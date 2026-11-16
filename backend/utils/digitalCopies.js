"use strict";

/**
 * Buying several copies of a digital product (pure; no DB).
 *
 * - A single digital product (web version, flipbook, ...) can be bought up to MAX_DIGITAL_COPIES
 *   at a time. Combos, and products whose access our team sets up by hand, stay at 1 (they
 *   can't be gifted, so extra copies couldn't be passed on).
 * - The buyer gets one copy in their own library if they don't have working access already;
 *   every other copy is a shareable code (a GiftPass) they can give to anyone.
 * - "Working access" is checked against what they own now, so someone whose earlier copy
 *   ended (refunded, cancelled, item refunded or code revoked) gets a library copy again.
 * - A gift order gives the buyer no copy: every copy is a code.
 *
 * Each digital line is stamped with shareableCopies (how many codes to issue). A line where
 * the buyer gets no copy is also marked isGift, which is what keeps it out of their library.
 */

const MAX_DIGITAL_COPIES = 10;

function isBundleProduct(p) {
  return String(p?.productType || "").toLowerCase() === "bundle" || (Array.isArray(p?.bundleItems) && p.bundleItems.length > 0);
}

/** Product (from the DB) whose extra copies can become shareable codes. */
function canShareCopies(product) {
  if (product?.isDigital !== true || isBundleProduct(product)) return false;
  const delivery = String(product?.digitalDelivery || "onsite").toLowerCase();
  return !(product?.externalAccessManual === true && delivery === "external");
}

/** Normalized order item (from normalizeOrderItem) whose extra copies can become codes. */
function lineCanShareCopies(item) {
  // Lines whose access our team sets up by hand (including gift lines held for a recipient)
  // keep one code per line
  return item?.isDigital === true && !isBundleProduct(item) && item?.accessManual !== true && item?.giftAccessManual !== true;
}

/** Most copies of a digital product one order may hold. */
function maxDigitalCopies(product) {
  return canShareCopies(product) ? MAX_DIGITAL_COPIES : 1;
}

/**
 * Decides, for each digital line, how many copies go to the buyer and how many become codes.
 * Mutates and returns the items: sets `shareableCopies` (and `isGift` when the buyer gets none).
 * @param {object[]} items      normalized order items
 * @param {object} options
 * @param {Set<string>} options.ownedIds  digital product ids the buyer has working access to
 * @param {boolean} options.isGift        the whole order is a gift
 */
function planDigitalCopies(items, { ownedIds = new Set(), isGift = false } = {}) {
  const owned = ownedIds instanceof Set ? ownedIds : new Set(Array.from(ownedIds || []).map(String));
  for (const item of Array.isArray(items) ? items : []) {
    if (!lineCanShareCopies(item)) continue;
    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const buyerHasIt = owned.has(String(item.product?._id || item.product || ""));
    const toBuyer = isGift || buyerHasIt ? 0 : 1;
    item.shareableCopies = quantity - toBuyer;
    if (toBuyer === 0) item.isGift = true;
  }
  return items;
}

/**
 * How many codes an order line should have. Lines stamped by planDigitalCopies say so;
 * older gift lines (before multiple copies) have one code each, other older lines none.
 */
function codesForLine(order, item) {
  if (item?.isDigital !== true) return 0;
  const stamped = Number(item?.shareableCopies);
  if (Number.isInteger(stamped) && stamped >= 0) return Math.min(stamped, MAX_DIGITAL_COPIES);
  return order?.isGift || item?.isGift ? 1 : 0;
}

/** Short description of a line's copies, for the cart and order pages. */
function describeCopies({ quantity = 1, buyerHasIt = false, isGift = false } = {}) {
  const q = Math.max(1, Math.floor(Number(quantity) || 1));
  if (isGift) return q === 1 ? "1 gift code" : `${q} gift codes`;
  if (buyerHasIt) return q === 1 ? "Already in your library: this copy will be a shareable code" : `Already in your library: all ${q} copies will be shareable codes`;
  if (q === 1) return "";
  return `1 copy for you + ${q - 1} shareable ${q - 1 === 1 ? "code" : "codes"}`;
}

module.exports = {
  MAX_DIGITAL_COPIES,
  canShareCopies,
  lineCanShareCopies,
  maxDigitalCopies,
  planDigitalCopies,
  codesForLine,
  describeCopies
};
