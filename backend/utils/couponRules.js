// Coupon rules shared by the admin routes, the Apply preview and checkout,
// so all three agree on what a coupon allows.

const roundMoney = (v) => Math.round((Number(v) || 0) * 100) / 100;

// A usage limit of null/undefined/0 means unlimited.
function hasUsageLeft(coupon) {
  const limit = Number(coupon?.usageLimit || 0);
  if (!limit) return true;
  return Number(coupon?.usageCount || 0) < limit;
}

// Mongo condition for hasUsageLeft.
const usageLeftFilter = () => ({
  $or: [
    { usageLimit: null },
    { usageLimit: 0 },
    { $expr: { $lt: ["$usageCount", "$usageLimit"] } }
  ]
});

// Returns { value } (rounded) or { error }.
function parseCouponValue(type, input) {
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0) {
    return { error: "Discount value must be greater than 0" };
  }
  if (type === "percentage") {
    if (value > 100) return { error: "Percentage discount cannot be more than 100%" };
    return { value: roundMoney(value) };
  }
  return { value: roundMoney(value) };
}

// Returns { usageLimit } (null = unlimited) or { error }.
// A limit at or below what has already been used would leave the coupon unusable.
function parseUsageLimit(input, usageCount = 0) {
  if (input === undefined || input === null || input === "") return { usageLimit: null };
  const limit = Number(input);
  if (!Number.isInteger(limit) || limit < 0) {
    return { error: "Usage limit must be a whole number" };
  }
  if (limit === 0) return { usageLimit: null };
  const used = Number(usageCount || 0);
  if (limit <= used) {
    return { error: `Usage limit must be more than the ${used} time${used === 1 ? "" : "s"} it has already been used` };
  }
  return { usageLimit: limit };
}

module.exports = {
  hasUsageLeft,
  usageLeftFilter,
  parseCouponValue,
  parseUsageLimit
};
