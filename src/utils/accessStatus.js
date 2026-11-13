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

  if (Array.isArray(item.bundleItems) && item.bundleItems.length > 0) {
    return item.bundleItems.every((comp) => {
      if (!comp) return false;
      if (comp.isDigital === true) return true;
      const hasLink = (link) => (typeof link === "string" ? link.trim().length > 0 : Boolean(link));
      return hasLink(comp.webReaderLink) || hasLink(comp.kindleLink) || hasLink(comp.externalAccessLink);
    });
  }

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

const DIGITAL_NAME_WORDS = ["web", "kindle", "flipbook"];
const hasText = (value) => (typeof value === "string" ? value.trim().length > 0 : Boolean(value));

/**
 * Does this order item (or combo component) give online access?
 * Orders saved by the store always carry an isDigital flag, so the name is only used as a
 * guess for old/imported items without one. A combo decides by its components, never by its
 * own name: "All Products Bundle Web-version – USB" is a shipped USB, and its components
 * are plain shipped copies (isDigital false, no links).
 */
export function itemGivesOnlineAccess(item) {
  if (!item) return false;
  if (Array.isArray(item.bundleItems) && item.bundleItems.length > 0) {
    return item.isDigital === true || item.bundleItems.some((component) => itemGivesOnlineAccess(component));
  }
  if (
    item.isDigital === true ||
    item.legacyAccess ||
    (item.digitalDelivery || item.product?.digitalDelivery) === "external" ||
    hasText(item.webReaderLink) ||
    hasText(item.kindleLink) ||
    hasText(item.externalAccessLink)
  ) {
    return true;
  }
  if (typeof item.isDigital === "boolean") return false;
  const name = String(item.name || "").toLowerCase();
  const format = String(item.format || "").toLowerCase();
  return DIGITAL_NAME_WORDS.some((word) => name.includes(word)) || format.includes("web") || format.includes("flipbook");
}
