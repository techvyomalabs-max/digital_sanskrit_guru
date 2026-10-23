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

/**
 * Sanitizes an access note from admin input.
 * Strips control characters (keeping \n), trims, collapses 3+ newlines to 2,
 * cuts to 500 characters. Returns "" for non-strings.
 */
function sanitizeAccessNote(note) {
  if (typeof note !== "string") return "";
  let s = note.replace(/\r\n|\r/g, "\n");
  s = s.replace(/[\x00-\x09\x0B-\x1F\x7F]/g, "");
  s = s.trim();
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.slice(0, 500);
}

/**
 * Applies access grant to items array.
 * Pure function: does not mutate the input array.
 * Returns { items: newItemsArray, grantedIndexes: [], error: "" }
 */
function applyAccessGrant(items, { itemIndexes, adminId, note, now } = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return { items: Array.isArray(items) ? [...items] : [], grantedIndexes: [], error: "No items to grant." };
  }

  const currentDate = now ? new Date(now) : new Date();
  const sanitizedNote = sanitizeAccessNote(note);

  let targetIndexes;
  if (itemIndexes === undefined || itemIndexes === null) {
    targetIndexes = [];
    items.forEach((it, idx) => {
      if (isAccessPending(it)) {
        targetIndexes.push(idx);
      }
    });

    if (targetIndexes.length === 0) {
      return { items: items.map((it) => ({ ...it })), grantedIndexes: [], error: "Access was already granted." };
    }
  } else {
    if (!Array.isArray(itemIndexes) || itemIndexes.length === 0) {
      return { items: items.map((it) => ({ ...it })), grantedIndexes: [], error: "No items specified." };
    }

    targetIndexes = [];
    for (const rawIdx of itemIndexes) {
      const idx = Number(rawIdx);
      if (!Number.isInteger(idx) || idx < 0 || idx >= items.length) {
        return { items: items.map((it) => ({ ...it })), grantedIndexes: [], error: `Item index ${rawIdx} is out of range.` };
      }
      const item = items[idx];
      if (!requiresAdminAccess(item)) {
        return { items: items.map((it) => ({ ...it })), grantedIndexes: [], error: `Item at index ${idx} does not require manual access.` };
      }
      if (item.accessGrantedAt) {
        return { items: items.map((it) => ({ ...it })), grantedIndexes: [], error: "Access was already granted." };
      }
      if (!targetIndexes.includes(idx)) {
        targetIndexes.push(idx);
      }
    }
  }

  const targetSet = new Set(targetIndexes);
  const newItemsArray = items.map((it, idx) => {
    if (targetSet.has(idx)) {
      return {
        ...it,
        accessGrantedAt: currentDate,
        accessGrantedBy: adminId || null,
        accessNote: sanitizedNote
      };
    }
    return { ...it };
  });

  return {
    items: newItemsArray,
    grantedIndexes: targetIndexes,
    error: ""
  };
}

/**
 * Returns true if an order should be set to Completed after a grant:
 * non-empty, every item isDigitalLikeItem, and allDigitalAccessGranted(items).
 */
function shouldCompleteAfterGrant(items) {
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.every(isDigitalLikeItem) && allDigitalAccessGranted(items);
}

/**
 * Returns true for a paid order with at least one pending manual item.
 */
function hasPendingManualAccess(order) {
  if (!order) return false;
  const isPaid = String(order.paymentStatus || "").toLowerCase() === "paid";
  if (!isPaid) return false;
  const items = Array.isArray(order.items) ? order.items : [];
  return items.some(isAccessPending);
}

module.exports = {
  isDigitalLikeItem,
  requiresAdminAccess,
  isAccessPending,
  canAutoComplete,
  allDigitalAccessGranted,
  sanitizeAccessNote,
  applyAccessGrant,
  shouldCompleteAfterGrant,
  hasPendingManualAccess
};
