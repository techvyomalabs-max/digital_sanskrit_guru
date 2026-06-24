/**
 * webPush.js — Web Push (VAPID) notification utility.
 *
 * PUSH_ENABLED=false in .env means pushes are logged but not sent.
 * VAPID keys are already generated — stored in .env.
 */

const webpush = require("web-push");
const PushSubscription = require("../models/PushSubscription");

const PUSH_ENABLED = String(process.env.PUSH_ENABLED || "true").toLowerCase() === "true";
const SITE_NAME = "Digital Sanskrit Guru";

// ── Init VAPID ───────────────────────────────────────────────────────────────

let vapidInitialized = false;

function initVapid() {
  if (vapidInitialized) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL || "mailto:admin@digitalsanskritguru.com";

  if (!publicKey || !privateKey) {
    console.warn("[Push] VAPID keys not set — push disabled.");
    return;
  }

  webpush.setVapidDetails(email, publicKey, privateKey);
  vapidInitialized = true;
}

// ── Core push sender ─────────────────────────────────────────────────────────

async function sendPushToSubscription(subscription, payload) {
  if (!PUSH_ENABLED || !vapidInitialized) return { skipped: true };

  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify(payload)
    );
    return { sent: true };
  } catch (err) {
    // 410 Gone = subscription is expired/unsubscribed, remove it
    if (err.statusCode === 410 || err.statusCode === 404) {
      try {
        await PushSubscription.deleteOne({ endpoint: subscription.endpoint });
      } catch {
        // ignore cleanup errors
      }
    }
    return { error: err.message };
  }
}

// ── Send to a single user (all their subscriptions) ──────────────────────────

async function sendPushToUser(userId, payload) {
  const subscriptions = await PushSubscription.find({ user: userId }).lean();
  const results = await Promise.allSettled(
    subscriptions.map((sub) => sendPushToSubscription(sub, payload))
  );
  return results;
}

// ── Broadcast to all subscribers ─────────────────────────────────────────────

async function broadcastPush(payload) {
  const subscriptions = await PushSubscription.find({}).lean();
  if (subscriptions.length === 0) return [];
  const results = await Promise.allSettled(
    subscriptions.map((sub) => sendPushToSubscription(sub, payload))
  );
  return results;
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
    url: "/#/my-orders",
    icon: "/favicon.ico",
    badge: "/favicon.ico"
  };
}

function lowStockPayload(productName, stockLeft) {
  return {
    title: `${SITE_NAME} — Low Stock Alert`,
    body: `⚠️ "${productName}" has only ${stockLeft} unit(s) left.`,
    url: "/#/admin/products",
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
    url: "/#/wishlist",
    icon: "/favicon.ico",
    badge: "/favicon.ico"
  };
}

function broadcastPayload(title, body, url = "/") {
  return { title: `${SITE_NAME} — ${title}`, body, url, icon: "/favicon.ico", badge: "/favicon.ico" };
}

module.exports = {
  initVapid,
  sendPushToSubscription,
  sendPushToUser,
  broadcastPush,
  orderPayload,
  lowStockPayload,
  wishlistLowStockPayload,
  broadcastPayload,
  getVapidPublicKey: () => process.env.VAPID_PUBLIC_KEY || ""
};
