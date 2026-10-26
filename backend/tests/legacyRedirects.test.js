const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizePath,
  buildRedirectMap,
  keepTrackingParams,
  resolveRedirect,
  trailingSlashRedirect,
  createRedirectMiddleware
} = require("../utils/legacyRedirects");

const sampleRedirects = require("../config/legacyRedirects.json");

describe("legacyRedirects utility (pure)", () => {
  const map = buildRedirectMap(sampleRedirects);

  describe("normalizePath", () => {
    it("lowercases paths", () => {
      assert.equal(normalizePath("/SHOP"), "/shop");
      assert.equal(normalizePath("/Product-Catalog"), "/product-catalog");
    });

    it("collapses repeated slashes and removes a single trailing slash", () => {
      assert.equal(normalizePath("/shop/"), "/shop");
      assert.equal(normalizePath("/shop//"), "/shop");
      assert.equal(normalizePath("/faq//"), "/faq");
    });

    it("preserves root path /", () => {
      assert.equal(normalizePath("/"), "/");
      assert.equal(normalizePath("//"), "/");
      assert.equal(normalizePath("///"), "/");
    });

    it("handles URL encoding safely and handles invalid encoding gracefully", () => {
      assert.equal(normalizePath("/shop%20item"), "/shop item");
      assert.equal(normalizePath("/%ZZbad"), "/%zzbad");
    });
  });

  describe("keepTrackingParams", () => {
    it("keeps only allowed marketing parameters and strips all other query params", () => {
      const search = "?utm_source=mail&orderby=price&page=2&fbclid=xyz123";
      const result = keepTrackingParams(search);
      assert.equal(result, "?utm_source=mail&fbclid=xyz123");
    });

    it("returns empty string when no tracking params are present", () => {
      assert.equal(keepTrackingParams("?orderby=price&filter=books"), "");
      assert.equal(keepTrackingParams(""), "");
      assert.equal(keepTrackingParams(null), "");
    });
  });

  describe("resolveRedirect", () => {
    it("redirects /shop/ to /collection with status 301", () => {
      const res = resolveRedirect(map, "/shop/", "");
      assert.deepEqual(res, { status: 301, location: "/collection" });
    });

    it("redirects /SHOP to /collection (case-insensitive)", () => {
      const res = resolveRedirect(map, "/SHOP", "");
      assert.deepEqual(res, { status: 301, location: "/collection" });
    });

    it("redirects /shop?utm_source=mail&orderby=price to /collection?utm_source=mail", () => {
      const res = resolveRedirect(map, "/shop", "?utm_source=mail&orderby=price");
      assert.deepEqual(res, { status: 301, location: "/collection?utm_source=mail" });
    });

    it("redirects /terms-conditions to /terms-and-conditions", () => {
      const res = resolveRedirect(map, "/terms-conditions", "");
      assert.deepEqual(res, { status: 301, location: "/terms-and-conditions" });
    });

    it("redirects /my-account/ to /account", () => {
      const res = resolveRedirect(map, "/my-account/", "");
      assert.deepEqual(res, { status: 301, location: "/account" });
    });

    it("returns null for non-configured routes", () => {
      assert.equal(resolveRedirect(map, "/collection", ""), null);
      assert.equal(resolveRedirect(map, "/faq", ""), null);
      assert.equal(resolveRedirect(map, "/", ""), null);
    });
  });

  describe("trailingSlashRedirect", () => {
    it("redirects /faq/ to /faq with status 301", () => {
      const res = trailingSlashRedirect("/faq/", "");
      assert.deepEqual(res, { status: 301, location: "/faq" });
    });

    it("redirects /faq// to /faq (collapsing repeated slashes)", () => {
      const res = trailingSlashRedirect("/faq//", "");
      assert.deepEqual(res, { status: 301, location: "/faq" });
    });

    it("preserves non-tracking query parameters for trailing slash normalization", () => {
      const res = trailingSlashRedirect("/faq/", "?category=general");
      assert.deepEqual(res, { status: 301, location: "/faq?category=general" });
    });

    it("returns null for root /", () => {
      assert.equal(trailingSlashRedirect("/", ""), null);
    });

    it("returns null for /api/ paths", () => {
      assert.equal(trailingSlashRedirect("/api/orders/", ""), null);
      assert.equal(trailingSlashRedirect("/api/products/", ""), null);
      assert.equal(trailingSlashRedirect("/api/", ""), null);
    });

    it("returns null for /uploads/ and /wp-content/", () => {
      assert.equal(trailingSlashRedirect("/uploads/a.png", ""), null);
      assert.equal(trailingSlashRedirect("/uploads/folder/", ""), null);
      assert.equal(trailingSlashRedirect("/wp-content/uploads/", ""), null);
    });

    it("returns null when the last segment has a file extension (/img/logo.png/)", () => {
      assert.equal(trailingSlashRedirect("/img/logo.png/", ""), null);
      assert.equal(trailingSlashRedirect("/assets/style.css/", ""), null);
    });

    it("SECURITY: //evil.com/ never produces a location starting with //", () => {
      const res = trailingSlashRedirect("//evil.com/", "");
      if (res) {
        assert.ok(!res.location.startsWith("//"), `Location "${res.location}" must not start with "//"`);
        assert.ok(res.location.startsWith("/"), `Location "${res.location}" should start with a single "/"`);
      }
    });
  });

  describe("buildRedirectMap validation", () => {
    it("rejects a 'to' that is another entry's 'from' (chain)", () => {
      const chainConfig = [
        { from: "/shop", to: "/store" },
        { from: "/store", to: "/collection" }
      ];
      assert.throws(() => buildRedirectMap(chainConfig), /redirect chains\/loops are prohibited/i);
    });

    it("rejects an entry where 'from' equals 'to'", () => {
      const loopConfig = [{ from: "/terms", to: "/terms" }];
      assert.throws(() => buildRedirectMap(loopConfig), /"from" must not equal "to"/i);
    });

    it("rejects an entry with 'from' without a leading slash", () => {
      const invalidFrom = [{ from: "shop", to: "/collection" }];
      assert.throws(() => buildRedirectMap(invalidFrom), /"from" must be a string starting with exactly one "\/"/i);
    });

    it("rejects an entry with 'https://evil.com' as 'to'", () => {
      const externalTo = [{ from: "/shop", to: "https://evil.com" }];
      assert.throws(() => buildRedirectMap(externalTo), /"to" must be a string starting with exactly one "\/"/i);
    });

    it("rejects an entry with '//evil.com' as 'to'", () => {
      const protocolRelative = [{ from: "/shop", to: "//evil.com" }];
      assert.throws(() => buildRedirectMap(protocolRelative), /"to" must be a string starting with exactly one "\/"/i);
    });

    it("rejects duplicate 'from' definitions", () => {
      const dupConfig = [
        { from: "/shop", to: "/collection" },
        { from: "/shop", to: "/products" }
      ];
      assert.throws(() => buildRedirectMap(dupConfig), /duplicate "from" path/i);
    });
  });

  describe("createRedirectMiddleware", () => {
    const middleware = createRedirectMiddleware(map);

    function createMockRes() {
      return {
        redirectStatus: null,
        redirectLocation: null,
        redirect(status, location) {
          this.redirectStatus = status;
          this.redirectLocation = location;
        }
      };
    }

    it("redirects GET requests with status 301", () => {
      const req = { method: "GET", path: "/shop/", url: "/shop/" };
      const res = createMockRes();
      let nextCalled = false;
      middleware(req, res, () => { nextCalled = true; });

      assert.equal(nextCalled, false);
      assert.equal(res.redirectStatus, 301);
      assert.equal(res.redirectLocation, "/collection");
    });

    it("handles HEAD requests similarly to GET", () => {
      const req = { method: "HEAD", path: "/shop", url: "/shop" };
      const res = createMockRes();
      let nextCalled = false;
      middleware(req, res, () => { nextCalled = true; });

      assert.equal(nextCalled, false);
      assert.equal(res.redirectStatus, 301);
      assert.equal(res.redirectLocation, "/collection");
    });

    it("ignores POST requests (calls next without redirecting)", () => {
      const req = { method: "POST", path: "/shop", url: "/shop" };
      const res = createMockRes();
      let nextCalled = false;
      middleware(req, res, () => { nextCalled = true; });

      assert.equal(nextCalled, true);
      assert.equal(res.redirectStatus, null);
    });

    it("ignores /api requests entirely", () => {
      const req = { method: "GET", path: "/api/products/", url: "/api/products/" };
      const res = createMockRes();
      let nextCalled = false;
      middleware(req, res, () => { nextCalled = true; });

      assert.equal(nextCalled, true);
      assert.equal(res.redirectStatus, null);
    });

    it("passes through unmapped paths without trailing slash", () => {
      const req = { method: "GET", path: "/collection", url: "/collection" };
      const res = createMockRes();
      let nextCalled = false;
      middleware(req, res, () => { nextCalled = true; });

      assert.equal(nextCalled, true);
      assert.equal(res.redirectStatus, null);
    });
  });
});
