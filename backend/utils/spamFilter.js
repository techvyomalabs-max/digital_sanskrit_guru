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

// ── 3. Cloudflare Turnstile Verifier ──────────────────────────────────────────

/**
 * Verify Cloudflare Turnstile Token
 * @param {string} token - The turnstile response token from the frontend
 * @param {string} remoteip - Client IP address
 * @returns {Promise<boolean>}
 */
async function verifyTurnstileToken(token, remoteip) {
  const secretKey = process.env.TURNSTILE_SECRET_KEY || process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
  
  // If no secret key is configured (local dev / demo mode), allow test tokens or bypass gracefully
  if (!secretKey) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[SpamEngine] TURNSTILE_SECRET_KEY is not configured in production environment.");
    }
    return true; // Graceful fallback so legitimate users are not locked out
  }

  // Always-pass test secret key support
  if (secretKey.startsWith("1x0000000000000000000000000000000AA") || token === "1x00000000000000000000AA") {
    return true;
  }

  if (!token) {
    return false;
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token);
    if (remoteip) formData.append("remoteip", remoteip);

    const res = await axios.post(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      formData.toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 5000
      }
    );

    return Boolean(res.data?.success);
  } catch (err) {
    console.error("[SpamEngine] Cloudflare Turnstile verification request error:", err.message);
    // In case Cloudflare API is temporarily unreachable, don't break the entire user experience
    return true;
  }
}

/**
 * Turnstile Express Middleware
 */
const turnstileMiddleware = async (req, res, next) => {
  const secretKey = process.env.TURNSTILE_SECRET_KEY || process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
  
  // If secret key is not set, skip verification
  if (!secretKey) {
    return next();
  }

  const token =
    req.body?.turnstileToken ||
    req.body?.["cf-turnstile-response"] ||
    req.headers["x-turnstile-token"];

  const ip = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (!token) {
    return res.status(400).json({
      message: "Security verification required. Please complete the captcha challenge."
    });
  }

  const isValid = await verifyTurnstileToken(token, ip);
  if (!isValid) {
    console.warn(`[SpamEngine] Failed Turnstile verification from IP ${ip}`);
    return res.status(403).json({
      message: "Security verification failed. Please refresh and try again."
    });
  }

  next();
};

module.exports = {
  honeypotMiddleware,
  globalApiLimiter,
  reviewRateLimiter,
  orderRateLimiter,
  paymentRateLimiter,
  verifyTurnstileToken,
  turnstileMiddleware
};
