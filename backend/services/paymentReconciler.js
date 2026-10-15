const PaymentIntent = require("../models/PaymentIntent");
const Order = require("../models/Order");
const User = require("../models/User");
const { sendOrphanPaymentAlert } = require("../utils/email");

/**
 * Sweep captured intents older than 15 minutes to reconcile with orders
 * or mark as orphan and alert admins.
 */
async function runPaymentReconciliation() {
  try {
    const cutoff15m = new Date(Date.now() - 15 * 60 * 1000);

    // Find captured intents older than 15 mins
    const capturedIntents = await PaymentIntent.find({
      status: "captured",
      capturedAt: { $lte: cutoff15m }
    });

    for (const intent of capturedIntents) {
      // 1. Check if an order already exists for this payment
      const order = await Order.findOne({
        $or: [
          { "paymentMeta.razorpayPaymentId": intent.razorpayPaymentId },
          { "paymentMeta.razorpayOrderId": intent.razorpayOrderId }
        ]
      }).select("_id").lean();

      if (order) {
        // Linked atomically
        await PaymentIntent.updateOne(
          { _id: intent._id, status: "captured" },
          { $set: { status: "linked" } }
        );
        continue;
      }

      // 2. Atomically claim status from "captured" -> "orphan"
      // Only the worker/thread that wins this claim sends the alert email
      const now = new Date();
      const claimed = await PaymentIntent.findOneAndUpdate(
        { _id: intent._id, status: "captured" },
        { $set: { status: "orphan", orphanedAt: now } },
        { new: true }
      );

      if (claimed) {
        let userEmail = "";
        if (claimed.user) {
          const userDoc = await User.findById(claimed.user).select("email").lean();
          if (userDoc?.email) {
            userEmail = userDoc.email;
          }
        }

        try {
          await sendOrphanPaymentAlert({
            razorpayPaymentId: claimed.razorpayPaymentId,
            razorpayOrderId: claimed.razorpayOrderId,
            amountMinor: claimed.amountMinor,
            currency: claimed.currency || "INR",
            capturedAt: claimed.capturedAt,
            userEmail
          });

          await PaymentIntent.updateOne(
            { _id: claimed._id },
            { $set: { alertSentAt: new Date() } }
          );
        } catch (alertErr) {
          console.error("[PaymentReconciler] Failed to send orphan payment alert email:", alertErr?.message || alertErr);
        }
      }
    }
  } catch (err) {
    console.error("[PaymentReconciler] Error during reconciliation sweep:", err?.message || err);
  }
}

/**
 * Initialize 10-minute background interval for Payment Reconciliation.
 */
function initPaymentReconciler() {
  // Initial check after 1 minute on server boot
  setTimeout(() => {
    runPaymentReconciliation().catch(() => {});
  }, 60000);

  // Run every 10 minutes
  const INTERVAL_10_MIN = 10 * 60 * 1000;
  setInterval(() => {
    runPaymentReconciliation().catch(() => {});
  }, INTERVAL_10_MIN);

  console.log("[PaymentReconciler] Scheduler initialized (10-minute check).");
}

module.exports = {
  runPaymentReconciliation,
  initPaymentReconciler
};
