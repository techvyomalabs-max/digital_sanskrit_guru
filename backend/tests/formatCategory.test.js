const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeBundleFormatsInput, buildSingleFormatChildFields } = require("../utils/bundleFormats");

const parent = { _id: "p1", name: "Saptaha Stotra Sangraha", category: "Flipbook", description: "Prayers" };

test("a format can have its own category; blank means the product's", () => {
  const { formats, error } = normalizeBundleFormatsInput([
    { label: "Paperback", type: "physical", price: 99, category: "  Book  -  Paperback " },
    { label: "Flipbook", type: "digital", price: 99, category: "" },
    { label: "Web Version", type: "digital", price: 99 }
  ]);
  assert.equal(error, "");
  assert.equal(formats[0].category, "Book - Paperback", "spaces tidied");
  assert.equal(formats[1].category, "");
  assert.equal("category" in formats[2], false, "older forms that don't send it");

  assert.equal(buildSingleFormatChildFields(parent, formats[0]).category, "Book - Paperback");
  assert.equal(buildSingleFormatChildFields(parent, formats[1]).category, "Flipbook");
  assert.equal(buildSingleFormatChildFields(parent, formats[2]).category, "Flipbook");
});

test("format category is limited to 80 characters", () => {
  const { formats } = normalizeBundleFormatsInput([{ label: "Print", type: "physical", price: 1, category: "x".repeat(200) }]);
  assert.equal(formats[0].category.length, 80);
});
