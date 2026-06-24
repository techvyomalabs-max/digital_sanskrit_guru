const express = require("express");
const User = require("../models/User");
const Product = require("../models/Product");
const PushSubscription = require("../models/PushSubscription");
const Wishlist = require("../models/Wishlist");
const EmailLog = require("../models/EmailLog");
const StoreSettings = require("../models/StoreSettings");
const protect = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");
const { sendBroadcastEmail, sendTestEmail, sendLowStockAdminAlert } = require("../utils/email");
const { broadcastPush, sendPushToUser, broadcastPayload, lowStockPayload, wishlistLowStockPayload } = require("../utils/webPush");

const router = express.Router();

// All routes require admin
router.use(protect, admin);

// ── GET /api/marketing/subscribers ──────────────────────────────────────────
// Overview counts for the marketing dashboard
router.get("/subscribers", async (_req, res) => {
  try {
    const [pushCount, userCount, settings] = await Promise.all([
      PushSubscription.countDocuments(),
      User.countDocuments({ deletedAt: null }),
      StoreSettings.findOne().select("lowStockThreshold notificationEmail emailEnabled pushEnabled").lean()
    ]);

    const threshold = Number(settings?.lowStockThreshold ?? 5);
    const lowStockCount = await Product.countDocuments({ stock: { $lte: threshold }, deletedAt: null });

    res.json({
      pushSubscribers: pushCount,
      emailSubscribers: userCount,
      lowStockCount,
      lowStockThreshold: threshold,
      notificationEmail: settings?.notificationEmail || "",
      emailEnabled: settings?.emailEnabled !== false,
      pushEnabled: settings?.pushEnabled !== false
    });
  } catch {
    res.status(500).json({ message: "Failed to load subscriber stats." });
  }
});

// ── GET /api/marketing/low-stock ─────────────────────────────────────────────
// List products at or below low-stock threshold + wishlist user count per product
router.get("/low-stock", async (_req, res) => {
  try {
    const settings = await StoreSettings.findOne().select("lowStockThreshold").lean();
    const threshold = Number(settings?.lowStockThreshold ?? 5);

    const products = await Product.find({ stock: { $lte: threshold }, deletedAt: null })
      .select("_id name stock category image")
      .sort({ stock: 1 })
      .lean();

    // Count how many wishlists include each low-stock product
    const productIds = products.map((p) => p._id);
    const wishlistAgg = await Wishlist.aggregate([
      { $match: { productIds: { $in: productIds } } },
      { $unwind: "$productIds" },
      { $match: { productIds: { $in: productIds } } },
      { $group: { _id: "$productIds", count: { $sum: 1 } } }
    ]);
    const wishlistCountMap = new Map(wishlistAgg.map((w) => [String(w._id), w.count]));

    const enriched = products.map((p) => ({
      ...p,
      wishlistCount: wishlistCountMap.get(String(p._id)) || 0
    }));

    res.json({ products: enriched, threshold });
  } catch {
    res.status(500).json({ message: "Failed to load low-stock products." });
  }
});

// ── POST /api/marketing/alert/low-stock ──────────────────────────────────────
// Manually trigger low-stock admin email + alert all wishlist users
router.post("/alert/low-stock", async (_req, res) => {
  try {
    const settings = await StoreSettings.findOne().select("lowStockThreshold notificationEmail").lean();
    const threshold = Number(settings?.lowStockThreshold ?? 5);

    const products = await Product.find({ stock: { $lte: threshold }, deletedAt: null })
      .select("_id name stock category")
      .sort({ stock: 1 })
      .lean();

    if (products.length === 0) {
      return res.json({ message: "No low-stock products found.", alertsSent: 0 });
    }

    // Build wishlist count map
    const productIds = products.map((p) => p._id);
    const wishlistAgg = await Wishlist.aggregate([
      { $match: { productIds: { $in: productIds } } },
      { $unwind: "$productIds" },
      { $match: { productIds: { $in: productIds } } },
      { $group: { _id: "$productIds", count: { $sum: 1 } } }
    ]);
    const wishlistCountMap = new Map(wishlistAgg.map((w) => [String(w._id), w.count]));
    const enrichedProducts = products.map((p) => ({
      ...p,
      wishlistCount: wishlistCountMap.get(String(p._id)) || 0
    }));

    // 1. Admin email + push
    await sendLowStockAdminAlert(enrichedProducts);
    if (settings?.notificationEmail || process.env.ADMIN_EMAIL) {
      // Push to admin subscriptions (find admin users)
      const admins = await User.find({ isAdmin: true }).select("_id").lean();
      for (const adminUser of admins) {
        await sendPushToUser(adminUser._id, lowStockPayload(
          `${products.length} item(s)`,
          `${products.length} products at ≤ ${threshold} stock`
        ));
      }
    }

    // 2. Wishlist user alerts (per-user push + email)
    const wishlistUsers = await Wishlist.find({ productIds: { $in: productIds } })
      .populate("user", "name email")
      .lean();

    let userAlertsSent = 0;
    for (const wl of wishlistUsers) {
      if (!wl.user?._id) continue;

      // Which low-stock products does this user have wishlisted?
      const userWishlistedLowStock = products.filter((p) =>
        wl.productIds.some((id) => String(id) === String(p._id))
      );

      if (userWishlistedLowStock.length === 0) continue;

      const productNames = userWishlistedLowStock.map((p) => p.name);
      const minStock = Math.min(...userWishlistedLowStock.map((p) => p.stock));

      // Push
      await sendPushToUser(wl.user._id, wishlistLowStockPayload(productNames, minStock));

      // Email (lazy import to avoid circular)
      const { sendWishlistLowStockAlert } = require("../utils/email");
      await sendWishlistLowStockAlert(wl.user, userWishlistedLowStock);

      userAlertsSent++;
    }

    res.json({
      message: `Low-stock alerts sent. Admin notified. ${userAlertsSent} wishlist user(s) alerted.`,
      productsAlerted: products.length,
      userAlertsSent
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to send alerts." });
  }
});

// ── POST /api/marketing/broadcast/email ──────────────────────────────────────
// Send a bulk email campaign to all registered users
router.post("/broadcast/email", async (req, res) => {
  try {
    const subject = String(req.body?.subject || "").trim();
    const html = String(req.body?.html || "").trim();

    if (!subject || !html) {
      return res.status(400).json({ message: "Subject and HTML body are required." });
    }

    const users = await User.find({ deletedAt: null }).select("email name").lean();
    const recipients = users.filter((u) => u.email);

    // Fire-and-forget — respond immediately
    res.json({ message: `Sending to ${recipients.length} users...`, total: recipients.length });

    // Send in background (don't await in handler)
    sendBroadcastEmail({ subject, html, recipients }).catch((err) => {
      console.error("[Marketing] Broadcast email error:", err.message);
    });
  } catch {
    res.status(500).json({ message: "Failed to start broadcast." });
  }
});

// ── POST /api/marketing/broadcast/push ───────────────────────────────────────
// Send a push notification to all subscribers
router.post("/broadcast/push", async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    const body = String(req.body?.body || "").trim();
    const url = String(req.body?.url || "/").trim();

    if (!title || !body) {
      return res.status(400).json({ message: "Title and body are required." });
    }

    const count = await PushSubscription.countDocuments();
    res.json({ message: `Sending push to ${count} subscriber(s)...`, total: count });

    // Fire-and-forget
    broadcastPush(broadcastPayload(title, body, url)).catch((err) => {
      console.error("[Marketing] Broadcast push error:", err.message);
    });
  } catch {
    res.status(500).json({ message: "Failed to send broadcast push." });
  }
});

// ── POST /api/marketing/test-email ───────────────────────────────────────────
// Send a test email to the admin
router.post("/test-email", async (req, res) => {
  try {
    const to = String(req.body?.to || process.env.ADMIN_EMAIL || "").trim();
    if (!to) return res.status(400).json({ message: "Email address required." });
    await sendTestEmail(to);
    res.json({ message: `Test email sent to ${to}.` });
  } catch {
    res.status(500).json({ message: "Failed to send test email." });
  }
});

// ── GET /api/marketing/email-log ─────────────────────────────────────────────
// Recent email send history
router.get("/email-log", async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const type = String(req.query.type || "").trim();
    const filter = type ? { type } : {};
    const logs = await EmailLog.find(filter).sort({ sentAt: -1 }).limit(limit).lean();
    res.json(logs);
  } catch {
    res.status(500).json({ message: "Failed to load email log." });
  }
});

// ── PUT /api/marketing/settings ──────────────────────────────────────────────
// Update low-stock threshold + notification email
router.put("/settings", async (req, res) => {
  try {
    const threshold = Math.max(0, Number(req.body?.lowStockThreshold ?? 5));
    const notificationEmail = String(req.body?.notificationEmail || "").trim().toLowerCase();
    const emailEnabled = req.body?.emailEnabled !== false;
    const pushEnabled = req.body?.pushEnabled !== false;

    const settings = await StoreSettings.findOneAndUpdate(
      {},
      { $set: { lowStockThreshold: threshold, notificationEmail, emailEnabled, pushEnabled } },
      { upsert: true, new: true }
    );

    res.json({
      lowStockThreshold: settings.lowStockThreshold,
      notificationEmail: settings.notificationEmail,
      emailEnabled: settings.emailEnabled,
      pushEnabled: settings.pushEnabled
    });
  } catch {
    res.status(500).json({ message: "Failed to save settings." });
  }
});

module.exports = router;
