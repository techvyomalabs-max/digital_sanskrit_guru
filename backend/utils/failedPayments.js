"use strict";

/**
 * Failed and abandoned Razorpay payments.
 *
 * Every checkout creates a Razorpay order first (a PaymentIntent row, razorpayOrderId "order_…").
 * A payment ("pay_…") only exists once the customer actually tries to pay:
 *   - paid:      the order stores both IDs (verified elsewhere).
 *   - failed:    Razorpay made a payment that failed. We keep its pay_ ID and reason on the
 *                PaymentIntent (from the payment.failed webhook, or reported by the checkout
 *                page and checked with Razorpay here).
 *   - abandoned: the customer closed the checkout without trying, so there is no pay_ ID at all;
 *                only the order_ ID.
 *
 * The order's own paymentMeta.razorpayPaymentId stays reserved for the payment that was actually
 * captured, because refunds, duplicate checks and finance reports rely on it.
 */

const RAZORPAY_ORDER_ID = /^order_[A-Za-z0-9]{6,40}$/;
const RAZORPAY_PAYMENT_ID = /^pay_[A-Za-z0-9]{6,40}$/;

function cleanRazorpayOrderId(value) {
  const id = String(value || "").trim();
  return RAZORPAY_ORDER_ID.test(id) ? id : "";
}

function cleanRazorpayPaymentId(value) {
  const id = String(value || "").trim();
  return RAZORPAY_PAYMENT_ID.test(id) ? id : "";
}

function failureFromPayment(payment) {
  return {
    paymentId: String(payment.id || ""),
    code: String(payment.error_code || ""),
    description: String(payment.error_description || "").slice(0, 300),
    reason: String(payment.error_reason || ""),
    source: String(payment.error_source || ""),
    step: String(payment.error_step || ""),
    method: String(payment.method || ""),
    at: payment.created_at ? new Date(Number(payment.created_at) * 1000) : new Date()
  };
}

/**
 * Keep a failed payment try on its checkout's PaymentIntent (finance "Payment attempts" report and
 * the admin order page). The same payment reported twice (webhook and checkout page) counts once.
 */
async function recordFailedPayment(payment, { PaymentIntent }) {
  if (!payment || !payment.order_id) return { recorded: false, reason: "no-order" };
  const razorpayOrderId = String(payment.order_id);
  const paymentId = String(payment.id || "");

  if (paymentId) {
    const existing = await PaymentIntent.findOne({ razorpayOrderId }).select("lastFailure.paymentId").lean();
    if (existing?.lastFailure?.paymentId === paymentId) {
      return { recorded: false, reason: "already-recorded" };
    }
  }

  await PaymentIntent.findOneAndUpdate(
    { razorpayOrderId },
    {
      $inc: { failedAttempts: 1 },
      $set: { lastFailure: failureFromPayment(payment) },
      $setOnInsert: {
        amountMinor: Number(payment.amount) || 0,
        currency: payment.currency || "INR",
        mode: "checkout",
        status: "created"
      }
    },
    { upsert: true }
  );
  return { recorded: true };
}

/**
 * The customer's own checkout for this order, or null. A Razorpay order ID sent by the browser is
 * only trusted if our server created it for this customer and it isn't tied to a different order.
 */
async function findOwnedIntent({ razorpayOrderId, userId, orderId = null }, { PaymentIntent }) {
  const id = cleanRazorpayOrderId(razorpayOrderId);
  if (!id || !userId) return null;
  const intent = await PaymentIntent.findOne({ razorpayOrderId: id });
  if (!intent || String(intent.user || "") !== String(userId)) return null;
  if (intent.orderId && orderId && String(intent.orderId) !== String(orderId)) return null;
  return intent;
}

/**
 * After a failed or abandoned checkout: link the customer's PaymentIntent to the saved order and,
 * when the checkout page reported a failed payment, confirm it with Razorpay and record it.
 * Never throws: this is bookkeeping and must not stop the order from saving.
 */
async function noteUnpaidCheckout(
  { razorpayOrderId, failedPaymentId, userId, orderId },
  { PaymentIntent, fetchPayment, logger = console }
) {
  try {
    const intent = await findOwnedIntent({ razorpayOrderId, userId, orderId }, { PaymentIntent });
    if (!intent) return { linked: false, recorded: false };

    if (orderId && !intent.orderId) {
      intent.orderId = orderId;
      await intent.save();
    }

    const paymentId = cleanRazorpayPaymentId(failedPaymentId);
    if (!paymentId || typeof fetchPayment !== "function") return { linked: true, recorded: false };

    // Ask Razorpay rather than trusting the browser: it must be a failed payment on this checkout.
    const payment = await fetchPayment(paymentId);
    if (!payment || String(payment.order_id) !== intent.razorpayOrderId || payment.status !== "failed") {
      return { linked: true, recorded: false };
    }
    const result = await recordFailedPayment(payment, { PaymentIntent });
    return { linked: true, recorded: result.recorded };
  } catch (err) {
    logger.warn?.("[Payment] Could not record the failed checkout:", err?.message || err);
    return { linked: false, recorded: false };
  }
}

/** What happened on each checkout of an order, for the admin order page (newest first). */
function describePaymentAttempts(intents = []) {
  return [...intents]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .map((intent) => {
      const failure = intent.lastFailure || {};
      const paid = Boolean(intent.razorpayPaymentId) || ["captured", "linked", "refunding", "refunded"].includes(intent.status);
      let outcome = "closed";
      if (paid) outcome = "paid";
      else if (Number(intent.failedAttempts) > 0 || failure.paymentId) outcome = "failed";
      return {
        razorpayOrderId: intent.razorpayOrderId,
        mode: intent.mode || "checkout",
        startedAt: intent.createdAt || null,
        outcome,
        razorpayPaymentId: paid ? String(intent.razorpayPaymentId || "") : "",
        failedAttempts: Number(intent.failedAttempts) || 0,
        lastFailure: failure.paymentId || failure.description
          ? {
              paymentId: failure.paymentId || "",
              description: failure.description || "",
              reason: failure.reason || "",
              method: failure.method || "",
              at: failure.at || null
            }
          : null
      };
    });
}

module.exports = {
  cleanRazorpayOrderId,
  cleanRazorpayPaymentId,
  recordFailedPayment,
  findOwnedIntent,
  noteUnpaidCheckout,
  describePaymentAttempts
};
