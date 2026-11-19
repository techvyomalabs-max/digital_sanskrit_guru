"use strict";
/**
 * Refunds of orders with shareable / gift codes (pure; no DB).
 *
 * A code someone has already redeemed is a copy that was used, so it is not refunded: the
 * refundable amount leaves out the value of the used codes. When an item is refunded, its codes
 * that nobody has used yet stop working; the used ones keep working (they were not refunded).
 */

const { codesForLine } = require("./digitalCopies");

const round2 = (num) => Math.round((Number(num) || 0) * 100) / 100;

const lineId = (it) => String(it?._id || it?.id || it?.product || "");

/** Does any line of the order have codes? (Only then are the order's codes looked up.) */
function orderHasCodes(order) {
  return (Array.isArray(order?.items) ? order.items : []).some((it) => codesForLine(order, it) > 0);
}

/** Number of used (redeemed, not revoked) codes per line index. */
function usedCodeCounts(passes) {
  const counts = new Map();
  for (const p of Array.isArray(passes) ? passes : []) {
    if (p?.isRedeemed !== true || p?.isRevoked === true) continue;
    const i = Number(p.lineIndex) || 0;
    counts.set(i, (counts.get(i) || 0) + 1);
  }
  return counts;
}

/** The order's INR rate, the same way the refund quote works it out. */
function orderFxRate(order) {
  const total = Number(order?.total || 0);
  const totalInInr = Number(order?.totalInInr !== undefined && order?.totalInInr !== null ? order.totalInInr : total);
  return Number(order?.fxRateToInr) || (total > 0 && totalInInr > 0 ? totalInInr / total : 1);
}

/**
 * The value (INR) of the used codes on the chosen lines (all lines when itemIds is empty).
 * A copy's value is its price less its share of the order discount, like the refund quote.
 * Returns { count, valueInInr }.
 */
function usedCodesValue(order, passes, itemIds = []) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const counts = usedCodeCounts(passes);
  if (counts.size === 0) return { count: 0, valueInInr: 0 };

  const wanted = new Set((Array.isArray(itemIds) ? itemIds : []).map(String).filter(Boolean));
  const allGross = items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);
  const discount = Number(order?.discount || 0);
  const fx = orderFxRate(order);

  let count = 0;
  let value = 0;
  items.forEach((it, index) => {
    if (wanted.size > 0 && !wanted.has(lineId(it))) return;
    const used = Math.min(counts.get(index) || 0, Math.max(1, Number(it.quantity) || 1));
    if (used <= 0) return;
    const unit = Number(it.price) || 0;
    const unitDiscount = allGross > 0 ? discount * (unit / allGross) : 0;
    count += used;
    value += used * Math.max(0, unit - unitDiscount) * fx;
  });
  return { count, valueInInr: round2(value) };
}

/**
 * Line indexes whose unused codes stop working after a refund of these items
 * (every line when itemIds is empty).
 */
function refundedLineIndexes(order, itemIds = []) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const wanted = new Set((Array.isArray(itemIds) ? itemIds : []).map(String).filter(Boolean));
  return items
    .map((it, index) => ({ it, index }))
    .filter(({ it }) => (wanted.size === 0 || wanted.has(lineId(it))) && codesForLine(order, it) > 0)
    .map(({ index }) => index);
}

module.exports = { orderHasCodes, usedCodeCounts, usedCodesValue, refundedLineIndexes };
