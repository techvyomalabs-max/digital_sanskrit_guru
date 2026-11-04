const express = require("express");
const rateLimit = require("express-rate-limit");
const { perWorker } = require("../utils/workerCount");
const { getMailmodoConfig, parseMailmodoWebhook, safeEqual } = require("../utils/mailmodo");
const { applyMailmodoOptOut } = require("../services/mailmodoSync");

const router = express.Router();

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: perWorker(120),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many webhook requests." }
});

// ── POST /api/mailmodo/webhook?token=<MAILMODO_WEBHOOK_SECRET> ──────────────
// Mailmodo calls this when a contact unsubscribes or marks an email as spam,
// so our own promotional emails stop for them too.
router.post("/webhook", webhookLimiter, async (req, res) => {
  const { webhookSecret } = getMailmodoConfig();
  if (!webhookSecret) {
    return res.status(503).json({ message: "Mailmodo webhook is not configured." });
  }

  const token = String(req.query?.token || req.get("x-webhook-token") || "");
  if (!safeEqual(token, webhookSecret)) {
    return res.status(401).json({ message: "Invalid webhook token." });
  }

  try {
    const events = parseMailmodoWebhook(req.body).slice(0, 500);
    let optedOut = 0;
    for (const event of events) {
      if (!event.isOptOut) continue;
      if (await applyMailmodoOptOut(event.email)) optedOut += 1;
    }
    // Always 200 for events we don't act on, so Mailmodo doesn't keep retrying them
    return res.json({ received: events.length, optedOut });
  } catch (err) {
    console.error("[Mailmodo] Webhook error:", err.message);
    return res.status(500).json({ message: "Failed to process webhook." });
  }
});

module.exports = router;
