const PaymentIntent = require("../models/PaymentIntent");
const Order = require("../models/Order");
const User = require("../models/User");
const { sendOrphanPaymentAlert } = require("../utils/email");

/**
 * Sweep captured intents older than 15 minutes to reconcile with orders
 * or mark as orphan and alert admins.
 */
async function runPaymentReconciliation() {
  // First: create the orders for paid checkouts whose browser closed (one try each)
  try {
    // Loaded here: the order routes load most of the app
    const { placeOrder } = require("../routes/orderRoutes");
    const { recoverPaidCheckouts } = require("./orderRecovery");
    // A try interrupted by a restart: hand it to the orphan check below
    await PaymentIntent.updateMany(
      { status: "recovering", "recovery.lastAttemptAt": { $lte: new Date(Date.now() - 10 * 60 * 1000) } },
      { $set: { status: "captured", "recovery.lastError": "Interrupted (server restart)" } }
    );
    await recoverPaidCheckouts({ PaymentIntent, Order, placeOrder });
  } catch (err) {
    console.error("[PaymentReconciler] Order recovery error:", err?.message || err);
  }

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
          // A "Failed" order from an earlier attempt on this checkout doesn't count
          { "paymentMeta.razorpayOrderId": intent.razorpayOrderId, paymentStatus: "Paid" }
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
 * Background check every 5 minutes: recover orders for paid checkouts, then flag
 * payments still without an order as orphans.
 */
function initPaymentReconciler() {
  // Initial check after 1 minute on server boot
  setTimeout(() => {
    runPaymentReconciliation().catch(() => {});
  }, 60000);

  // Every 5 minutes, so a recovered order arrives within about 3–8 minutes of payment
  const INTERVAL_5_MIN = 5 * 60 * 1000;
  setInterval(() => {
    runPaymentReconciliation().catch(() => {});
  }, INTERVAL_5_MIN);

  console.log("[PaymentReconciler] Scheduler initialized (5-minute check).");
}

module.exports = {
  runPaymentReconciliation,
  initPaymentReconciler
};
