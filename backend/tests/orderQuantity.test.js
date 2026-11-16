const test = require("node:test");
const assert = require("node:assert/strict");
const { maxOrderQuantity, clampOrderQuantity } = require("../utils/orderQuantity");

test("orderQuantity (server): retail items max 5, shareable digital 10 copies (else 1), bulk unlimited", () => {
  assert.equal(maxOrderQuantity({ productType: "single" }), 5);
  assert.equal(maxOrderQuantity({ productType: "bundle" }), 5);
  assert.equal(maxOrderQuantity({ isDigital: true }), 10);
  assert.equal(maxOrderQuantity({ isDigital: true, productType: "bundle" }), 1, "digital combos stay at 1");
  assert.equal(maxOrderQuantity({ isDigital: true, digitalDelivery: "external", externalAccessManual: true }), 1, "team-setup access stays at 1");
  assert.ok(maxOrderQuantity({ productType: "bulk" }) >= 1000);

  assert.equal(clampOrderQuantity({ productType: "single" }, 9), 5);
  assert.equal(clampOrderQuantity({ productType: "single" }, 3), 3);
  assert.equal(clampOrderQuantity({ isDigital: true }, 4), 4);
  assert.equal(clampOrderQuantity({ isDigital: true }, 40), 10);
  assert.equal(clampOrderQuantity({ productType: "bulk" }, 250), 250);
  assert.equal(clampOrderQuantity({}, 0), 1);
  assert.equal(clampOrderQuantity({}, "2.7"), 2);
  assert.equal(clampOrderQuantity({}, -4), 1);
});

test("orderQuantity (cart): stepper limit and stored quantity follow the same rule", async () => {
  const { maxCartQuantity, clampCartQuantity } = await import("../../src/utils/orderQuantity.js");
  assert.equal(maxCartQuantity({}), 5);
  assert.equal(maxCartQuantity({ stock: 3 }), 3);
  assert.equal(maxCartQuantity({ stock: 40 }), 5);
  assert.equal(maxCartQuantity({ isDigital: true, stock: 40 }), 1);
  assert.equal(maxCartQuantity({ isDigital: true, canShareCopies: true }), 10);
  assert.equal(maxCartQuantity({ isBulk: true }), Infinity);

  assert.equal(clampCartQuantity(7, {}), 5);
  assert.equal(clampCartQuantity(7, { isBulk: true }), 7);
  assert.equal(clampCartQuantity(3, { isDigital: true }), 1);
  assert.equal(clampCartQuantity(3, { isDigital: true, canShareCopies: true }), 3);
  assert.equal(clampCartQuantity(30, { isDigital: true, canShareCopies: true }), 10);
  assert.equal(clampCartQuantity(undefined, {}), 1);
});
