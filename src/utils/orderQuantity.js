// Per-order quantity limits shown in the cart. Mirrors backend/utils/orderQuantity.js,
// which the server applies again when it prices the order.
export const MAX_RETAIL_QUANTITY = 5;
// Copies of one digital product per order (extra copies become shareable codes).
// Mirrors MAX_DIGITAL_COPIES in backend/utils/digitalCopies.js.
export const MAX_DIGITAL_COPIES = 10;

// A single digital product whose extra copies can be passed on as codes: not a combo, and
// not one whose access our team sets up by hand (those can't be gifted).
export function canShareDigitalCopies(item) {
  if (!item || item.isDigital !== true) return false;
  const type = String(item.productType || item.product?.productType || "").toLowerCase();
  if (type === "bundle" || (Array.isArray(item.bundleItems) && item.bundleItems.length > 0)) return false;
  const delivery = String(item.digitalDelivery || "onsite").toLowerCase();
  return !(item.externalAccessManual === true && delivery === "external");
}

// Largest quantity the cart allows for one line: digital items 10 copies when they can be
// shared (else 1), bulk products unlimited, everything else 5 (or the stock left, if lower).
export function maxCartQuantity({ isDigital = false, isBulk = false, stock = 0, canShareCopies = false } = {}) {
  if (isDigital) return canShareCopies ? MAX_DIGITAL_COPIES : 1;
  if (isBulk) return Infinity;
  const inStock = Number(stock);
  return inStock > 0 ? Math.min(MAX_RETAIL_QUANTITY, inStock) : MAX_RETAIL_QUANTITY;
}

// The quantity actually kept in the cart: the per-order rule only, not stock, so a
// low-stock line isn't silently reduced (stock is checked when payment starts).
export function clampCartQuantity(quantity, { isDigital = false, isBulk = false, canShareCopies = false } = {}) {
  const wanted = Math.max(1, Math.floor(Number(quantity) || 1));
  if (isDigital) return canShareCopies ? Math.min(MAX_DIGITAL_COPIES, wanted) : 1;
  if (isBulk) return wanted;
  return Math.min(MAX_RETAIL_QUANTITY, wanted);
}
