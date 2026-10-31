const test = require("node:test");
const assert = require("node:assert/strict");
const { categoryKey } = require("../utils/categoryKey");

test("categoryKey: spacing and capital letters do not create separate categories", () => {
  assert.equal(categoryKey("Book - Paperback"), categoryKey("Book-Paperback"));
  assert.equal(categoryKey("Learning Path"), categoryKey("learning path"));
  assert.equal(categoryKey("  E-Book  -  Kindle "), categoryKey("E-Book - Kindle"));
  assert.equal(categoryKey("Calendar – Paperback"), categoryKey("Calendar–Paperback"));
});

test("categoryKey: different categories stay different", () => {
  assert.notEqual(categoryKey("Book - Paperback"), categoryKey("Calendar - Paperback"));
  assert.notEqual(categoryKey("Web Version"), categoryKey("WebVersion - Audio"));
  assert.equal(categoryKey(""), "");
  assert.equal(categoryKey(null), "");
});

test("isComboCategory: recognises categories that already hold combo/bundle products", () => {
  const { isComboCategory } = require("../utils/categoryKey");
  assert.equal(isComboCategory("Combo"), true);
  assert.equal(isComboCategory(" bundles "), true);
  assert.equal(isComboCategory("Combo Packs"), true);
  assert.equal(isComboCategory("Book - Paperback"), false);
  assert.equal(isComboCategory("Bulk Products"), false);
});

test("categoryKey (frontend copy) matches the backend version", async () => {
  const frontend = await import("../../src/utils/categoryKey.js");
  for (const label of ["Book - Paperback", "Book-Paperback", "  E-Book  -  Kindle ", "Learning path", "Calendar – Paperback", ""]) {
    assert.equal(frontend.categoryKey(label), categoryKey(label), label);
  }
});

test("resolveCategoryAlias: old links point at the category the shop now shows", async () => {
  const { resolveCategoryAlias } = await import("../../src/utils/categoryKey.js");
  const shown = ["All", "Web Version", "Book-Paperback", "Combo"];
  assert.equal(resolveCategoryAlias("Bundle", shown), "Combo");
  assert.equal(resolveCategoryAlias("Book - Paperback", shown), "Book-Paperback");
  assert.equal(resolveCategoryAlias("Web Version", shown), "Web Version");
  assert.equal(resolveCategoryAlias("All", shown), "All");
  assert.equal(resolveCategoryAlias("Unknown", shown), "Unknown");
  assert.equal(resolveCategoryAlias("Bundle", ["All", "Web Version"]), "Bundle");
});
