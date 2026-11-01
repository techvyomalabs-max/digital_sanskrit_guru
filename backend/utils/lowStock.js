"use strict";

/**
 * Which products can run low on stock: physical products only.
 * - Digital products (web versions, flipbooks, digital combo formats) never run out; their stock
 *   field is 0 and must not trigger "out of stock" lists or "only 0 left" alerts.
 * - Products with options (including combos sold in formats) are left out: each physical
 *   option/format has its own stock and is listed on its own, so the parent would be a duplicate.
 */

const DEFAULT_THRESHOLD = 5;

function lowStockThreshold(settings) {
  const n = Number(settings?.lowStockThreshold);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_THRESHOLD;
}

/** Mongo filter for products at or below the threshold. */
function lowStockFilter(threshold = DEFAULT_THRESHOLD, extra = {}) {
  return {
    ...extra,
    stock: { $lte: threshold },
    isDeleted: { $ne: true },
    isDigital: { $ne: true },
    hasOptions: { $ne: true }
  };
}

/** Same rule for a product already loaded. */
function isLowStock(product, threshold = DEFAULT_THRESHOLD) {
  if (!product || product.isDeleted === true || product.isDigital === true || product.hasOptions === true) return false;
  return Number(product.stock ?? 0) <= threshold;
}

/** The two checkboxes on Marketing → Low-Stock Alerts (on unless switched off). */
function alertChannels(settings) {
  return { email: settings?.emailEnabled !== false, push: settings?.pushEnabled !== false };
}

module.exports = { DEFAULT_THRESHOLD, lowStockThreshold, lowStockFilter, isLowStock, alertChannels };
