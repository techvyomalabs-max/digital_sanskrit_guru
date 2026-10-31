"use strict";

/**
 * General API rate limit, split three ways so one busy person or one shared network
 * cannot block the whole site:
 *  - public read-only browsing (catalogue, home data, product pages, public settings,
 *    public coupon list): counted per IP with a high limit; these are cached and cheap.
 *  - signed-in users: counted per ACCOUNT, so staff or customers sharing one office or
 *    college connection each get their own allowance (and admins working all day are fine).
 *  - everything else from visitors who are not signed in: counted per IP.
 * The strict limiters (login, OTP, password reset, orders, payments, reviews, bulk
 * enquiries, media uploads) are separate and unchanged.
 */

const jwt = require("jsonwebtoken");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { perWorker } = require("./workerCount");

const WINDOW_MS = 15 * 60 * 1000;
const LIMITS = Object.freeze({
  publicRead: 3000,
  account: 2000,
  guest: 600
});

const TOO_MANY = { message: "Too many requests. Please wait a minute and try again." };

// Read-only catalogue endpoints anyone can call (GET/HEAD only).
const PUBLIC_READ_PATTERNS = [
  /^\/api\/products\/?$/,
  /^\/api\/products\/home\/?$/,
  /^\/api\/products\/recommend\/[^/]+\/?$/,
  /^\/api\/products\/[^/]+\/reviews\/?$/,
  /^\/api\/settings\/public\/?$/,
  /^\/api\/coupons\/?$/
];
// /api/products/:id is public too, except these admin-only paths.
const PRODUCT_ADMIN_SEGMENTS = new Set(["admin", "debug", "cleanup-imported-data"]);

function apiPath(req) {
  const raw = String(req.originalUrl || req.url || "");
  return raw.split("?")[0];
}

function isPublicReadRequest(req) {
  const method = String(req.method || "").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return false;
  const p = apiPath(req);
  if (PUBLIC_READ_PATTERNS.some((re) => re.test(p))) return true;
  const m = p.match(/^\/api\/products\/([^/]+)\/?$/);
  return Boolean(m && !PRODUCT_ADMIN_SEGMENTS.has(m[1]));
}

/**
 * The account id from a valid Bearer token, or null. The signature is checked, so a key
 * cannot be faked; expired or invalid tokens are treated as "not signed in".
 * (Blocked or logged-out sessions are still refused later by the auth middleware.)
 */
function tokenUserId(req, secret = process.env.JWT_SECRET) {
  const header = String(req.headers?.authorization || "");
  if (!header.startsWith("Bearer ") || !secret) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
    const id = decoded && decoded.id ? String(decoded.id) : "";
    return id || null;
  } catch {
    return null;
  }
}

const ipKey = (req) => ipKeyGenerator(req.ip || "");

function makeLimiters(limits = LIMITS) {
  const common = {
    windowMs: WINDOW_MS,
    standardHeaders: true,
    legacyHeaders: false,
    message: TOO_MANY
  };
  return {
    publicRead: rateLimit({ ...common, max: perWorker(limits.publicRead), keyGenerator: (req) => `ip:${ipKey(req)}` }),
    account: rateLimit({ ...common, max: perWorker(limits.account), keyGenerator: (req) => `user:${req.rateLimitUserId}` }),
    guest: rateLimit({ ...common, max: perWorker(limits.guest), keyGenerator: (req) => `ip:${ipKey(req)}` })
  };
}

/** Picks which bucket a request belongs to: "publicRead", "account" or "guest". */
function classifyRequest(req, secret) {
  if (isPublicReadRequest(req)) return "publicRead";
  const userId = tokenUserId(req, secret);
  if (userId) {
    req.rateLimitUserId = userId;
    return "account";
  }
  return "guest";
}

function createApiRateLimiter(limiters = makeLimiters(), secret) {
  return function apiRateLimiter(req, res, next) {
    const bucket = classifyRequest(req, secret);
    return limiters[bucket](req, res, next);
  };
}

module.exports = {
  LIMITS,
  WINDOW_MS,
  isPublicReadRequest,
  tokenUserId,
  classifyRequest,
  makeLimiters,
  createApiRateLimiter
};
