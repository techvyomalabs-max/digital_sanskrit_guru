const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { istDay, buildBuckets, computeUserOverview, userListSort } = require("../utils/userInsights");

const start = new Date("2026-10-01T00:00:00+05:30");
const end = new Date("2026-10-30T23:59:59.999+05:30");

describe("userInsights", () => {
  it("counts sign-ups per India day, including just after midnight IST", () => {
    const out = computeUserOverview({
      signupDates: [
        new Date("2026-10-01T18:40:00Z"), // 2 Oct 00:10 IST
        new Date("2026-10-01T10:00:00Z"), // 1 Oct IST
        new Date("2026-10-01T12:00:00Z")
      ],
      startDate: start,
      endDate: end
    });
    assert.equal(out.range.unit, "day");
    assert.equal(out.trend.length, 30);
    assert.equal(out.trend[0].signups, 2);
    assert.equal(out.trend[1].signups, 1);
    assert.equal(out.trend[1].label, "2 Oct");
    assert.equal(out.summary.newSignups, 3);
  });

  it("uses months for long periods and keeps empty months", () => {
    const { unit, buckets } = buildBuckets(new Date("2025-11-01T00:00:00+05:30"), new Date("2026-10-31T23:59:59+05:30"));
    assert.equal(unit, "month");
    assert.equal(buckets.length, 12);
    assert.equal(buckets[0].label, "Nov 25");
    assert.equal(buckets[11].key, "2026-10");
    assert.equal(istDay(new Date("2026-10-31T18:30:00Z")), "2026-11-01");
  });

  it("works out conversion and change against the previous period", () => {
    const signupDates = Array.from({ length: 20 }, () => new Date("2026-10-10T06:00:00Z"));
    const out = computeUserOverview({ signupDates, previousSignups: 16, newBuyers: 5, startDate: start, endDate: end });
    assert.equal(out.summary.conversionPercent, 25);
    assert.equal(out.changes.newSignups, 25);
    const none = computeUserOverview({ signupDates, previousSignups: 0, startDate: start, endDate: end });
    assert.equal(none.changes.newSignups, null);
    const empty = computeUserOverview({ startDate: start, endDate: end });
    assert.equal(empty.summary.conversionPercent, 0);
  });

  it("averages time only over customers who have used the site", () => {
    const out = computeUserOverview({
      counts: { customers: 100, engagedCustomers: 4, totalTimeSec: 1200 },
      startDate: start,
      endDate: end
    });
    assert.equal(out.summary.avgTimePerEngagedSec, 300);
    assert.equal(out.summary.customers, 100);
  });

  it("never reports more buyers than sign-ups and ignores bad counts", () => {
    const out = computeUserOverview({
      counts: { onlineNow: -3, active7d: "12" },
      signupDates: [new Date("2026-10-05T06:00:00Z")],
      newBuyers: 4,
      startDate: start,
      endDate: end
    });
    assert.equal(out.summary.newBuyers, 1);
    assert.equal(out.summary.onlineNow, 0);
    assert.equal(out.summary.active7d, 12);
  });

  it("maps list sort options", () => {
    assert.deepEqual(userListSort("newest"), { _id: -1 });
    assert.deepEqual(userListSort("time"), { totalTimeSpentSec: -1, _id: -1 });
    assert.deepEqual(userListSort("anything"), { lastActiveAt: -1, _id: -1 });
  });
});
