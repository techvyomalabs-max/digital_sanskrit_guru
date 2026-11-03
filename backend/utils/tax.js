function getItemHsnSac(item) {
  if (item?.hsnSac) return String(item.hsnSac).trim();
  const name = String(item?.name || "").trim().toLowerCase();
  const category = String(item?.category || "").trim().toLowerCase();

  // E-books, Kindle books, Web versions, and Digital formats are taxed at 18% GST (SAC 9973 or 9984)
  const isDigital =
    category.includes("ebook") ||
    category.includes("e-book") ||
    category.includes("kindle") ||
    category.includes("web version") ||
    category.includes("web-version") ||
    category.includes("flipbook") ||
    name.includes("ebook") ||
    name.includes("e-book") ||
    name.includes("kindle") ||
    name.includes("web version") ||
    name.includes("web-version") ||
    name.includes("flipbook") ||
    name.includes("epub") ||
    name.includes("pdf");

  if (isDigital) {
    return "9973";
  }

  // Exempt printed books: category or name based check (HSN Chapter 49 - 0% GST)
  const isPrintedBook =
    category.includes("book") ||
    category.includes("sanskrit") ||
    category.includes("gita") ||
    category.includes("scriptures") ||
    category.includes("grammar") ||
    category.includes("dharma") ||
    category.includes("paperback") ||
    name.includes("book") ||
    name.includes("volume") ||
    name.includes("vol.") ||
    name.includes("hardcover") ||
    name.includes("paperback");

  return isPrintedBook ? "4901" : "8523";
}

const roundMoney = (v) => Math.round((Number(v) || 0) * 100) / 100;

/** The code to print for a line: the product's own HSN/SAC if the admin set one, else the rule above. */
function lineCode(item) {
  return getItemHsnSac(item);
}

/**
 * GST rate % for a line.
 * - Sales outside India: 0 (export).
 * - The product's own GST rate, when the admin set one.
 * - Printed books (HSN 4901): 0.
 * - Otherwise the store-wide rate from settings.
 */
function lineGstRate(item, { isInternational = false, storeRate = 0 } = {}) {
  if (isInternational) return 0;
  const own = item?.gstRate;
  if (own !== null && own !== undefined && own !== "" && Number.isFinite(Number(own))) {
    return Math.min(50, Math.max(0, Number(own)));
  }
  if (lineCode(item) === "4901") return 0;
  return Math.min(50, Math.max(0, Number(storeRate) || 0));
}

/**
 * The tax on one line, from the price the customer paid (prices include GST).
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

module.exports = { getItemHsnSac, lineCode, lineGstRate, lineTax, roundMoney };
