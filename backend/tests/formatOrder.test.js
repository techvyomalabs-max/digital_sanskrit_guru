const test = require("node:test");
const assert = require("node:assert/strict");

const opt = (id, { digital = false, stock = 5, type = "", label = id } = {}) => ({
  label,
  product: { _id: id, isDigital: digital, stock, formatTypeKey: type }
});

test("format order: India shows physical first, abroad digital first", async () => {
  const { orderFormatOptions } = await import("../../src/utils/productOptions.js");
  const options = [opt("web", { digital: true, type: "web-version" }), opt("paper", { type: "paper" }), opt("usb", { type: "pendrive" })];
  const typeOrder = ["paper", "pendrive", "web-version"];
  assert.deepEqual(orderFormatOptions(options, { typeOrder }).map((o) => o.product._id), ["paper", "usb", "web"]);
  assert.deepEqual(orderFormatOptions(options, { isInternational: true, typeOrder }).map((o) => o.product._id), ["web", "paper", "usb"]);
});

test("format order: out of stock and not shipped here go last", async () => {
  const { orderFormatOptions } = await import("../../src/utils/productOptions.js");
  const options = [opt("paper", { stock: 0, type: "paper" }), opt("usb", { type: "pendrive" }), opt("web", { digital: true })];
  const india = orderFormatOptions(options, { typeOrder: ["paper", "pendrive"] });
  assert.deepEqual(india.map((o) => [o.product._id, o.status]), [["usb", "available"], ["web", "available"], ["paper", "out-of-stock"]]);
  const abroad = orderFormatOptions(options, { isInternational: true, physicalAbroad: false });
  assert.deepEqual(abroad.map((o) => [o.product._id, o.status]), [["web", "available"], ["paper", "not-in-country"], ["usb", "not-in-country"]]);
});

test("format order: unknown types keep the product's own order", async () => {
  const { orderFormatOptions } = await import("../../src/utils/productOptions.js");
  const options = [opt("b"), opt("a"), opt("c")];
  assert.deepEqual(orderFormatOptions(options).map((o) => o.product._id), ["b", "a", "c"]);
});

test("default format: link choice wins (id, type key or name), else first that can be bought", async () => {
  const { pickDefaultOptionId } = await import("../../src/utils/productOptions.js");
  const options = [opt("p1", { type: "paper", stock: 0, label: "Paper" }), opt("w1", { digital: true, type: "web-version", label: "Web Version" })];
  assert.equal(pickDefaultOptionId(options, "w1"), "w1");
  assert.equal(pickDefaultOptionId(options, "web-version"), "w1");
  assert.equal(pickDefaultOptionId(options, "Web Version"), "w1");
  assert.equal(pickDefaultOptionId(options, "", { typeOrder: ["paper"] }), "w1", "paper is out of stock");
  assert.equal(pickDefaultOptionId(options, ""), "w1", "old behaviour without context");
});

test("format warnings flag what's missing", async () => {
  const { formatWarnings } = await import("../../src/utils/formatWarnings.js");
  assert.deepEqual(formatWarnings({ price: 299, stock: 0, weight: 0 }), ["Out of stock", "No package weight"]);
  assert.deepEqual(formatWarnings({ price: 299, stock: 3, weight: 400 }), ["Low stock"]);
  assert.deepEqual(formatWarnings({ price: 169, isDigital: true, webReaderLink: "" }), ["No access link"]);
  assert.deepEqual(formatWarnings({ price: 169, isDigital: true, digitalDelivery: "external", externalAccessLink: "https://x" }), []);
  assert.deepEqual(formatWarnings({ price: 0, isDigital: true, digitalType: "Kindle", kindleLink: "" }), ["No Amazon link"]);
  assert.deepEqual(formatWarnings({ price: 0, stock: 9, weight: 1 }), ["No price"]);
  assert.deepEqual(formatWarnings(null), ["Product missing"]);
});
