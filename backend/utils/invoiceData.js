"use strict";

/**
 * Everything printed on a GST tax invoice, worked out from the order as saved at checkout.
 * Kept separate from the PDF drawing so the numbers can be tested.
 *
 * - Lines use the tax saved on each line at checkout (item.tax). Orders placed before that
 *   was saved are worked out the same way from their prices and the rate charged then.
 * - Taxable value + tax = what the customer paid for the line (prices include GST).
 * - Delivery is shown on its own line, outside the taxable value (as charged at checkout).
 */

const { codeByStateName, stateByCode, gstinStateCode, determineIsIntrastate } = require("./gstin");
const { lineCode, lineGstRate, lineTax, roundMoney } = require("./tax");
const { isInternationalCountry } = require("./productPricing");

const FOREIGN_STATE_CODE = "96"; // GST code for "Other country"

const CURRENCY_WORDS = {
  INR: ["Rupees", "Paise"],
  USD: ["US Dollars", "Cents"],
  GBP: ["Pounds Sterling", "Pence"],
  EUR: ["Euros", "Cents"],
  CAD: ["Canadian Dollars", "Cents"],
  AUD: ["Australian Dollars", "Cents"],
  SGD: ["Singapore Dollars", "Cents"],
  AED: ["UAE Dirhams", "Fils"],
  SAR: ["Saudi Riyals", "Halalas"]
};

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n) {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}

function belowThousand(n) {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds ? `${ONES[hundreds]} Hundred` : "", rest ? belowHundred(rest) : ""].filter(Boolean).join(" ");
}

/** Whole number in words, Indian style (thousand, lakh, crore). 0 → "Zero". */
function integerToWords(value) {
  let n = Math.floor(Math.abs(Number(value) || 0));
  if (n === 0) return "Zero";
  const parts = [];
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${integerToWords(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (n) parts.push(belowThousand(n));
  return parts.join(" ");
}

/** "Rupees One Thousand Two Hundred Fifty and Fifty Paise Only" */
function amountInWords(amount, currency = "INR") {
  const [major, minor] = CURRENCY_WORDS[currency] || [currency, "Cents"];
  const cents = Math.round(Math.abs(Number(amount) || 0) * 100);
  const whole = Math.floor(cents / 100);
  const fraction = cents % 100;
  const words = `${major} ${integerToWords(whole)}`;
  return fraction ? `${words} and ${integerToWords(fraction)} ${minor} Only` : `${words} Only`;
}

const text = (v) => String(v ?? "").trim();
const isPlaceholderState = (s) => !s || /^digital$/i.test(s) || /^n\/?a$/i.test(s);

function stateWithCode(name) {
  const state = text(name);
  const code = codeByStateName(state);
  return { state: code ? stateByCode(code) || state : state, stateCode: code };
}

/**
 * Place of supply. Physical goods: where they are delivered. Digital-only orders (no real
 * delivery address): the billing state, else the state in the buyer's GSTIN.
 * Outside India: "Outside India (<country>)", code 96.
 */
function placeOfSupply(order, seller) {
  const shipping = order?.shipping || order?.shippingAddress || {};
  const billing = order?.billing || {};
  const country = text(shipping.country || billing.country);
  if (country && isInternationalCountry(country)) {
    return { state: `Outside India (${country})`, stateCode: FOREIGN_STATE_CODE, isExport: true };
  }
  for (const candidate of [shipping.state, billing.state]) {
    if (!isPlaceholderState(text(candidate))) return { ...stateWithCode(candidate), isExport: false };
  }
  const gstin = text(billing.gstin);
  if (gstin) {
    const code = gstinStateCode(gstin);
    return { state: stateByCode(code) || "", stateCode: code, isExport: false };
  }
  return { ...stateWithCode(seller?.state || "Karnataka"), isExport: false };
}

/** Tax for orders saved before each line carried its own (same rules as checkout). */
function legacyLineTaxes(order, items, isLocal, isExport) {
  const storeRate = Number(order?.gstAmount) > 0 ? Number(order?.gstPercent || 0) : 0;
  const grosses = items.map((it) => roundMoney(Number(it?.price || 0) * Math.max(1, Number(it?.quantity || 1))));
  const grossTotal = grosses.reduce((a, b) => a + b, 0);
  const discount = Math.max(0, Number(order?.discount || 0));
  let allocated = 0;
  return items.map((it, i) => {
    let share = 0;
    if (discount > 0 && grossTotal > 0) {
      share = i === items.length - 1 ? roundMoney(discount - allocated) : roundMoney(discount * (grosses[i] / grossTotal));
      allocated = roundMoney(allocated + share);
    }
    const rate = lineGstRate(it, { isInternational: isExport, storeRate });
    return lineTax({ gross: grosses[i], discount: share, rate, isLocal });
  });
}

function addressLines(a = {}) {
  const street = text(a.address);
  const cityLine = [a.city, a.state, a.pincode].map(text).filter((s) => s && !isPlaceholderState(s) && s !== "000000").join(", ");
  const country = text(a.country);
  return [street === "Digital Delivery" ? "" : street, cityLine, country].filter(Boolean);
}

/**
 * order: the saved order (lean or document). user: { name, email } of the account (optional).
 * seller: business details when the order has none saved.
 */
function buildInvoice(order, { user = null, seller: fallbackSeller = null } = {}) {
  const sellerSaved = order?.sellerDetails || {};
  const seller = text(sellerSaved.gstin) || !fallbackSeller ? sellerSaved : { ...fallbackSeller, ...pickFilled(sellerSaved) };
  const sellerState = stateWithCode(seller.state || "Karnataka");

  const currency = text(order?.currencyDisplay?.currency || order?.currency || "INR").toUpperCase() || "INR";
  const pos = placeOfSupply(order, seller);
  const items = Array.isArray(order?.items) ? order.items : [];

  const savedIsLocal = order?.taxDetails?.isLocal;
  const isLocal = pos.isExport
    ? false
    : typeof savedIsLocal === "boolean"
      ? savedIsLocal
      : Boolean(pos.stateCode && sellerState.stateCode ? pos.stateCode === sellerState.stateCode : determineIsIntrastate(order, pos.state, seller.state));

  const allHaveTax = items.length > 0 && items.every((it) => it?.tax && Number.isFinite(Number(it.tax.taxable)));
  const taxes = allHaveTax ? items.map((it) => it.tax) : legacyLineTaxes(order, items, isLocal, pos.isExport);

  const lines = items.map((it, i) => {
    const t = taxes[i];
    const quantity = Math.max(1, Number(it?.quantity || 1));
    return {
      name: text(it?.name || it?.product?.name) || "Item",
      format: text(it?.format || it?.selectedFormatLabel),
      hsnSac: text(it?.hsnSac) || lineCode(it),
      quantity,
      unitPrice: roundMoney(Number(it?.price || 0)),
      gross: roundMoney(t.gross),
      discount: roundMoney(t.discount),
      taxable: roundMoney(t.taxable),
      rate: Number(t.rate) || 0,
      cgst: roundMoney(t.cgst),
      sgst: roundMoney(t.sgst),
      igst: roundMoney(t.igst),
      tax: roundMoney(t.tax),
      total: roundMoney(t.total)
    };
  });

  const sum = (key) => roundMoney(lines.reduce((a, l) => a + l[key], 0));
  const deliveryCharge = roundMoney(Number(order?.deliveryCharge || 0));
  const totals = {
    gross: sum("gross"),
    discount: sum("discount"),
    taxable: sum("taxable"),
    cgst: sum("cgst"),
    sgst: sum("sgst"),
    igst: sum("igst"),
    tax: sum("tax"),
    deliveryCharge
  };
  totals.grandTotal = roundMoney(totals.taxable + totals.tax + deliveryCharge);

  // Tax by rate, the way GST returns group it
  const byRate = new Map();
  for (const l of lines) {
    const row = byRate.get(l.rate) || { rate: l.rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0 };
    for (const k of ["taxable", "cgst", "sgst", "igst", "tax"]) row[k] = roundMoney(row[k] + l[k]);
    byRate.set(l.rate, row);
  }

  const billing = order?.billing || {};
  const shipping = order?.shipping || order?.shippingAddress || {};
  const billingHasAddress = addressLines(billing).length > 0;
  const buyerGstin = text(billing.gstin);
  const billState = stateWithCode(isPlaceholderState(text(billing.state)) ? "" : billing.state);

  return {
    invoiceNumber: text(order?.invoiceNumber),
    invoiceDate: order?.invoiceIssuedAt || order?.paymentMeta?.paidAt || order?.createdAt || null,
    orderRef: String(order?._id || "").slice(-8).toUpperCase(),
    orderDate: order?.createdAt || null,
    isPaid: order?.paymentStatus === "Paid" || order?.paymentStatus === "Refunded",
    paymentStatus: text(order?.paymentStatus) || "Pending",
    paymentRef: text(order?.paymentMeta?.razorpayPaymentId || order?.razorpayPaymentId),
    paymentMethod: text(order?.paymentMethod) || "Online (Razorpay)",
    currency,
    seller: {
      legalName: text(seller.legalName) || "Vyoma Linguistic Labs Foundation",
      tradeName: "Digital Sanskrit Guru",
      gstin: text(seller.gstin),
      address: text(seller.address),
      state: sellerState.state,
      stateCode: text(seller.stateCode) || sellerState.stateCode,
      email: text(seller.email)
    },
    buyer: {
      name: text(billing.name || shipping.name || user?.name) || "Customer",
      businessName: buyerGstin ? text(billing.businessName) : "",
      gstin: buyerGstin,
      email: text(billing.email || user?.email || shipping.email),
      phone: text(billing.phone || shipping.phone),
      address: billingHasAddress ? addressLines(billing) : addressLines(shipping),
      // Indian buyers only (a foreign buyer's region is already in the address)
      state: pos.isExport ? "" : billState.state || pos.state,
      stateCode: pos.isExport ? "" : billState.stateCode || (buyerGstin ? gstinStateCode(buyerGstin) : pos.stateCode)
    },
    // Only when something was delivered to a real address (not digital-only orders)
    shipTo: text(shipping.address) && text(shipping.address) !== "Digital Delivery"
      ? { name: text(shipping.name), address: addressLines(shipping) }
      : null,
    placeOfSupply: pos,
    isLocal,
    isExport: pos.isExport,
    isB2B: Boolean(buyerGstin),
    reverseCharge: false,
    lines,
    rates: [...byRate.values()].sort((a, b) => a.rate - b.rate),
    totals,
    amountInWords: amountInWords(totals.grandTotal, currency)
  };
}

function pickFilled(obj = {}) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => text(v)));
}

module.exports = { buildInvoice, amountInWords, integerToWords, placeOfSupply };
