/**
 * webPush.js — Web Push (VAPID) notification utility.
 *
 * Needs VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env (the same pair the browser subscribed
 * with). PUSH_ENABLED=false turns sending off. Every send logs a one-line summary, and the
 * reason when nothing went out.
 */

const webpush = require("web-push");
const PushSubscription = require("../models/PushSubscription");

const PUSH_ENABLED = String(process.env.PUSH_ENABLED || "true").toLowerCase() === "true";
const SITE_NAME = "Digital Sanskrit Guru";

// ── Init VAPID ───────────────────────────────────────────────────────────────

let vapidInitialized = false;
let vapidError = "";

/** Whether the server can send pushes right now, and if not, why (shown to admins). */
function getPushStatus() {
  const enabled = String(process.env.PUSH_ENABLED || "true").toLowerCase() === "true";
  const configured = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  initVapid();
  let reason = "";
  if (!configured) reason = "Push keys (VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY) are not set on the server.";
  else if (vapidError) reason = `Push keys on the server are not valid: ${vapidError}`;
  else if (!enabled) reason = "Push is switched off on the server (PUSH_ENABLED=false).";
  return { ready: enabled && configured && vapidInitialized, enabled, configured, reason };
}

function initVapid() {
  if (vapidInitialized || vapidError) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL || "mailto:admin@digitalsanskritguru.com";

  if (!publicKey || !privateKey) {
    console.warn("[Push] VAPID keys not set — push notifications are OFF.");
    return;
  }

  try {
    webpush.setVapidDetails(email, publicKey, privateKey);
    vapidInitialized = true;
  } catch (err) {
    // e.g. a key pasted with quotes or a missing "mailto:" in VAPID_EMAIL
    vapidError = err.message;
    console.error("[Push] VAPID keys are invalid — push notifications are OFF:", err.message);
  }
}

// The browser subscribed with a different public key than the server now sends with,
// so this subscription can never work again. Happens after the keys are changed.
function isKeyMismatch(err) {
  const text = `${err?.body || ""} ${err?.message || ""}`.toLowerCase();
  return err?.statusCode === 403 && (text.includes("correspond") || text.includes("vapid"));
}

// ── Core push sender ─────────────────────────────────────────────────────────

async function sendPushToSubscription(subscription, payload) {
  const status = getPushStatus();
  if (!status.ready) return { skipped: true, reason: status.reason };

  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify(payload)
    );
    return { sent: true };
  } catch (err) {
    const gone = err.statusCode === 410 || err.statusCode === 404;
    const mismatch = isKeyMismatch(err);
    console.error(
      `[Push] Send failed (${err.statusCode || "no status"})${mismatch ? " — subscribed with an old key" : ""}:`,
      err.body || err.message
    );
    // Expired, unsubscribed, or made with an old key: it can never succeed, so remove it.
    // The browser subscribes again on the customer's next visit.
    if (gone || mismatch) {
      try {
        await PushSubscription.deleteOne({ endpoint: subscription.endpoint });
      } catch {
        // ignore cleanup errors
      }
    }
    return { error: err.body || err.message, statusCode: err.statusCode || null, removed: gone || mismatch };
  }
}

/** Counts of what happened, for logs and for the admin/test messages. */
function summarizeResults(results = []) {
  const summary = { devices: results.length, sent: 0, failed: 0, skipped: 0, removed: 0, reason: "" };
  for (const r of results) {
    const value = r?.status === "fulfilled" ? r.value : { error: r?.reason?.message || "error" };
    if (value?.sent) summary.sent += 1;
    else if (value?.skipped) {
      summary.skipped += 1;
      summary.reason = summary.reason || value.reason || "";
    } else {
      summary.failed += 1;
      if (value?.removed) summary.removed += 1;
      summary.reason = summary.reason || String(value?.error || "");
    }
  }
  return summary;
}

// ── Send to a single user (all their subscriptions) ──────────────────────────

async function sendPushToUser(userId, payload) {
  const subscriptions = await PushSubscription.find({ user: userId }).lean();
  const results = await Promise.allSettled(
    subscriptions.map((sub) => sendPushToSubscription(sub, payload))
  );
  const summary = summarizeResults(results);
  console.log(
    `[Push] User ${userId}: ${summary.devices} device(s), ${summary.sent} sent, ${summary.failed} failed, ${summary.skipped} skipped` +
      (summary.reason ? ` — ${summary.reason}` : "")
  );
  return summary;
}

// ── Broadcast to all subscribers ─────────────────────────────────────────────

async function broadcastPush(payload) {
  const subscriptions = await PushSubscription.find({}).lean();
  const results = await Promise.allSettled(
    subscriptions.map((sub) => sendPushToSubscription(sub, payload))
  );
  const summary = summarizeResults(results);
  console.log(
    `[Push] Broadcast: ${summary.devices} device(s), ${summary.sent} sent, ${summary.failed} failed` +
      ` (${summary.removed} expired removed), ${summary.skipped} skipped` +
      (summary.reason ? ` — ${summary.reason}` : "")
  );
  return summary;
}

// ── Convenience builders ─────────────────────────────────────────────────────

function orderPayload(order, event) {
  const statusMessages = {
    placed: { title: `${SITE_NAME} — Order Placed!`, body: `Your order #${String(order._id || "").slice(-6).toUpperCase()} has been placed successfully.` },
    shipped: { title: `${SITE_NAME} — Order Shipped!`, body: `Your order #${String(order._id || "").slice(-6).toUpperCase()} is on its way!` },
    delivered: { title: `${SITE_NAME} — Order Delivered!`, body: `Your order #${String(order._id || "").slice(-6).toUpperCase()} has been delivered. Enjoy!` },
    cancelled: { title: `${SITE_NAME} — Order Cancelled`, body: `Your order #${String(order._id || "").slice(-6).toUpperCase()} has been cancelled.` }
  };
  const msg = statusMessages[event] || { title: SITE_NAME, body: `Order update: ${event}` };
  return {
    title: msg.title,
    body: msg.body,
    url: "/my-orders",
    icon: "/favicon.ico",
    badge: "/favicon.ico"
  };
}

function lowStockPayload(productName, stockLeft) {
  return {
    title: `${SITE_NAME} — Low Stock Alert`,
    body: `⚠️ "${productName}" has only ${stockLeft} unit(s) left.`,
    url: "/admin/products",
    icon: "/favicon.ico",
    badge: "/favicon.ico"
  };
}

function wishlistLowStockPayload(productNames, stockLeft) {
  const name = productNames.length === 1 ? productNames[0] : `${productNames.length} wishlisted items`;
  const body = productNames.length === 1
    ? `Hurry! "${name}" has only ${stockLeft} unit(s) left.`
    : `Hurry! ${name} in your wishlist are running low.`;
  return {
    title: `${SITE_NAME} — Your Wishlist`,
    body,
    url: "/wishlist",
    icon: "/favicon.ico",
    badge: "/favicon.ico"
  };
}

function broadcastPayload(title, body, url = "/") {
  return { title: `${SITE_NAME} — ${title}`, body, url, icon: "/favicon.ico", badge: "/favicon.ico" };
}

function refundRequestPayload({ orderId, kind, customerName, amountText }) {
  const shortId = String(orderId || "").slice(-6).toUpperCase();
  const title = kind === "cancellation" ? "Refund request: cancellation" : "Refund request: return";
  const body = `${customerName} · Order #${shortId} · ${amountText}`;
  return {
    title,
    body,
    url: "/admin/orders",
    icon: "/favicon.ico",
    badge: "/favicon.ico"
  };
}

function accessGrantedPayload(order) {
  return {
    title: "Your access is ready",
    body: "Open My Library to start",
    url: "/my-library",
    icon: "/favicon.ico",
    badge: "/favicon.ico"
  };
}

function accessPendingPayload({ orderId, customerName, productNames }) {
  const shortId = String(orderId || "").slice(-6).toUpperCase();
  const names = Array.isArray(productNames) ? productNames.join(", ") : String(productNames || "");
  const title = "Manual Access Required";
  const body = `${customerName || "Customer"} · Order #${shortId}${names ? ` · ${names}` : ""}`;
  return {
    title,
    body,
    url: "/admin/orders",
    icon: "/favicon.ico",
    badge: "/favicon.ico"
  };
}

module.exports = {
  initVapid,
  getPushStatus,
  summarizeResults,
  sendPushToSubscription,
  sendPushToUser,
  broadcastPush,
  orderPayload,
  lowStockPayload,
  wishlistLowStockPayload,
  broadcastPayload,
  refundRequestPayload,
  accessGrantedPayload,
  accessPendingPayload,
  getVapidPublicKey: () => process.env.VAPID_PUBLIC_KEY || ""
};
