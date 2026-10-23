/**
 * Pure helpers for "admin must grant access" fulfilment logic.
 * CommonJS — no database, no side-effects.
 */

/**
 * Returns true when the order-item looks digital (same meaning the codebase
 * already uses in autoCompletePaidDigitalOrders and the other four inline
 * "isDigitalOnly" checks).
 */
function isDigitalLikeItem(item) {
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

/** True when the item's snapshot says "admin must grant access". */
function requiresAdminAccess(item) {
  return item?.accessManual === true;
}

/** True when admin access is required but has NOT yet been granted. */
function isAccessPending(item) {
  return requiresAdminAccess(item) && !item.accessGrantedAt;
}

/**
 * Returns true when the order can be auto-completed (all items are digital-
 * like AND none require manual admin access).
 * Replaces the inline "isDigitalOnly" check in the four places that set
 * status → Completed.
 */
function canAutoComplete(items) {
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.every(
    (it) => isDigitalLikeItem(it) && !requiresAdminAccess(it)
  );
}

/**
 * Returns true when every digital-like item either does NOT require admin
 * access or has already been granted.
 */
function allDigitalAccessGranted(items) {
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.every(
    (it) => !isDigitalLikeItem(it) || !requiresAdminAccess(it) || !!it.accessGrantedAt
  );
}

module.exports = {
  isDigitalLikeItem,
  requiresAdminAccess,
  isAccessPending,
  canAutoComplete,
  allDigitalAccessGranted
};
