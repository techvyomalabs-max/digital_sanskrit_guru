const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("legacyHash utility (pure)", async () => {
  const { legacyHashToPath, legacyQueryToPath } = await import("../../src/utils/legacyHash.js");

  describe("legacyHashToPath", () => {
    it("converts standard hash product route to real path", () => {
      assert.equal(legacyHashToPath("#/product/123"), "/product/123");
    });

    it("converts root hash route to root path", () => {
      assert.equal(legacyHashToPath("#/"), "/");
    });

    it("preserves query parameters in hash", () => {
      assert.equal(legacyHashToPath("#/reset-password?token=abc"), "/reset-password?token=abc");
    });

    it("preserves in-page anchor fragments in hash", () => {
      assert.equal(legacyHashToPath("#/account#addresses"), "/account#addresses");
    });

    it("appends search query if hash path has no query", () => {
      assert.equal(legacyHashToPath("#/product/123", "?v=1"), "/product/123?v=1");
    });

    it("appends search query before in-page anchor fragment", () => {
      assert.equal(legacyHashToPath("#/account#addresses", "?from=cart"), "/account?from=cart#addresses");
    });

    it("does not append search query if hash already contains query parameters", () => {
      assert.equal(legacyHashToPath("#/reset-password?token=abc", "?v=1"), "/reset-password?token=abc");
    });

    it("returns null for non-routing in-page anchors", () => {
      assert.equal(legacyHashToPath("#reviews"), null);
    });

    it("returns null for empty or invalid hash", () => {
      assert.equal(legacyHashToPath(""), null);
      assert.equal(legacyHashToPath(null), null);
      assert.equal(legacyHashToPath(undefined), null);
    });

    it("SECURITY: rejects protocol-relative open redirect attempts (#//evil.com)", () => {
      assert.equal(legacyHashToPath("#//evil.com"), null);
    });

    it("SECURITY: rejects backslash open redirect attempts (#/\\evil.com)", () => {
      assert.equal(legacyHashToPath("#/\\evil.com"), null);
      assert.equal(legacyHashToPath("#/path\\with\\backslash"), null);
    });

    it("SECURITY: rejects control characters", () => {
      assert.equal(legacyHashToPath("#/product/123\x00evil"), null);
      assert.equal(legacyHashToPath("#/product/123\r\nevil"), null);
    });
  });

  describe("legacyQueryToPath", () => {
    it("converts valid legacy product query to real path", () => {
      assert.equal(legacyQueryToPath("?product=64abc"), "/product/64abc");
      assert.equal(legacyQueryToPath("product=64abc"), "/product/64abc");
    });

    it("accepts valid alphanumeric, underscore and hyphen IDs", () => {
      assert.equal(legacyQueryToPath("?product=prod_123-abc"), "/product/prod_123-abc");
    });

    it("returns null for invalid or malicious product IDs", () => {
      assert.equal(legacyQueryToPath("?product=../x"), null);
      assert.equal(legacyQueryToPath("?product=<script>"), null);
      assert.equal(legacyQueryToPath("?product=//evil.com"), null);
      assert.equal(legacyQueryToPath("?other=123"), null);
      assert.equal(legacyQueryToPath(""), null);
      assert.equal(legacyQueryToPath(null), null);
    });
  });
});
