const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_PRODUCT_FORMAT_TYPES,
  normalizeProductFormatTypes,
  resolveProductFormatTypes,
  effectiveFormatTax,
  formatTypeForKind,
  findType,
  publicProductFormatTypes
} = require("../utils/productFormatTypes");

test("default types carry finance's GST rules", () => {
  const byKey = Object.fromEntries(DEFAULT_PRODUCT_FORMAT_TYPES.map((t) => [t.key, t]));
  assert.deepEqual([byKey.paper.hsnSac, byKey.paper.gstRate], ["4901", 0]);
  assert.deepEqual([byKey.pendrive.hsnSac, byKey.pendrive.gstRate], ["8523", 18]);
  assert.deepEqual([byKey["web-version"].hsnSac, byKey["web-version"].gstRate], ["998433", 18]);
  assert.deepEqual([byKey["audio-book"].hsnSac, byKey["audio-book"].gstRate], ["998433", 18]);
  assert.equal(byKey.kindle.kind, "kindle");
});

test("normalizeProductFormatTypes keeps keys, adds new ones, rejects bad values", () => {
  const { types, error } = normalizeProductFormatTypes([
    { key: "paper", label: "Paperback", kind: "physical", hsnSac: "4901", gstRate: 0 },
    { label: "Video Course", kind: "digital", hsnSac: "998433", gstRate: "18", note: " Watch online " }
  ]);
  assert.equal(error, "");
  assert.equal(types[0].key, "paper", "renaming keeps the key");
  assert.equal(types[1].key, "video-course");
  assert.equal(types[1].gstRate, 18);
  assert.equal(types[1].note, "Watch online");
  assert.ok(normalizeProductFormatTypes([]).error);
  assert.ok(normalizeProductFormatTypes([{ label: "A", kind: "box" }]).error);
  assert.ok(normalizeProductFormatTypes([{ label: "A", kind: "physical", hsnSac: "12" }]).error);
  assert.ok(normalizeProductFormatTypes([{ label: "A", kind: "physical", gstRate: 7 }]).error);
  assert.ok(normalizeProductFormatTypes([{ label: "A", kind: "physical" }, { label: "a", kind: "digital" }]).error);
});

test("resolveProductFormatTypes falls back to the defaults", () => {
  assert.equal(resolveProductFormatTypes([]).length, DEFAULT_PRODUCT_FORMAT_TYPES.length);
  assert.equal(resolveProductFormatTypes(null)[0].key, "paper");
});

test("a format's tax follows its type unless it has its own", () => {
  const pendrive = findType(DEFAULT_PRODUCT_FORMAT_TYPES, "pendrive");
  assert.deepEqual(effectiveFormatTax({}, pendrive), { hsnSac: "8523", gstRate: 18 });
  assert.deepEqual(effectiveFormatTax({ hsnSac: "8471", gstRate: 12 }, pendrive), { hsnSac: "8471", gstRate: 12 });
  assert.deepEqual(effectiveFormatTax({ gstRate: 0 }, pendrive), { hsnSac: "8523", gstRate: 0 });
  assert.deepEqual(effectiveFormatTax({}, null), { hsnSac: "", gstRate: null });
});

test("type kinds map to physical/digital formats", () => {
  assert.equal(formatTypeForKind("physical"), "physical");
  assert.equal(formatTypeForKind("digital"), "digital");
  assert.equal(formatTypeForKind("kindle"), "digital");
  assert.equal(formatTypeForKind("x"), "");
});

test("the shop sees no tax details", () => {
  const pub = publicProductFormatTypes(DEFAULT_PRODUCT_FORMAT_TYPES);
  assert.deepEqual(Object.keys(pub[0]).sort(), ["key", "kind", "label", "note", "position"]);
});
