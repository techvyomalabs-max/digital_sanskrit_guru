const express = require("express");
const mongoose = require("mongoose");
const protect = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");
const PaymentIntent = require("../models/PaymentIntent");
const getRazorpayClient = require("../utils/razorpay");
const { logAdminAction } = require("../utils/adminAudit");
const { parsePageParams } = require("../utils/paging");

const router = express.Router();

// All routes require authentication, admin role, and access to "orders" page
router.use(protect, admin, admin.requireAdminPage("orders"));

/**
 * GET /api/admin/payments/orphans
 * List intents with status orphan, refunded, or resolved (newest first), one page at a time.
 * `count` is the total that match (not just this page), so the dashboard alert is exact.
 */
router.get("/orphans", async (req, res) => {
  try {
    const validStatuses = new Set(["orphan", "refunding", "refunded", "resolved"]);
    const requestedStatus = String(req.query.status || "").trim();

    const query = validStatuses.has(requestedStatus)
      ? { status: requestedStatus }
      : { status: { $in: ["orphan", "refunding", "refunded", "resolved"] } };

    const { page, limit, skip } = parsePageParams(req.query, { defaultLimit: 50, maxLimit: 100 });
    const [items, total] = await Promise.all([
      PaymentIntent.find(query)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "name email")
        .lean(),
      PaymentIntent.countDocuments(query)
    ]);

    return res.json({
      success: true,
      count: total,
      total,
      page,
      limit,
      hasMore: skip + items.length < total,
      items
    });
  } catch (err) {
    console.error("[AdminPayment] Failed to list orphan payments:", err?.message || err);
    return res.status(500).json({ message: "Failed to fetch orphan payments" });
  }
});

/**
 * POST /api/admin/payments/orphans/:id/refund
 * Super-admin only (adminLevel 1). Atomically claims and refunds via Razorpay.
 */
router.post("/orphans/:id/refund", admin.requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid payment intent id" });
  }

  // Atomically claim the intent to prevent double-click / concurrent refunds
  const intent = await PaymentIntent.findOneAndUpdate(
    { _id: id, status: "orphan" },
    { $set: { status: "refunding" } },
    { new: true }
  );

  if (!intent) {
    return res.status(409).json({
      message: "Payment is not in an orphan status or a refund is already in progress."
    });
  }

  if (!intent.razorpayPaymentId) {
    await PaymentIntent.updateOne({ _id: intent._id }, { $set: { status: "orphan" } });
    return res.status(400).json({ message: "Missing Razorpay payment ID for refund." });
  }

  try {
    const razorpay = getRazorpayClient();
    const refund = await razorpay.payments.refund(intent.razorpayPaymentId, {
      amount: intent.amountMinor,
      notes: { reason: "Orphan payment - no order created" }
    });

    const adminEmail = req.adminUser?.email || String(req.user);
    const now = new Date();

    intent.status = "refunded";
    intent.refundId = refund?.id || "";
    intent.resolvedAt = now;
    intent.resolvedBy = adminEmail;
    intent.resolutionNote = "Refunded via Razorpay";
    await intent.save();

    await logAdminAction({
      req,
      action: "orphan-payment-refund",
      entityType: "payment_intent",
      entityId: String(intent._id),
      entityLabel: intent.razorpayPaymentId,
      summary: `Refunded orphan payment ${intent.razorpayPaymentId} (${intent.currency} ${(intent.amountMinor / 100).toFixed(2)}) via Razorpay`,
      details: {
        refundId: refund?.id,
        amountMinor: intent.amountMinor,
        currency: intent.currency,
        razorpayPaymentId: intent.razorpayPaymentId
      }
    });

    return res.json({
      success: true,
      message: "Refund processed successfully",
      refundId: refund?.id,
      intent
    });
  } catch (error) {
    // Revert atomic lock back to "orphan" on failure
    await PaymentIntent.updateOne({ _id: intent._id }, { $set: { status: "orphan" } });

    const message =
      error?.error?.description ||
      error?.error?.reason ||
      error?.message ||
      "Razorpay refund request failed";

    console.error("[AdminPayment] Refund failed for intent:", intent._id, message);
    return res.status(502).json({ message });
  }
});

/**
 * POST /api/admin/payments/orphans/:id/resolve
 * Mark an orphan payment as resolved with a mandatory note (>= 10 characters).
 */
router.post("/orphans/:id/resolve", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid payment intent id" });
  }

  const note = String(req.body?.note || "").trim();
  if (note.length < 10) {
    return res.status(400).json({
      message: "A resolution note (at least 10 characters) is required to resolve this payment."
    });
  }

  const adminEmail = req.adminUser?.email || String(req.user);
  const now = new Date();

  const intent = await PaymentIntent.findOneAndUpdate(
    { _id: id, status: "orphan" },
    {
      $set: {
        status: "resolved",
        resolutionNote: note,
        resolvedBy: adminEmail,
        resolvedAt: now
      }
    },
    { new: true }
  );

  if (!intent) {
    return res.status(404).json({
      message: "Orphan payment not found or already resolved."
    });
  }

  await logAdminAction({
    req,
    action: "orphan-payment-resolve",
    entityType: "payment_intent",
    entityId: String(intent._id),
    entityLabel: intent.razorpayPaymentId,
    summary: `Marked orphan payment ${intent.razorpayPaymentId} as resolved: ${note}`,
    details: {
      razorpayPaymentId: intent.razorpayPaymentId,
      note
    }
  });

  return res.json({
    success: true,
    message: "Payment marked as resolved",
    intent
  });
});

module.exports = router;
