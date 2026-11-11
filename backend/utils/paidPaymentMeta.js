"use strict";

/**
 * Record a successful payment on an existing order (a retry from My Orders, or an admin marking it
 * paid). Each field is set on its own path: copying `order.paymentMeta` with `{ ...spread }` also
 * copies empty nested fields (manualOverride) as undefined, which fails the save after the money
 * has already been taken. Refunds and other payment details already on the order are kept.
 */
function applyPaidPaymentMeta(order, { razorpayOrderId, razorpayPaymentId, razorpaySignature, verifiedPayment, manualOverride, now = new Date() }) {
  const meta = order.paymentMeta || {};
  order.set("paymentMeta.razorpayOrderId", razorpayOrderId || meta.razorpayOrderId || "");
  order.set("paymentMeta.razorpayPaymentId", razorpayPaymentId || meta.razorpayPaymentId || "");
  order.set("paymentMeta.razorpaySignature", razorpaySignature || meta.razorpaySignature || "");
  order.set("paymentMeta.paidAt", meta.paidAt || now);
  order.set("paymentMeta.paidAmountMinor", verifiedPayment ? Number(verifiedPayment.amount) : meta.paidAmountMinor || null);
  order.set("paymentMeta.paidCurrency", verifiedPayment ? String(verifiedPayment.currency).toUpperCase() : meta.paidCurrency || "");
  if (manualOverride) {
    order.set("paymentMeta.manualOverride", { ...manualOverride, at: manualOverride.at || now });
  }
}

module.exports = { applyPaidPaymentMeta };
