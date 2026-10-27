const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeAttribution } = require("../utils/attribution");

describe("sanitizeAttribution utility (pure, no DB, no network)", () => {
  it("valid object passes with all valid fields", () => {
    const validDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
    const input = {
      source: "google",
      medium: "cpc",
      campaign: "spring_sale",
      term: "learn sanskrit",
      content: "banner_ad_1",
      referrerHost: "google.com",
      landingPath: "/courses",
      firstSeenAt: validDate.toISOString()
    };

    const result = sanitizeAttribution(input);
    assert.ok(result);
    assert.equal(result.source, "google");
    assert.equal(result.medium, "cpc");
    assert.equal(result.campaign, "spring_sale");
    assert.equal(result.term, "learn sanskrit");
    assert.equal(result.content, "banner_ad_1");
    assert.equal(result.referrerHost, "google.com");
    assert.equal(result.landingPath, "/courses");
    assert.ok(result.firstSeenAt instanceof Date);
    assert.equal(result.firstSeenAt.getTime(), validDate.getTime());
  });

  it("unknown keys are dropped", () => {
    const input = {
      source: "newsletter",
      ip: "192.168.1.1",
      userAgent: "Mozilla/5.0",
      foo: "bar",
      token: "secret123"
    };

    const result = sanitizeAttribution(input);
    assert.deepEqual(result, { source: "newsletter" });
    assert.equal(result.ip, undefined);
    assert.equal(result.userAgent, undefined);
    assert.equal(result.foo, undefined);
  });

  it("non-strings are dropped", () => {
    const input = {
      source: "facebook",
      medium: 12345,
      campaign: true,
      term: { nested: "object" },
      content: ["array", "item"],
      referrerHost: null,
      landingPath: undefined
    };

    const result = sanitizeAttribution(input);
    assert.deepEqual(result, { source: "facebook" });
  });

  it("arrays, strings, numbers, null, and undefined are rejected as root input", () => {
    assert.equal(sanitizeAttribution(null), null);
    assert.equal(sanitizeAttribution(undefined), null);
    assert.equal(sanitizeAttribution("source=google"), null);
    assert.equal(sanitizeAttribution(123), null);
    assert.equal(sanitizeAttribution(true), null);
    assert.equal(sanitizeAttribution([]), null);
    assert.equal(sanitizeAttribution(["google", "cpc"]), null);
  });

  it("over-long values are truncated to their caps", () => {
    const input = {
      source: "s".repeat(150),       // cap 100
      medium: "m".repeat(150),       // cap 100
      campaign: "c".repeat(200),     // cap 150
      term: "t".repeat(200),         // cap 150
      content: "x".repeat(200),      // cap 150
      referrerHost: "r".repeat(300), // cap 255
      landingPath: "/".repeat(300)   // cap 255
    };

    const result = sanitizeAttribution(input);
    assert.ok(result);
    assert.equal(result.source.length, 100);
    assert.equal(result.medium.length, 100);
    assert.equal(result.campaign.length, 150);
    assert.equal(result.term.length, 150);
    assert.equal(result.content.length, 150);
    assert.equal(result.referrerHost.length, 255);
    assert.equal(result.landingPath.length, 255);
  });

  it("< and > are stripped and control characters removed and strings trimmed", () => {
    const input = {
      source: "  <script>alert('xss')</script>google  ",
      landingPath: "\x00/product\x1F/<tag>test\x7F  "
    };

    const result = sanitizeAttribution(input);
    assert.ok(result);
    assert.equal(result.source, "scriptalert('xss')/scriptgoogle");
    assert.equal(result.landingPath, "/product/tagtest");
  });

  it("future firstSeenAt is dropped", () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day in the future
    const input = {
      source: "google",
      firstSeenAt: futureDate.toISOString()
    };

    const result = sanitizeAttribution(input);
    assert.deepEqual(result, { source: "google" });
    assert.equal(result.firstSeenAt, undefined);
  });

  it("91-day-old firstSeenAt is dropped", () => {
    const oldDate = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000); // 91 days old
    const input = {
      source: "google",
      firstSeenAt: oldDate.toISOString()
    };

    const result = sanitizeAttribution(input);
    assert.deepEqual(result, { source: "google" });
    assert.equal(result.firstSeenAt, undefined);
  });

  it("recent firstSeenAt (within 90 days) is preserved as Date", () => {
    const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days old
    const input = {
      source: "direct",
      firstSeenAt: recentDate.toISOString()
    };

    const result = sanitizeAttribution(input);
    assert.ok(result);
    assert.equal(result.source, "direct");
    assert.ok(result.firstSeenAt instanceof Date);
    assert.equal(result.firstSeenAt.getTime(), recentDate.getTime());
  });

  it("invalid date string for firstSeenAt is dropped", () => {
    const input = {
      source: "direct",
      firstSeenAt: "not-a-valid-date"
    };

    const result = sanitizeAttribution(input);
    assert.deepEqual(result, { source: "direct" });
  });

  it("empty result returns null", () => {
    assert.equal(sanitizeAttribution({}), null);
    assert.equal(sanitizeAttribution({ unknownField: "test" }), null);
    assert.equal(sanitizeAttribution({ source: "" }), null);
    assert.equal(sanitizeAttribution({ source: "   " }), null);
    assert.equal(sanitizeAttribution({ source: "<<>>" }), null);
    assert.equal(sanitizeAttribution({ source: 12345 }), null);
    assert.equal(sanitizeAttribution({ firstSeenAt: "2099-01-01T00:00:00.000Z" }), null);
  });
});
