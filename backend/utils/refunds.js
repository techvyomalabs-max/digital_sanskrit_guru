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

/**
 * A fully refunded order's shareable/gift codes stop working (redeemed ones lose access too),
 * the same as when an order is cancelled. Loaded lazily to keep module loading simple.
 */
async function revokeCodesIfFullyRefunded(order) {
  if (String(order?.refundStatus || "") !== "Refunded") return;
  try {
    const { revokeGiftPassesForOrder } = require("./giftPasses");
    await revokeGiftPassesForOrder(order._id, "order-refunded");
  } catch (err) {
    console.error(`[Refund] Could not revoke codes for order ${order?._id}:`, err.message);
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

async function processGatewayRefund({ orderId, refundAmount, reason = "Admin requested refund", actor, isManualOnly = false, forceManual = false, itemIds = [] }) {
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
      at: new Date(),
      // Which items this refund is for, so the credit note reverses tax on those items only
      itemIds: (Array.isArray(itemIds) ? itemIds : []).map(String).filter(Boolean)
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
    await revokeCodesIfFullyRefunded(savedOrder);
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

/**
 * Whether an admin can approve the automatic full refund for a cancelled order (pure; no DB).
 * Rule: a paid order cancelled before it was shipped gets everything back (items, delivery,
 * no gateway fee kept), once an admin approves it in DSG.
 */
function cancellationRefundEligibility(order) {
  if (!order) return { ok: false, message: "Order not found." };
  if (String(order.status || "") !== "Cancelled") {
    return { ok: false, message: "Only cancelled orders can get the cancellation refund." };
  }
  if (order.paymentStatus !== "Paid") {
    return { ok: false, message: "This order was not paid, so there is nothing to refund." };
  }
  if (order.shippedAt || order.deliveredAt) {
    return { ok: false, message: "This order was shipped before it was cancelled. Use a return refund instead." };
  }
  const total = Number(order.totalInInr || order.total || 0);
  const refunded = Number(order.refundedAmountInInr || 0);
  const remaining = Math.max(0, Math.round((total - refunded) * 100) / 100);
  if (String(order.refundStatus || "") === "Refunded" || remaining <= 0) {
    return { ok: false, message: "This order has already been refunded in full." };
  }
  return { ok: true, amount: remaining };
}

/**
 * What to do with a Razorpay "refund.processed" webhook for an order (pure; no DB).
 * Refunds made from the Razorpay dashboard never pass through our refund screen, so this is
 * how they get recorded on the order (and get a GST credit note like any other refund).
 *
 * Returns { action, ... }:
 * - "ignore"  nothing to change (reason says why: already recorded, not INR, ...)
 * - "review"  money moved but it can't be recorded automatically; an admin must look
 * - "record"  record it: { entry, refundedAmountInInr, refundStatus }
 */
function planWebhookRefund(order, refund) {
  const refundId = String(refund?.id || "").trim();
  const amountMinor = Number(refund?.amount);
  const currency = String(refund?.currency || "INR").toUpperCase();

  if (!refundId || !Number.isInteger(amountMinor) || amountMinor <= 0) {
    return { action: "ignore", reason: "invalid-refund" };
  }
  if (!order) return { action: "ignore", reason: "no-order" };

  const recorded = Array.isArray(order.paymentMeta?.refunds) ? order.paymentMeta.refunds : [];
  if (recorded.some((r) => r && String(r.refundId || "") === refundId)) {
    return { action: "ignore", reason: "already-recorded" };
  }
  // Store refunds are kept in INR; a refund in another currency needs the exchange rate of the
  // day, so it is left for an admin rather than guessed
  if (currency !== "INR") return { action: "review", reason: "non-inr-currency" };
  if (order.paymentStatus !== "Paid") return { action: "review", reason: "order-not-paid" };

  const totalInInr = Number(order.totalInInr || order.total || 0);
  const alreadyRefunded = Number(order.refundedAmountInInr || 0);
  const refundedAmountInInr = Math.round((alreadyRefunded * 100 + amountMinor)) / 100;
  if (refundedAmountInInr > totalInInr + 0.01) {
    return { action: "review", reason: "exceeds-order-total" };
  }

  // Refunds should be made in DSG; one that arrives only by webhook was made elsewhere
  const note = String(refund?.notes?.reason || "").trim();
  const reason = `Refunded outside DSG (Razorpay dashboard)${note ? `: ${note}` : ""}`;
  return {
    action: "record",
    refundedAmountInInr,
    refundStatus: refundedAmountInInr >= totalInInr - 0.01 ? "Refunded" : "Partially Refunded",
    entry: {
      refundId,
      amountMinor,
      currency: "INR",
      method: "razorpay",
      reference: refundId,
      reason: reason.slice(0, 255),
      byEmail: "razorpay-webhook",
      at: refund?.created_at ? new Date(Number(refund.created_at) * 1000) : new Date(),
      itemIds: []
    }
  };
}

/**
 * Records a processed Razorpay refund on its order (from the webhook). Uses the same refund
 * lock as the refund screen, so a refund an admin is making right now is never counted twice:
 * if the order is locked this throws a 409 RefundError and Razorpay retries the webhook later.
 */
async function recordWebhookRefund(refund) {
  const paymentId = String(refund?.payment_id || "").trim();
  if (!paymentId) return { action: "ignore", reason: "no-payment-id" };

  const candidate = await Order.findOne({
    $or: [{ "paymentMeta.razorpayPaymentId": paymentId }, { razorpayPaymentId: paymentId }]
  }).select("_id").lean();
  if (!candidate) return { action: "ignore", reason: "no-order" };

  const { order: lockedOrder, token } = await acquireRefundLock(candidate._id, "razorpay-webhook");
  try {
    const plan = planWebhookRefund(lockedOrder, refund);
    if (plan.action !== "record") return { ...plan, orderId: String(lockedOrder._id) };

    if (!lockedOrder.paymentMeta) lockedOrder.paymentMeta = {};
    if (!Array.isArray(lockedOrder.paymentMeta.refunds)) lockedOrder.paymentMeta.refunds = [];
    lockedOrder.paymentMeta.refunds.push(plan.entry);

    lockedOrder.refundedAmountInInr = plan.refundedAmountInInr;
    lockedOrder.refundStatus = plan.refundStatus;
    lockedOrder.paymentMeta.refundedAmountMinor = Math.round(plan.refundedAmountInInr * 100);
    lockedOrder.paymentMeta.refundMethod = "razorpay";
    lockedOrder.paymentMeta.razorpayRefundId = plan.entry.refundId;
    lockedOrder.paymentMeta.refundedAt = new Date();
    lockedOrder.lastUpdatedByName = "Razorpay (webhook)";
    lockedOrder.lastUpdatedByEmail = "razorpay-webhook";
    lockedOrder.lastUpdatedAt = new Date();

    // The order's save hook gives the new refund its credit note number
    const saved = await lockedOrder.save();
    await revokeCodesIfFullyRefunded(saved);
    const entry = saved.paymentMeta.refunds.find((r) => r.refundId === plan.entry.refundId);
    return {
      action: "recorded",
      orderId: String(saved._id),
      refundStatus: saved.refundStatus,
      creditNoteNumber: entry?.creditNoteNumber || ""
    };
  } finally {
    await releaseRefundLock(candidate._id, token);
  }
}

module.exports = {
  RefundError,
  previewRefund,
  processGatewayRefund,
  acquireRefundLock,
  releaseRefundLock,
  cancellationRefundEligibility,
  planWebhookRefund,
  recordWebhookRefund
};
