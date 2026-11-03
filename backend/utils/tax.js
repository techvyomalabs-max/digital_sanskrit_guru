"use strict";

/**
 * GST rules for what DSG sells, as confirmed by finance (November 2026):
 *
 *   Printed books                    HSN 4901    nil (0%)
 *   USB devices                      HSN 8523    18%
 *   Audio devices                    HSN 8518    18%
 *   Digital products (web versions,  SAC 998433  18%
 *     flipbooks, e-books)
 *
 * - Prices include GST: the taxable value is worked out from what the customer pays.
 * - A product's own HSN/SAC and GST rate (set in Add Products) always win.
 * - A combo is taxed by its components: its price is split in proportion to each component's
 *   value, and each component keeps its own code and rate.
 * - Delivery charges are part of the taxable value: the fee is split over the physical items
 *   delivered, in proportion to their value, and each part is taxed at that item's rate.
 * - Sales outside India carry no GST.
 */

const roundMoney = (v) => Math.round((Number(v) || 0) * 100) / 100;

const TAX_CATEGORIES = [
  { key: "printed-book", label: "Printed book", code: "4901", rate: 0 },
  { key: "usb-device", label: "USB device", code: "8523", rate: 18 },
  { key: "audio-device", label: "Audio device", code: "8518", rate: 18 },
  { key: "digital", label: "Digital product (web version, flipbook, e-book)", code: "998433", rate: 18 }
];

/** The GST rate that goes with each code finance confirmed. */
const CODE_RATES = Object.fromEntries(TAX_CATEGORIES.map((c) => [c.code, c.rate]));

const DIGITAL_WORDS = ["ebook", "e-book", "kindle", "web version", "web-version", "flipbook", "epub", "pdf"];
const BOOK_WORDS = ["book", "sanskrit", "gita", "scriptures", "grammar", "dharma", "paperback", "volume", "vol.", "hardcover"];
const USB_WORDS = ["usb", "pen drive", "pendrive", "flash drive"];
const AUDIO_DEVICE_WORDS = ["speaker", "headphone", "earphone", "earbud", "audio device", "audio player", "mp3 player", "microphone"];

const has = (text, words) => words.some((w) => text.includes(w));

/**
 * The HSN/SAC code for an item: the admin's own code, else a best guess from the product.
 * Guesses: digital → 998433, USB → 8523, audio device → 8518, book → 4901, else 8523.
 * Set the code on the product wherever the guess could be wrong.
 */
function getItemHsnSac(item) {
  if (item?.hsnSac) return String(item.hsnSac).trim();
  const name = String(item?.name || "").trim().toLowerCase();
  const category = String(item?.category || "").trim().toLowerCase();
  const text = `${category} ${name}`;

  if (item?.isDigital === true || has(text, DIGITAL_WORDS)) return "998433";
  if (has(text, USB_WORDS)) return "8523";
  if (has(text, AUDIO_DEVICE_WORDS)) return "8518";
  if (has(text, BOOK_WORDS)) return "4901";
  return "8523";
}

/** The code to print for a line: the product's own HSN/SAC if the admin set one, else the rule above. */
function lineCode(item) {
  return getItemHsnSac(item);
}

const ownRate = (item) => {
  const own = item?.gstRate;
  return own !== null && own !== undefined && own !== "" && Number.isFinite(Number(own))
    ? Math.min(50, Math.max(0, Number(own)))
    : null;
};

/**
 * GST rate % for an item.
 * - Sales outside India: 0 (export).
 * - The product's own GST rate, when the admin set one.
 * - The rate that goes with its code (table above).
 * - Otherwise the store-wide rate from settings.
 * codeRates: false keeps the rules used before November 2026, for working out older orders.
 */
function lineGstRate(item, { isInternational = false, storeRate = 0, codeRates = true } = {}) {
  if (isInternational) return 0;
  const own = ownRate(item);
  if (own !== null) return own;
  const code = lineCode(item);
  if (code === "4901") return 0;
  if (codeRates && Object.prototype.hasOwnProperty.call(CODE_RATES, code)) return CODE_RATES[code];
  return Math.min(50, Math.max(0, Number(storeRate) || 0));
}

/**
 * The tax on an amount the customer paid (prices include GST).
 * gross = price × qty before the coupon; discount = this line's share of the coupon.
 * Returns amounts that add up exactly: taxable + tax = gross − discount.
 */
function lineTax({ gross, discount = 0, rate = 0, isLocal = false }) {
  const net = Math.max(0, roundMoney(gross - discount));
  const taxable = roundMoney(net / (1 + rate / 100));
  const tax = roundMoney(net - taxable);
  const cgst = isLocal ? roundMoney(tax / 2) : 0;
  const sgst = isLocal ? roundMoney(tax - cgst) : 0;
  const igst = isLocal ? 0 : tax;
  return {
    gross: roundMoney(gross),
    discount: roundMoney(discount),
    taxable,
    rate,
    cgstRate: isLocal ? rate / 2 : 0,
    sgstRate: isLocal ? rate / 2 : 0,
    igstRate: isLocal ? 0 : rate,
    cgst,
    sgst,
    igst,
    tax,
    total: net
  };
}

/** Splits an amount by weights so the pieces add up exactly (the last piece takes the rounding). */
function splitByWeights(amount, weights) {
  const total = weights.reduce((a, w) => a + (Number(w) > 0 ? Number(w) : 0), 0);
  let allocated = 0;
  return weights.map((w, i) => {
    if (i === weights.length - 1) return roundMoney(amount - allocated);
    const piece = total > 0 ? roundMoney(amount * ((Number(w) > 0 ? Number(w) : 0) / total)) : 0;
    allocated = roundMoney(allocated + piece);
    return piece;
  });
}

/**
 * A combo's components, weighted by value, for splitting its price: [{ name, hsnSac, rate,
 * isDigital, weight }], or null when the item isn't a combo (or no component has a value).
 * Components the customer already owned (and got credit for) are left out.
 */
function comboParts(item, { isInternational = false, storeRate = 0 } = {}) {
  const components = Array.isArray(item?.bundleItems) ? item.bundleItems : [];
  if (!components.length) return null;
  const parts = components
    .filter((c) => c && c.owned !== true)
    .map((c) => {
      const unit = Number(c.unitValue) > 0 ? Number(c.unitValue) : 0;
      return {
        name: String(c.name || "Item").trim(),
        hsnSac: lineCode(c),
        rate: lineGstRate(c, { isInternational, storeRate }),
        isDigital: c.isDigital === true,
        weight: roundMoney(unit * Math.max(1, Number(c.quantity || 1)))
      };
    });
  if (!parts.length || parts.every((p) => p.weight <= 0)) return null;
  return parts;
}

/** Adds up tax pieces (lineTax results) into one; rate is kept only when they share one. */
function sumTax(pieces, isLocal) {
  const sum = (k) => roundMoney(pieces.reduce((a, p) => a + (Number(p[k]) || 0), 0));
  const rates = [...new Set(pieces.map((p) => Number(p.rate) || 0))];
  const rate = rates.length === 1 ? rates[0] : null;
  return {
    gross: sum("gross"),
    discount: sum("discount"),
    taxable: sum("taxable"),
    rate,
    cgstRate: isLocal && rate !== null ? rate / 2 : 0,
    sgstRate: isLocal && rate !== null ? rate / 2 : 0,
    igstRate: !isLocal && rate !== null ? rate : 0,
    cgst: sum("cgst"),
    sgst: sum("sgst"),
    igst: sum("igst"),
    tax: sum("tax"),
    total: sum("total")
  };
}

/**
 * The tax on a combo line: its gross and coupon share are split over the components by value,
 * and each component is taxed at its own rate. Returns the line's totals plus `parts`.
 */
function comboTax({ gross, discount = 0, parts, isLocal = false }) {
  const grossParts = splitByWeights(gross, parts.map((p) => p.weight));
  const discountParts = splitByWeights(discount, parts.map((p) => p.weight));
  const taxed = parts.map((p, i) => ({
    name: p.name,
    hsnSac: p.hsnSac,
    isDigital: p.isDigital,
    ...lineTax({ gross: grossParts[i], discount: discountParts[i], rate: p.rate, isLocal })
  }));
  return { ...sumTax(taxed, isLocal), parts: taxed };
}

/**
 * The pieces a line is taxed in: a combo's components, or the line itself.
 * Each: { name, hsnSac, rate, isDigital, gross, discount, taxable, cgst, sgst, igst, tax, total }.
 */
function taxUnits(item) {
  const t = item?.tax || {};
  if (Array.isArray(t.parts) && t.parts.length) return t.parts;
  return [{ name: String(item?.name || "Item"), hsnSac: item?.hsnSac || lineCode(item), isDigital: item?.isDigital === true, ...t }];
}

/**
 * Delivery charges as part of the taxable value. The fee the customer pays (GST included) is
 * split over the physical items delivered, in proportion to what they paid for each, and each
 * part is taxed at that item's rate (so delivery of a printed book carries no GST).
 * units: [{ hsnSac, rate, isDigital, total }] for the whole order. No physical items: the
 * fee is split over everything. Returns { gross, taxable, tax, cgst, sgst, igst, parts }.
 */
function deliveryTax({ amount, units = [], isLocal = false, isInternational = false }) {
  const gross = roundMoney(amount);
  if (gross <= 0) {
    return { gross: 0, taxable: 0, tax: 0, cgst: 0, sgst: 0, igst: 0, parts: [] };
  }
  const physical = units.filter((u) => u && u.isDigital !== true && Number(u.total) > 0);
  const base = physical.length ? physical : units.filter((u) => u && Number(u.total) > 0);
  if (!base.length) {
    const only = lineTax({ gross, rate: 0, isLocal });
    return { gross, taxable: only.taxable, tax: 0, cgst: 0, sgst: 0, igst: 0, parts: [{ hsnSac: "", ...only }] };
  }
  const shares = splitByWeights(gross, base.map((u) => Number(u.total)));
  const parts = base.map((u, i) => ({
    hsnSac: u.hsnSac || "",
    ...lineTax({ gross: shares[i], rate: isInternational ? 0 : Number(u.rate) || 0, isLocal })
  }));
  const sum = (k) => roundMoney(parts.reduce((a, p) => a + p[k], 0));
  return { gross, taxable: sum("taxable"), tax: sum("tax"), cgst: sum("cgst"), sgst: sum("sgst"), igst: sum("igst"), parts };
}

module.exports = {
  TAX_CATEGORIES,
  CODE_RATES,
  getItemHsnSac,
  lineCode,
  lineGstRate,
  lineTax,
  splitByWeights,
  comboParts,
  comboTax,
  sumTax,
  taxUnits,
  deliveryTax,
  roundMoney
};
