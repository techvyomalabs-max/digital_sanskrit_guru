"use strict";

/**
 * User Activity & Insights numbers (pure, no DB).
 * - Only customer accounts are counted: admin accounts (and the admin's own open tab) are left out,
 *   so "online now" and "time on site" describe real customers.
 * - Average time is per customer who has actually used the site, not divided by everyone who
 *   only signed up once.
 * - Days and months are India time (IST).
 */

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ACTIVE_WINDOWS_MS = {
  onlineNow: 5 * 60 * 1000,
  active24h: DAY_MS,
  active7d: 7 * DAY_MS,
  active30d: 30 * DAY_MS
};

/** "YYYY-MM-DD" of a date in India time. */
function istDay(date) {
  return new Date(new Date(date).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Buckets between two dates: daily for ranges up to 62 days, otherwise monthly. Gaps are kept as 0. */
function buildBuckets(startDate, endDate) {
  const startDay = istDay(startDate);
  const endDay = istDay(endDate);
  const days = Math.round((Date.parse(`${endDay}T00:00:00Z`) - Date.parse(`${startDay}T00:00:00Z`)) / DAY_MS) + 1;
  const buckets = [];
  if (days <= 62) {
    for (let i = 0; i < days; i += 1) {
      const key = new Date(Date.parse(`${startDay}T00:00:00Z`) + i * DAY_MS).toISOString().slice(0, 10);
      buckets.push({ key, label: `${Number(key.slice(8))} ${MONTHS[Number(key.slice(5, 7)) - 1]}` });
    }
    return { unit: "day", buckets };
  }
  let y = Number(startDay.slice(0, 4));
  let m = Number(startDay.slice(5, 7));
  const endKey = endDay.slice(0, 7);
  for (let guard = 0; guard < 24; guard += 1) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    buckets.push({ key, label: `${MONTHS[m - 1]} ${String(y).slice(2)}` });
    if (key === endKey) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return { unit: "month", buckets };
}

/** % change from previous to current; null when there is nothing to compare with. */
function change(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

const count = (v) => Math.max(0, Math.floor(Number(v) || 0));

/**
 * counts: { customers, onlineNow, active24h, active7d, active30d, engagedCustomers, totalTimeSec }
 * signupDates: sign-up time of each customer who joined inside [startDate, endDate]
 * previousSignups: how many joined in the equally long period just before
 * newBuyers: how many of this period's sign-ups have a paid order
 */
function computeUserOverview({ counts = {}, signupDates = [], previousSignups = 0, newBuyers = 0, startDate, endDate }) {
  const { unit, buckets } = buildBuckets(startDate, endDate);
  const byKey = new Map(buckets.map((b) => [b.key, { ...b, signups: 0 }]));
  for (const date of signupDates) {
    const day = istDay(date);
    const bucket = byKey.get(unit === "day" ? day : day.slice(0, 7));
    if (bucket) bucket.signups += 1;
  }

  const newSignups = signupDates.length;
  const buyers = Math.min(count(newBuyers), newSignups);
  const engaged = count(counts.engagedCustomers);
  const totalTimeSec = count(counts.totalTimeSec);

  return {
    range: { from: istDay(startDate), to: istDay(endDate), unit },
    summary: {
      customers: count(counts.customers),
      newSignups,
      previousSignups: count(previousSignups),
      newBuyers: buyers,
      conversionPercent: newSignups ? Math.round((buyers / newSignups) * 1000) / 10 : 0,
      onlineNow: count(counts.onlineNow),
      active24h: count(counts.active24h),
      active7d: count(counts.active7d),
      active30d: count(counts.active30d),
      engagedCustomers: engaged,
      totalTimeSec,
      avgTimePerEngagedSec: engaged ? Math.round(totalTimeSec / engaged) : 0
    },
    changes: {
      newSignups: change(newSignups, count(previousSignups))
    },
    trend: [...byKey.values()]
  };
}

/** Sort for the customer list: recent activity (default), newest sign-ups, or most time on site. */
function userListSort(sort) {
  if (sort === "newest") return { _id: -1 };
  if (sort === "time") return { totalTimeSpentSec: -1, _id: -1 };
  return { lastActiveAt: -1, _id: -1 };
}

module.exports = {
  ACTIVE_WINDOWS_MS,
  istDay,
  buildBuckets,
  computeUserOverview,
  userListSort
};
