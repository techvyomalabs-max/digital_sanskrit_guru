// Per-order quantity limits shown in the cart. Mirrors backend/utils/orderQuantity.js,
// which the server applies again when it prices the order.
export const MAX_RETAIL_QUANTITY = 5;

// Largest quantity the cart allows for one line:
// digital items 1, bulk products unlimited, everything else 5 (or the stock left, if lower).
export function maxCartQuantity({ isDigital = false, isBulk = false, stock = 0 } = {}) {
  if (isDigital) return 1;
  if (isBulk) return Infinity;
  const inStock = Number(stock);
  return inStock > 0 ? Math.min(MAX_RETAIL_QUANTITY, inStock) : MAX_RETAIL_QUANTITY;
}

// The quantity actually kept in the cart: the per-order rule only, not stock, so a
// low-stock line isn't silently reduced (stock is checked when payment starts).
export function clampCartQuantity(quantity, { isDigital = false, isBulk = false } = {}) {
  const wanted = Math.max(1, Math.floor(Number(quantity) || 1));
  if (isDigital) return 1;
  if (isBulk) return wanted;
  return Math.min(MAX_RETAIL_QUANTITY, wanted);
}
