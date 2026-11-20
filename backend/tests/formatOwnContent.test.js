const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSingleFormatChildFields, ownContentDiff, withoutOwnContent } = require("../utils/bundleFormats");

const main = {
  _id: "p1",
  name: "Gita",
  description: "Main text",
  aboutProduct: ["Point one"],
  image: "m1.jpg",
  images: ["m1.jpg", "m2.jpg"],
  trailerVideoUrl: "https://youtu.be/abc"
};

test("a type that still matches the main product has no own content", () => {
  const expected = buildSingleFormatChildFields(main, { key: "paper", label: "Paper", type: "physical", price: 100 });
  assert.deepEqual(ownContentDiff({ ...expected, description: "  Main text " }, expected), []);
});

test("the type's own image from the main product's type row is not counted as its own", () => {
  const expected = buildSingleFormatChildFields(main, { key: "usb", label: "Pendrive", type: "physical", price: 300, image: "usb.jpg" });
  assert.deepEqual(ownContentDiff({ ...expected }, expected), []);
  assert.equal(expected.image, "usb.jpg");
});

test("changed description and images become the type's own; About and video still follow", () => {
  const expected = buildSingleFormatChildFields(main, { key: "paper", label: "Paper", type: "physical", price: 100 });
  const child = { ...expected, description: "Paperback text", image: "p.jpg", images: ["p.jpg"] };
  assert.deepEqual(ownContentDiff(child, expected), ["description", "images"]);
});

test("a main product save leaves the type's own fields out", () => {
  const fields = buildSingleFormatChildFields({ ...main, description: "Fixed" }, { key: "paper", label: "Paper", type: "physical", price: 100 });
  const kept = withoutOwnContent(fields, ["description", "images"]);
  assert.equal("description" in kept, false);
  assert.equal("image" in kept, false);
  assert.equal("images" in kept, false);
  assert.deepEqual(kept.aboutProduct, ["Point one"]);
  assert.equal(kept.price, 100);
});
