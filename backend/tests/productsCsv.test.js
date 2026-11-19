const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/utils/productsCsv.js");

const parent = {
  _id: "p1",
  name: "Bhagavad Gita",
  price: 499,
  internationalCountryPrices: [{ country: "US", price: 12 }],
  marketPrices: [],
  image: "https://img/a.jpg",
  images: ["https://img/a.jpg", "https://img/b.jpg"],
  description: 'Line one, with "quotes"\nLine two',
  aboutProduct: "=not a formula",
  category: "Gita",
  stock: 5,
  hasOptions: true
};
const child = { _id: "c1", name: "Bhagavad Gita - Web Version", price: 199, optionParent: "p1", formatTypeKey: "web-version", isDigital: true, digitalType: "web", stock: 0 };
const other = { _id: "o1", name: "Amarakosha", price: 300, category: "Sanskrit", stock: 2 };

test("export puts main products A–Z with their formats after them", async () => {
  const { buildProductsCsv, parseCsvText } = await load();
  const rows = parseCsvText(buildProductsCsv([child, parent, other]));
  assert.deepEqual(rows.map((r) => r.name), ["Amarakosha", "Bhagavad Gita", "Bhagavad Gita - Web Version"]);
  assert.equal(rows[2].mainproduct, "Bhagavad Gita");
  assert.equal(rows[2].formattype, "web-version");
});

test("an exported CSV reads back with commas, quotes, line breaks and formula guards intact", async () => {
  const { buildProductsCsv, parseCsvText } = await load();
  const csv = buildProductsCsv([parent]);
  assert.ok(csv.startsWith("\uFEFF"));
  const [row] = parseCsvText(csv);
  assert.equal(row.description, parent.description);
  assert.equal(row.images, "https://img/a.jpg\nhttps://img/b.jpg");
  assert.equal(row.aboutproduct, "=not a formula");
  assert.equal(row.price, "499");
  assert.deepEqual(JSON.parse(row.internationalcountryprices), [{ country: "US", price: 12 }]);
});

test("old-style simple CSV files still import", async () => {
  const { parseCsvText } = await load();
  const rows = parseCsvText("name,price,category\r\nGita,100,Books\n\nVeda,\"1,200\",General\n");
  assert.deepEqual(rows, [
    { name: "Gita", price: "100", category: "Books" },
    { name: "Veda", price: "1,200", category: "General" }
  ]);
});
