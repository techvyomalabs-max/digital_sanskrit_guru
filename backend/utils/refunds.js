const crypto = require("crypto");
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
  const token = crypto.randomUUID();

  const order = await Order.findOneAndUpdate(
    {
      _id: orderId,
      $or: [
        { "refundLock.expiresAt": null },
        { "refundLock.expiresAt": { $lt: now } }
      ]
    },
    {
      $set: {
        "refundLock.lockedAt": now,
        "refundLock.lockedBy": String(actorId || "system"),
        "refundLock.token": token,
        "refundLock.expiresAt": expiresAt
      }
    },
    { new: true }
  );

  if (!order) {
    const exists = await Order.exists({ _id: orderId });
    if (!exists) {
      throw new RefundError("Order not found.", 404);
    }
    throw new RefundError("Refund is currently being processed by another transaction. Please retry in a few moments.", 409);
  }

  return { order, token };
}

async function releaseRefundLock(orderId, token) {
  try {
    const filter = token !== undefined
      ? { _id: orderId, "refundLock.token": token }
      : { _id: orderId };

    await Order.updateOne(
      filter,
      {
        $set: {
          "refundLock.lockedAt": null,
          "refundLock.lockedBy": "",
          "refundLock.token": "",
          "refundLock.expiresAt": null
        }
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
  const { order: lockedOrder, token } = await acquireRefundLock(orderId, actorId);

  try {
    if (lockedOrder.paymentStatus !== "Paid") {
      throw new RefundError("Only paid orders can be refunded.", 400);
    }

    const razorpayPaymentId = String(lockedOrder.paymentMeta?.razorpayPaymentId || lockedOrder.razorpayPaymentId || "").trim();

    if (!razorpayPaymentId && !isManualOnly && !forceManual) {
      throw new RefundError(
        "This order has no Razorpay payment. If you refunded the customer another way, confirm a manual refund.",
        400,
        { canForceManual: true }
      );
    }

    const preview = previewRefund({ order: lockedOrder, refundAmount });
    const amountToRefund = preview.proposedRefundAmountInInr;
    const amountInPaise = Math.round(amountToRefund * 100);

    let razorpayRefundId = null;

    if (razorpayPaymentId && !isManualOnly && !forceManual) {
      const razorpay = getRazorpayClient();

      let refundsCollection;
      try {
        refundsCollection = await razorpay.payments.fetchMultipleRefund(razorpayPaymentId, { count: 100 });
      } catch (fetchErr) {
        console.error(`[Refund] Failed to verify existing refunds for ${razorpayPaymentId}:`, fetchErr);
        throw new RefundError("Could not verify existing refunds with Razorpay. Please retry.", 502, { canForceManual: true });
      }

      const items = Array.isArray(refundsCollection?.items)
        ? refundsCollection.items
        : (Array.isArray(refundsCollection) ? refundsCollection : []);

      const gatewayRefundedPaise = items
        .filter((r) => r && r.status !== "failed")
        .reduce((sum, r) => sum + Number(r.amount || 0), 0);

      const recordedPaise = Math.round((lockedOrder.refundedAmountInInr || 0) * 100);

      if (gatewayRefundedPaise > recordedPaise + 1) {
        if (!lockedOrder.paymentMeta) lockedOrder.paymentMeta = {};
        if (!Array.isArray(lockedOrder.paymentMeta.refunds)) {
          lockedOrder.paymentMeta.refunds = [];
        }

        const existingRefundIds = new Set(
          lockedOrder.paymentMeta.refunds.map((r) => r.refundId).filter(Boolean)
        );

        for (const r of items) {
          if (r && r.status !== "failed" && r.id && !existingRefundIds.has(r.id)) {
            lockedOrder.paymentMeta.refunds.push({
              refundId: r.id,
              amountMinor: Number(r.amount || 0),
              currency: r.currency || "INR",
              method: "razorpay",
              reference: r.id,
              reason: "Reconciled from Razorpay",
              byEmail: actor?.email || "",
              at: r.created_at ? new Date(r.created_at * 1000) : new Date()
            });
            existingRefundIds.add(r.id);
          }
        }

        const orderTotal = Number(lockedOrder.totalInInr || lockedOrder.total || 0);
        lockedOrder.refundedAmountInInr = gatewayRefundedPaise / 100;
        lockedOrder.refundStatus = lockedOrder.refundedAmountInInr >= orderTotal - 0.01 ? "Refunded" : "Partially Refunded";
        lockedOrder.paymentMeta.refundedAmountMinor = gatewayRefundedPaise;
        lockedOrder.paymentMeta.refundMethod = "razorpay";
        lockedOrder.lastUpdatedAt = new Date();

        await lockedOrder.save();

        throw new RefundError(
          "Razorpay already shows refunds that were not recorded here. Records have been updated; please review before refunding again.",
          409
        );
      }

      try {
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

    const method = razorpayRefundId ? "razorpay" : "manual";

    if (!lockedOrder.paymentMeta) lockedOrder.paymentMeta = {};
    if (!Array.isArray(lockedOrder.paymentMeta.refunds)) {
      lockedOrder.paymentMeta.refunds = [];
    }

    lockedOrder.paymentMeta.refunds.push({
      refundId: razorpayRefundId || "",
      amountMinor: amountInPaise,
      currency: "INR",
      method,
      reference: razorpayRefundId || "manual",
      reason: String(reason).slice(0, 255),
      byEmail: actor?.email || "",
      at: new Date()
    });

    lockedOrder.paymentMeta.refundedAmountMinor = Math.round(newRefundedTotal * 100);
    lockedOrder.paymentMeta.refundMethod = method;
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
    await releaseRefundLock(orderId, token);
  }
}

module.exports = {
  RefundError,
  previewRefund,
  processGatewayRefund,
  acquireRefundLock,
  releaseRefundLock
};
