"use strict";

/**
 * The order details checkout sends when payment starts, kept with the payment so the
 * server can create the order itself if the browser never does (tab closed after paying).
 * Only the fields /api/orders reads are kept; payment fields are never taken from here.
 */
const DRAFT_FIELDS = ["items", "total", "shipping", "billing", "couponCode", "discount", "isGift", "giftRecipientEmail", "currencyDisplay"];
const MAX_DRAFT_BYTES = 100 * 1024;

function cleanOrderDraft(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (!Array.isArray(raw.items) || raw.items.length === 0 || raw.items.length > 200) return null;
  const draft = {};
  for (const key of DRAFT_FIELDS) {
    if (raw[key] !== undefined) draft[key] = raw[key];
  }
  let json;
  try {
    json = JSON.stringify(draft);
  } catch {
    return null;
  }
  if (json.length > MAX_DRAFT_BYTES) return null;
  // A plain copy: no prototypes, functions or Mongo operators as keys
  if (/"\$[a-z]/i.test(json)) return null;
  return JSON.parse(json);
}

module.exports = { cleanOrderDraft, DRAFT_FIELDS, MAX_DRAFT_BYTES };
