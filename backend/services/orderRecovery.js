"use strict";

/**
 * Order recovery: a customer paid, Razorpay confirmed it (webhook → PaymentIntent "captured"),
 * but the browser never created the order (tab closed, phone locked, network dropped).
 *
 * After RECOVER_AFTER_MS, this creates the order from the details saved when payment started
 * (PaymentIntent.orderDraft), through the same code as normal checkout (placeOrder): same
 * prices, coupon and stock rules, same confirmation email. The payment is checked directly
 * with Razorpay using our own key.
 *
 * One try per payment. If it can't be done (no saved details, guest checkout, the price or
 * coupon changed so the paid amount no longer matches, Razorpay unreachable…), the payment
 * is left "captured" and the existing reconciler marks it orphan after 15 minutes and emails
 * the admins, exactly as before.
 */

const RECOVER_AFTER_MS = 3 * 60 * 1000;
const MAX_PER_RUN = 25;

function captureResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    setHeader() {}
  };
}

async function recoverOrderForIntent(intent, { PaymentIntent, Order, placeOrder, now = new Date(), logger = console }) {
  // Claim it, so two server workers never try the same payment at once
  const claimed = await PaymentIntent.findOneAndUpdate(
    { _id: intent._id, status: "captured", "recovery.attempts": { $lt: 1 } },
    { $set: { status: "recovering", "recovery.lastAttemptAt": now }, $inc: { "recovery.attempts": 1 } },
    { new: true }
  );
  if (!claimed) return { action: "skipped" };

  const settle = (set) => PaymentIntent.updateOne({ _id: claimed._id, status: "recovering" }, { $set: set });

  try {
    // The browser may have got there after all
    const existing = await Order.findOne({ "paymentMeta.razorpayPaymentId": claimed.razorpayPaymentId })
      .select("_id")
      .lean();
    if (existing) {
      await settle({ status: "linked", orderId: existing._id });
      return { action: "already-linked", orderId: existing._id };
    }

    const req = {
      serverRecovery: true,
      user: String(claimed.user),
      headers: {},
      body: {
        ...claimed.orderDraft,
        paymentStatus: "Paid",
        razorpayOrderId: claimed.razorpayOrderId,
        razorpayPaymentId: claimed.razorpayPaymentId
      }
    };
    const res = captureResponse();
    await placeOrder(req, res);

    if (res.statusCode === 201 && res.body?._id) {
      await settle({ status: "linked", orderId: res.body._id, "recovery.recoveredAt": new Date(), "recovery.lastError": "" });
      logger.info?.(`[OrderRecovery] Created order ${res.body._id} for payment ${claimed.razorpayPaymentId}`);
      return { action: "recovered", orderId: res.body._id };
    }

    if (res.statusCode === 409 && /already used/i.test(String(res.body?.message || ""))) {
      const order = await Order.findOne({ "paymentMeta.razorpayPaymentId": claimed.razorpayPaymentId }).select("_id").lean();
      await settle({ status: "linked", ...(order ? { orderId: order._id } : {}) });
      return { action: "already-linked", orderId: order?._id || null };
    }

    const reason = String(res.body?.message || `HTTP ${res.statusCode}`).slice(0, 300);
    await settle({ status: "captured", "recovery.lastError": reason });
    logger.warn?.(`[OrderRecovery] Could not create the order for payment ${claimed.razorpayPaymentId}: ${reason}`);
    return { action: "failed", reason };
  } catch (err) {
    const reason = String(err?.message || err).slice(0, 300);
    await settle({ status: "captured", "recovery.lastError": reason }).catch(() => {});
    logger.error?.(`[OrderRecovery] Error for payment ${claimed.razorpayPaymentId}: ${reason}`);
    return { action: "failed", reason };
  }
}

/** Finds paid checkouts with no order and tries to create each order once. */
async function recoverPaidCheckouts(deps) {
  const { PaymentIntent, now = new Date() } = deps;
  const intents = await PaymentIntent.find({
    status: "captured",
    mode: "checkout",
    capturedAt: { $lte: new Date(now.getTime() - RECOVER_AFTER_MS) },
    user: { $ne: null },
    orderDraft: { $ne: null },
    razorpayPaymentId: { $gt: "" },
    "recovery.attempts": { $lt: 1 }
  })
    .sort({ capturedAt: 1 })
    .limit(MAX_PER_RUN)
    .lean();

  const results = [];
  for (const intent of intents) {
    results.push(await recoverOrderForIntent(intent, deps));
  }
  return results;
}

module.exports = { recoverPaidCheckouts, recoverOrderForIntent, RECOVER_AFTER_MS };
