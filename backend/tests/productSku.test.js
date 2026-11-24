const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeSku } = require("../utils/productSku");

test("SKU: trimmed, spaces dropped; blank / NA / - means none; bad characters refused", () => {
  assert.deepEqual(normalizeSku(" VL-LAG-B-003 "), { sku: "VL-LAG-B-003" });
  assert.deepEqual(normalizeSku("VL LAG B 003"), { sku: "VLLAGB003" });
  for (const none of ["", null, undefined, "NA", "na", "N/A", "-", "--"]) assert.deepEqual(normalizeSku(none), { sku: "" });
  assert.ok(normalizeSku("VL#1").error);
  assert.ok(normalizeSku("X".repeat(65)).error);
});
