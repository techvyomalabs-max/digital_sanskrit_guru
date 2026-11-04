/**
 * mailmodo.js — Mailmodo API client and the pure rules for which customers it may hold.
 *
 * Mailmodo is used only for promotional email. Order, account and password emails
 * never go through it. A customer is synced only while they are an active account
 * that has not unsubscribed from marketing.
 *
 * Settings (backend/.env):
 *   MAILMODO_API_KEY         API key from Mailmodo → Settings → API Keys
 *   MAILMODO_LIST_NAME       the contact list customers are synced to
 *   MAILMODO_WEBHOOK_SECRET  shared secret for /api/mailmodo/webhook (unsubscribe sync)
 *   MAILMODO_AUTO_SYNC       "false" turns off the scheduled sync (manual sync still works)
 */

const crypto = require("crypto");

const MAILMODO_BASE_URL = "https://api.mailmodo.com/api/v1";
const BATCH_SIZE = 100;
const REQUEST_TIMEOUT_MS = 15000;
// Customers who signed up this recently are added one at a time, because only
// single adds can enter a Mailmodo journey (for example a welcome series).
// Older customers go in by batch so a first sync doesn't send them a welcome email.
const RECENT_SIGNUP_DAYS = 7;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getMailmodoConfig(env = process.env) {
  const apiKey = String(env.MAILMODO_API_KEY || "").trim();
  const listName = String(env.MAILMODO_LIST_NAME || "").trim();
  const webhookSecret = String(env.MAILMODO_WEBHOOK_SECRET || "").trim();
  return {
    configured: Boolean(apiKey && listName),
    apiKey,
    listName,
    webhookSecret,
    autoSync: String(env.MAILMODO_AUTO_SYNC || "true").trim().toLowerCase() !== "false"
  };
}

function normalizeMarketingEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  if (!value || value.length > 254 || !EMAIL_PATTERN.test(value)) return "";
  return value;
}

/**
 * The Mongo filter for customers Mailmodo may hold. isMailmodoEligible must agree with it.
 */
function eligibleUserFilter() {
  return {
    isDeleted: { $ne: true },
    isBlocked: { $ne: true },
    marketingOptOut: { $ne: true },
    email: { $type: "string", $gt: "" }
  };
}

function ineligibleUserFilter() {
  return {
    $or: [
      { isDeleted: true },
      { isBlocked: true },
      { marketingOptOut: true }
    ]
  };
}

function isMailmodoEligible(user) {
  if (!user) return false;
  if (user.isDeleted === true || user.isBlocked === true || user.marketingOptOut === true) return false;
  return Boolean(normalizeMarketingEmail(user.email));
}

/** Why a synced customer must come off the Mailmodo list. */
function removalReason(user) {
  if (user?.marketingOptOut === true) return "opt-out";
  return "inactive";
}

function splitName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/** Only the email and name leave our system; no orders, phone numbers or addresses. */
function buildContact(user) {
  const email = normalizeMarketingEmail(user?.email);
  if (!email) return null;
  const name = String(user?.name || "").trim().slice(0, 100);
  const { firstName, lastName } = splitName(name);
  return {
    email,
    data: {
      first_name: firstName,
      last_name: lastName,
      name
    }
  };
}

function objectIdTime(id) {
  const hex = String(id || "");
  if (!/^[0-9a-f]{24}$/i.test(hex)) return null;
  return parseInt(hex.slice(0, 8), 16) * 1000;
}

function isRecentSignup(user, now = Date.now(), days = RECENT_SIGNUP_DAYS) {
  const createdAt = objectIdTime(user?._id);
  if (createdAt === null) return false;
  return now - createdAt <= days * 24 * 60 * 60 * 1000;
}

function chunk(items, size = BATCH_SIZE) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length === 0 || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

const OPT_OUT_EVENT = /unsub|spam|complain|abuse/i;

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/**
 * Reads a Mailmodo webhook body into {email, event, isOptOut} entries.
 * Accepts one event or an array of events, and the field names Mailmodo has used.
 */
function parseMailmodoWebhook(body) {
  const items = Array.isArray(body) ? body : Array.isArray(body?.events) ? body.events : [body];
  return items
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const email = normalizeMarketingEmail(firstString(
        item.email,
        item.recipient,
        item.recipientEmail,
        item.contact?.email,
        item.data?.email,
        item.event_properties?.email
      ));
      const event = firstString(item.event, item.eventName, item.event_name, item.eventType, item.event_type, item.type, item.status);
      return { email, event, isOptOut: Boolean(email && OPT_OUT_EVENT.test(event)) };
    });
}

class MailmodoError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "MailmodoError";
    this.status = status;
  }
}

function describeFailure(status, body) {
  if (status === 401 || status === 403) return "Mailmodo rejected the API key. Check MAILMODO_API_KEY.";
  if (status === 429) return "Mailmodo rate limit reached. The next sync will continue.";
  const detail = firstString(body?.message, body?.error, typeof body === "string" ? body : "");
  return `Mailmodo request failed (${status || "network"})${detail ? `: ${detail.slice(0, 200)}` : ""}`;
}

async function mailmodoRequest(path, payload, config = getMailmodoConfig(), { retryOnRateLimit = true } = {}) {
  if (!config.apiKey) throw new MailmodoError("Mailmodo is not configured.");

  let response;
  try {
    response = await fetch(`${MAILMODO_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        mmApiKey: config.apiKey
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (err) {
    throw new MailmodoError(`Could not reach Mailmodo: ${err.message}`);
  }

  if (response.status === 429 && retryOnRateLimit) {
    const retryAfter = Math.min(30, Math.max(1, Number(response.headers.get("retry-after")) || 5));
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    return mailmodoRequest(path, payload, config, { retryOnRateLimit: false });
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw new MailmodoError(describeFailure(response.status, body), response.status);
  }
  return body;
}

function addContact(contact, config = getMailmodoConfig()) {
  return mailmodoRequest("/addToList", { listName: config.listName, ...contact }, config);
}

function addContactsBatch(contacts, config = getMailmodoConfig()) {
  return mailmodoRequest("/addToList/batch", { listName: config.listName, values: contacts }, config);
}

function unsubscribeContact(email, config = getMailmodoConfig()) {
  return mailmodoRequest("/contacts/unsubscribe", { email }, config);
}

function resubscribeContact(email, config = getMailmodoConfig()) {
  return mailmodoRequest("/contacts/resubscribe", { email }, config);
}

module.exports = {
  BATCH_SIZE,
  RECENT_SIGNUP_DAYS,
  MailmodoError,
  getMailmodoConfig,
  normalizeMarketingEmail,
  eligibleUserFilter,
  ineligibleUserFilter,
  isMailmodoEligible,
  removalReason,
  buildContact,
  isRecentSignup,
  chunk,
  safeEqual,
  parseMailmodoWebhook,
  describeFailure,
  addContact,
  addContactsBatch,
  unsubscribeContact,
  resubscribeContact
};
