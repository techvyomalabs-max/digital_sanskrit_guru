/**
 * Shared helpers for manual digital access status checks.
 * Pure functions, no React.
 *
 * NOTE: isDigitalLikeItem must stay in sync with backend/utils/accessFulfilment.js.
 */

/**
 * Returns true when an order item is digital or has a digital format/link.
 * Matches backend/utils/accessFulfilment.js isDigitalLikeItem.
 */
export function isDigitalLikeItem(item) {
  if (!item) return false;
  if (item.isDigital) return true;
  if (item.webReaderLink) return true;
  if (item.externalAccessLink) return true;
  if (item.kindleLink) return true;

  const name = String(item.name || "").toLowerCase();
  const format = String(item.format || "").toLowerCase();

  if (
    name.includes("web") ||
    name.includes("kindle") ||
    name.includes("flipbook")
  ) return true;

  if (
    format.includes("web") ||
    format.includes("flipbook")
  ) return true;

  return false;
}

/**
 * True when an item requires manual admin access and access has not yet been granted.
 * Excludes items that have been refunded.
 */
export function isAccessPending(item) {
  if (!item) return false;
  if (item.accessGrantedAt) return false;
  if (String(item.returnRequest?.status || "").trim().toLowerCase() === "refunded") return false;
  if (item.accessPending === true) return true;
  if (item.accessManual === true) return true;
  return false;
}

/**
 * True when the order is paid, not cancelled, not fully refunded, and has at least one
 * item with manual access pending.
 */
export function orderHasPendingAccess(order) {
  if (!order) return false;
  const isPaid = String(order.paymentStatus || "").toLowerCase() === "paid";
  const isCancelled = String(order.status || "").toLowerCase() === "cancelled";
  const isRefunded = String(order.refundStatus || "").toLowerCase() === "refunded";
  if (!isPaid || isCancelled || isRefunded) return false;

  const items = Array.isArray(order.items) ? order.items : [];
  return items.some((item) => isAccessPending(item));
}

/**
 * Returns array of { index, item } for pending items, keeping original index in order.items
 * (used by the grant-access endpoint).
 */
export function pendingAccessItems(order) {
  if (!order || !Array.isArray(order.items)) return [];
  const result = [];
  order.items.forEach((item, index) => {
    if (isAccessPending(item)) {
      result.push({ index, item });
    }
  });
  return result;
}
