// Coupon expiry is a calendar date in India time: a coupon picked to end on a day
// stays valid until 23:59:59.999 IST that day.
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const INVALID = new Date(NaN);

// Admin input -> stored Date. Returns undefined for "no expiry", an Invalid Date for bad input.
function parseCouponExpiry(input) {
  if (input === undefined || input === null || input === "") return undefined;
  const text = String(input).trim();
  const match = text.match(DATE_ONLY);
  if (!match) return new Date(text);

  const [, y, m, d] = match.map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    return INVALID;
  }
  return new Date(check.getTime() + DAY_MS - IST_OFFSET_MS - 1);
}

// Same as parseCouponExpiry, but for saving: rejects bad and already-past dates.
// Returns { expiresAt } (null = no expiry) or { error }.
function parseFutureCouponExpiry(input, now = new Date()) {
  const expiresAt = parseCouponExpiry(input);
  if (expiresAt === undefined) return { expiresAt: null };
  if (Number.isNaN(expiresAt.getTime())) return { error: "Invalid expiry date" };
  if (expiresAt.getTime() < new Date(now).getTime()) return { error: "Expiry date is in the past" };
  return { expiresAt };
}

const isUtcMidnight = (date) =>
  date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0;

// Coupons saved before the fix stored the picked date as 00:00 UTC (05:30 IST),
// so read those as the end of that day in India.
function effectiveCouponExpiry(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (isUtcMidnight(date)) return new Date(date.getTime() + DAY_MS - IST_OFFSET_MS - 1);
  return date;
}

function isCouponExpired(value, now = new Date()) {
  const expiry = effectiveCouponExpiry(value);
  return Boolean(expiry) && expiry.getTime() < new Date(now).getTime();
}

// Mongo condition matching coupons that have not expired: no expiry, expiry still ahead,
// or an old midnight-UTC value for today's IST date (still valid until IST midnight).
function couponNotExpiredFilter(now = new Date()) {
  const istNow = new Date(new Date(now).getTime() + IST_OFFSET_MS);
  const legacyToday = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()));
  return {
    $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }, { expiresAt: legacyToday }]
  };
}

module.exports = {
  parseCouponExpiry,
  parseFutureCouponExpiry,
  effectiveCouponExpiry,
  isCouponExpired,
  couponNotExpiredFilter
};
