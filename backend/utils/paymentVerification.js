const crypto = require("crypto");
const getRazorpayClient = require("./razorpay");
const { toMinorUnits, convertCurrencyAmount, normalizeCurrencyCode } = require("./currency");

const SETTLEMENT_CURRENCY = "INR";

function verifyRazorpaySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature } = {}) {
  const secret = process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET || "";
  const sig = String(razorpaySignature || "").trim();
  if (!razorpayOrderId || !razorpayPaymentId || !sig || !secret || !/^[0-9a-f]+$/i.test(sig)) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest();
  const provided = Buffer.from(sig, "hex");

  return provided.length === expected.length && crypto.timingSafeEqual(expected, provided);
}

function getSettlementCharge({ total, orderCurrency, rates = {} }) {
  const src = normalizeCurrencyCode(orderCurrency, SETTLEMENT_CURRENCY);
  const raw =
    src === SETTLEMENT_CURRENCY
      ? Number(total || 0)
      : convertCurrencyAmount(total, { sourceCurrency: src, currency: SETTLEMENT_CURRENCY, rates });
  return { amount: Math.round((Number(raw) || 0) * 100) / 100, currency: SETTLEMENT_CURRENCY };
}

async function verifyRazorpayPaymentForOrder({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
  expectedAmount,
  expectedCurrency,
  toleranceMinor = 0
}) {
  if (!verifyRazorpaySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature })) {
    return { ok: false, reason: "INVALID_SIGNATURE" };
  }

  const currency = String(expectedCurrency || "").toUpperCase();
  const expectedMinor = toMinorUnits(expectedAmount, currency);
  if (!currency || !Number.isInteger(expectedMinor) || expectedMinor <= 0) {
    return { ok: false, reason: "INVALID_EXPECTED_AMOUNT" };
  }

  const rzp = getRazorpayClient();
  let p;
  try {
    p = await rzp.payments.fetch(razorpayPaymentId);
  } catch (fetchErr) {
    return { ok: false, reason: "GATEWAY_LOOKUP_FAILED" };
  }

  if (!p || p.id !== razorpayPaymentId) {
    return { ok: false, reason: "PAYMENT_NOT_FOUND" };
  }
  if (p.order_id !== razorpayOrderId) {
    return { ok: false, reason: "ORDER_MISMATCH", payment: p };
  }
  if (String(p.currency).toUpperCase() !== currency) {
    return { ok: false, reason: "CURRENCY_MISMATCH", payment: p };
  }
  if (Math.abs(Number(p.amount) - expectedMinor) > toleranceMinor) {
    return { ok: false, reason: "AMOUNT_MISMATCH", payment: p };
  }
  if (Number(p.amount_refunded || 0) > 0) {
    return { ok: false, reason: "PAYMENT_REFUNDED", payment: p };
  }

  if (p.status === "authorized") {
    try {
      p = await rzp.payments.capture(razorpayPaymentId, p.amount, p.currency);
    } catch (captureErr) {
      return { ok: false, reason: "CAPTURE_FAILED", payment: p };
    }
  }

  return p.status === "captured"
    ? { ok: true, payment: p }
    : { ok: false, reason: "NOT_CAPTURED", payment: p };
}

const FAIL_MESSAGES = {
  INVALID_SIGNATURE: [400, "Payment verification signature is invalid."],
  ORDER_MISMATCH: [400, "Payment does not belong to this checkout."],
  CURRENCY_MISMATCH: [400, "Payment currency does not match the order."],
  AMOUNT_MISMATCH: [400, "Paid amount does not match the order total."],
  PAYMENT_REFUNDED: [409, "This payment has already been refunded."],
  NOT_CAPTURED: [402, "Payment has not been completed."],
  CAPTURE_FAILED: [502, "Could not capture the payment."],
  GATEWAY_LOOKUP_FAILED: [502, "Could not confirm the payment with Razorpay."]
};

const sendPaymentVerificationError = (res, v, paymentId = "") => {
  const [s, m] = FAIL_MESSAGES[v?.reason] || [400, "Payment verification failed."];
  console.error("[Payment] verification failed", { reason: v?.reason, paymentId });
  return res.status(s).json({ message: m, reason: v?.reason, razorpayPaymentId: paymentId });
};

const isDuplicatePaymentIdError = (e) =>
  e?.code === 11000 &&
  (Boolean(e.keyPattern?.["paymentMeta.razorpayPaymentId"]) ||
    String(e.message || "").includes("uniq_razorpay_payment_id"));

module.exports = {
  SETTLEMENT_CURRENCY,
  verifyRazorpaySignature,
  getSettlementCharge,
  verifyRazorpayPaymentForOrder,
  sendPaymentVerificationError,
  isDuplicatePaymentIdError
};
