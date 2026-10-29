const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const {
  parseReportRange,
  idRangeForDates,
  summarizeSignupRows
} = require("../utils/signupReport");

describe("signupReport utility", () => {
  describe("parseReportRange", () => {
    it("default range: last 30 days ending today in IST", () => {
      const result = parseReportRange();
      assert.strictEqual(result.error, undefined);
      assert.ok(result.from);
      assert.ok(result.to);
      assert.ok(result.startDate instanceof Date);
      assert.ok(result.endDate instanceof Date);

      const diffMs =
        new Date(`${result.to}T00:00:00+05:30`).getTime() -
        new Date(`${result.from}T00:00:00+05:30`).getTime();
      const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000)) + 1;
      assert.strictEqual(diffDays, 30);
    });

    it("IST end-of-day: endDate is inclusive of the full IST day", () => {
      const result = parseReportRange("2026-10-01", "2026-10-15");
      assert.strictEqual(result.error, undefined);
      assert.strictEqual(result.from, "2026-10-01");
      assert.strictEqual(result.to, "2026-10-15");

      // In IST (+05:30), 23:59:59.999 is 18:29:59.999Z in UTC
      assert.strictEqual(result.endDate.toISOString(), "2026-10-15T18:29:59.999Z");
    });

    it("invalid date strings return error", () => {
      assert.ok(parseReportRange("invalid", "2026-10-15").error);
      assert.ok(parseReportRange("2026-13-01", "2026-10-15").error);
      assert.ok(parseReportRange("2026-02-31", "2026-10-15").error);
      assert.ok(parseReportRange("2026-10-01", "not-a-date").error);
    });

    it("from > to returns error", () => {
      const result = parseReportRange("2026-10-20", "2026-10-10");
      assert.ok(result.error);
      assert.match(result.error, /'from' date cannot be after 'to' date/i);
    });

    it("range over 366 days returns error", () => {
      const result = parseReportRange("2025-01-01", "2026-01-05");
      assert.ok(result.error);
      assert.match(result.error, /366 days/i);
    });
  });

  describe("idRangeForDates", () => {
    it("boundaries: an ObjectId made at the start time is included, one at the end time is excluded", () => {
      const start = new Date("2026-10-01T00:00:00.000Z");
      const end = new Date("2026-10-02T00:00:00.000Z");

      const range = idRangeForDates(start, end);
      assert.ok(range.$gte instanceof mongoose.Types.ObjectId);
      assert.ok(range.$lt instanceof mongoose.Types.ObjectId);

      const idAtStart = mongoose.Types.ObjectId.createFromTime(
        Math.floor(start.getTime() / 1000)
      );
      const idAtEnd = mongoose.Types.ObjectId.createFromTime(
        Math.floor(end.getTime() / 1000)
      );

      // Boundary check for $gte: idAtStart >= range.$gte
      assert.ok(idAtStart.toString() >= range.$gte.toString());
      assert.strictEqual(
        idAtStart.getTimestamp().getTime(),
        range.$gte.getTimestamp().getTime()
      );

      // Boundary check for $lt: idAtEnd is NOT < range.$lt (it is equal, so excluded)
      assert.ok(!(idAtEnd.toString() < range.$lt.toString()));
      assert.strictEqual(
        idAtEnd.getTimestamp().getTime(),
        range.$lt.getTimestamp().getTime()
      );
    });
  });

  describe("summarizeSignupRows", () => {
    it("labels 'Not tracked', sorts, computes sharePercent and keeps buyers/revenue", () => {
      const rows = [
        {
          _id: { source: "", medium: "", campaign: "" },
          signups: 2,
          buyers: 0,
          revenueInInr: 0
        },
        {
          _id: { source: "google", medium: "cpc", campaign: "diwali" },
          signups: 5,
          buyers: 2,
          revenueInInr: 1500
        },
        {
          _id: { source: "whatsapp", medium: "", campaign: "festive" },
          signups: 3,
          buyers: 1,
          revenueInInr: 500
        }
      ];

      const total = 10;
      const summarized = summarizeSignupRows(rows, total);

      assert.strictEqual(summarized.length, 3);
      // Sorted by signups desc: 5, 3, 2
      assert.strictEqual(summarized[0].source, "google");
      assert.strictEqual(summarized[0].signups, 5);
      assert.strictEqual(summarized[0].sharePercent, 50.0);
      assert.strictEqual(summarized[0].buyers, 2);
      assert.strictEqual(summarized[0].revenueInInr, 1500);

      assert.strictEqual(summarized[1].source, "whatsapp");
      assert.strictEqual(summarized[1].signups, 3);
      assert.strictEqual(summarized[1].sharePercent, 30.0);
      assert.strictEqual(summarized[1].buyers, 1);
      assert.strictEqual(summarized[1].revenueInInr, 500);

      assert.strictEqual(summarized[2].source, "Not tracked");
      assert.strictEqual(summarized[2].signups, 2);
      assert.strictEqual(summarized[2].sharePercent, 20.0);
      assert.strictEqual(summarized[2].buyers, 0);
      assert.strictEqual(summarized[2].revenueInInr, 0);
    });

    it("handles flat row objects and single-decimal rounding for sharePercent", () => {
      const rows = [
        {
          source: "meta",
          medium: "feed",
          campaign: "promo",
          signups: 1,
          buyers: 1,
          revenueInInr: 250
        },
        {
          source: null,
          medium: null,
          campaign: null,
          signups: 2,
          buyers: 0,
          revenueInInr: 0
        }
      ];
      const summarized = summarizeSignupRows(rows, 3);
      // 1 / 3 = 33.3%
      assert.strictEqual(summarized[0].source, "Not tracked");
      assert.strictEqual(summarized[0].sharePercent, 66.7);
      assert.strictEqual(summarized[1].source, "meta");
      assert.strictEqual(summarized[1].sharePercent, 33.3);
    });
  });
});
