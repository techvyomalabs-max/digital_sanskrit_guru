const crypto = require("crypto");
const WebhookEvent = require("../models/WebhookEvent");
const PaymentIntent = require("../models/PaymentIntent");
const Order = require("../models/Order");

/**
 * Pure helper to verify Razorpay webhook HMAC-SHA256 signature
 */
function verifyWebhookSignature(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) {
    return false;
  }
  const sig = String(signature).trim();
  if (!/^[0-9a-f]+$/i.test(sig)) {
    return false;
  }
  const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), "utf8");
  const expectedHex = crypto.createHmac("sha256", secret).update(bodyBuf).digest("hex");
  const expectedBuf = Buffer.from(expectedHex, "hex");
  const providedBuf = Buffer.from(sig, "hex");

  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Express handler for POST /api/payment/webhook
 */
async function paymentWebhookHandler(req, res) {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret || !verifyWebhookSignature(req.body, signature, webhookSecret)) {
      console.warn("[Webhook] Invalid signature or RAZORPAY_WEBHOOK_SECRET unset");
      return res.status(400).json({ error: "Invalid signature" });
    }

    const eventId = String(req.headers["x-razorpay-event-id"] || "").trim();
    if (eventId) {
      const existing = await WebhookEvent.findOne({ eventId }).lean();
      if (existing) {
        return res.status(200).json({ ok: true, duplicate: true });
      }
    }

    let body;
    try {
      const rawStr = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body);
      body = JSON.parse(rawStr);
    } catch (parseErr) {
      console.warn("[Webhook] Failed to parse JSON body:", parseErr.message);
      return res.status(200).json({ ok: true, ignored: "invalid_json" });
    }

    let eventRecordCreated = false;
    if (eventId) {
      try {
        await WebhookEvent.create({
          eventId,
          event: body?.event || "",
          receivedAt: new Date()
        });
        eventRecordCreated = true;
      } catch (evtErr) {
        if (evtErr?.code === 11000) {
          return res.status(200).json({ ok: true, duplicate: true });
        }
        console.warn("[Webhook] Error saving WebhookEvent:", evtErr.message);
      }
    }

    try {
      if (body?.event === "payment.captured") {
        const payment = body?.payload?.payment?.entity;
        if (payment && payment.order_id) {
          const orderIdFromRzp = payment.order_id;
          const paymentIdFromRzp = payment.id;
          const now = new Date();

          let intent = await PaymentIntent.findOne({ razorpayOrderId: orderIdFromRzp });
          if (intent) {
            if (intent.status === "created") {
              intent.status = "captured";
              intent.razorpayPaymentId = paymentIdFromRzp;
              intent.capturedAt = now;
              await intent.save();
            }
          } else {
            intent = await PaymentIntent.create({
              razorpayOrderId: orderIdFromRzp,
              razorpayPaymentId: paymentIdFromRzp,
              amountMinor: Number(payment.amount) || 0,
              currency: payment.currency || "INR",
              mode: "checkout",
              status: "captured",
              capturedAt: now
            });
          }

          const orderExists = await Order.exists({
            $or: [
              { "paymentMeta.razorpayPaymentId": paymentIdFromRzp },
              { "paymentMeta.razorpayOrderId": orderIdFromRzp }
            ]
          });

          if (orderExists && intent.status !== "linked") {
            intent.status = "linked";
            await intent.save();
          }
        }
      }

      return res.status(200).json({ ok: true });
    } catch (bizErr) {
      console.error("[Webhook] Unexpected business logic error:", bizErr?.message || bizErr);
      if (eventId && eventRecordCreated) {
        try {
          await WebhookEvent.deleteOne({ eventId });
        } catch (delErr) {
          console.error("[Webhook] Failed to delete WebhookEvent after failure:", delErr?.message || delErr);
        }
      }
      return res.status(500).json({ error: "Webhook processing error" });
    }
  } catch (error) {
    console.error("[Webhook] Unexpected handler error:", error?.message || error);
    return res.status(500).json({ error: "Unexpected server error" });
  }
}

module.exports = {
  verifyWebhookSignature,
  paymentWebhookHandler
};
