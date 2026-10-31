const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const {
  isPublicReadRequest,
  tokenUserId,
  classifyRequest,
  makeLimiters,
  createApiRateLimiter
} = require("../utils/apiRateLimit");

const SECRET = "test-secret-not-real";
const tokenFor = (id, opts = {}) => jwt.sign({ id, tokenVersion: 0 }, SECRET, { algorithm: "HS256", ...opts });
const req = (method, url, { token, ip = "203.0.113.5" } = {}) => ({
  method,
  url,
  originalUrl: url,
  ip,
  headers: token ? { authorization: `Bearer ${token}` } : {},
  app: { get: () => false }
});

// Runs a request through the middleware; resolves "next" or the status it sent.
function run(mw, r) {
  return new Promise((resolve) => {
    const headers = {};
    const res = {
      statusCode: 200,
      headersSent: false,
      setHeader: (k, v) => { headers[k] = v; },
      getHeader: (k) => headers[k],
      append: () => {},
      status(code) { this.statusCode = code; return this; },
      send() { resolve(this.statusCode); return this; },
      json() { resolve(this.statusCode); return this; },
      end() { resolve(this.statusCode); return this; },
      on: () => {}
    };
    mw(r, res, () => resolve("next"));
  });
}

describe("api rate limit: which bucket", () => {
  it("public read-only catalogue GETs are 'publicRead'", () => {
    for (const url of ["/api/products", "/api/products?page=2", "/api/products/home", "/api/products/abc123",
      "/api/products/dhaturupaparicayah", "/api/products/abc/reviews", "/api/products/recommend/abc",
      "/api/settings/public", "/api/coupons"]) {
      assert.equal(isPublicReadRequest(req("GET", url)), true, url);
    }
  });

  it("admin paths, writes and other APIs are not public reads", () => {
    for (const [m, url] of [["GET", "/api/products/admin/all"], ["GET", "/api/products/debug/summary"],
      ["GET", "/api/products/cleanup-imported-data"], ["POST", "/api/products"], ["PUT", "/api/products/abc"],
      ["GET", "/api/settings"], ["GET", "/api/orders"], ["GET", "/api/coupons/admin/all"], ["POST", "/api/auth/login"]]) {
      assert.equal(isPublicReadRequest(req(m, url)), false, `${m} ${url}`);
    }
  });

  it("a valid token gives the account id; a bad, wrong-secret or expired token gives null", () => {
    assert.equal(tokenUserId(req("GET", "/api/orders", { token: tokenFor("u1") }), SECRET), "u1");
    assert.equal(tokenUserId(req("GET", "/api/orders", { token: "garbage" }), SECRET), null);
    assert.equal(tokenUserId(req("GET", "/api/orders", { token: jwt.sign({ id: "u1" }, "other") }), SECRET), null);
    assert.equal(tokenUserId(req("GET", "/api/orders", { token: tokenFor("u1", { expiresIn: -10 }) }), SECRET), null);
    assert.equal(tokenUserId(req("GET", "/api/orders"), SECRET), null);
  });

  it("classifies: public read wins even when signed in; signed in -> account; otherwise guest", () => {
    assert.equal(classifyRequest(req("GET", "/api/products/home", { token: tokenFor("u1") }), SECRET), "publicRead");
    const r = req("GET", "/api/orders", { token: tokenFor("u1") });
    assert.equal(classifyRequest(r, SECRET), "account");
    assert.equal(r.rateLimitUserId, "u1");
    assert.equal(classifyRequest(req("POST", "/api/auth/login"), SECRET), "guest");
  });
});

describe("api rate limit: counting", () => {
  it("two signed-in admins on the same connection each get their own allowance", async () => {
    const mw = createApiRateLimiter(makeLimiters({ publicRead: 100, account: 3, guest: 2 }), SECRET);
    const a = tokenFor("adminA");
    const b = tokenFor("adminB");
    for (let i = 0; i < 3; i += 1) assert.equal(await run(mw, req("GET", "/api/orders", { token: a })), "next");
    assert.equal(await run(mw, req("GET", "/api/orders", { token: a })), 429, "admin A is over the limit");
    assert.equal(await run(mw, req("GET", "/api/orders", { token: b })), "next", "admin B on the same IP is not blocked");
  });

  it("visitors who are not signed in are limited per IP; another IP is unaffected", async () => {
    const mw = createApiRateLimiter(makeLimiters({ publicRead: 100, account: 100, guest: 2 }), SECRET);
    assert.equal(await run(mw, req("POST", "/api/auth/forgot-password")), "next");
    assert.equal(await run(mw, req("POST", "/api/auth/forgot-password")), "next");
    assert.equal(await run(mw, req("POST", "/api/auth/forgot-password")), 429);
    assert.equal(await run(mw, req("POST", "/api/auth/forgot-password", { ip: "198.51.100.9" })), "next");
  });

  it("using up the guest or account allowance does not block public browsing", async () => {
    const mw = createApiRateLimiter(makeLimiters({ publicRead: 5, account: 1, guest: 1 }), SECRET);
    await run(mw, req("POST", "/api/cart"));
    assert.equal(await run(mw, req("POST", "/api/cart")), 429);
    assert.equal(await run(mw, req("GET", "/api/products/home")), "next");
    assert.equal(await run(mw, req("GET", "/api/settings/public")), "next");
  });

  it("public browsing itself still has a ceiling per IP", async () => {
    const mw = createApiRateLimiter(makeLimiters({ publicRead: 2, account: 100, guest: 100 }), SECRET);
    await run(mw, req("GET", "/api/products"));
    await run(mw, req("GET", "/api/products"));
    assert.equal(await run(mw, req("GET", "/api/products")), 429);
  });
});
