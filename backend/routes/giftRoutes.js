const express = require("express");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { perWorker } = require("../utils/workerCount");
const GiftPass = require("../models/GiftPass");
const Product = require("../models/Product");
const Order = require("../models/Order");
const protect = require("../middleware/authMiddleware");
const { PUBLIC_PRODUCT_EXCLUDE, toPublicProduct } = require("../utils/productProjection");
const { getOwnedDigitalIdsForUser } = require("../services/digitalOwnershipService");
const User = require("../models/User");
const { findGiftLineIndex, isGiftAwaitingRecipient, buildGiftRecipient } = require("../utils/giftAccess");
const { sendPushToUser, accessPendingPayload } = require("../utils/webPush");
const { sendAccessPendingAdminAlert } = require("../utils/email");

// Notifications never block or fail the response
const fireNotifications = (fn) =>
  Promise.resolve()
    .then(fn)
    .catch((err) => console.error("[GiftRoutes] Notification error:", err?.message));

const router = express.Router();

const giftRedeemLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: perWorker(10),       // max 10 attempts per IP per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many gift pass redemption attempts. Please try again later." }
});

// Helper to generate a cryptographically secure Gift Pass Code (e.g. GIFT-DSG-849201)
const generateGiftCode = () => {
  const randomStr = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `GIFT-DSG-${randomStr}`;
};

// Redeem a Gift Pass Code (logged-in recipient)
router.post("/redeem", protect, giftRedeemLimiter, async (req, res) => {
  try {
    const rawCode = String(req.body?.code || "").trim().toUpperCase();
    if (!rawCode) {
      return res.status(400).json({ message: "Please enter a Gift Pass Code." });
    }

    const existingPass = await GiftPass.findOne({ code: rawCode });
    if (!existingPass) {
      return res.status(404).json({ message: "Invalid Gift Pass Code. Please double check the code." });
    }

    if (existingPass.order) {
      const parentOrder = await Order.findById(existingPass.order).select("status refundStatus").lean();
      if (parentOrder && (parentOrder.status === "Cancelled" || parentOrder.refundStatus === "Refunded")) {
        return res.status(400).json({ message: "This Gift Pass is no longer valid because the order was cancelled or refunded." });
      }
    }

    if (existingPass.isRevoked) {
      return res.status(400).json({ message: "This code is no longer valid (the order it came from was refunded or cancelled)." });
    }

    if (existingPass.isRedeemed) {
      return res.status(400).json({ message: "This Gift Pass has already been redeemed." });
    }

    // A gift is for someone else: the person who bought it can't redeem it
    if (existingPass.buyer && String(existingPass.buyer) === String(req.user)) {
      return res.status(400).json({
        code: "GIFT_OWN_PURCHASE",
        message: "You bought this gift, so it can't be redeemed on your account. Please share the code with the person you're gifting."
      });
    }

    // Check if the user already owns this product
    const ownedDigitalIds = await getOwnedDigitalIdsForUser(req.user);
    if (ownedDigitalIds.has(String(existingPass.product))) {
      return res.status(400).json({
        message: "You already own this web version in your library. Please share this Gift Pass code with someone else."
      });
    }

    // Atomically claim the gift pass
    const giftPass = await GiftPass.findOneAndUpdate(
      { code: rawCode, isRedeemed: false, isRevoked: { $ne: true } },
      {
        $set: {
          isRedeemed: true,
          redeemedBy: req.user,
          redeemedAt: new Date()
        }
      },
      { new: true }
    );

    if (!giftPass) {
      return res.status(400).json({ message: "This Gift Pass has already been redeemed." });
    }

    const product = await Product.findById(giftPass.product)
      .select(PUBLIC_PRODUCT_EXCLUDE)
      .lean();

    // Access our team sets up by hand: the order line now waits for the admin, with the
    // recipient's details, and the admins are told
    const accessPending = await queueRecipientAccess(giftPass, req.user);
    const itemName = giftPass.productName || product?.name || "Digital Item";

    return res.json({
      success: true,
      accessPending,
      message: accessPending
        ? `Gift redeemed! Our team is now setting up your access to "${itemName}". We'll email you as soon as it's ready (usually within 24-48 hours).`
        : `Congratulations! You have successfully redeemed "${itemName}"!`,
      product: toPublicProduct(product)
    });
  } catch (err) {
    console.error("[GiftRoutes] Redeem error:", err.message);
    return res.status(500).json({ message: "Failed to redeem Gift Pass. Please try again." });
  }
});

// GET /api/gifts/my-codes — the shareable codes this user bought (gift orders and extra
// copies), newest first, with their status. The redeemer is shown by first name only.
router.get("/my-codes", protect, async (req, res) => {
  try {
    const passes = await GiftPass.find({ buyer: req.user })
      .sort({ createdAt: -1 })
      .limit(500)
      .populate("redeemedBy", "name")
      .populate("order", "paymentStatus status createdAt")
      .lean();
    const codes = passes
      .filter((p) => p.order && p.order.paymentStatus === "Paid")
      .map((p) => ({
        id: String(p._id),
        code: p.isRevoked ? "" : p.code,
        productId: String(p.product),
        productName: p.productName || "Digital item",
        orderId: String(p.order._id),
        orderRef: String(p.order._id).slice(-8).toUpperCase(),
        purchasedAt: p.order.createdAt || p.createdAt,
        status: p.isRevoked ? "revoked" : p.isRedeemed ? "redeemed" : "available",
        redeemedAt: p.redeemedAt || null,
        redeemedByName: p.isRedeemed ? String(p.redeemedBy?.name || "").split(/\s+/)[0] || "Someone" : ""
      }));
    return res.json({ success: true, codes });
  } catch (err) {
    console.error("[GiftRoutes] my-codes error:", err.message);
    return res.status(500).json({ message: "Failed to load your codes." });
  }
});

/**
 * After a gift is redeemed: if its order line is held for a recipient (access our team
 * sets up by hand), make it a normal "Access Pending" line with the recipient's name and
 * email, and alert the admins. Returns true when access still has to be set up.
 */
async function queueRecipientAccess(giftPass, userId) {
  try {
    if (!giftPass?.order) return false;
    const order = await Order.findById(giftPass.order).select("_id invoiceNumber items").lean();
    const idx = findGiftLineIndex(order?.items, giftPass);
    if (idx < 0 || !isGiftAwaitingRecipient(order.items[idx])) return false;

    const user = await User.findById(userId).select("name email").lean();
    const recipient = buildGiftRecipient({ _id: userId, ...(user || {}) });
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, [`items.${idx}.giftAccessManual`]: true, [`items.${idx}.accessManual`]: { $ne: true } },
      { $set: { [`items.${idx}.accessManual`]: true, [`items.${idx}.giftRecipient`]: recipient } },
      { returnDocument: "after" }
    ).lean();
    if (!updated) return false;

    const line = updated.items[idx];
    fireNotifications(async () => {
      const admins = await User.find({ isAdmin: true }).select("_id").lean();
      const payload = accessPendingPayload({
        orderId: updated._id,
        customerName: `${recipient.name} (gift)`,
        productNames: [line?.name || "Item"]
      });
      for (const adminUser of admins) await sendPushToUser(adminUser._id, payload);
      await sendAccessPendingAdminAlert(updated, [line], { name: `${recipient.name} (gift recipient)`, email: recipient.email });
    });
    return true;
  } catch (err) {
    console.error("[GiftRoutes] Queueing recipient access failed:", err.message);
    return false;
  }
}

// Get user's redeemed gift passes
router.get("/my-redeemed", protect, async (req, res) => {
  try {
    const redeemedPasses = await GiftPass.find({ redeemedBy: req.user, isRedeemed: true })
      .populate({ path: "product", select: PUBLIC_PRODUCT_EXCLUDE })
      .sort({ redeemedAt: -1 })
      .lean();

    const sanitizedPasses = (redeemedPasses || []).map((gp) => ({
      ...gp,
      product: toPublicProduct(gp.product)
    }));

    return res.json(sanitizedPasses);
  } catch (err) {
    console.error("[GiftRoutes] Fetch redeemed error:", err.message);
    return res.status(500).json({ message: "Failed to fetch redeemed gift passes." });
  }
});

module.exports = {
  router,
  generateGiftCode
};
