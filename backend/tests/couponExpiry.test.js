const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseCouponExpiry,
  parseFutureCouponExpiry,
  effectiveCouponExpiry,
  isCouponExpired,
  couponNotExpiredFilter
} = require("../utils/couponExpiry");

test("parseCouponExpiry: a picked date lasts until the end of that day in India", () => {
  assert.equal(parseCouponExpiry("2026-10-30").toISOString(), "2026-10-30T18:29:59.999Z");
});

test("parseCouponExpiry: empty means no expiry, impossible dates are invalid", () => {
  assert.equal(parseCouponExpiry(""), undefined);
  assert.equal(parseCouponExpiry(null), undefined);
  assert.ok(Number.isNaN(parseCouponExpiry("2026-02-31").getTime()));
  assert.ok(Number.isNaN(parseCouponExpiry("not a date").getTime()));
});

test("parseCouponExpiry: full timestamps are kept as given", () => {
  assert.equal(parseCouponExpiry("2026-10-30T10:00:00.000Z").toISOString(), "2026-10-30T10:00:00.000Z");
});

test("isCouponExpired: coupon ending today is still valid all day in India", () => {
  const expiry = parseCouponExpiry("2026-10-30");
  assert.equal(isCouponExpired(expiry, new Date("2026-10-30T00:30:00+05:30")), false);
  assert.equal(isCouponExpired(expiry, new Date("2026-10-30T12:00:00+05:30")), false);
  assert.equal(isCouponExpired(expiry, new Date("2026-10-30T23:59:59+05:30")), false);
  assert.equal(isCouponExpired(expiry, new Date("2026-10-31T00:00:00+05:30")), true);
});

test("isCouponExpired: old coupons stored as 00:00 UTC also last the whole IST day", () => {
  const legacy = new Date("2026-10-30T00:00:00.000Z");
  assert.equal(effectiveCouponExpiry(legacy).toISOString(), "2026-10-30T18:29:59.999Z");
  assert.equal(isCouponExpired(legacy, new Date("2026-10-30T12:00:00+05:30")), false);
  assert.equal(isCouponExpired(legacy, new Date("2026-10-31T00:00:01+05:30")), true);
});

test("isCouponExpired: no expiry never expires", () => {
  assert.equal(isCouponExpired(null), false);
  assert.equal(isCouponExpired(undefined), false);
});

test("couponNotExpiredFilter: matches today's legacy midnight value by IST date", () => {
  const now = new Date("2026-10-30T12:00:00+05:30");
  const filter = couponNotExpiredFilter(now);
  assert.deepEqual(filter.$or[0], { expiresAt: null });
  assert.deepEqual(filter.$or[1], { expiresAt: { $gte: now } });
  assert.equal(filter.$or[2].expiresAt.toISOString(), "2026-10-30T00:00:00.000Z");
});

test("couponNotExpiredFilter: just after IST midnight uses the new IST date", () => {
  const filter = couponNotExpiredFilter(new Date("2026-10-31T00:10:00+05:30"));
  assert.equal(filter.$or[2].expiresAt.toISOString(), "2026-10-31T00:00:00.000Z");
});

test("parseFutureCouponExpiry: today and later dates are accepted when renewing", () => {
  const now = new Date("2026-10-30T15:00:00+05:30");
  assert.equal(parseFutureCouponExpiry("2026-10-30", now).expiresAt.toISOString(), "2026-10-30T18:29:59.999Z");
  assert.equal(parseFutureCouponExpiry("2026-12-31", now).expiresAt.toISOString(), "2026-12-31T18:29:59.999Z");
});

test("parseFutureCouponExpiry: empty clears the expiry", () => {
  assert.deepEqual(parseFutureCouponExpiry(""), { expiresAt: null });
  assert.deepEqual(parseFutureCouponExpiry(null), { expiresAt: null });
});

test("parseFutureCouponExpiry: past and invalid dates are rejected", () => {
  const now = new Date("2026-10-30T15:00:00+05:30");
  assert.deepEqual(parseFutureCouponExpiry("2026-10-29", now), { error: "Expiry date is in the past" });
  assert.deepEqual(parseFutureCouponExpiry("2026-02-31", now), { error: "Invalid expiry date" });
});
