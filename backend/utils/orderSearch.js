"use strict";

/**
 * Extra admin order-search conditions for the references people actually type:
 *   - the full order ID (24 characters)
 *   - the short order ID shown on the Orders page (#A66A7B) or in finance reports (72A66A7B):
 *     the end of the order ID, with or without "#"
 *   - the invoice number, whole or in part (DSG/2026-27/0002, 2026-27/0002, 0002)
 */

const escapeRegex = (str) => String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function orderReferenceConditions(searchText) {
  const text = String(searchText || "").trim();
  if (!text) return [];
  const conditions = [{ invoiceNumber: { $regex: escapeRegex(text), $options: "i" } }];

  const ref = text.replace(/^#/, "");
  if (/^[0-9a-f]{24}$/i.test(ref)) {
    conditions.push({ _id: ref.toLowerCase() });
  } else if (/^[0-9a-f]{4,23}$/i.test(ref)) {
    // Order IDs are stored as ObjectIds, so compare the end of their text form
    conditions.push({
      $expr: { $regexMatch: { input: { $toString: "$_id" }, regex: `${ref.toLowerCase()}$` } }
    });
  }
  return conditions;
}

module.exports = { orderReferenceConditions, escapeRegex };
