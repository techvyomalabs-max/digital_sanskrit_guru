const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { orderReferenceConditions } = require("../utils/orderSearch");

describe("admin order search by order ID or invoice number", () => {
  const regexOf = (conds) => conds.find((c) => c.$expr)?.$expr.$regexMatch.regex;

  it("matches the short order ID with or without #, as shown on the Orders page", () => {
    assert.equal(regexOf(orderReferenceConditions("#A66A7B")), "a66a7b$");
    assert.equal(regexOf(orderReferenceConditions("72A66A7B")), "72a66a7b$", "8-character form from finance reports");
  });

  it("matches a full order ID exactly", () => {
    const conds = orderReferenceConditions("6AEC0EC4ADBA49D272A66A7B");
    assert.ok(conds.some((c) => c._id === "6aec0ec4adba49d272a66a7b"));
    assert.equal(regexOf(conds), undefined);
  });

  it("matches the invoice number, whole or in part", () => {
    const [inv] = orderReferenceConditions("DSG/2026-27/0002");
    assert.ok(new RegExp(inv.invoiceNumber.$regex, inv.invoiceNumber.$options).test("DSG/2026-27/0002"));
    const [part] = orderReferenceConditions("0002");
    assert.ok(new RegExp(part.invoiceNumber.$regex, part.invoiceNumber.$options).test("DSG/2026-27/0002"));
  });

  it("doesn't treat names or emails as order IDs", () => {
    assert.equal(regexOf(orderReferenceConditions("Manjushree")), undefined);
    assert.equal(regexOf(orderReferenceConditions("x@y.com")), undefined);
    assert.deepEqual(orderReferenceConditions("  "), []);
  });
});
