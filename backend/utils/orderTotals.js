const Product = require("../models/Product");
const { resolveDeliveryCharge, isDigitalItem } = require("./deliveryPricing");
const { convertCurrencyAmount, normalizeCurrencyRates, resolveItemsCurrency, normalizeCurrencyCode } = require("./currency");
const { getProductPriceDetails, isInternationalCountry } = require("./productPricing");
const { normalizeOrderItem } = require("./orderItems");
const { lineCode, lineGstRate, lineTax } = require("./tax");
const { validateCoupon } = require("./coupons");
const { getSettlementCharge } = require("./paymentVerification");
const { buildComponentsFromProduct, computeUpgradeCreditPerUnit } = require("./upgradePricing");
const { applyComboWeights } = require("./comboWeight");
const { isKindleProduct } = require("./kindle");
const { clampOrderQuantity } = require("./orderQuantity");

const roundMoney = (v) => Math.round((Number(v) || 0) * 100) / 100;

class OrderTotalsError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const getWarehouseState = (settings) =>
  String(settings?.businessDetails?.state || settings?.warehouseLocation?.state || "Karnataka")
    .trim()
    .toLowerCase();

function mergeDuplicateItems(items = []) {
  const map = new Map();
  for (const raw of items) {
    const id = String(raw?._id || raw?.id || raw?.product || "").trim();
    if (!id) continue;
    const prev = map.get(id);
    map.set(id, {
      productId: id,
      quantity: (prev ? Number(prev.quantity) : 0) + Math.max(1, Math.floor(Number(raw?.quantity || 1)))
    });
  }
  return [...map.values()];
}

async function computeOrderTotals({
  items = [],
  shipping = {},
  couponCode = "",
  userId = null,
  settings,
  ownedDigitalIds = null
}) {
  let ownedSet = null;
  if (userId) {
    if (ownedDigitalIds) {
      ownedSet = ownedDigitalIds instanceof Set ? ownedDigitalIds : new Set(ownedDigitalIds);
    } else {
      const { getOwnedDigitalIdsForUser } = require("../services/digitalOwnershipService");
      ownedSet = await getOwnedDigitalIdsForUser(userId);
    }
  }

  const country = String(shipping?.country || "India").trim();
  const lines = mergeDuplicateItems(items);
  if (!lines.length) {
    throw new OrderTotalsError(400, "No valid items in the cart.");
  }

  const products = await Product.find({
    _id: { $in: lines.map((l) => l.productId) },
    isDeleted: { $ne: true }
  })
    .populate("bundleItems.product")
    .lean();

  const byId = new Map(products.map((p) => [String(p._id), p]));

  for (const line of lines) {
    const p = byId.get(line.productId);
    if (p && isKindleProduct(p)) {
      throw new OrderTotalsError(400, "Kindle editions are sold on Amazon.");
    }
    if (p && p.hasOptions === true) {
      throw new OrderTotalsError(400, "Please choose a format first.");
    }
  }
  const cfg = {
    pricingMarkets: settings?.pricingMarkets || [],
    internationalPricingDefaults: settings?.internationalPricingDefaults || {},
    currencyConversionRates: settings?.currencyConversionRates || {}
  };

  const normalizedItems = lines
    .map((l) => {
      const p = byId.get(l.productId);
      if (!p) return null;
      const pricing = getProductPriceDetails(p, country, cfg);
      // Same per-order limits as the cart (5 retail, 1 digital), whichever page sent the order
      return normalizeOrderItem(p, { quantity: clampOrderQuantity(p, l.quantity) }, pricing);
    })
    .filter(Boolean);

  if (!normalizedItems.length) {
    throw new OrderTotalsError(400, "No valid products found for this order.");
  }

  const isInternational = isInternationalCountry(country);
  if (isInternational && settings?.internationalDelivery?.enabled === false && normalizedItems.some((i) => !isDigitalItem(i))) {
    throw new OrderTotalsError(400, "Physical product delivery is currently disabled for international locations.");
  }

  const ic = resolveItemsCurrency(normalizedItems);
  if (!ic.ok) {
    throw new OrderTotalsError(400, "Mixed-currency cart.");
  }

  const orderCurrency = ic.currency;
  const rates = normalizeCurrencyRates(settings?.currencyConversionRates || {});
  const toCcy = (inr) => convertCurrencyAmount(inr, { sourceCurrency: "INR", currency: orderCurrency, rates });

  applyComboWeights(normalizedItems, byId);

  const gstPercent = isInternational ? 0 : Math.min(50, Math.max(0, Number(settings?.gstPercent || 0)));
  const deliveryCharge = roundMoney(toCcy(resolveDeliveryCharge(settings, shipping, normalizedItems)));

  for (const it of normalizedItems) {
    const p = byId.get(String(it.product));
    const isCombo = Boolean(p && (p.productType === "bundle" || (Array.isArray(p.bundleItems) && p.bundleItems.length > 0)));

    if (isCombo && p?.skipOwnershipRules !== true && ownedSet && ownedSet.size > 0) {
      const components = buildComponentsFromProduct(p);
      const creditResult = computeUpgradeCreditPerUnit({
        unitPrice: it.price,
        components,
        ownedIds: ownedSet
      });

      if (creditResult.creditPerUnit > 0) {
        it.upgradeCreditPerUnit = creditResult.creditPerUnit;
        it.upgradeCredit = roundMoney(creditResult.creditPerUnit * it.quantity);
        it.upgradeOwnedItems = creditResult.ownedItems;
        it.upgradeOwnedDetails = (creditResult.ownedDetails || []).map((od) => ({
          name: od.name,
          amountPerUnit: od.creditPerUnit,
          amount: roundMoney(od.creditPerUnit * it.quantity)
        }));
        it.price = roundMoney(it.price - creditResult.creditPerUnit);
      } else {
        it.upgradeCreditPerUnit = 0;
        it.upgradeCredit = 0;
        it.upgradeOwnedItems = [];
        it.upgradeOwnedDetails = [];
      }
    } else {
      it.upgradeCreditPerUnit = 0;
      it.upgradeCredit = 0;
      it.upgradeOwnedItems = [];
      it.upgradeOwnedDetails = [];
    }
  }

  const upgradeCredit = roundMoney(normalizedItems.reduce((acc, it) => acc + (it.upgradeCredit || 0), 0));
  const upgradeCreditItems = normalizedItems
    .filter((it) => (it.upgradeCredit || 0) > 0)
    .map((it) => ({
      name: it.name,
      ownedItems: it.upgradeOwnedItems || [],
      credit: it.upgradeCredit,
      ownedDetails: (it.upgradeOwnedDetails || []).map((od) => ({
        name: od.name,
        amount: od.amount
      }))
    }));

  const priced = normalizedItems.map((it) => ({
    it,
    gross: roundMoney(it.price * it.quantity),
    rate: lineGstRate(it, { isInternational, storeRate: gstPercent })
  }));

  let coupon = { discount: 0, appliedCouponCode: "", eligibleIds: new Set() };
  if (couponCode) {
    try {
      coupon = await validateCoupon({
        code: couponCode,
        userId,
        priced,
        orderCurrency,
        rates
      });
    } catch (couponErr) {
      if (userId) {
        throw new OrderTotalsError(400, couponErr.message || "Invalid coupon code.");
      }
      coupon = { discount: 0, appliedCouponCode: "", eligibleIds: new Set() };
    }
  }

  const eligible = priced.filter((p) => !coupon.eligibleIds.size || coupon.eligibleIds.has(String(p.it.product)));
  const eligibleGross = eligible.reduce((s, p) => s + p.gross, 0);

  // Place of supply decides CGST+SGST (same state as the business) or IGST (other state)
  const customerState = String(shipping?.state || "").trim().toLowerCase();
  const isLocal = !isInternational && customerState === getWarehouseState(settings);

  // Each line keeps its own tax as charged (code, rate, coupon share, taxable value, CGST/SGST/IGST),
  // so invoices, GST returns and credit notes use what was actually charged, never a recalculation.
  let allocated = 0;
  priced.forEach((p) => {
    let share = 0;
    if (coupon.discount > 0 && eligible.includes(p) && eligibleGross > 0) {
      share =
        p === eligible[eligible.length - 1]
          ? roundMoney(coupon.discount - allocated)
          : roundMoney(coupon.discount * (p.gross / eligibleGross));
      allocated = roundMoney(allocated + share);
    }
    p.it.hsnSac = lineCode(p.it);
    p.it.tax = lineTax({ gross: p.gross, discount: share, rate: p.rate, isLocal });
  });

  const sum = (key) => roundMoney(normalizedItems.reduce((acc, it) => acc + (Number(it.tax?.[key]) || 0), 0));
  const subtotal = sum("taxable");
  const gstAmount = sum("tax");
  const total = roundMoney(subtotal + gstAmount + deliveryCharge);

  // Order totals are the sum of the lines (so they always match line by line).
  // The % fields only describe a single-rate order; mixed rates are listed per line.
  const lineRates = [...new Set(normalizedItems.map((it) => Number(it.tax?.rate) || 0))];
  const singleRate = lineRates.length === 1 ? lineRates[0] : null;
  const taxDetails = {
    hsnCode: "4901",
    sacCode: "9984",
    cgstPercent: isLocal && singleRate !== null ? singleRate / 2 : 0,
    sgstPercent: isLocal && singleRate !== null ? singleRate / 2 : 0,
    igstPercent: !isLocal && singleRate !== null ? singleRate : 0,
    cgstAmount: sum("cgst"),
    sgstAmount: sum("sgst"),
    igstAmount: sum("igst"),
    isLocal,
    mixedRates: singleRate === null
  };

  const fxRateToInr = orderCurrency === "INR" ? 1 : 1 / (rates[orderCurrency] || 1);
  const settlement = getSettlementCharge({ total, orderCurrency, rates });

  return {
    normalizedItems,
    orderCurrency,
    isInternational,
    gstPercent,
    deliveryCharge,
    subtotal,
    gstAmount,
    discount: coupon.discount,
    appliedCouponCode: coupon.appliedCouponCode,
    total,
    fxRateToInr,
    totalInInr: roundMoney(total * fxRateToInr),
    taxDetails,
    chargeAmount: settlement.amount,
    chargeCurrency: settlement.currency,
    upgradeCredit,
    upgradeCreditItems
  };
}

module.exports = {
  computeOrderTotals,
  OrderTotalsError,
  getWarehouseState
};
