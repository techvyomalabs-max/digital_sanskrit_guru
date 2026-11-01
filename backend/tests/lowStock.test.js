const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { lowStockFilter, isLowStock, lowStockThreshold, alertChannels } = require("../utils/lowStock");

describe("lowStock", () => {
  it("only physical products, never digital ones or option/format parents", () => {
    assert.equal(isLowStock({ name: "Paperback", stock: 2 }), true);
    assert.equal(isLowStock({ name: "Combo – Web version", isDigital: true, stock: 0 }), false);
    assert.equal(isLowStock({ name: "Combo (formats parent)", hasOptions: true, stock: 0 }), false);
    assert.equal(isLowStock({ name: "Combo – USB", stock: 3 }), true);
    assert.equal(isLowStock({ name: "Deleted book", isDeleted: true, stock: 0 }), false);
    assert.equal(isLowStock({ name: "Plenty", stock: 40 }), false);
  });

  it("builds the matching database filter", () => {
    assert.deepEqual(lowStockFilter(5, { _id: { $in: ["a"] } }), {
      _id: { $in: ["a"] },
      stock: { $lte: 5 },
      isDeleted: { $ne: true },
      isDigital: { $ne: true },
      hasOptions: { $ne: true }
    });
  });

  it("reads the threshold and the email/push switches from settings", () => {
    assert.equal(lowStockThreshold({ lowStockThreshold: 3 }), 3);
    assert.equal(lowStockThreshold({ lowStockThreshold: 0 }), 0);
    assert.equal(lowStockThreshold({}), 5);
    assert.deepEqual(alertChannels({}), { email: true, push: true });
    assert.deepEqual(alertChannels({ emailEnabled: false, pushEnabled: true }), { email: false, push: true });
  });
});
