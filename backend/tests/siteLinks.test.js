const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { getSiteUrl, siteLink } = require("../utils/siteLinks");
const { buildResetUrl } = require("../utils/passwordReset");

describe("siteLinks utility (pure)", () => {
  const originalEnvSiteUrl = process.env.SITE_URL;
  const originalEnvViteSiteUrl = process.env.VITE_SITE_URL;

  afterEach(() => {
    if (originalEnvSiteUrl === undefined) {
      delete process.env.SITE_URL;
    } else {
      process.env.SITE_URL = originalEnvSiteUrl;
    }

    if (originalEnvViteSiteUrl === undefined) {
      delete process.env.VITE_SITE_URL;
    } else {
      process.env.VITE_SITE_URL = originalEnvViteSiteUrl;
    }
  });

  describe("getSiteUrl()", () => {
    it("returns default 'http://localhost:5173' when SITE_URL and VITE_SITE_URL are not set", () => {
      delete process.env.SITE_URL;
      delete process.env.VITE_SITE_URL;
      assert.equal(getSiteUrl(), "http://localhost:5173");
    });

    it("returns default 'http://localhost:5173' when SITE_URL and VITE_SITE_URL are empty strings", () => {
      process.env.SITE_URL = "";
      process.env.VITE_SITE_URL = "";
      assert.equal(getSiteUrl(), "http://localhost:5173");
    });

    it("SITE_URL unset and VITE_SITE_URL set uses VITE_SITE_URL", () => {
      delete process.env.SITE_URL;
      process.env.VITE_SITE_URL = "https://vite.digitalsanskritguru.com";
      assert.equal(getSiteUrl(), "https://vite.digitalsanskritguru.com");
    });

    it("SITE_URL wins over VITE_SITE_URL", () => {
      process.env.SITE_URL = "https://canonical.digitalsanskritguru.com";
      process.env.VITE_SITE_URL = "https://vite.digitalsanskritguru.com";
      assert.equal(getSiteUrl(), "https://canonical.digitalsanskritguru.com");
    });

    it("respects process.env.SITE_URL when set", () => {
      delete process.env.VITE_SITE_URL;
      process.env.SITE_URL = "https://digitalsanskritguru.com";
      assert.equal(getSiteUrl(), "https://digitalsanskritguru.com");
    });

    it("removes trailing slashes", () => {
      delete process.env.VITE_SITE_URL;
      process.env.SITE_URL = "https://digitalsanskritguru.com/";
      assert.equal(getSiteUrl(), "https://digitalsanskritguru.com");

      process.env.SITE_URL = "https://digitalsanskritguru.com///";
      assert.equal(getSiteUrl(), "https://digitalsanskritguru.com");
    });

    it("removes trailing '/#' and '#'", () => {
      delete process.env.VITE_SITE_URL;
      process.env.SITE_URL = "https://digitalsanskritguru.com/#";
      assert.equal(getSiteUrl(), "https://digitalsanskritguru.com");

      process.env.SITE_URL = "https://digitalsanskritguru.com/#/";
      assert.equal(getSiteUrl(), "https://digitalsanskritguru.com");

      process.env.SITE_URL = "https://digitalsanskritguru.com#";
      assert.equal(getSiteUrl(), "https://digitalsanskritguru.com");
    });

    it("trims whitespace from environment variable", () => {
      delete process.env.VITE_SITE_URL;
      process.env.SITE_URL = "   https://digitalsanskritguru.com/#/   ";
      assert.equal(getSiteUrl(), "https://digitalsanskritguru.com");
    });
  });

  describe("siteLink()", () => {
    beforeEach(() => {
      delete process.env.VITE_SITE_URL;
      process.env.SITE_URL = "https://site";
    });

    it("normalises paths: 'my-orders', '/my-orders', '#/my-orders', and '/#/my-orders' all give same real URL", () => {
      const expected = "https://site/my-orders";
      assert.equal(siteLink("my-orders"), expected);
      assert.equal(siteLink("/my-orders"), expected);
      assert.equal(siteLink("#/my-orders"), expected);
      assert.equal(siteLink("/#/my-orders"), expected);
    });

    it("ensures the path always starts with exactly one '/'", () => {
      assert.equal(siteLink(""), "https://site/");
      assert.equal(siteLink("/"), "https://site/");
      assert.equal(siteLink("///my-orders"), "https://site/my-orders");
      assert.equal(siteLink(null), "https://site/");
      assert.equal(siteLink(undefined), "https://site/");
    });

    it("ensures '/nested/#/path' gives 'https://site/nested/path' by collapsing repeated slashes in path part", () => {
      assert.equal(siteLink("/nested/#/path"), "https://site/nested/path");
    });

    it("keeps the double slash after the '?' untouched in '/reset-password?token=a//b'", () => {
      assert.equal(siteLink("/reset-password?token=a//b"), "https://site/reset-password?token=a//b");
    });

    it("ensures the result never contains '#/'", () => {
      const testCases = [
        "#/my-orders",
        "/#/my-orders",
        "/#/product/123",
        "/#/admin/products",
        "/#/wishlist",
        "/#/login",
        "/nested/#/path"
      ];
      for (const input of testCases) {
        const result = siteLink(input);
        assert.ok(!result.includes("#/"), `Result '${result}' for input '${input}' should not contain '#/'`);
      }
    });

    it("handles product links and dynamic parameters", () => {
      assert.equal(siteLink("/product/64f1a2b3c4d5e6f7a8b9c0d1"), "https://site/product/64f1a2b3c4d5e6f7a8b9c0d1");
      assert.equal(siteLink("/#/product/64f1a2b3c4d5e6f7a8b9c0d1"), "https://site/product/64f1a2b3c4d5e6f7a8b9c0d1");
    });

    it("preserves URL query strings and hash anchors without '#/'", () => {
      assert.equal(
        siteLink("/reset-password?token=abcdef123456"),
        "https://site/reset-password?token=abcdef123456"
      );
      assert.equal(
        siteLink("/#/reset-password?token=abcdef123456"),
        "https://site/reset-password?token=abcdef123456"
      );
      assert.equal(
        siteLink("/account#addresses"),
        "https://site/account#addresses"
      );
    });
  });

  describe("Password reset URL (buildResetUrl)", () => {
    it("generates a real path without '#' and preserves the raw token", () => {
      delete process.env.VITE_SITE_URL;
      process.env.SITE_URL = "https://digitalsanskritguru.com";
      const token = "b7f9a103c5d8e24f71a980bc234def56";
      const resetUrl = buildResetUrl(token);

      assert.equal(
        resetUrl,
        `https://digitalsanskritguru.com/reset-password?token=${token}`
      );
      assert.ok(!resetUrl.includes("#"), `Password reset URL '${resetUrl}' should not contain any '#'`);
      assert.ok(resetUrl.includes(`token=${token}`), "Password reset URL must keep the raw token");
    });

    it("encodes special characters in token safely and has no '#'", () => {
      delete process.env.VITE_SITE_URL;
      process.env.SITE_URL = "https://digitalsanskritguru.com/";
      const token = "token+with/special&chars==";
      const resetUrl = buildResetUrl(token);

      assert.equal(
        resetUrl,
        `https://digitalsanskritguru.com/reset-password?token=${encodeURIComponent(token)}`
      );
      assert.ok(!resetUrl.includes("#"), "Password reset URL should not contain '#'");
    });
  });

  describe("Unsubscribe URL (buildUnsubscribeUrl)", () => {
    const { buildUnsubscribeUrl, verifyUnsubscribe } = require("../utils/unsubscribe");

    it("uses getSiteUrl() and preserves /api/unsubscribe format and verification", () => {
      delete process.env.VITE_SITE_URL;
      process.env.SITE_URL = "https://digitalsanskritguru.com/";
      const userId = "507f1f77bcf86cd799439011";
      const unsubUrl = buildUnsubscribeUrl(userId);

      assert.ok(unsubUrl.startsWith("https://digitalsanskritguru.com/api/unsubscribe?u="));
      const urlObj = new URL(unsubUrl);
      assert.equal(urlObj.searchParams.get("u"), userId);
      const sig = urlObj.searchParams.get("s");
      assert.ok(sig);
      assert.equal(verifyUnsubscribe(userId, sig), true);
    });
  });
});

