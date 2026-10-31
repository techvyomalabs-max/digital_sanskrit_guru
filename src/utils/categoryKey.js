// Mirror of backend/utils/categoryKey.js: one key for category names that differ
// only in spacing or capital letters ("Book - Paperback" / "Book-Paperback").
export function categoryKey(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/\s*([-–—/&,])\s*/g, "$1")
    .replace(/\s+/g, " ");
}

const COMBO_CATEGORY_KEYS = new Set(["combo", "combos", "bundle", "bundles", "combo pack", "combo packs"]);

// Finds the category in `categories` that a link's ?category= value refers to:
// the same name spelled differently, or, for the old "Bundle" filter, the store's
// combo category (the backend folds the Bundle filter into it).
export function resolveCategoryAlias(requested, categories) {
  const list = Array.isArray(categories) ? categories : [];
  if (!requested || requested === "All" || list.includes(requested)) return requested;
  const key = categoryKey(requested);
  const sameName = list.find((category) => categoryKey(category) === key);
  if (sameName) return sameName;
  if (COMBO_CATEGORY_KEYS.has(key)) {
    return list.find((category) => COMBO_CATEGORY_KEYS.has(categoryKey(category))) || requested;
  }
  return requested;
}
