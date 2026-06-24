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
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ message: "Subscribed to push notifications." });
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate endpoint (already subscribed) — fine
      return res.json({ message: "Already subscribed." });
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

module.exports = router;
