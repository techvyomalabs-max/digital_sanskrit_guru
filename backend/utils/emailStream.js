/**
 * emailStream.js — picks which SMTP server an email goes through.
 *
 * Transactional (SMTP_*): order, payment, refund, account, password and admin emails.
 * Marketing (MARKETING_SMTP_*): promotional emails only. Keeping them apart means spam
 * complaints about a promotion can't hurt delivery of order confirmations.
 *
 * Only the types listed below are promotional. Anything else, including a new type
 * nobody has listed yet, stays on the transactional server. If MARKETING_SMTP_* isn't
 * fully set, promotional emails also use the transactional server, as they did before.
 */

const MARKETING_EMAIL_TYPES = new Set(["broadcast", "wishlist-alert", "wishlist-reminder"]);

function emailStreamForType(type) {
  return MARKETING_EMAIL_TYPES.has(String(type || "")) ? "marketing" : "transactional";
}

function transactionalSmtp(env) {
  const user = String(env.SMTP_USER || "");
  return {
    stream: "transactional",
    host: String(env.SMTP_HOST || "smtp.gmail.com"),
    port: Number(env.SMTP_PORT || 587),
    user,
    pass: String(env.SMTP_PASS || ""),
    sender: String(env.SENDER_EMAIL || user)
  };
}

function marketingSmtp(env) {
  const host = String(env.MARKETING_SMTP_HOST || "").trim();
  const user = String(env.MARKETING_SMTP_USER || "").trim();
  const pass = String(env.MARKETING_SMTP_PASS || "");
  if (!host || !user || !pass) return null;
  return {
    stream: "marketing",
    host,
    port: Number(env.MARKETING_SMTP_PORT || 587),
    user,
    pass,
    sender: String(env.MARKETING_SENDER_EMAIL || user).trim()
  };
}

/**
 * The SMTP settings for a stream. `stream` is the stream wanted; the returned
 * config's `stream` says which one is actually used.
 */
function getSmtpConfig(stream, env = process.env) {
  if (stream === "marketing") {
    const marketing = marketingSmtp(env);
    if (marketing) return marketing;
  }
  return transactionalSmtp(env);
}

function isMarketingSmtpConfigured(env = process.env) {
  return marketingSmtp(env) !== null;
}

module.exports = {
  MARKETING_EMAIL_TYPES,
  emailStreamForType,
  getSmtpConfig,
  isMarketingSmtpConfigured
};
