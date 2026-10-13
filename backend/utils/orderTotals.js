const Product = require("../models/Product");
const { resolveDeliveryCharge, isDigitalItem } = require("./deliveryPricing");
const { convertCurrencyAmount, normalizeCurrencyRates, resolveItemsCurrency, normalizeCurrencyCode } = require("./currency");
const { getProductPriceDetails, isInternationalCountry } = require("./productPricing");
const { normalizeOrderItem } = require("./orderItems");
const { getItemHsnSac } = require("./tax");
const { validateCoupon } = require("./coupons");
const { getSettlementCharge } = require("./paymentVerification");

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

async function computeOrderTotals({ items = [], shipping = {}, couponCode = "", userId = null, settings }) {
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
      return normalizeOrderItem(p, { quantity: l.quantity }, pricing);
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

  const gstPercent = isInternational ? 0 : Math.min(50, Math.max(0, Number(settings?.gstPercent || 0)));
  const deliveryCharge = roundMoney(toCcy(resolveDeliveryCharge(settings, shipping, normalizedItems)));

  const priced = normalizedItems.map((it) => ({
    it,
    gross: roundMoney(it.price * it.quantity),
    rate: isInternational || getItemHsnSac(it) === "4901" ? 0 : gstPercent
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

  let allocated = 0;
  let subtotal = 0;
  let gstAmount = 0;

  priced.forEach((p) => {
    let share = 0;
    if (coupon.discount > 0 && eligible.includes(p) && eligibleGross > 0) {
      share =
        p === eligible[eligible.length - 1]
          ? roundMoney(coupon.discount - allocated)
          : roundMoney(coupon.discount * (p.gross / eligibleGross));
      allocated = roundMoney(allocated + share);
    }
    const net = Math.max(0, p.gross - share);
    const base = roundMoney(net / (1 + p.rate / 100));
    subtotal += base;
    gstAmount += roundMoney(net - base);
  });

  subtotal = roundMoney(subtotal);
  gstAmount = roundMoney(gstAmount);
  const total = roundMoney(subtotal + gstAmount + deliveryCharge);

  const customerState = String(shipping?.state || "").trim().toLowerCase();
  const isLocal = !isInternational && customerState === getWarehouseState(settings);

  const taxDetails = isLocal
    ? {
        hsnCode: "4901",
        sacCode: "9984",
        cgstPercent: gstPercent / 2,
        sgstPercent: gstPercent / 2,
        igstPercent: 0,
        cgstAmount: roundMoney(gstAmount / 2),
        sgstAmount: roundMoney(gstAmount - roundMoney(gstAmount / 2)),
        igstAmount: 0
      }
    : {
        hsnCode: "4901",
        sacCode: "9984",
        cgstPercent: 0,
        sgstPercent: 0,
        igstPercent: gstPercent,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: gstAmount
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
    chargeCurrency: settlement.currency
  };
}

module.exports = {
  computeOrderTotals,
  OrderTotalsError,
  getWarehouseState
};
