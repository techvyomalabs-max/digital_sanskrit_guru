/**
 * backend/utils/spamFilter.js
 *
 * Comprehensive Bot & Spam Protection Engine:
 *  1. Honeypot check — blocks automatic bot submissions across forms using hidden form inputs.
 *  2. In-memory IP rate limiters (via express-rate-limit) — blocks scraping, brute-forcing, and order/payment flooding.
 *  3. Cloudflare Turnstile token verifier — validates human verification challenges.
 */

"use strict";

const rateLimit = require("express-rate-limit");
const axios = require("axios");

// ── 1. Honeypot Middleware ───────────────────────────────────────────────────
// Checks hidden fields that human users leave empty but automated bots autofill
const honeypotMiddleware = (req, res, next) => {
  const honeypotVal = req.body?.honey_pot_field || req.body?.honeypot || req.body?.bot_trap;
  if (honeypotVal) {
    const ip = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    console.warn(`[SpamEngine] Honeypot triggered by bot submission from IP ${ip} on ${req.originalUrl || req.url}`);
    // Return 200 silently so the bot assumes success, but we discard the malicious payload
    return res.status(200).json({
      message: "Request processed successfully.",
      success: true
    });
  }
  next();
};

// ── 2. Rate Limiters ──────────────────────────────────────────────────────────

// Global API rate limiter (protects against scraping and aggressive flooding)
const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 600,                  // max 600 requests per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please slow down and try again later." }
});

// Review submission rate limiter
const reviewRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                   // Limit each IP to 5 reviews per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "You have submitted too many reviews. Please wait 15 minutes before trying again." }
});

// Order creation rate limiter (prevents spam order flooding)
const orderRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20,                  // max 20 order placements per 10 mins per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many order attempts. Please wait a few minutes before trying again." }
});

// Payment creation rate limiter (prevents card testing & payment gateway abuse)
const paymentRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 25,                  // max 25 payment attempts per 10 mins per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many payment requests. Please wait a few minutes before trying again." }
});

// Bulk enquiry rate limiter (prevents wholesale quote request flooding)
const bulkEnquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                   // max 5 bulk enquiries per 15 mins per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many bulk enquiry submissions from this connection. Please try again after 15 minutes." }
});

// ── 3. Cloudflare Turnstile Verifier ──────────────────────────────────────────

const IS_PROD = process.env.NODE_ENV === "production";
const DEV_BYPASS = !IS_PROD && process.env.TURNSTILE_DEV_BYPASS === "true";
const TEST_TOKENS = new Set(["1x00000000000000000000AA", "XXXX.DUMMY.TOKEN.XXXX"]);
const getTurnstileSecret = () => process.env.TURNSTILE_SECRET_KEY || process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY || "";

/**
 * Verify Cloudflare Turnstile Token
 * @param {string} token - The turnstile response token from the frontend
 * @param {string} remoteip - Client IP address
 * @returns {Promise<boolean>}
 */
async function verifyTurnstileToken(token, remoteip) {
  const s = getTurnstileSecret();
  if (!s || token === "bypass") return DEV_BYPASS;
  if (TEST_TOKENS.has(token) || s.startsWith("1x0000000000000000000000000000000AA")) return !IS_PROD;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  try {
    const form = new URLSearchParams({ secret: s, response: token });
    if (remoteip) form.append("remoteip", String(remoteip));
    const r = await axios.post("https://challenges.cloudflare.com/turnstile/v0/siteverify", form.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 5000
    });
    return r.data?.success === true;
  } catch (e) {
    console.error("[SpamEngine] Turnstile error:", e.message);
    return DEV_BYPASS;
  }
}

/**
 * Turnstile Express Middleware
 */
const turnstileMiddleware = async (req, res, next) => {
  if (process.env.TURNSTILE_ENABLED === "false") {
    if (IS_PROD) console.warn("[SpamEngine] captcha disabled by env in production");
    return next();
  }
  try {
    const StoreSettings = require("../models/StoreSettings");
    const st = await StoreSettings.findOne().select("turnstileEnabled").lean();
    if (st?.turnstileEnabled === false) return next();
  } catch {}

  const s = getTurnstileSecret();
  if (!s && IS_PROD) {
    return res.status(503).json({ message: "Security verification is temporarily unavailable." });
  }
  const token = req.body?.turnstileToken || req.body?.["cf-turnstile-response"] || req.headers["x-turnstile-token"];
  if (!token) {
    return res.status(400).json({ message: "Security verification required." });
  }
  const ip = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  if (!(await verifyTurnstileToken(token, ip))) {
    return res.status(403).json({ message: "Security verification failed. Please refresh and try again." });
  }
  next();
};

module.exports = {
  honeypotMiddleware,
  globalApiLimiter,
  reviewRateLimiter,
  orderRateLimiter,
  paymentRateLimiter,
  bulkEnquiryLimiter,
  verifyTurnstileToken,
  turnstileMiddleware
};
