/**
 * Utilities for external digital delivery products and combos.
 */

export function isExternalDelivery(item) {
  if (!item) return false;
  const delivery = item.digitalDelivery || item.product?.digitalDelivery;
  return delivery === "external";
}

export function hasExternalDelivery(items) {
  if (!Array.isArray(items)) return false;
  return items.some((item) => isExternalDelivery(item));
}
