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
    const rate = lineGstRate(it, { isInternational: isExport, storeRate, codeRates: false });
    return lineTax({ gross: grosses[i], discount: share, rate, isLocal });
  });
}

function addressLines(a = {}) {
  const street = text(a.address);
  const cityLine = [a.city, a.state, a.pincode].map(text).filter((s) => s && !isPlaceholderState(s) && s !== "000000").join(", ");
  const country = text(a.country);
  return [street === "Digital Delivery" ? "" : street, cityLine, country].filter(Boolean);
}

const TAX_KEYS = ["gross", "discount", "taxable", "cgst", "sgst", "igst", "tax", "total"];

/** One taxed piece (a line, a combo component or a share of delivery), amounts rounded. */
function unitFrom(t = {}, name = "Item") {
  const out = { name, hsnSac: text(t.hsnSac), rate: t.rate === null || t.rate === undefined ? null : Number(t.rate) };
  for (const k of TAX_KEYS) out[k] = roundMoney(t[k]);
  return out;
}

/** The same piece reduced to a share (0–1) of itself, as on a credit note. */
function scaleUnit(u, ratio, isLocal) {
  const taxable = roundMoney(u.taxable * ratio);
  const tax = roundMoney(u.tax * ratio);
  const cgst = isLocal ? roundMoney(tax / 2) : 0;
  const sgst = isLocal ? roundMoney(tax - cgst) : 0;
  return { ...u, gross: roundMoney(taxable + tax), discount: 0, taxable, cgst, sgst, igst: isLocal ? 0 : tax, tax, total: roundMoney(taxable + tax) };
}

/** A line reduced to a share of itself; a combo's components are each reduced the same way. */
function scaleLine(l, ratio, isLocal) {
  if (!l.parts) return scaleUnit(l, ratio, isLocal);
  const parts = l.parts.map((p) => scaleUnit(p, ratio, isLocal));
  const out = { ...l, parts };
  for (const k of TAX_KEYS) out[k] = roundMoney(parts.reduce((a, p) => a + p[k], 0));
  out.discount = 0;
  return out;
}

/**
 * Totals, tax by rate and every taxed piece of an invoice or credit note.
 * totals.taxable = the items' taxable value; totals.deliveryCharge = delivery's taxable value
 * (or, for older orders, the untaxed delivery charge); totals.tax includes GST on delivery.
 * So: taxable + deliveryCharge + tax = grandTotal (base price + delivery + GST = total).
 */
function summarize(lines, delivery) {
  const units = lines.flatMap((l) => (l.parts ? l.parts.map((p) => ({ ...p, combo: l.name })) : [{ ...l }]));
  const deliveryUnits = delivery.parts.map((p) => ({ ...p, name: "Delivery charges", kind: "delivery" }));
  const all = [...units, ...deliveryUnits];
  const sum = (list, k) => roundMoney(list.reduce((a, u) => a + (Number(u[k]) || 0), 0));

  const deliveryTaxable = delivery.taxed ? sum(deliveryUnits, "taxable") : delivery.gross;
  const totals = {
    gross: sum(lines, "gross"),
    discount: sum(lines, "discount"),
    taxable: sum(units, "taxable"),
    cgst: sum(all, "cgst"),
    sgst: sum(all, "sgst"),
    igst: sum(all, "igst"),
    tax: sum(all, "tax"),
    deliveryCharge: deliveryTaxable,
    deliveryGross: delivery.gross,
    deliveryTax: delivery.taxed ? sum(deliveryUnits, "tax") : 0
  };
  totals.totalTaxable = roundMoney(totals.taxable + totals.deliveryCharge);
  totals.grandTotal = roundMoney(totals.taxable + totals.tax + totals.deliveryCharge);

  // Tax by rate, the way GST returns group it (delivery counted at the rate of what it carried)
  const byRate = new Map();
  for (const u of all) {
    const rate = Number(u.rate) || 0;
    const row = byRate.get(rate) || { rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0 };
    for (const k of ["taxable", "cgst", "sgst", "igst", "tax"]) row[k] = roundMoney(row[k] + (Number(u[k]) || 0));
    byRate.set(rate, row);
  }
  return { totals, rates: [...byRate.values()].sort((a, b) => a.rate - b.rate), units: all };
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
    const parts = Array.isArray(t.parts) && t.parts.length ? t.parts.map((p) => unitFrom(p, text(p.name) || "Item")) : null;
    return {
      ...unitFrom(t, text(it?.name || it?.product?.name) || "Item"),
      format: text(it?.format || it?.selectedFormatLabel),
      // A combo shows its components' codes on their own rows
      hsnSac: parts ? "" : text(it?.hsnSac) || lineCode(it),
      quantity,
      unitPrice: roundMoney(Number(it?.price || 0)),
      parts
    };
  });

  // Delivery: taxed (orders from November 2026, split over the items delivered) or, for older
  // orders, an untaxed amount outside the taxable value as it was charged then
  const saved = order?.taxDetails?.delivery;
  const delivery = saved && Number.isFinite(Number(saved.gross))
    ? {
        taxed: true,
        gross: roundMoney(saved.gross),
        parts: (Array.isArray(saved.parts) ? saved.parts : []).map((p) => unitFrom(p, "Delivery charges"))
      }
    : { taxed: false, gross: roundMoney(Number(order?.deliveryCharge || 0)), parts: [] };

  const { totals, rates, units } = summarize(lines, delivery);

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
    delivery,
    units,
    rates,
    totals,
    amountInWords: amountInWords(totals.grandTotal, currency)
  };
}

function pickFilled(obj = {}) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => text(v)));
}

/** Refunds on the order that have a credit note, oldest first. */
function creditNoteRefunds(order) {
  const refunds = Array.isArray(order?.paymentMeta?.refunds) ? order.paymentMeta.refunds : [];
  return refunds
    .filter((r) => r && r.creditNoteNumber)
    .sort((a, b) => new Date(a.creditNoteIssuedAt || a.at || 0) - new Date(b.creditNoteIssuedAt || b.at || 0));
}

/**
 * A GST credit note for one refund, in the same shape as the invoice so it prints the same way.
 * The refund (recorded in INR) is spread over the invoice lines in proportion to each line's
 * amount, so every GST rate and HSN/SAC is reduced by its own share; delivery takes the rest.
 * Amounts are in the invoice's currency.
 */
/** The id a refund uses for an order item (same as the refund quote). */
const itemRefundId = (it) => String(it?._id || it?.id || it?.product || "");

/**
 * Splits a refund over the invoice.
 * - Returned items (itemIds given): the refund goes to those lines first, in proportion to
 *   what was invoiced for them, so only their GST rates are reduced; what is left is delivery.
 * - Whole order (no itemIds, or none match): spread over every line and delivery in proportion.
 * A combo line is reduced component by component. refundAmount is in the invoice's currency.
 * Returns { lines, delivery, itemLevel }: the reversed lines and the reversed delivery.
 */
function allocateRefund(order, inv, refundAmount, itemIds = []) {
  const amount = Math.max(0, roundMoney(refundAmount));
  const items = Array.isArray(order?.items) ? order.items : [];
  const ids = new Set((Array.isArray(itemIds) ? itemIds : []).map(String).filter(Boolean));
  const selected = inv.lines.map((_, i) => ids.size > 0 && ids.has(itemRefundId(items[i])));
  const itemLevel = selected.some(Boolean);

  let ratios;
  if (itemLevel) {
    const selectedTotal = inv.lines.reduce((a, l, i) => a + (selected[i] ? l.total : 0), 0);
    const r = selectedTotal > 0 ? Math.min(1, amount / selectedTotal) : 0;
    ratios = selected.map((sel) => (sel ? r : 0));
  } else {
    const r = inv.totals.grandTotal > 0 ? Math.min(1, amount / inv.totals.grandTotal) : 0;
    ratios = inv.lines.map(() => r);
  }

  const lines = inv.lines.map((l, i) => ({ ...scaleLine(l, ratios[i], inv.isLocal), returned: itemLevel ? selected[i] : true }));
  const itemsTotal = lines.reduce((a, l) => a + l.total, 0);
  // Whatever is left of the refund after the items is the delivery share (never below zero)
  const deliveryAmount = Math.max(0, roundMoney(amount - itemsTotal));
  return { lines, delivery: scaleDelivery(inv.delivery, deliveryAmount, inv.isLocal), itemLevel };
}

/** Delivery reduced to the amount refunded for it, GST reversed in proportion. */
function scaleDelivery(delivery, amount, isLocal) {
  if (!delivery?.taxed || !(delivery.gross > 0) || amount <= 0) {
    return { taxed: false, gross: roundMoney(amount), parts: [] };
  }
  const ratio = Math.min(1, amount / delivery.gross);
  const parts = delivery.parts.map((p) => scaleUnit(p, ratio, isLocal));
  // Rounding (or anything above the delivery charge) stays with the last part, so it adds up exactly
  const extra = roundMoney(amount - parts.reduce((a, p) => a + p.total, 0));
  if (parts.length && extra !== 0) {
    const last = parts[parts.length - 1];
    last.taxable = roundMoney(last.taxable + extra);
    last.gross = roundMoney(last.gross + extra);
    last.total = roundMoney(last.total + extra);
  }
  return { taxed: true, gross: roundMoney(amount), parts };
}

/**
 * A GST credit note for one refund, in the same shape as the invoice so it prints the same way.
 * Amounts are in the invoice's currency (the refund is recorded in INR and converted back at
 * the order's own rate).
 */
function buildCreditNote(order, refund, options = {}) {
  const inv = buildInvoice(order, options);
  const totalInr = Number(order?.totalInInr) > 0 ? Number(order.totalInInr) : inv.totals.grandTotal;
  const refundInr = roundMoney((Number(refund?.amountMinor) || 0) / 100);
  const ratio = totalInr > 0 ? Math.min(1, Math.max(0, refundInr / totalInr)) : 0;
  const refundAmount = roundMoney(inv.totals.grandTotal * ratio);

  const allocation = allocateRefund(order, inv, refundAmount, refund?.itemIds);
  // Only the returned items are listed on an item return
  const lines = allocation.itemLevel ? allocation.lines.filter((l) => l.returned) : allocation.lines;
  const { totals, rates, units } = summarize(lines, allocation.delivery);

  return {
    ...inv,
    lines,
    delivery: allocation.delivery,
    units,
    rates,
    totals,
    amountInWords: amountInWords(totals.grandTotal, inv.currency),
    creditNote: {
      number: text(refund?.creditNoteNumber),
      date: refund?.creditNoteIssuedAt || refund?.at || null,
      refundInr,
      isFull: ratio >= 0.9999,
      itemLevel: allocation.itemLevel,
      reason: text(refund?.reason) || "Refund",
      method: text(refund?.method) === "razorpay" ? "Razorpay refund" : "Refunded outside Razorpay",
      reference: text(refund?.refundId || (refund?.reference !== "manual" ? refund?.reference : ""))
    }
  };
}

module.exports = { buildInvoice, buildCreditNote, allocateRefund, summarize, creditNoteRefunds, amountInWords, integerToWords, placeOfSupply };
