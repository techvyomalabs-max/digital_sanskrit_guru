const test = require("node:test");
const assert = require("node:assert/strict");

const load = async () => ({
  ...(await import("../../src/utils/productImport.js")),
  ...(await import("../../src/utils/productsCsv.js"))
});

const gita = {
  _id: "aaaaaaaaaaaaaaaaaaaaaaa1",
  slug: "bhagavad-gita",
  name: "श्रीमद्भगवद्गीता",
  price: 499,
  mrp: 599,
  stock: 5,
  category: "Gita",
  description: "Line one\r\nLine two",
  aboutProduct: ["Hardbound", "Sanskrit + English"],
  image: "a.jpg",
  images: ["a.jpg", "b.jpg"],
  internationalCountryPrices: [{ country: "US", price: 12 }],
  marketPrices: []
};
const main = { _id: "aaaaaaaaaaaaaaaaaaaaaaa2", slug: "amarakosha", name: "Amarakosha", price: 199, stock: 3, hasOptions: true, category: "Sanskrit" };
const format = {
  _id: "aaaaaaaaaaaaaaaaaaaaaaa3",
  slug: "amarakosha-web",
  name: "Amarakosha – Web Version",
  price: 199,
  stock: 0,
  optionParent: main._id,
  bundleFormatKey: "web-version",
  category: "Sanskrit",
  isDigital: true
};
const all = [gita, main, format];

// Export, then read the file back like the upload does
const roundTrip = async (products, edit = (rows) => rows) => {
  const { buildProductsCsv, parseCsvText, readImportFile, planProductImport } = await load();
  const csv = buildProductsCsv(products);
  const rows = parseCsvText(csv);
  const edited = edit(rows);
  const header = Object.keys(rows[0]);
  const { escapeCsvCell } = await import("../../src/utils/ordersCsv.js");
  const text = [header.join(","), ...edited.map((r) => header.map((h) => escapeCsvCell(r[h] ?? "")).join(","))].join("\n");
  const file = readImportFile("products.csv", text);
  return planProductImport(file.rows, file.columns, all);
};

test("an untouched export changes nothing", async () => {
  const plan = await roundTrip(all);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.creates.length, 0);
  assert.equal(plan.unchanged, 3);
});

test("only edited cells are sent, matched by id", async () => {
  const plan = await roundTrip(all, (rows) =>
    rows.map((r) => (r.id === gita._id ? { ...r, price: "450", stock: "9", aboutproduct: "Hardbound\nSanskrit + English\nNew point" } : r))
  );
  assert.equal(plan.updates.length, 1);
  const [u] = plan.updates;
  assert.equal(u.productId, gita._id);
  assert.deepEqual(u.payload, { price: 450, stock: 9, aboutProduct: ["Hardbound", "Sanskrit + English", "New point"] });
});

test("a row with no id but a known slug updates that product; no id and no slug adds a product", async () => {
  const plan = await roundTrip(all, (rows) => [
    ...rows.map((r) => (r.slug === "bhagavad-gita" ? { ...r, id: "", category: "Books" } : r)),
    { name: "New Title", price: "250", category: "Books", stock: "4" }
  ]);
  assert.equal(plan.updates.length, 1);
  assert.deepEqual(plan.updates[0].payload, { category: "Books" });
  assert.equal(plan.creates.length, 1);
  assert.equal(plan.creates[0].payload.name, "New Title");
  assert.equal(plan.creates[0].payload.price, 250);
});

test("an id that matches nothing is reported, never added", async () => {
  const plan = await roundTrip([gita], (rows) => rows.map((r) => ({ ...r, id: "ffffffffffffffffffffffff", slug: "" })));
  assert.equal(plan.notFound.length, 1);
  assert.equal(plan.creates.length, 0);
});

test("format price and international price are updated; its name is not; a main product's own price is skipped", async () => {
  const plan = await roundTrip(all, (rows) =>
    rows.map((r) => {
      if (r.id === format._id) return { ...r, price: "149", internationalprice: "583.33", name: "Renamed" };
      if (r.id === main._id) return { ...r, price: "99" };
      return r;
    })
  );
  const f = plan.updates.find((u) => u.productId === format._id);
  assert.deepEqual(f.payload, { price: 149, internationalPrice: 583.33 });
  assert.deepEqual(f.skipped.map((s) => s.field), ["name"]);
  assert.equal(f.mainName, "Amarakosha");
  const m = plan.updates.find((u) => u.productId === main._id);
  assert.deepEqual(m.payload, {});
  assert.deepEqual(m.skipped.map((s) => s.field), ["price"]);
});

test("Sanskrit turned into ? by Excel is caught and skipped", async () => {
  const plan = await roundTrip([gita], (rows) => rows.map((r) => ({ ...r, name: "?????????????" })));
  assert.equal(plan.garbled, true);
  assert.deepEqual(plan.updates[0].payload, {});
});

test("changing only the first image keeps the rest of the gallery", async () => {
  const plan = await roundTrip([gita], (rows) => rows.map((r) => ({ ...r, image: "c.jpg" })));
  assert.deepEqual(plan.updates[0].payload, { images: ["c.jpg", "a.jpg", "b.jpg"], image: "c.jpg" });
});

test("bad numbers and broken price lists are skipped with a reason", async () => {
  const plan = await roundTrip([gita], (rows) => rows.map((r) => ({ ...r, price: "abc", internationalcountryprices: "[oops" })));
  assert.deepEqual(plan.updates[0].payload, {});
  assert.deepEqual(plan.updates[0].skipped.map((s) => s.field).sort(), ["internationalCountryPrices", "price"]);
});

test("a full JSON export re-uploaded changes nothing", async () => {
  const { buildProductsJson, readImportFile, planProductImport } = await load();
  const file = readImportFile("p.json", buildProductsJson(all));
  const plan = planProductImport(file.rows, file.columns, all);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.unchanged, 3);
});

test("a file Excel saved with broken characters is refused", async () => {
  const { readImportFile } = await load();
  assert.match(readImportFile("p.csv", "name,price\n�,1").error, /CSV UTF-8/);
});

test("a combo's format takes price and international price changes, but not market prices", async () => {
  const { planProductImport } = await load();
  const combo = { _id: "c0", name: "Combo", productType: "bundle", hasOptions: true, price: 3399 };
  const comboWeb = { _id: "c9", name: "Combo – Web version", productType: "bundle", optionParent: "c0", bundleFormatKey: "web-version", price: 3399 };
  const plan = planProductImport([{ id: "c9", price: "3299", internationalprice: "7000" }], new Set(["id", "price", "internationalprice"]), [combo, comboWeb]);
  assert.deepEqual(plan.updates[0].payload, { price: 3299, internationalPrice: 7000 });
  assert.deepEqual(plan.updates[0].skipped, []);
  assert.equal(plan.updates[0].mainName, "Combo");
});

test("Digital, HSN/SAC and GST %: set from the file; blank cells change nothing", async () => {
  const { planProductImport } = await load();
  const path = { _id: "lp1", name: "My Path - Chanting - Beginner", isDigital: false, digitalType: "", hsnSac: "", gstRate: null, price: 399 };
  const cols = new Set(["id", "isdigital", "digitaltype", "hsnsac", "gstrate"]);
  const plan = planProductImport([{ id: "lp1", isdigital: "yes", digitaltype: "Web Version", hsnsac: "998433", gstrate: "18%" }], cols, [path]);
  assert.deepEqual(plan.updates[0].payload, { isDigital: true, digitalType: "Web Version", hsnSac: "998433", gstRate: 18 });

  const blank = planProductImport([{ id: "lp1", isdigital: "", digitaltype: "", hsnsac: "", gstrate: "" }], cols, [path]);
  assert.equal(blank.updates.length, 0);
  assert.equal(blank.unchanged, 1);

  const bad = planProductImport([{ id: "lp1", isdigital: "maybe", hsnsac: "99-84", gstrate: "x" }], cols, [path]);
  assert.deepEqual(bad.updates[0].payload, {});
  assert.deepEqual(bad.updates[0].skipped.map((s) => s.field).sort(), ["gstRate", "hsnSac", "isDigital"]);
});

test("a format's Digital / HSN / GST are refused (they come from its main product's formats table)", async () => {
  const { planProductImport } = await load();
  const main = { _id: "m1", name: "Gita", hasOptions: true, price: 199 };
  const fmt = { _id: "f1", name: "Gita – Web Version", optionParent: "m1", bundleFormatKey: "web-version", isDigital: true, hsnSac: "", gstRate: null, price: 199 };
  const plan = planProductImport([{ id: "f1", hsnsac: "998433", gstrate: "18", isdigital: "no" }], new Set(["id", "hsnsac", "gstrate", "isdigital"]), [main, fmt]);
  assert.deepEqual(plan.updates[0].payload, {});
  assert.deepEqual(plan.updates[0].skipped.map((s) => s.field).sort(), ["gstRate", "hsnSac", "isDigital"]);
});

test("an untouched export (CSV and JSON) still changes nothing with the new columns", async () => {
  const { buildProductsCsv, buildProductsJson, readImportFile, planProductImport } = await load();
  const items = [
    { _id: "a1", name: "Book", price: 199, isDigital: false, digitalType: "Web Version", hsnSac: "4901", gstRate: 0 },
    { _id: "a2", name: "Web", price: 199, isDigital: true, digitalType: "Web Version", hsnSac: "", gstRate: null }
  ];
  for (const [name, text] of [["p.csv", buildProductsCsv(items)], ["p.json", buildProductsJson(items)]]) {
    const f = readImportFile(name, text);
    const plan = planProductImport(f.rows, f.columns, items);
    assert.equal(plan.updates.length, 0, name);
    assert.equal(plan.unchanged, 2, name);
  }
});
