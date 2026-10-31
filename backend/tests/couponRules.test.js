const test = require("node:test");
const assert = require("node:assert/strict");
const { hasUsageLeft, parseCouponValue, parseUsageLimit } = require("../utils/couponRules");

test("hasUsageLeft: no limit, null limit and 0 limit all mean unlimited", () => {
  assert.equal(hasUsageLeft({ usageCount: 50 }), true);
  assert.equal(hasUsageLeft({ usageLimit: null, usageCount: 50 }), true);
  assert.equal(hasUsageLeft({ usageLimit: 0, usageCount: 50 }), true);
});

test("hasUsageLeft: blocks once the count reaches the limit", () => {
  assert.equal(hasUsageLeft({ usageLimit: 10, usageCount: 9 }), true);
  assert.equal(hasUsageLeft({ usageLimit: 10, usageCount: 10 }), false);
  assert.equal(hasUsageLeft({ usageLimit: 10, usageCount: 12 }), false);
});

test("parseCouponValue: percentage must be above 0 and at most 100", () => {
  assert.deepEqual(parseCouponValue("percentage", 10), { value: 10 });
  assert.deepEqual(parseCouponValue("percentage", 100), { value: 100 });
  assert.deepEqual(parseCouponValue("percentage", 150), { error: "Percentage discount cannot be more than 100%" });
  assert.deepEqual(parseCouponValue("percentage", 0), { error: "Discount value must be greater than 0" });
});

test("parseCouponValue: fixed amounts are rounded to paise", () => {
  assert.deepEqual(parseCouponValue("fixed", "199.999"), { value: 200 });
  assert.deepEqual(parseCouponValue("fixed", "49.5"), { value: 49.5 });
  assert.deepEqual(parseCouponValue("fixed", "abc"), { error: "Discount value must be greater than 0" });
  assert.deepEqual(parseCouponValue("fixed", -5), { error: "Discount value must be greater than 0" });
});

test("parseUsageLimit: empty and 0 mean no limit", () => {
  assert.deepEqual(parseUsageLimit(""), { usageLimit: null });
  assert.deepEqual(parseUsageLimit(null), { usageLimit: null });
  assert.deepEqual(parseUsageLimit(0, 5), { usageLimit: null });
});

test("parseUsageLimit: must be a whole number above what was already used", () => {
  assert.deepEqual(parseUsageLimit(100, 40), { usageLimit: 100 });
  assert.deepEqual(parseUsageLimit("41", 40), { usageLimit: 41 });
  assert.deepEqual(parseUsageLimit(40, 40), {
    error: "Usage limit must be more than the 40 times it has already been used"
  });
  assert.deepEqual(parseUsageLimit(1, 1), {
    error: "Usage limit must be more than the 1 time it has already been used"
  });
  assert.deepEqual(parseUsageLimit(2.5), { error: "Usage limit must be a whole number" });
  assert.deepEqual(parseUsageLimit(-1), { error: "Usage limit must be a whole number" });
});
