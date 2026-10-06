const mongoose = require("mongoose");
const Order = require("../models/Order");
const getRazorpayClient = require("./razorpay");
const { toMinorUnits } = require("./currency");

const REFUND_LOCK_TIMEOUT_MS = 30000;

class RefundError extends Error {
  constructor(message, statusCode = 400, details = {}) {
    super(message);
    this.name = "RefundError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

async function acquireRefundLock(orderId, actorId) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + REFUND_LOCK_TIMEOUT_MS);

  const order = await Order.findOneAndUpdate(
    {
      _id: orderId,
      $or: [
        { "refundLock.expiresAt": null },
        { "refundLock.expiresAt": { $lt: now } },
        { "refundLock.lockedBy": actorId }
      ]
    },
    {
      $set: {
        "refundLock.lockedAt": now,
        "refundLock.lockedBy": String(actorId || "system"),
        "refundLock.expiresAt": expiresAt
      }
    },
    { new: true }
  );

  if (!order) {
    throw new RefundError("Refund is currently being processed by another transaction. Please retry in a few moments.", 409);
  }

  return order;
}

async function releaseRefundLock(orderId) {
  try {
    await Order.updateOne(
      { _id: orderId },
      {
        $unset: { refundLock: 1 }
      }
    );
  } catch (err) {
    console.error(`[Refund] Failed to release lock on order ${orderId}:`, err.message);
  }
}

function previewRefund({ order, refundAmount }) {
  if (!order) {
    throw new RefundError("Order not found.", 404);
  }

  const totalInInr = Number(order.totalInInr || order.total || 0);
  const refundedInInr = Number(order.refundedAmountInInr || 0);
  const remainingInInr = Math.max(0, Math.round((totalInInr - refundedInInr) * 100) / 100);

  const requestedAmount = Number.isFinite(Number(refundAmount)) && Number(refundAmount) > 0
    ? Number(refundAmount)
    : remainingInInr;

  if (requestedAmount <= 0) {
    throw new RefundError("No refundable balance remaining for this order.", 400);
  }

  if (requestedAmount > remainingInInr + 0.01) {
    throw new RefundError(`Refund amount (₹${requestedAmount}) exceeds remaining balance (₹${remainingInInr}).`, 400);
  }

  return {
    orderId: order._id,
    totalInInr,
    alreadyRefundedInInr: refundedInInr,
    remainingRefundableInInr: remainingInInr,
    proposedRefundAmountInInr: requestedAmount,
    currency: "INR"
  };
}

async function processGatewayRefund({ orderId, refundAmount, reason = "Admin requested refund", actor, isManualOnly = false, forceManual = false }) {
  const actorId = actor?._id || actor?.id || "admin";
  let lockedOrder = await acquireRefundLock(orderId, actorId);

  try {
    const preview = previewRefund({ order: lockedOrder, refundAmount });
    const amountToRefund = preview.proposedRefundAmountInInr;
    const amountInPaise = Math.round(amountToRefund * 100);

    let razorpayRefundId = null;
    const razorpayPaymentId = String(lockedOrder.paymentMeta?.razorpayPaymentId || lockedOrder.razorpayPaymentId || "").trim();

    if (razorpayPaymentId && !isManualOnly && !forceManual) {
      try {
        const razorpay = getRazorpayClient();
        const paymentObj = await razorpay.payments.fetch(razorpayPaymentId);
        
        if (paymentObj && paymentObj.status === "authorized") {
          await razorpay.payments.capture(razorpayPaymentId, paymentObj.amount, paymentObj.currency || "INR");
        }

        const refundResponse = await razorpay.payments.refund(razorpayPaymentId, {
          amount: amountInPaise,
          notes: {
            orderId: String(lockedOrder._id),
            orderNumber: String(lockedOrder.orderNumber || lockedOrder.invoiceNumber || String(lockedOrder._id).slice(-6)),
            reason: String(reason).slice(0, 255)
          }
        });

        razorpayRefundId = String(refundResponse?.id || "");
      } catch (gatewayErr) {
        console.error(`[Refund] Razorpay gateway refund error for order ${orderId}:`, gatewayErr);
        const description = gatewayErr?.error?.description || gatewayErr?.message || "Razorpay API error";
        throw new RefundError(`Gateway Refund Failed: ${description}`, 502, { canForceManual: true, gatewayError: description });
      }
    }

    const newRefundedTotal = Math.round(((lockedOrder.refundedAmountInInr || 0) + amountToRefund) * 100) / 100;
    const isFullRefund = newRefundedTotal >= (lockedOrder.totalInInr || lockedOrder.total || 0) - 0.01;

    lockedOrder.refundedAmountInInr = newRefundedTotal;
    lockedOrder.refundStatus = isFullRefund ? "Refunded" : "Partially Refunded";

    if (!lockedOrder.paymentMeta) lockedOrder.paymentMeta = {};
    if (razorpayRefundId) {
      lockedOrder.paymentMeta.razorpayRefundId = razorpayRefundId;
    }
    lockedOrder.paymentMeta.refundedAt = new Date();

    lockedOrder.lastUpdatedByName = actor?.name || "Admin";
    lockedOrder.lastUpdatedByEmail = actor?.email || "admin@store.local";
    lockedOrder.lastUpdatedAt = new Date();

    const savedOrder = await lockedOrder.save();
    return {
      success: true,
      order: savedOrder,
      refundAmount: amountToRefund,
      razorpayRefundId,
      refundStatus: lockedOrder.refundStatus
    };
  } finally {
    await releaseRefundLock(orderId);
  }
}

module.exports = {
  RefundError,
  previewRefund,
  processGatewayRefund,
  acquireRefundLock,
  releaseRefundLock
};
