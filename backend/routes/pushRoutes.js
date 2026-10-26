const express = require("express");
const PushSubscription = require("../models/PushSubscription");
const protect = require("../middleware/authMiddleware");
const { initVapid, getVapidPublicKey } = require("../utils/webPush");

const router = express.Router();

// Ensure VAPID is initialised when this module loads
initVapid();

// GET /api/push/vapid-key — public, browser needs this to subscribe
router.get("/vapid-key", (_req, res) => {
  const key = getVapidPublicKey();
  if (!key) {
    return res.status(503).json({ message: "Push notifications not configured." });
  }
  res.json({ publicKey: key });
});

// POST /api/push/subscribe — save a push subscription for the logged-in user
router.post("/subscribe", protect, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ message: "Invalid subscription payload." });
    }

    // Upsert by endpoint — endpoint is unique per browser/device
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      { user: req.user, endpoint, keys },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    res.json({ message: "Subscribed to push notifications." });
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate endpoint (already subscribed) — update user and keys
      await PushSubscription.updateOne(
        { endpoint: req.body.endpoint },
        { user: req.user, keys: req.body.keys }
      );
      return res.json({ message: "Subscription updated." });
    }
    res.status(500).json({ message: "Failed to save subscription." });
  }
});

// DELETE /api/push/unsubscribe — remove subscription for this browser
router.delete("/unsubscribe", protect, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ message: "Endpoint required." });

    await PushSubscription.deleteOne({ endpoint, user: req.user });
    res.json({ message: "Unsubscribed from push notifications." });
  } catch {
    res.status(500).json({ message: "Failed to remove subscription." });
  }
});

// GET /api/push/status — check if current browser endpoint is subscribed
router.post("/status", protect, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.json({ subscribed: false });
    const exists = await PushSubscription.exists({ endpoint, user: req.user });
    res.json({ subscribed: Boolean(exists) });
  } catch {
    res.json({ subscribed: false });
  }
});

// POST /api/push/test — send an instant test push to the logged-in user
router.post("/test", protect, async (req, res) => {
  try {
    const { sendPushToUser } = require("../utils/webPush");
    const count = await PushSubscription.countDocuments({ user: req.user });
    if (count === 0) {
      return res.status(400).json({
        success: false,
        message: "No push subscription found for your account. Please enable notifications first."
      });
    }

    const results = await sendPushToUser(req.user, {
      title: "Digital Sanskrit Guru — Test Notification",
      body: "🔔 Push notifications are working perfectly on your device!",
      url: "/account",
      icon: "/favicon.ico",
      badge: "/favicon.ico"
    });

    res.json({ success: true, message: "Test notification sent!", results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
