/**
 * backend/utils/productSku.js
 * A product's SKU code (e.g. "VL-LAG-B-003"): optional, set by the admin, one per product or type.
 */
const SKU_MAX_LENGTH = 64;

/**
 * Cleans an SKU: trims it and drops spaces inside it. Blank, "NA" or "-" means no SKU.
 * Returns { sku } or { error }.
 */
function normalizeSku(value) {
  const sku = String(value ?? "").replace(/\s+/g, "").trim();
  if (!sku || /^(na|n\/a|-+)$/i.test(sku)) return { sku: "" };
  if (sku.length > SKU_MAX_LENGTH) return { error: `SKU must be at most ${SKU_MAX_LENGTH} characters.` };
  if (!/^[A-Za-z0-9._/-]+$/.test(sku)) return { error: "SKU may only use letters, numbers and - _ . /" };
  return { sku };
}

module.exports = { normalizeSku, SKU_MAX_LENGTH };
