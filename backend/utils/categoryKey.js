// Product categories are typed by hand in the admin panel, so the same category
// can appear as "Book - Paperback", "Book-Paperback" or "book - paperback".
// categoryKey() gives all of those one key, so the collection filter shows a
// single button for them and the button matches every spelling.
// Keep in sync with src/utils/categoryKey.js (used by the admin panel).
function categoryKey(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/\s*([-–—/&,])\s*/g, "$1")
    .replace(/\s+/g, " ");
}

// Store categories that already mean "combo / bundle products". When one of
// these exists, the automatic "Bundle" filter would list the same products a
// second time, so it is folded into this category instead.
const COMBO_CATEGORY_KEYS = new Set(["combo", "combos", "bundle", "bundles", "combo pack", "combo packs"]);

function isComboCategory(label) {
  return COMBO_CATEGORY_KEYS.has(categoryKey(label));
}

module.exports = { categoryKey, isComboCategory };
