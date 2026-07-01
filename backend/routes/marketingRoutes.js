const express = require("express");
const User = require("../models/User");
const Product = require("../models/Product");
const PushSubscription = require("../models/PushSubscription");
const Wishlist = require("../models/Wishlist");
const EmailLog = require("../models/EmailLog");
const StoreSettings = require("../models/StoreSettings");
const Order = require("../models/Order");
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

// Helper to resolve recipients list based on category/product/spend filter
async function resolveRecipientsList(filterType, filterValue) {
  let userIds = null;

  if (filterType === "category") {
    const orders = await Order.find({
      status: { $ne: "Cancelled" },
      "items.category": filterValue
    }).select("user").lean();
    userIds = orders.map((o) => String(o.user)).filter(Boolean);
  } else if (filterType === "product") {
    const orders = await Order.find({
      status: { $ne: "Cancelled" },
      $or: [
        { "items._id": filterValue },
        { "items.product": filterValue }
      ]
    }).select("user").lean();
    userIds = orders.map((o) => String(o.user)).filter(Boolean);
  } else if (filterType === "minSpend") {
    const spendAgg = await Order.aggregate([
      { $match: { status: { $ne: "Cancelled" } } },
      { $group: { _id: "$user", totalSpent: { $sum: "$total" } } },
      { $match: { totalSpent: { $gte: Number(filterValue || 0) } } }
    ]);
    userIds = spendAgg.map((s) => String(s._id)).filter(Boolean);
  }

  const query = { deletedAt: null };
  if (userIds !== null) {
    query._id = { $in: userIds };
  }

  return await User.find(query).select("email name").lean();
}

// ── GET /api/marketing/targeting-options ─────────────────────────────────────
// Retrieve all unique product categories and active products list
router.get("/targeting-options", async (_req, res) => {
  try {
    const [categories, products] = await Promise.all([
      Product.distinct("category", { deletedAt: null }),
      Product.find({ deletedAt: null }).select("_id name").sort({ name: 1 }).lean()
    ]);
    res.json({ categories, products });
  } catch {
    res.status(500).json({ message: "Failed to load targeting options." });
  }
});

// ── POST /api/marketing/recipient-preview ────────────────────────────────────
// Preview the matching recipients for a given targeting configuration
router.post("/recipient-preview", async (req, res) => {
  try {
    const filterType = String(req.body?.filterType || "all").trim();
    const filterValue = String(req.body?.filterValue || "").trim();

    const recipients = await resolveRecipientsList(filterType, filterValue);
    res.json({
      count: recipients.length,
      recipients: recipients.slice(0, 10).map(r => ({ name: r.name, email: r.email })) // Limit preview list for UI performance
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to load preview." });
  }
});

// ── POST /api/marketing/segmented-customers ──────────────────────────────────
// Returns a detailed list of matching customers with order counts and spent totals
router.post("/segmented-customers", async (req, res) => {
  try {
    const filterType = String(req.body?.filterType || "all").trim();
    const filterValue = String(req.body?.filterValue || "").trim();

    const matchedUsers = await resolveRecipientsList(filterType, filterValue);
    const userIds = matchedUsers.map(u => u._id);

    // Aggregate spend and order count for these users
    const ordersAgg = await Order.aggregate([
      { $match: { user: { $in: userIds }, status: { $ne: "Cancelled" } } },
      { $group: { _id: "$user", totalSpent: { $sum: "$total" }, orderCount: { $sum: 1 } } }
    ]);

    const statsMap = new Map(ordersAgg.map(o => [String(o._id), o]));

    const enrichedUsers = matchedUsers.map(user => {
      const stats = statsMap.get(String(user._id)) || { totalSpent: 0, orderCount: 0 };
      return {
        _id: String(user._id),
        name: user.name || "User",
        email: user.email || "",
        orderCount: stats.orderCount,
        totalSpent: stats.totalSpent
      };
    });

    // Sort by total spent descending
    enrichedUsers.sort((a, b) => b.totalSpent - a.totalSpent);

    res.json({ customers: enrichedUsers });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to load segmented customers." });
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
// Send a bulk email campaign to registered users (supporting targeting filters)
router.post("/broadcast/email", async (req, res) => {
  try {
    const subject = String(req.body?.subject || "").trim();
    const html = String(req.body?.html || "").trim();
    const filterType = String(req.body?.filterType || "all").trim();
    const filterValue = String(req.body?.filterValue || "").trim();

    if (!subject || !html) {
      return res.status(400).json({ message: "Subject and HTML body are required." });
    }

    const matchedUsers = await resolveRecipientsList(filterType, filterValue);
    const recipients = matchedUsers.filter((u) => u.email);

    if (recipients.length === 0) {
      return res.status(400).json({ message: "No recipients match the selected criteria." });
    }

    // Fire-and-forget — respond immediately
    res.json({ message: `Sending to ${recipients.length} users...`, total: recipients.length });

    // Send in background (don't await in handler)
    sendBroadcastEmail({ subject, html, recipients }).catch((err) => {
      console.error("[Marketing] Broadcast email error:", err.message);
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to start broadcast." });
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
