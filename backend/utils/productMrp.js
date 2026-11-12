"use strict";

/**
 * A product's M.R.P. (maximum retail price), e.g. the price printed on a book's cover.
 * Optional, shown crossed out next to the selling price; never used to work out what the
 * customer pays, totals, GST or invoices. Under Indian rules nothing may be sold above it,
 * so it can't be lower than the selling price.
 */

/** Returns { value } (undefined = not sent, null = cleared, number) or { error }. */
function normalizeMrpInput(raw) {
  if (raw === undefined) return { value: undefined };
  if (raw === null || String(raw).trim() === "") return { value: null };
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return { error: "M.R.P. must be a number, 0 or more (or left blank)." };
  return { value: Math.round(value * 100) / 100 };
}

/** The error to show when the M.R.P. is below the selling price, else "". */
function mrpBelowPriceError(mrp, price) {
  if (mrp === null || mrp === undefined || !Number.isFinite(Number(price))) return "";
  return Number(mrp) < Number(price)
    ? `M.R.P. (Rs ${Number(mrp)}) can't be lower than the selling price (Rs ${Number(price)}).`
    : "";
}

module.exports = { normalizeMrpInput, mrpBelowPriceError };
