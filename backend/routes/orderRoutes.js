const express = require("express");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const StoreSettings = require("../models/StoreSettings");
const Coupon = require("../models/Coupon");
const Product = require("../models/Product");
const User = require("../models/User");
const Wishlist = require("../models/Wishlist");
const GiftPass = require("../models/GiftPass");
const { generateGiftCode } = require("./giftRoutes");
const { resolveDeliveryCharge, isDigitalItem, getDeliveryPricingDetails } = require("../utils/deliveryPricing");
const { applyComboWeights } = require("../utils/comboWeight");
const { convertCurrencyAmount, normalizeCurrencyCode } = require("../utils/currency");
const { getProductPriceDetails, isInternationalCountry } = require("../utils/productPricing");
const protect = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");
const { requireAdminPage, requireSuperAdmin } = require("../middleware/adminMiddleware");
const { getAdminActorSnapshot, logAdminAction } = require("../utils/adminAudit");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const {
  sendOrderConfirmation,
  sendOrderStatusUpdate,
  sendRefundStatusUpdate,
  sendLowStockAdminAlert,
  sendWishlistLowStockAlert,
  sendWelcomeCredentialsEmail,
  sendGiftPassEmail,
  sendReturnStatusEmail
} = require("../utils/email");
const {
  isPhysicalItem,
  isReturnOverdue,
  checkRefundReceipt,
  restockableItems,
  deriveOrderRefundStatus
} = require("../utils/returnPolicy");
const {
  sendPushToUser,
  broadcastPush,
  orderPayload,
  lowStockPayload,
  wishlistLowStockPayload,
  refundRequestPayload
} = require("../utils/webPush");

const { getTrackingDetails } = require("../utils/trackingService");
const { orderRateLimiter, estimateRateLimiter, honeypotMiddleware } = require("../utils/spamFilter");
const getRazorpayClient = require("../utils/razorpay");
const { verifyRazorpayPaymentForOrder, getSettlementCharge, sendPaymentVerificationError, isDuplicatePaymentIdError } = require("../utils/paymentVerification");
const { hasDigitalAccess, hasItemDigitalAccess, stripDigitalFields, serializeOrderForOwner } = require("../utils/orderAccess");
const { normalizeOrderItem } = require("../utils/orderItems");
const { toMinorUnits, resolveItemsCurrency } = require("../utils/currency");
const { computeOrderTotals, OrderTotalsError, getWarehouseState } = require("../utils/orderTotals");
const { reserveStockForOrder, releaseStockForOrder, incrementStock, expandItemsForStock } = require("../utils/stock");
const { claimCoupon, releaseCouponForOrder } = require("../utils/coupons");
const { issueGiftPassesForOrder, revokeGiftPassesForOrder } = require("../utils/giftPasses");
const { processGatewayRefund, previewRefund, RefundError } = require("../utils/refunds");
const { computeRefundQuote } = require("../utils/refundQuote");
const refundPolicy = require("../config/refundPolicy");
const { buildInvoiceRow, buildCreditNoteRows, summarize } = require("../utils/financeLedger");
const { checkDigitalOwnership } = require("../services/digitalOwnershipService");
const jwt = require("jsonwebtoken");

const router = express.Router();

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
const allowedPaymentStatuses = new Set(["Pending", "Paid", "Failed"]);
const allowedRefundStatuses = new Set(["Not Applicable", "Pending", "Processing", "Refunded", "Rejected"]);
const allowedReturnStatuses = new Set(["Requested", "Approved", "Rejected", "Refunded"]);
const RETURN_WINDOW_DAYS = 7;

// ── Notification helper (fire-and-forget — never blocks the response) ─────────

async function fireNotifications(fn) {
  try {
    await fn();
  } catch (err) {
    console.error("[Notification] Non-blocking error:", err.message);
  }
}

function verifyRazorpayPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return false;
  }

  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const razorpaySecret = process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET || "";
  if (!razorpaySecret) return false;

  const expectedSignature = crypto
    .createHmac("sha256", razorpaySecret)
    .update(body)
    .digest("hex");

  return expectedSignature === razorpaySignature;
}

// GET /api/orders/audit-migration (Admin only)
router.get("/audit-migration", protect, admin, requireAdminPage("orders"), async (req, res) => {
  try {
    const total = await Order.countDocuments();
    const emptyItemsCount = await Order.countDocuments({ items: { $size: 0 } });
    const noUserCount = await Order.countDocuments({ user: null });
    const zeroTotalCount = await Order.countDocuments({ total: { $lte: 0 } });

    const sampleEmpty = await Order.find({ items: { $size: 0 } }).limit(5).lean();

    res.json({
      total,
      emptyItemsCount,
      noUserCount,
      zeroTotalCount,
      sampleEmpty
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Low-stock alert helper: called after stock is decremented ─────────────────
// Checks which of the just-ordered products are now at/below threshold
// and sends push + email to admin + all users who wishlisted those products.
async function fireLowStockAlerts(normalizedItems) {
  try {
    const settings = await StoreSettings.findOne()
      .select("lowStockThreshold notificationEmail pushEnabled emailEnabled")
      .lean();
    const threshold = Number(settings?.lowStockThreshold ?? 5);

    const productIds = normalizedItems.map((i) => i.product);
    const lowStockProducts = await Product.find({
      _id: { $in: productIds },
      stock: { $lte: threshold }
    }).select("_id name stock category").lean();

    if (lowStockProducts.length === 0) return;

    // 1. Admin alert
    const admins = await User.find({ isAdmin: true }).select("_id").lean();
    const enriched = lowStockProducts.map((p) => ({ ...p, wishlistCount: 0 }));
    await sendLowStockAdminAlert(enriched);
    for (const adminUser of admins) {
      await sendPushToUser(adminUser._id,
        lowStockPayload(`${lowStockProducts.length} item(s)`, lowStockProducts.map((p) => p.stock).join(", "))
      );
    }

    // 2. Wishlist user alerts
    const lowStockIds = lowStockProducts.map((p) => p._id);
    const wishlistDocs = await Wishlist.find({ productIds: { $in: lowStockIds } })
      .populate("user", "name email")
      .lean();

    for (const wl of wishlistDocs) {
      if (!wl.user?._id) continue;
      const affected = lowStockProducts.filter((p) =>
        wl.productIds.some((id) => String(id) === String(p._id))
      );
      if (affected.length === 0) continue;
      const names = affected.map((p) => p.name);
      const minStock = Math.min(...affected.map((p) => p.stock));
      await sendPushToUser(wl.user._id, wishlistLowStockPayload(names, minStock));
      await sendWishlistLowStockAlert(wl.user, affected);
    }
  } catch (err) {
    console.error("[Low-Stock Alert] Error:", err.message);
  }
}

// ── Refund request admin push notification ──────────────────────────────────
// Sends instant push notification to all admins when a customer creates a refund request
function notifyAdminsOfRefundRequest(order, kind) {
  fireNotifications(async () => {
    const admins = await User.find({ isAdmin: true }).select("_id").lean();
    if (!admins || admins.length === 0) return;

    let customerName = "Customer";
    if (order.user && typeof order.user === "object" && order.user.name) {
      customerName = order.user.name;
    } else if (order.user) {
      const u = await User.findById(order.user).select("name").lean();
      if (u?.name) customerName = u.name;
    } else if (order.shipping?.name) {
      customerName = order.shipping.name;
    }

    const currency = String(order?.currencyDisplay?.currency || order?.currency || "INR").toUpperCase();
    const rawAmount = order?.currencyDisplay?.amount != null && order?.currencyDisplay?.amount !== ""
      ? Number(order.currencyDisplay.amount)
      : Number(order?.totalInInr ?? order?.total ?? 0);
    const amountNum = Number.isFinite(rawAmount) ? rawAmount : 0;
    const amountText = currency === "INR" ? `₹${amountNum.toFixed(2)}` : `${currency} ${amountNum.toFixed(2)}`;

    const payload = refundRequestPayload({
      orderId: order._id,
      kind,
      customerName,
      amountText
    });

    for (const adminUser of admins) {
      await sendPushToUser(adminUser._id, payload);
    }
  });
}

const getReturnReferenceDate = (order, item) => {
  const candidates = [item?.deliveredAt, order?.deliveredAt, order?.updatedAt, order?.createdAt];
  for (const candidate of candidates) {
    const date = candidate ? new Date(candidate) : null;
    if (date && !Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return null;
};

const getOrderItemById = (order, itemId) =>
  Array.isArray(order?.items)
    ? order.items.find((item) => String(item?._id || item?.id || item?.product || "").trim() === String(itemId || "").trim())
    : null;

const canRequestReturnForItem = (order, item) => {
  if (!order || !item) return false;
  if (String(order?.status || "").trim() !== "Delivered") return false;
  if (String(order?.paymentStatus || "").trim() !== "Paid") return false;
  if (String(item?.returnRequest?.status || "Not Requested").trim() !== "Not Requested") return false;

  const referenceDate = getReturnReferenceDate(order, item);
  if (!referenceDate) return false;

  const msSinceDelivered = Date.now() - referenceDate.getTime();
  return msSinceDelivered <= RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
};

// ── Routes ────────────────────────────────────────────────────────────────────

// Helper to determine HSN/SAC based on product classification (matching invoicePdf.js)
function getItemHsnSac(item) {
  if (item?.hsnSac) return String(item.hsnSac).trim();
  const name = String(item?.name || "").trim().toLowerCase();
  const category = String(item?.category || "").trim().toLowerCase();
  
  // E-books, Kindle books, Web versions, and Digital formats are taxed at 18% GST
  const isDigital = 
    category.includes("ebook") ||
    category.includes("e-book") ||
    category.includes("kindle") ||
    category.includes("web version") ||
    category.includes("web-version") ||
    category.includes("flipbook") ||
    name.includes("ebook") ||
    name.includes("e-book") ||
    name.includes("kindle") ||
    name.includes("web version") ||
    name.includes("web-version") ||
    name.includes("flipbook") ||
    name.includes("epub") ||
    name.includes("pdf");
    
  if (isDigital) {
    return "9973"; // Digital products/services (18% GST)
  }

  // Exempt printed books: category or name based check (HSN Chapter 49)
  const isPrintedBook = 
    category.includes("book") ||
    category.includes("sanskrit") ||
    category.includes("gita") ||
    category.includes("scriptures") ||
    category.includes("grammar") ||
    category.includes("dharma") ||
    category.includes("paperback") ||
    name.includes("book") ||
    name.includes("volume") ||
    name.includes("vol.") ||
    name.includes("hardcover") ||
    name.includes("paperback");
    
  return isPrintedBook ? "4901" : "8523";
}

// Calculate order totals (logged-in user)
router.post("/calculate-totals", protect, async (req, res) => {
  try {
    const shipping = req.body.shipping || {};
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const couponCode = String(req.body?.couponCode || "").trim().toUpperCase();
    const settings = (await StoreSettings.findOne().lean()) || {};

    const totals = await computeOrderTotals({
      items,
      shipping,
      couponCode,
      userId: req.user,
      settings
    });

    return res.json({
      subtotal: totals.subtotal,
      gstPercent: totals.gstPercent,
      gstAmount: totals.gstAmount,
      deliveryCharge: totals.deliveryCharge,
      discount: totals.discount,
      total: totals.total,
      currency: totals.orderCurrency,
      couponCode: totals.appliedCouponCode,
      chargeAmount: totals.chargeAmount,
      chargeCurrency: totals.chargeCurrency,
      upgradeCredit: totals.upgradeCredit || 0,
      upgradeCreditItems: totals.upgradeCreditItems || []
    });
  } catch (error) {
    console.error("[Order] calculate-totals error:", error);
    const status = error instanceof OrderTotalsError || error?.status ? error.status : 500;
    return res.status(status).json({ message: error.message || "Failed to calculate totals." });
  }
});

function isValidEstimateProductId(id) {
  if (!id || typeof id !== "string") return false;
  return /^[a-fA-F0-9]{24}$/.test(id);
}

// POST /api/orders/delivery-estimate (PUBLIC)
router.post("/delivery-estimate", estimateRateLimiter, async (req, res) => {
  try {
    const rawItems = Array.isArray(req.body?.items) ? req.body.items.slice(0, 50) : [];
    const shipping = req.body?.shipping || {};

    const seenMap = new Map();
    for (const raw of rawItems) {
      const rawId = raw?.product?._id || raw?.product?.id || raw?.product || raw?.id || raw?._id;
      const id = String(rawId || "").trim();
      if (!isValidEstimateProductId(id)) continue;
      const qty = Math.max(1, Math.floor(Number(raw?.quantity || 1)) || 1);
      seenMap.set(id, (seenMap.get(id) || 0) + qty);
    }

    const lines = [];
    for (const [productId, quantity] of seenMap.entries()) {
      lines.push({ productId, quantity });
    }

    if (lines.length === 0) {
      return res.json({ deliveryCharge: null });
    }

    const settings = (await StoreSettings.findOne().lean()) || {};

    const products = await Product.find({
      _id: { $in: lines.map((l) => l.productId) },
      isDeleted: { $ne: true }
    })
      .populate("bundleItems.product")
      .lean();

    const byId = new Map(products.map((p) => [String(p._id), p]));

    const normalizedItems = lines
      .map((l) => {
        const p = byId.get(l.productId);
        if (!p) return null;
        return normalizeOrderItem(p, { quantity: l.quantity });
      })
      .filter(Boolean);

    if (normalizedItems.length === 0) {
      return res.json({ deliveryCharge: null });
    }

    applyComboWeights(normalizedItems, byId);

    const pricingDetails = getDeliveryPricingDetails(settings, shipping, normalizedItems);

    return res.json({
      deliveryCharge: pricingDetails.deliveryCharge,
      pricingMode: pricingDetails.pricingMode,
      distanceKm: pricingDetails.distanceKm,
      isDigitalOnly: Boolean(pricingDetails.isDigitalOnly)
    });
  } catch (err) {
    return res.json({ deliveryCharge: null });
  }
});

// POST /api/orders/digital-ownership
router.post("/digital-ownership", protect, estimateRateLimiter, async (req, res) => {
  try {
    const analysis = await checkDigitalOwnership({
      userId: req.user,
      items: req.body?.items,
      isGift: req.body?.isGift === true
    });

    let upgradeCredit = 0;
    let upgradeCreditItems = [];
    let currency = "INR";

    if (analysis.notice === true && req.user) {
      try {
        const country = String(req.body?.shipping?.country || "India").trim();
        const settings = (await StoreSettings.findOne().lean()) || {};
        const totals = await computeOrderTotals({
          items: req.body?.items,
          shipping: { country },
          userId: req.user,
          settings
        });
        upgradeCredit = totals.upgradeCredit || 0;
        upgradeCreditItems = totals.upgradeCreditItems || [];
        currency = totals.orderCurrency || "INR";
      } catch {
        upgradeCredit = 0;
        upgradeCreditItems = [];
      }
    }

    let message = analysis.message;
    if (upgradeCredit > 0) {
      const ownedList = Array.isArray(analysis?.ownedItems) ? analysis.ownedItems.join(", ") : "";
      message = `You already own: ${ownedList}.`;
    }

    return res.json({
      ...analysis,
      message,
      upgradeCredit,
      upgradeCreditItems,
      currency
    });
  } catch (err) {
    console.error("[OrderRoutes] digital-ownership error:", err.message);
    return res.status(500).json({ message: "Failed to check digital ownership." });
  }
});

const ensureGiftPassesForOrder = async (order) => {
  if (!order || String(order.paymentStatus) !== "Paid") return order;

  const items = Array.isArray(order.items) ? [...order.items] : [];
  let updated = false;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const isDigital = Boolean(
      item.isDigital ||
      item.webReaderLink ||
      item.externalAccessLink ||
      item.kindleLink ||
      String(item.name || "").toLowerCase().includes("flipbook") ||
      String(item.name || "").toLowerCase().includes("web") ||
      String(item.name || "").toLowerCase().includes("kindle") ||
      String(item.format || "").toLowerCase().includes("web") ||
      String(item.format || "").toLowerCase().includes("flipbook")
    );

    if ((order.isGift || item.isGift) && !item.giftCode) {
      const code = generateGiftCode();
      try {
        await GiftPass.create({
          code,
          product: item.product || item._id || item.id,
          productName: item.name || "Digital Item",
          order: order._id,
          buyer: order.user,
          recipientEmail: order.giftRecipientEmail || "",
          isRedeemed: false
        });
        item.giftCode = code;
        updated = true;

        if (order.giftRecipientEmail) {
          const User = require("../models/User");
          const buyerUser = await User.findById(order.user).lean();
          const buyerName = buyerUser ? (buyerUser.name || buyerUser.email) : "A friend";
          
          const { sendGiftPassEmail } = require("../utils/email");
          await sendGiftPassEmail({
            to: order.giftRecipientEmail,
            buyerName,
            giftCode: code,
            productName: item.name || "Digital Item",
            orderId: String(order._id)
          });
        }
      } catch (err) {
        console.error("[GiftPass] Creation/Email error:", err.message);
      }
    }
  }

  if (updated) {
    await Order.updateOne({ _id: order._id }, { $set: { items } });
    order.items = items;
  }
  return order;
};

async function emailIssuedGiftPasses(order, issued) {
  if (!order || !order.giftRecipientEmail || !Array.isArray(issued) || issued.length === 0) {
    return;
  }
  let buyerName = null;
  for (const entry of issued) {
    const pass = entry?.pass;
    const item = entry?.item;
    if (!pass?.code) continue;
    try {
      if (buyerName === null) {
        const buyerUser = order.user ? await User.findById(order.user).lean() : null;
        buyerName = buyerUser ? (buyerUser.name || buyerUser.email) : (order.shipping?.name || "A friend");
      }
      await sendGiftPassEmail({
        to: order.giftRecipientEmail,
        buyerName,
        giftCode: pass.code,
        productName: item?.name || "Digital Item",
        orderId: String(order._id)
      });
    } catch (err) {
      console.error("[GiftPass] Email send error:", err.message);
    }
  }
}

// Create order (logged-in user)
router.post("/", protect, orderRateLimiter, honeypotMiddleware, async (req, res) => {
  try {
    const rawPaymentStatus = String(req.body?.paymentStatus || "Pending").trim();
    if (!allowedPaymentStatuses.has(rawPaymentStatus)) {
      return res.status(400).json({ message: "Invalid payment status." });
    }

    const shipping = req.body.shipping || {};
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const couponCode = String(req.body?.couponCode || "").trim().toUpperCase();
    const settings = (await StoreSettings.findOne().lean()) || {};

    const totals = await computeOrderTotals({
      items,
      shipping,
      couponCode,
      userId: req.user,
      settings
    });

    if (req.body.total !== undefined && Math.abs(totals.total - Number(req.body.total)) > 0.05) {
      return res.status(400).json({
        message: `Order total mismatch. Server calculated: ${totals.total}, Client provided: ${req.body.total}`
      });
    }

    const razorpayOrderId = String(req.body?.razorpayOrderId || "").trim();
    const razorpayPaymentId = String(req.body?.razorpayPaymentId || "").trim();
    const razorpaySignature = String(req.body?.razorpaySignature || req.body?.razorpay_signature || "").trim();

    let verifiedPayment = null;
    if (rawPaymentStatus === "Paid") {
      if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return res.status(400).json({ message: "Payment reference is required to place paid order." });
      }

      if (await Order.exists({ "paymentMeta.razorpayPaymentId": razorpayPaymentId })) {
        return res.status(409).json({ message: "Payment already used" });
      }

      const v = await verifyRazorpayPaymentForOrder({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        expectedAmount: totals.chargeAmount,
        expectedCurrency: totals.chargeCurrency
      });

      if (!v.ok) {
        return sendPaymentVerificationError(res, v, razorpayPaymentId);
      }
      verifiedPayment = v.payment;
    }

    if (!verifiedPayment && req.user) {
      const ownershipCheck = await checkDigitalOwnership({
        userId: req.user,
        items: req.body?.items,
        isGift: req.body?.isGift === true
      });
      if (ownershipCheck.blocked) {
        return res.status(409).json({
          code: "DIGITAL_ALREADY_OWNED",
          message: ownershipCheck.message,
          ownedItems: ownershipCheck.ownedItems
        });
      }
    }

    const requestedBilling = req.body.billing || req.body.shipping || {};
    const isDigitalOnly = totals.normalizedItems.every((item) => item.isDigital === true);
    const initialStatus = rawPaymentStatus === "Paid" && isDigitalOnly ? "Completed" : "Pending";

    const order = await Order.create({
      user: req.user,
      items: totals.normalizedItems,
      subtotal: totals.subtotal,
      gstPercent: totals.gstPercent,
      gstAmount: totals.gstAmount,
      couponCode: totals.appliedCouponCode,
      discount: totals.discount,
      deliveryCharge: totals.deliveryCharge,
      total: totals.total,
      fxRateToInr: totals.fxRateToInr,
      totalInInr: totals.totalInInr,
      taxDetails: totals.taxDetails,
      sellerDetails: {
        legalName: String(settings?.businessDetails?.legalName || "Digital Sanskrit Guru"),
        gstin: String(settings?.businessDetails?.gstin || ""),
        address: String(settings?.businessDetails?.address || ""),
        state: String(settings?.businessDetails?.state || ""),
        stateCode: String(settings?.businessDetails?.stateCode || ""),
        email: String(settings?.businessDetails?.email || "")
      },
      status: initialStatus,
      paymentStatus: rawPaymentStatus,
      paymentMeta: {
        razorpayOrderId: verifiedPayment ? razorpayOrderId : "",
        razorpayPaymentId: verifiedPayment ? razorpayPaymentId : "",
        paidAt: verifiedPayment ? new Date() : null,
        paidAmountMinor: verifiedPayment ? Number(verifiedPayment.amount) : null,
        paidCurrency: verifiedPayment ? String(verifiedPayment.currency).toUpperCase() : ""
      },
      isGift: req.body?.isGift === true,
      giftRecipientEmail: req.body?.isGift === true ? String(req.body?.giftRecipientEmail || "").trim() : "",
      refundStatus: "Not Applicable",
      currencyDisplay: {
        currency: totals.orderCurrency,
        amount: totals.total,
        detectedCountry: String(req.body?.currencyDisplay?.detectedCountry || "").toUpperCase()
      },
      billing: {
        name: requestedBilling.name || "",
        phone: requestedBilling.phone || "",
        email: requestedBilling.email || "",
        address: requestedBilling.address || "",
        city: requestedBilling.city || "",
        state: requestedBilling.state || "",
        pincode: requestedBilling.pincode || "",
        country: requestedBilling.country || ""
      },
      shipping: {
        name: shipping.name || "",
        phone: shipping.phone || "",
        address: shipping.address || "",
        city: shipping.city || "",
        state: shipping.state || "",
        pincode: shipping.pincode || "",
        country: shipping.country || "",
        latitude: shipping.latitude === null || shipping.latitude === undefined ? null : Number(shipping.latitude),
        longitude: shipping.longitude === null || shipping.longitude === undefined ? null : Number(shipping.longitude)
      }
    });

    if (rawPaymentStatus === "Paid") {
      const stockRes = await reserveStockForOrder(order._id);
      if (stockRes && !stockRes.ok) {
        console.warn(`[Order] Oversold warning for order ${order._id}:`, stockRes.outOfStock);
        await Order.updateOne({ _id: order._id }, { $set: { stockIssue: true, stockIssueDetails: stockRes.outOfStock } });
      }
      if (totals.appliedCouponCode) {
        const claimed = await claimCoupon({ code: totals.appliedCouponCode, userId: req.user });
        if (claimed) {
          order.couponClaimed = true;
          await Order.updateOne({ _id: order._id }, { $set: { couponClaimed: true } });
        }
      }
      if (order.isGift) {
        const issued = await issueGiftPassesForOrder(order._id);
        emailIssuedGiftPasses(order, issued).catch((err) => console.error("[GiftPass] Background email error:", err?.message));
      }
    }

    fireNotifications(async () => {
      const user = await User.findById(req.user).select("name email").lean();
      if (!user) return;

      if (rawPaymentStatus === "Paid") {
        await sendPushToUser(req.user, orderPayload(order, "placed"));
        await sendOrderConfirmation(order, user);
        await fireLowStockAlerts(totals.normalizedItems);
      }
    });

    return res.status(201).json(serializeOrderForOwner(order));
  } catch (err) {
    console.error("[Order] Create order error:", err.message);
    if (isDuplicatePaymentIdError(err)) {
      return res.status(409).json({ message: "Payment already used" });
    }
    const status = err instanceof OrderTotalsError || err?.status ? err.status : 500;
    return res.status(status).json({ message: err.message || "Failed to place order." });
  }
});

const autoCompletePaidDigitalOrders = async (orders) => {
  if (!Array.isArray(orders) || orders.length === 0) return orders;

  const orderIdsToComplete = [];
  orders.forEach((order) => {
    const isPaid = String(order.paymentStatus || "").toLowerCase() === "paid";
    const items = Array.isArray(order.items) ? order.items : [];
    const isDigitalOnly = items.length > 0 && items.every((item) =>
      Boolean(
        item.isDigital ||
        item.webReaderLink ||
        item.externalAccessLink ||
        item.kindleLink ||
        String(item.name || "").toLowerCase().includes("web") ||
        String(item.name || "").toLowerCase().includes("kindle") ||
        String(item.name || "").toLowerCase().includes("flipbook") ||
        String(item.format || "").toLowerCase().includes("web") ||
        String(item.format || "").toLowerCase().includes("flipbook")
      )
    );

    if (isPaid && isDigitalOnly && order.orderStatus !== "Completed" && order.status !== "Completed" && order.orderStatus !== "Cancelled" && order.status !== "Cancelled") {
      order.orderStatus = "Completed";
      order.status = "Completed";
      if (order._id) orderIdsToComplete.push(order._id);
    }
  });

  if (orderIdsToComplete.length > 0) {
    try {
      await Order.updateMany(
        { _id: { $in: orderIdsToComplete } },
        { $set: { orderStatus: "Completed", status: "Completed" } }
      );
    } catch (err) {
      console.error("Failed to auto-complete digital orders:", err);
    }
  }

  return orders;
};

// Get all orders (admin only)
router.get("/", protect, admin, requireAdminPage("orders"), async (req, res) => {
  try {
    const settings = await StoreSettings.findOne().select("currencyConversionRates").lean();
    const rates = settings?.currencyConversionRates || {};

    const branches = Object.entries(rates)
      .filter(([currency, rate]) => currency !== "INR" && Number(rate) > 0)
      .map(([currency, rate]) => ({
        case: { $eq: ["$currencyDisplay.currency", currency.toUpperCase()] },
        then: Number(rate)
      }));

    const paidAmountExpression = { $ifNull: ["$currencyDisplay.amount", "$total"] };

    const totalInBaseExpression = branches.length > 0
      ? {
          $divide: [
            paidAmountExpression,
            {
              $switch: {
                branches,
                default: 1
              }
            }
          ]
        }
      : paidAmountExpression;

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limitQuery = req.query.limit;
    const isPaginated = limitQuery !== "all";
    const limit = Math.max(1, parseInt(limitQuery) || 20);
    const skip = (page - 1) * limit;

    const sortOrder = req.query.sort === "oldest" ? 1 : -1;
    const searchText = req.query.search ? String(req.query.search).trim() : "";
    const statusFilter = req.query.status ? String(req.query.status).trim() : "All";
    const fromDateTime = req.query.fromDateTime;
    const toDateTime = req.query.toDateTime;

    const escapeRegex = (str) => String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // 1. Build base query (matching search text and date range)
    let baseQuery = {};

    if (searchText) {
      const safeSearch = escapeRegex(searchText);
      // Find matching users first (for user.name and user.email search)
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: safeSearch, $options: "i" } },
          { email: { $regex: safeSearch, $options: "i" } }
        ]
      }).select("_id");
      const userIds = matchingUsers.map((u) => u._id);

      const conditions = [
        { "billing.name": { $regex: safeSearch, $options: "i" } },
        { "billing.email": { $regex: safeSearch, $options: "i" } },
        { "shipping.name": { $regex: safeSearch, $options: "i" } },
        { "items.name": { $regex: safeSearch, $options: "i" } }
      ];

      if (mongoose.Types.ObjectId.isValid(searchText)) {
        conditions.push({ _id: searchText });
      }

      if (userIds.length > 0) {
        conditions.push({ user: { $in: userIds } });
      }

      baseQuery.$or = conditions;
    }

    if (fromDateTime || toDateTime) {
      baseQuery.createdAt = {};
      if (fromDateTime) {
        baseQuery.createdAt.$gte = new Date(fromDateTime);
      }
      if (toDateTime) {
        baseQuery.createdAt.$lte = new Date(toDateTime);
      }
    }

    // 2. Build final query adding status constraints
    let finalQuery = { ...baseQuery };

    if (statusFilter === "On Hold") {
      finalQuery.status = { $ne: "Cancelled" };
      finalQuery.paymentStatus = { $ne: "Paid" };
    } else if (statusFilter === "Pending") {
      finalQuery.status = "Pending";
      finalQuery.paymentStatus = "Paid";
    } else if (statusFilter === "Shipped") {
      finalQuery.status = "Shipped";
      finalQuery.paymentStatus = "Paid";
    } else if (statusFilter === "Delivered") {
      finalQuery.status = "Delivered";
      finalQuery.paymentStatus = "Paid";
    } else if (statusFilter === "Cancelled") {
      finalQuery.status = "Cancelled";
    } else if (statusFilter === "Return Requests") {
      finalQuery["items.returnRequest.status"] = { $ne: "Not Requested" };
    }

    // 3. Query paginated orders
    let queryExec = Order.find(finalQuery)
      .populate("user", "name email")
      .sort({ createdAt: sortOrder });

    if (isPaginated) {
      queryExec = queryExec.skip(skip).limit(limit);
    }

    const orders = await queryExec;
    await autoCompletePaidDigitalOrders(orders);

    // 4. Calculate total count for matching active status query
    const totalMatchingOrders = await Order.countDocuments(finalQuery);

    // 5. Gather counts for each chip status (using baseQuery)
    const [
      totalCount,
      onHoldCount,
      pendingCount,
      shippedCount,
      deliveredCount,
      cancelledCount,
      returnCount,
      statsResult
    ] = await Promise.all([
      Order.countDocuments(baseQuery),
      Order.countDocuments({ ...baseQuery, status: { $ne: "Cancelled" }, paymentStatus: { $ne: "Paid" } }),
      Order.countDocuments({ ...baseQuery, status: "Pending", paymentStatus: "Paid" }),
      Order.countDocuments({ ...baseQuery, status: "Shipped", paymentStatus: "Paid" }),
      Order.countDocuments({ ...baseQuery, status: "Delivered", paymentStatus: "Paid" }),
      Order.countDocuments({ ...baseQuery, status: "Cancelled" }),
      Order.countDocuments({ ...baseQuery, "items.returnRequest.status": { $ne: "Not Requested" } }),
      Order.aggregate([
        { $match: finalQuery },
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      { $eq: ["$status", "Cancelled"] },
                      { $eq: ["$refundStatus", "Refunded"] }
                    ]
                  },
                  0,
                  totalInBaseExpression
                ]
              }
            },
            pendingPaymentsCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$paymentStatus", "Paid"] },
                      { $ne: ["$refundStatus", "Refunded"] }
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            fulfilledCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $in: ["$status", ["Shipped", "Delivered"]] },
                      { $eq: ["$paymentStatus", "Paid"] }
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ])
    ]);

    const overviewStats = statsResult[0] || {
      totalRevenue: 0,
      pendingPaymentsCount: 0,
      fulfilledCount: 0
    };

    res.json({
      orders,
      totalOrders: totalMatchingOrders,
      totalPages: isPaginated ? Math.ceil(totalMatchingOrders / limit) : 1,
      currentPage: page,
      statusSummary: {
        All: totalCount,
        "On Hold": onHoldCount,
        Pending: pendingCount,
        Shipped: shippedCount,
        Delivered: deliveredCount,
        Cancelled: cancelledCount,
        "Return Requests": returnCount
      },
      overviewStats: {
        totalOrders: totalMatchingOrders,
        totalRevenue: overviewStats.totalRevenue || 0,
        pendingPayments: overviewStats.pendingPaymentsCount || 0,
        fulfilledOrders: overviewStats.fulfilledCount || 0
      }
    });
  } catch (error) {
    console.error("Fetch orders error:", error);
    res.status(500).json({ message: error.message || "Failed to load orders." });
  }
});

// Sales Analytics (Admin only)
router.get("/analytics/sales", protect, admin, requireAdminPage("orders"), async (req, res) => {
  try {
    const orders = await Order.find({ paymentStatus: "Paid" }).lean();
    
    let totalItemsSold = 0;
    let totalRevenue = 0;
    const formatCounts = {
      "Web Version": 0,
      "Flipbook": 0,
      "Kindle": 0,
      "Paperback": 0,
      "E-Book/PDF": 0,
      "Other": 0
    };
    const productSalesMap = {};
    const countrySalesMap = {};
    const monthlySalesMap = {};

    orders.forEach((order) => {
      totalRevenue += Number(order.total || 0);
      
      // Items sold
      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach((item) => {
        const qty = Number(item.quantity || 1);
        totalItemsSold += qty;

        // Product sales aggregation
        const prodName = String(item.name || "Unknown Product").trim();
        productSalesMap[prodName] = (productSalesMap[prodName] || 0) + qty;

        // Format detection
        const nameLower = prodName.toLowerCase();
        const formatLower = String(item.format || "").toLowerCase();
        let detectedFormat = "Other";

        if (nameLower.includes("web") || formatLower.includes("web")) {
          detectedFormat = "Web Version";
        } else if (nameLower.includes("flipbook") || formatLower.includes("flipbook")) {
          detectedFormat = "Flipbook";
        } else if (nameLower.includes("kindle") || formatLower.includes("kindle")) {
          detectedFormat = "Kindle";
        } else if (nameLower.includes("paperback") || nameLower.includes("hardcover") || formatLower.includes("paperback")) {
          detectedFormat = "Paperback";
        } else if (nameLower.includes("pdf") || nameLower.includes("e-book") || formatLower.includes("pdf") || formatLower.includes("e-book")) {
          detectedFormat = "E-Book/PDF";
        }
        formatCounts[detectedFormat] = (formatCounts[detectedFormat] || 0) + qty;
      });

      // Geographic aggregation
      const country = String(order.shipping?.country || order.billing?.country || "India").trim();
      const normalizedCountry = country.charAt(0).toUpperCase() + country.slice(1).toLowerCase();
      countrySalesMap[normalizedCountry] = (countrySalesMap[normalizedCountry] || 0) + 1;

      // Monthly sales aggregation
      const date = new Date(order.createdAt);
      if (!Number.isNaN(date.getTime())) {
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        monthlySalesMap[monthKey] = (monthlySalesMap[monthKey] || 0) + Number(order.total || 0);
      }
    });

    // Formatting top selling products list
    const topProducts = Object.entries(productSalesMap)
      .map(([name, qty]) => ({ name, quantity: qty }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    // Formatting country list
    const countrySales = Object.entries(countrySalesMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // Formatting monthly sales list
    const monthlySales = Object.entries(monthlySalesMap)
      .map(([month, amount]) => ({ month, amount: Math.round(amount) }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);

    res.json({
      success: true,
      summary: {
        totalOrders: orders.length,
        totalItemsSold,
        totalRevenue: Math.round(totalRevenue),
        averageOrderValue: orders.length > 0 ? Math.round(totalRevenue / orders.length) : 0
      },
      formatDistribution: formatCounts,
      topProducts,
      geographicDistribution: countrySales,
      monthlySalesTrends: monthlySales
    });
  } catch (err) {
    console.error("Sales analytics error:", err);
    res.status(500).json({ message: "Failed to generate sales analytics" });
  }
});

// Financial Analytics (Admin only)
router.get("/analytics/finance", protect, admin, requireAdminPage("orders"), async (req, res) => {
  try {
    let fromStr = String(req.query.from || "").trim();
    let toStr = String(req.query.to || "").trim();

    if (!fromStr || !toStr) {
      const istStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
      const ym = istStr.slice(0, 7);
      const [y, m] = ym.split("-").map(Number);
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      if (!fromStr) fromStr = `${ym}-01`;
      if (!toStr) toStr = `${ym}-${String(lastDay).padStart(2, "0")}`;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(fromStr) || !dateRegex.test(toStr)) {
      return res.status(400).json({ success: false, message: "Dates must be in YYYY-MM-DD format" });
    }

    const fromDate = new Date(`${fromStr}T00:00:00+05:30`);
    const toStartDate = new Date(`${toStr}T00:00:00+05:30`);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toStartDate.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid date provided" });
    }

    if (fromDate > toStartDate) {
      return res.status(400).json({ success: false, message: "'from' date cannot be after 'to' date" });
    }

    const diffMs = toStartDate.getTime() - fromDate.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays > 366) {
      return res.status(400).json({ success: false, message: "Date range cannot exceed 366 days" });
    }

    const toExclusiveDate = new Date(toStartDate.getTime() + 24 * 60 * 60 * 1000);

    const settings = await StoreSettings.findOne().select("businessDetails warehouseLocation").lean();
    const businessState = settings?.businessDetails?.state || settings?.warehouseLocation?.state || "Karnataka";

    const fieldsToSelect =
      "_id invoiceNumber createdAt user shipping billing currencyDisplay total totalInInr fxRateToInr subtotal taxDetails gstAmount deliveryCharge discount refundedAmountInInr refundStatus paymentMeta razorpayPaymentId updatedAt";

    const invoiceOrders = await Order.find({
      paymentStatus: { $in: ["Paid", "Refunded"] },
      createdAt: { $gte: fromDate, $lt: toExclusiveDate }
    })
      .select(fieldsToSelect)
      .populate("user", "name email")
      .lean();

    const invoiceRows = invoiceOrders.map((order) => buildInvoiceRow(order, settings));
    invoiceRows.sort((a, b) => new Date(a.invoiceDate) - new Date(b.invoiceDate));

    const refundedOrders = await Order.find({
      paymentStatus: { $in: ["Paid", "Refunded"] },
      refundedAmountInInr: { $gt: 0 },
      $or: [
        { "paymentMeta.refunds.at": { $gte: fromDate, $lt: toExclusiveDate } },
        { "paymentMeta.refunds.0": { $exists: false }, updatedAt: { $gte: fromDate, $lt: toExclusiveDate } }
      ]
    })
      .select(fieldsToSelect)
      .populate("user", "name email")
      .lean();

    const creditNotes = [];
    for (const order of refundedOrders) {
      const invRow = buildInvoiceRow(order, settings);
      const cnRows = buildCreditNoteRows(order, invRow, { from: fromDate, to: toExclusiveDate });
      creditNotes.push(...cnRows);
    }
    creditNotes.sort((a, b) => new Date(a.refundDate) - new Date(b.refundDate));

    const summary = summarize(invoiceRows, creditNotes);

    // Monthly trends (last 12 months in IST)
    const nowIST = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    const [nowY, nowM] = nowIST.slice(0, 7).split("-").map(Number);
    const twelveAgoDate = new Date(Date.UTC(nowY, nowM - 12, 1));
    const twelveAgoY = twelveAgoDate.getUTCFullYear();
    const twelveAgoM = String(twelveAgoDate.getUTCMonth() + 1).padStart(2, "0");
    const twelveMonthsAgo = new Date(`${twelveAgoY}-${twelveAgoM}-01T00:00:00+05:30`);

    const fxRateExpr = { $ifNull: ["$fxRateToInr", 1] };
    const grossExpr = {
      $ifNull: [
        "$totalInInr",
        { $multiply: [{ $ifNull: ["$total", 0] }, fxRateExpr] }
      ]
    };
    const taxExpr = {
      $multiply: [
        { $ifNull: ["$gstAmount", 0] },
        fxRateExpr
      ]
    };

    const trendsAgg = await Order.aggregate([
      {
        $match: {
          paymentStatus: { $in: ["Paid", "Refunded"] },
          createdAt: { $gte: twelveMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m",
              date: "$createdAt",
              timezone: "Asia/Kolkata"
            }
          },
          gross: { $sum: grossExpr },
          tax: { $sum: taxExpr },
          refunds: { $sum: { $ifNull: ["$refundedAmountInInr", 0] } }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    const monthlyTrends = trendsAgg.map((r) => {
      const gross = Math.round(r.gross || 0);
      const tax = Math.round(r.tax || 0);
      const refunds = Math.round(r.refunds || 0);
      const net = Math.round(gross - refunds);
      return {
        month: r._id,
        gross,
        tax,
        refunds,
        net
      };
    });

    const warnings = {};
    const warningOrderIds = {};
    const addWarning = (code, orderId, invNum) => {
      if (!warnings[code]) {
        warnings[code] = { count: 0, invoiceNumbers: [] };
        warningOrderIds[code] = new Set();
      }
      const distinctId = String(orderId || invNum || "Unassigned");
      if (!warningOrderIds[code].has(distinctId)) {
        warningOrderIds[code].add(distinctId);
        warnings[code].count += 1;
      }
      const num = invNum || "Unassigned";
      if (warnings[code].invoiceNumbers.length < 20 && !warnings[code].invoiceNumbers.includes(num)) {
        warnings[code].invoiceNumbers.push(num);
      }
    };

    for (const inv of invoiceRows) {
      if (Array.isArray(inv.warnings)) {
        for (const code of inv.warnings) {
          addWarning(code, inv.orderId, inv.invoiceNumber);
        }
      }
    }
    for (const cn of creditNotes) {
      if (Array.isArray(cn.warnings)) {
        for (const code of cn.warnings) {
          addWarning(code, cn.orderId, cn.invoiceNumber);
        }
      }
    }

    res.json({
      success: true,
      period: { from: fromStr, to: toStr },
      businessState,
      summary,
      monthlyTrends,
      invoices: invoiceRows,
      creditNotes,
      warnings
    });
  } catch (err) {
    console.error("Financial analytics error:", err);
    res.status(500).json({ message: "Failed to generate financial analytics" });
  }
});

// UPDATE order status (ADMIN)
router.put("/:id/status", protect, admin, requireAdminPage("orders"), async (req, res) => {
  const actor = await getAdminActorSnapshot(req.user);
  const statusMap = {
    pending: "Pending",
    shipped: "Shipped",
    delivered: "Delivered",
    cancelled: "Cancelled"
  };
  const rawStatus = String(req.body.status || "").trim().toLowerCase();
  const normalizedStatus = statusMap[rawStatus];

  if (!normalizedStatus) {
    return res.status(400).json({ message: "Invalid order status" });
  }

  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const previousStatus = String(order.status || "").trim() || "Pending";

  if (String(order.status || "").trim() === "Cancelled" && normalizedStatus !== "Cancelled") {
    return res.status(400).json({ message: "Cancelled orders cannot be moved back to shipping states." });
  }

  if (normalizedStatus !== "Cancelled" && String(order.paymentStatus || "").trim() !== "Paid") {
    return res.status(400).json({ message: "Order status can be updated only after payment is completed." });
  }

  // Stock-holding states: Pending and Shipped (goods not yet returned)
  const stockHoldingStates = new Set(["Pending", "Shipped"]);

  // If status is updated to Shipped, or if the order is already in a state that supports tracking, update tracking details.
  if (normalizedStatus === "Shipped" || order.status === "Shipped" || order.status === "Delivered") {
    if (req.body.trackingId !== undefined) {
      order.trackingId = String(req.body.trackingId || "").trim();
    }
    if (req.body.courierPartner !== undefined) {
      order.courierPartner = String(req.body.courierPartner || "").trim();
    }
    if (normalizedStatus === "Shipped") {
      order.shippedAt = order.shippedAt || new Date();
    }
  }

  order.status = normalizedStatus;
  if (normalizedStatus === "Cancelled") {
    order.cancelledAt = order.cancelledAt || new Date();
    order.refundStatus = String(order.paymentStatus || "").trim() === "Paid" ? "Pending" : "Not Applicable";
  }
  if (normalizedStatus === "Delivered") {
    order.deliveredAt = order.deliveredAt || new Date();
    if (Array.isArray(order.items)) {
      order.items = order.items.map((item) => ({
        ...item,
        deliveredAt: item?.deliveredAt || order.deliveredAt
      }));
    }
  }
  order.lastUpdatedByName = actor.name;
  order.lastUpdatedByEmail = actor.email;
  order.lastUpdatedAt = new Date();
  const updated = await order.save();

  // Restore stock, coupon eligibility, and revoke gift passes on cancellation
  if (normalizedStatus === "Cancelled") {
    await releaseStockForOrder(updated);
    await releaseCouponForOrder(updated);
    await revokeGiftPassesForOrder(updated);
  }

  await logAdminAction({
    req,
    action: "order-status-updated",
    entityType: "order",
    entityId: String(updated._id || ""),
    entityLabel: String(updated._id || ""),
    summary: `Updated order ${String(updated._id || "").slice(-6)} status: ${previousStatus} -> ${normalizedStatus}`,
    details: {
      previousStatus,
      nextStatus: normalizedStatus
    }
  });

  res.json(updated);

  // ── Fire-and-forget: status-change push + email to customer ──────────────
  if (["Shipped", "Delivered", "Cancelled"].includes(normalizedStatus)) {
    fireNotifications(async () => {
      const populatedOrder = await Order.findById(updated._id).populate("user", "name email").lean();
      if (!populatedOrder?.user) return;

      const isDigitalOnly = Array.isArray(populatedOrder.items) && populatedOrder.items.length > 0 && populatedOrder.items.every((item) =>
        Boolean(
          item.isDigital ||
          item.webReaderLink ||
          item.externalAccessLink ||
          item.kindleLink ||
          String(item.name || "").toLowerCase().includes("web") ||
          String(item.name || "").toLowerCase().includes("kindle") ||
          String(item.name || "").toLowerCase().includes("flipbook") ||
          String(item.format || "").toLowerCase().includes("web") ||
          String(item.format || "").toLowerCase().includes("flipbook")
        )
      );

      // Digital-only orders get instant online access upon payment; skip physical shipping/delivery notification emails
      if (isDigitalOnly && ["Shipped", "Delivered"].includes(normalizedStatus)) {
        return;
      }

      await sendPushToUser(populatedOrder.user._id, orderPayload(updated, normalizedStatus.toLowerCase()));
      await sendOrderStatusUpdate(updated, populatedOrder.user, normalizedStatus);
    });
  }
});

router.put("/:id/cancel", protect, async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const isOwner = String(order.user) === String(req.user);
  if (!isOwner) {
    return res.status(403).json({ message: "You can only cancel your own orders." });
  }

  if (String(order.status || "").trim() !== "Pending") {
    return res.status(400).json({ message: "Only pending orders can be cancelled before shipping." });
  }

  order.status = "Cancelled";
  order.cancelledAt = new Date();
  order.refundStatus = String(order.paymentStatus || "").trim() === "Paid" ? "Pending" : "Not Applicable";

  const updated = await order.save();

  // Restore stock, coupon eligibility, and revoke any issued gift passes
  await releaseStockForOrder(updated);
  await releaseCouponForOrder(updated);
  await revokeGiftPassesForOrder(updated);

  if (updated.refundStatus === "Pending") {
    notifyAdminsOfRefundRequest(updated, "cancellation");
  }

  res.json(serializeOrderForOwner(updated, req.user));
});

router.put("/:id/payment-status", protect, async (req, res) => {
  const rawPaymentStatus = String(req.body?.paymentStatus || "").trim();
  const mutablePaymentStatuses = new Set(["Pending", "Paid", "Failed"]);
  if (!mutablePaymentStatuses.has(rawPaymentStatus)) {
    return res.status(400).json({ message: "Invalid payment status" });
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  if (order.status === "Cancelled" && rawPaymentStatus === "Paid") {
    return res.status(400).json({ message: "Cancelled orders cannot be marked paid." });
  }

  const isOwner = String(order.user) === String(req.user);
  let isAdmin = false;
  let isSuperAdmin = false;
  let adminEmail = "";

  if (!isOwner) {
    const userDoc = await User.findById(req.user).select("isAdmin adminLevel adminRole allowedPages email").lean();
    isAdmin = Boolean(userDoc?.isAdmin);
    isSuperAdmin = isAdmin && Number(userDoc?.adminLevel) === 1;
    adminEmail = String(userDoc?.email || "").trim().toLowerCase();

    if (!isAdmin) {
      return res.status(403).json({ message: "You can only update your own orders." });
    }

    // Changing payment status directly without payment verification is restricted to Level 1 Super Admins
    if (!isSuperAdmin) {
      return res.status(403).json({
        message: "Access denied. Only 1st Level Super Admins can manually override order payment status."
      });
    }
  }

  if (isOwner && (order.paymentStatus === "Paid" || order.paymentStatus === "Refunded")) {
    return res.status(400).json({ message: "Paid orders cannot have their payment status modified." });
  }

  let manualReason = "";
  let manualPaymentReference = "";

  if (!isOwner && rawPaymentStatus === "Paid") {
    manualReason = String(req.body?.reason || "").trim();
    if (manualReason.length < 10) {
      return res.status(400).json({
        message: "A reason (at least 10 characters) is required to mark an order paid manually."
      });
    }
    manualPaymentReference = String(req.body?.paymentReference || "").trim().slice(0, 100);
  }

  const razorpayOrderId = String(req.body?.razorpayOrderId || "").trim();
  const razorpayPaymentId = String(req.body?.razorpayPaymentId || "").trim();
  const razorpaySignature = String(req.body?.razorpaySignature || req.body?.razorpay_signature || "").trim();

  let verifiedPayment = null;
  if (rawPaymentStatus === "Paid") {
    // If the customer (owner) is paying, Razorpay payment verification is strictly required
    if (isOwner) {
      if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return res.status(400).json({ message: "Payment reference is required." });
      }
      if (await Order.exists({ _id: { $ne: order._id }, "paymentMeta.razorpayPaymentId": razorpayPaymentId })) {
        return res.status(409).json({ message: "Payment already used" });
      }

      const ic = resolveItemsCurrency(order.items);
      const s = await StoreSettings.findOne().select("currencyConversionRates").lean();
      const charge = getSettlementCharge({
        total: order.total,
        orderCurrency: ic.ok ? ic.currency : normalizeCurrencyCode(order.currencyDisplay?.currency, "INR"),
        rates: s?.currencyConversionRates || {}
      });

      const v = await verifyRazorpayPaymentForOrder({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        expectedAmount: charge.amount,
        expectedCurrency: charge.currency
      });
      if (!v.ok) {
        return sendPaymentVerificationError(res, v, razorpayPaymentId);
      }
      verifiedPayment = v.payment;
    }
  }

  const previousPaymentStatus = order.paymentStatus;
  order.paymentStatus = rawPaymentStatus;
  if (rawPaymentStatus === "Paid") {
    order.paymentMeta = {
      ...(order.paymentMeta || {}),
      razorpayOrderId: razorpayOrderId || order.paymentMeta?.razorpayOrderId || "",
      razorpayPaymentId: razorpayPaymentId || order.paymentMeta?.razorpayPaymentId || "",
      razorpaySignature: razorpaySignature || order.paymentMeta?.razorpaySignature || "",
      paidAt: order.paymentMeta?.paidAt || new Date(),
      paidAmountMinor: verifiedPayment ? Number(verifiedPayment.amount) : order.paymentMeta?.paidAmountMinor || null,
      paidCurrency: verifiedPayment ? String(verifiedPayment.currency).toUpperCase() : order.paymentMeta?.paidCurrency || ""
    };

    if (!isOwner) {
      order.paymentMeta.manualOverride = {
        by: adminEmail || String(req.user),
        reason: manualReason,
        paymentReference: manualPaymentReference,
        at: new Date()
      };
    }

    const isDigitalOnly = Array.isArray(order.items) && order.items.length > 0 && order.items.every((item) =>
      Boolean(
        item.isDigital ||
        item.webReaderLink ||
        item.externalAccessLink ||
        item.kindleLink ||
        String(item.name || "").toLowerCase().includes("web") ||
        String(item.name || "").toLowerCase().includes("kindle") ||
        String(item.name || "").toLowerCase().includes("flipbook") ||
        String(item.format || "").toLowerCase().includes("web") ||
        String(item.format || "").toLowerCase().includes("flipbook")
      )
    );

    if (isDigitalOnly) {
      order.status = "Completed";
    }

    if (order.couponCode && !order.couponClaimed) {
      try {
        const claimed = await claimCoupon({ code: order.couponCode, userId: order.user });
        if (claimed) {
          order.couponClaimed = true;
        }
      } catch (couponErr) {
        console.warn("[Order] Coupon claim warning on retry:", couponErr.message);
      }
    }
  }

  let updated;
  try {
    updated = await order.save();
  } catch (err) {
    if (isDuplicatePaymentIdError(err)) {
      return res.status(409).json({ message: "This payment reference has already been applied to another order." });
    }
    throw err;
  }

  if (rawPaymentStatus === "Paid") {
    const stockRes = await reserveStockForOrder(updated._id);
    if (stockRes && !stockRes.ok) {
      console.warn(`[Order] Oversold warning for order ${updated._id}:`, stockRes.outOfStock);
      await Order.updateOne({ _id: updated._id }, { $set: { stockIssue: true, stockIssueDetails: stockRes.outOfStock } });
    }
    const issued = await issueGiftPassesForOrder(updated._id);
    emailIssuedGiftPasses(updated, issued).catch((err) => console.error("[GiftPass] Background email error:", err?.message));
  }

  if (!isOwner && isAdmin) {
    await logAdminAction({
      req,
      action: "order-payment-status-override",
      entityType: "order",
      entityId: String(order._id),
      entityLabel: String(order._id),
      summary: `Manual payment status override for order ${String(order._id).slice(-6)}: ${previousPaymentStatus} -> ${rawPaymentStatus}`,
      details: {
        previousPaymentStatus,
        nextPaymentStatus: rawPaymentStatus,
        reason: manualReason,
        paymentReference: manualPaymentReference
      }
    });
  }

  res.json(serializeOrderForOwner(updated, req.user));

  // ── Fire-and-forget: order confirmation push + email if payment just succeeded ─
  if (rawPaymentStatus === "Paid" && previousPaymentStatus !== "Paid") {
    fireNotifications(async () => {
      const user = await User.findById(order.user).select("name email").lean();
      if (!user) return;
      await sendPushToUser(order.user, orderPayload(updated, "placed"));
      await sendOrderConfirmation(updated, user);
      await fireLowStockAlerts(order.items || []);
    });
  }
});

router.put("/:id/items/:itemId/return-request", protect, async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const isOwner = String(order.user) === String(req.user);
  if (!isOwner) {
    return res.status(403).json({ message: "You can only request a return for your own orders." });
  }

  const item = getOrderItemById(order, req.params.itemId);
  if (!item) {
    return res.status(404).json({ message: "Order item not found" });
  }

  if (!isPhysicalItem(item)) {
    return res.status(400).json({ message: "Digital items cannot be returned." });
  }

  if (!canRequestReturnForItem(order, item)) {
    return res.status(400).json({ message: "Returns are only available for delivered paid items within 7 days." });
  }

  item.returnRequest = {
    status: "Requested",
    requestedAt: new Date(),
    resolvedAt: null,
    reason: String(req.body?.reason || "").trim()
  };
  order.refundStatus = deriveOrderRefundStatus(order);

  order.markModified("items");
  const updated = await order.save();

  notifyAdminsOfRefundRequest(updated, "return");

  res.json(serializeOrderForOwner(updated, req.user));
});

router.get("/:id/refund-quote", protect, admin, requireAdminPage("orders"), async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  let gatewayFeePaise = null;
  const razorpayPaymentId = String(order.paymentMeta?.razorpayPaymentId || order.razorpayPaymentId || "").trim();
  if (razorpayPaymentId) {
    try {
      const razorpay = getRazorpayClient();
      const paymentObj = await razorpay.payments.fetch(razorpayPaymentId);
      if (paymentObj && Number.isFinite(Number(paymentObj.fee))) {
        gatewayFeePaise = Number(paymentObj.fee);
      }
    } catch (err) {
      console.warn(`[RefundQuote] Could not fetch gateway fee for payment ${razorpayPaymentId}:`, err.message);
      gatewayFeePaise = null;
    }
  }

  const validReason = req.query?.reason === "store_fault" ? "store_fault" : "customer_choice";
  const rawItemIds = req.query.itemIds
    ? String(req.query.itemIds).split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const quote = computeRefundQuote({
    order,
    itemIds: rawItemIds,
    reason: validReason,
    gatewayFeePaise,
    policy: refundPolicy
  });

  res.json(quote);
});

router.put("/:id/refund-status", protect, admin, requireAdminPage("orders"), async (req, res) => {
  const actor = await getAdminActorSnapshot(req.user);
  const refundStatus = String(req.body?.refundStatus || "").trim();
  if (!allowedRefundStatuses.has(refundStatus)) {
    return res.status(400).json({ message: "Invalid refund status" });
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const previousRefundStatus = String(order.refundStatus || "").trim() || "Not Applicable";

  if (previousRefundStatus === "Refunded") {
    return res.status(400).json({ message: "This order has already been refunded. Completed refunds cannot be changed." });
  }

  // If refund requested via gateway or explicit amount
  if (refundStatus === "Refunded" || Number(req.body?.refundAmount) > 0) {
    try {
      const validReason = req.body?.reason === "store_fault" ? "store_fault" : "customer_choice";
      const itemIds = Array.isArray(req.body?.itemIds)
        ? req.body.itemIds.map(String)
        : (typeof req.body?.itemIds === "string" && req.body.itemIds.trim()
            ? req.body.itemIds.split(",").map((s) => s.trim()).filter(Boolean)
            : []);
      const restock = Boolean(req.body?.restock);

      let reasonString = "Admin processed refund";
      if (validReason === "store_fault") {
        reasonString = itemIds.length > 0 ? `Store fault return: ${itemIds.length} item(s)` : "Store fault cancellation";
      } else {
        reasonString = itemIds.length > 0 ? `Customer choice return: ${itemIds.length} item(s)` : "Customer choice cancellation";
      }

      // Compute pre-refund quote for email breakdown before mutating order
      let preQuote = null;
      try {
        let gatewayFeePaise = null;
        const razorpayPaymentId = String(order.paymentMeta?.razorpayPaymentId || order.razorpayPaymentId || "").trim();
        if (razorpayPaymentId) {
          try {
            const razorpay = getRazorpayClient();
            const paymentObj = await razorpay.payments.fetch(razorpayPaymentId);
            if (paymentObj && Number.isFinite(Number(paymentObj.fee))) {
              gatewayFeePaise = Number(paymentObj.fee);
            }
          } catch (feeErr) {
            console.warn(`[RefundStatus] Could not fetch gateway fee for payment ${razorpayPaymentId}:`, feeErr.message);
            gatewayFeePaise = null;
          }
        }

        preQuote = computeRefundQuote({
          order,
          itemIds,
          reason: validReason,
          gatewayFeePaise,
          policy: refundPolicy
        });
      } catch (quoteErr) {
        console.warn("[RefundStatus] Failed to compute pre-refund quote for email:", quoteErr.message);
        preQuote = null;
      }

      const userDoc = await User.findById(req.user).select("isAdmin adminLevel").lean();
      const isSuperAdmin = Boolean(userDoc?.isAdmin) && Number(userDoc?.adminLevel) === 1;
      const waive = req.body?.waiveReceipt === true;
      const waiveReason = req.body?.waiveReason;

      const receiptCheck = checkRefundReceipt({
        order,
        itemIds,
        isSuperAdmin,
        waive,
        waiveReason
      });

      if (!receiptCheck.ok) {
        const blockedNames = (receiptCheck.blockedItems || []).map((it) => it?.name || "Item");
        return res.status(400).json({
          message: receiptCheck.message,
          blockedItems: blockedNames
        });
      }
      const isWaived = Boolean(receiptCheck.waived);

      const refundResult = await processGatewayRefund({
        orderId: req.params.id,
        refundAmount: req.body?.refundAmount,
        reason: reasonString,
        actor,
        isManualOnly: Boolean(req.body?.manualRefund || req.body?.forceManual),
        forceManual: Boolean(req.body?.forceManual)
      });

      // Post-refund: mark returned items as Refunded and restock if requested
      if (Array.isArray(refundResult.order?.items)) {
        const itemIdSet = new Set(itemIds);
        const targetAll = itemIds.length === 0;
        const refundedItems = [];

        refundResult.order.items.forEach((item) => {
          const id = String(item?._id || item?.id || item?.product || "");
          if (targetAll || itemIdSet.has(id)) {
            if (!item.returnRequest) {
              item.returnRequest = {};
            }
            item.returnRequest.status = "Refunded";
            if (!item.returnRequest.requestedAt) {
              item.returnRequest.requestedAt = new Date();
            }
            item.returnRequest.resolvedAt = new Date();

            if (isWaived) {
              item.returnRequest.receiptWaived = {
                by: actor.email,
                reason: String(waiveReason || "").trim(),
                at: new Date()
              };
            }

            refundedItems.push(item);
          }
        });

        if (restock) {
          const itemsToConsider = restockableItems(refundedItems);
          if (itemsToConsider.length > 0) {
            if (order.stockReserved === true) {
              const includeComponents =
                order.stockComponentsReserved === true ||
                refundResult.order.stockComponentsReserved === true;
              const itemsToRestock = expandItemsForStock(itemsToConsider, {
                includeComponents
              });
              if (itemsToRestock.length > 0) {
                await incrementStock(itemsToRestock);
              }
            } else {
              console.log("[RefundRestock] Stock was already returned when the order was cancelled; no restock needed.");
            }
          }
        }

        if (
          refundResult.order.items.length > 0 &&
          refundResult.order.items.every((it) => it.returnRequest?.status === "Refunded")
        ) {
          refundResult.order.refundStatus = "Refunded";
          refundResult.refundStatus = "Refunded";
        }

        refundResult.order.markModified("items");
        await refundResult.order.save();
      }

      // Build email lines from preQuote
      let emailLines = null;
      if (preQuote && Array.isArray(preQuote.lines)) {
        emailLines = [...preQuote.lines];
        const diff = Number(refundResult.refundAmount) - Number(preQuote.refundable);
        if (Math.abs(diff) > 0.01) {
          emailLines.push({
            label: "Adjustment by store",
            amount: Math.round(diff * 100) / 100
          });
        }
      }

      await logAdminAction({
        req,
        action: "order-refund-updated",
        entityType: "order",
        entityId: String(order._id),
        entityLabel: String(order._id),
        summary: `Processed refund of ₹${refundResult.refundAmount} for order ${String(order._id).slice(-6)}: ${previousRefundStatus} -> ${refundResult.refundStatus}`,
        details: {
          previousRefundStatus,
          nextRefundStatus: refundResult.refundStatus,
          refundAmount: refundResult.refundAmount,
          razorpayRefundId: refundResult.razorpayRefundId,
          restocked: restock,
          reason: reasonString,
          ...(isWaived ? { receiptWaived: true, waiveReason: String(waiveReason || "").trim() } : {})
        }
      });

      if (previousRefundStatus !== refundResult.refundStatus) {
        fireNotifications(async () => {
          const populatedOrder = await Order.findById(order._id).populate("user", "name email").lean();
          if (!populatedOrder?.user) return;

          await sendRefundStatusUpdate(refundResult.order, populatedOrder.user, refundResult.refundStatus, {
            lines: emailLines,
            refundAmount: refundResult.refundAmount
          });
        });
      }

      return res.json(refundResult.order);
    } catch (err) {
      if (err instanceof RefundError) {
        return res.status(err.statusCode).json({
          message: err.message,
          canForceManual: Boolean(err.details?.canForceManual)
        });
      }
      return res.status(500).json({ message: err.message || "Failed to process refund." });
    }
  }

  order.refundStatus = refundStatus;
  order.lastUpdatedByName = actor.name;
  order.lastUpdatedByEmail = actor.email;
  order.lastUpdatedAt = new Date();
  const updated = await order.save();

  await logAdminAction({
    req,
    action: "order-refund-updated",
    entityType: "order",
    entityId: String(updated._id || ""),
    entityLabel: String(updated._id || ""),
    summary: `Updated refund status for order ${String(updated._id || "").slice(-6)}: ${previousRefundStatus} -> ${refundStatus}`,
    details: {
      previousRefundStatus,
      nextRefundStatus: refundStatus
    }
  });

  res.json(updated);

  if (previousRefundStatus !== refundStatus && ["Processing", "Refunded", "Rejected"].includes(refundStatus)) {
    fireNotifications(async () => {
      const populatedOrder = await Order.findById(updated._id).populate("user", "name email").lean();
      if (!populatedOrder?.user) return;
      await sendRefundStatusUpdate(updated, populatedOrder.user, refundStatus);
    });
  }
});

router.put("/:id/items/:itemId/return-status", protect, admin, requireAdminPage("orders"), async (req, res) => {
  const actor = await getAdminActorSnapshot(req.user);
  const returnStatus = String(req.body?.returnStatus || "").trim();
  const adminReason = String(req.body?.adminReason || "").trim();
  if (!allowedReturnStatuses.has(returnStatus)) {
    return res.status(400).json({ message: "Invalid return status" });
  }

  if (returnStatus === "Refunded") {
    return res.status(400).json({ message: "Use the Refund action to refund returned items." });
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const item = getOrderItemById(order, req.params.itemId);
  if (!item) {
    return res.status(404).json({ message: "Order item not found" });
  }

  const previousReturnStatus = String(item?.returnRequest?.status || "Not Requested").trim();

  if (previousReturnStatus === "Not Requested") {
    return res.status(400).json({ message: "This item does not have a return request." });
  }

  if (previousReturnStatus === "Refunded") {
    return res.status(400).json({ message: "This item has already been refunded. Completed returns cannot be changed." });
  }

  let isAllowed = false;
  if (previousReturnStatus === "Requested") {
    isAllowed = returnStatus === "Approved" || returnStatus === "Rejected";
  } else if (previousReturnStatus === "Approved") {
    isAllowed = returnStatus === "Rejected";
  } else if (previousReturnStatus === "Received") {
    isAllowed = returnStatus === "Rejected";
  }

  if (!isAllowed) {
    return res.status(400).json({
      message: `Cannot transition return status from "${previousReturnStatus}" to "${returnStatus}".`
    });
  }

  if (returnStatus === "Rejected" && !adminReason) {
    return res.status(400).json({ message: "Please provide a reason before rejecting this return request." });
  }

  item.returnRequest.status = returnStatus;
  item.returnRequest.resolvedAt = new Date();
  if (returnStatus === "Approved") {
    item.returnRequest.approvedAt = new Date();
  }
  item.returnRequest.adminReason = returnStatus === "Rejected" ? adminReason : String(item?.returnRequest?.adminReason || "").trim();

  order.refundStatus = deriveOrderRefundStatus(order);

  order.markModified("items");
  order.lastUpdatedByName = actor.name;
  order.lastUpdatedByEmail = actor.email;
  order.lastUpdatedAt = new Date();
  const updated = await order.save();

  await logAdminAction({
    req,
    action: "order-return-updated",
    entityType: "order-item-return",
    entityId: `${String(updated._id || "")}:${String(req.params.itemId || "")}`,
    entityLabel: String(item?.name || req.params.itemId || "").trim(),
    summary:
      `Updated return for order ${String(updated._id || "").slice(-6)} item ${String(item?.name || "").trim() || "item"}: ` +
      `${previousReturnStatus} -> ${returnStatus}`,
    details: {
      orderId: String(updated._id || ""),
      itemId: String(req.params.itemId || ""),
      itemName: String(item?.name || "").trim(),
      previousReturnStatus,
      nextReturnStatus: returnStatus,
      ...(returnStatus === "Rejected" ? { adminReason } : {})
    }
  });

  fireNotifications(async () => {
    const populatedOrder = await Order.findById(order._id).populate("user", "name email").lean();
    if (!populatedOrder?.user) return;
    const settings = await StoreSettings.findOne().select("warehouseLocation").lean();
    await sendReturnStatusEmail({
      order: updated,
      user: populatedOrder.user,
      item,
      kind: returnStatus === "Approved" ? "approved" : "rejected",
      adminReason,
      returnAddress: settings?.warehouseLocation
    });
  });

  res.json(updated);
});

// NEW PUT /:id/items/:itemId/return-shipment (protect, owner only)
router.put("/:id/items/:itemId/return-shipment", protect, async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const isOwner = String(order.user) === String(req.user);
  if (!isOwner) {
    return res.status(403).json({ message: "You can only update your own orders." });
  }

  const item = getOrderItemById(order, req.params.itemId);
  if (!item) {
    return res.status(404).json({ message: "Order item not found" });
  }

  if (item?.returnRequest?.status !== "Approved") {
    return res.status(400).json({ message: "Tracking can only be added for approved return requests." });
  }

  const courier = String(req.body?.courier || "").trim();
  const trackingNumber = String(req.body?.trackingNumber || "").trim();

  if (courier.length < 2 || courier.length > 60) {
    return res.status(400).json({ message: "Courier name must be between 2 and 60 characters." });
  }
  if (trackingNumber.length < 3 || trackingNumber.length > 60) {
    return res.status(400).json({ message: "Tracking number must be between 3 and 60 characters." });
  }

  if (!item.returnRequest) {
    item.returnRequest = {};
  }
  item.returnRequest.shipment = {
    courier,
    trackingNumber,
    shippedAt: new Date()
  };

  order.markModified("items");
  const updated = await order.save();

  res.json(serializeOrderForOwner(updated, req.user));
});

// NEW PUT /:id/items/:itemId/return-received (protect, admin, requireAdminPage("orders"))
router.put("/:id/items/:itemId/return-received", protect, admin, requireAdminPage("orders"), async (req, res) => {
  const actor = await getAdminActorSnapshot(req.user);
  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const item = getOrderItemById(order, req.params.itemId);
  if (!item) {
    return res.status(404).json({ message: "Order item not found" });
  }

  if (item?.returnRequest?.status !== "Approved") {
    return res.status(400).json({ message: "Only approved returns can be marked as received." });
  }

  const condition = String(req.body?.condition || "").trim();
  const allowedConditions = new Set(["Good", "Damaged", "Incomplete"]);
  if (!allowedConditions.has(condition)) {
    return res.status(400).json({ message: "Condition must be 'Good', 'Damaged', or 'Incomplete'." });
  }

  const note = String(req.body?.note || "").trim();
  if (condition !== "Good" && note.length < 5) {
    return res.status(400).json({ message: "A note of at least 5 characters is required when condition is not Good." });
  }

  item.returnRequest.status = "Received";
  item.returnRequest.receivedAt = new Date();
  item.returnRequest.receivedBy = actor.email;
  item.returnRequest.condition = condition;
  item.returnRequest.conditionNote = note;

  order.refundStatus = deriveOrderRefundStatus(order);

  order.markModified("items");
  order.lastUpdatedByName = actor.name;
  order.lastUpdatedByEmail = actor.email;
  order.lastUpdatedAt = new Date();
  const updated = await order.save();

  await logAdminAction({
    req,
    action: "order-return-received",
    entityType: "order-item-return",
    entityId: `${String(updated._id || "")}:${String(req.params.itemId || "")}`,
    entityLabel: String(item?.name || req.params.itemId || "").trim(),
    summary: `Marked return for item ${String(item?.name || "").trim() || "item"} as Received (${condition}) for order ${String(updated._id || "").slice(-6)}`,
    details: {
      orderId: String(updated._id || ""),
      itemId: String(req.params.itemId || ""),
      itemName: String(item?.name || "").trim(),
      condition,
      conditionNote: note
    }
  });

  fireNotifications(async () => {
    const populatedOrder = await Order.findById(updated._id).populate("user", "name email").lean();
    if (!populatedOrder?.user) return;
    await sendReturnStatusEmail({
      order: updated,
      user: populatedOrder.user,
      item,
      kind: "received"
    });
  });

  res.json(updated);
});

// GET logged-in user's orders
router.get("/my", protect, async (req, res) => {
  try {
    let orders = await Order.find({ user: req.user }).sort({ createdAt: -1 }).lean();

    // Also fetch historical WordPress archive orders for this user
    try {
      const WpOrder = require("../models/WpOrder");
      const userId = req.user;
      const currentUserDoc = await User.findById(userId).select("email").lean();
      const userEmail = currentUserDoc ? String(currentUserDoc.email || "").trim().toLowerCase() : "";

      const wpOrders = await WpOrder.find({
        $or: [
          { user: userId },
          ...(userEmail ? [{ billingEmail: userEmail }] : [])
        ]
      }).sort({ wpCreatedAt: -1 }).lean();

      const formattedWpOrders = wpOrders.map((wO) => ({
        _id: `wp_${wO.wpOrderId}`,
        isWpArchive: true,
        wpOrderId: wO.wpOrderId,
        orderNumber: `WP-#${wO.wpOrderId}`,
        items: wO.items || [],
        total: wO.total || 0,
        subtotal: wO.subtotal || 0,
        gstAmount: wO.gstAmount || 0,
        deliveryCharge: wO.deliveryCharge || 0,
        discount: wO.discount || 0,
        couponCode: wO.couponCode || "",
        status: wO.status || "Delivered",
        paymentStatus: wO.paymentStatus || "Paid",
        paymentMethod: wO.paymentMethod || "WordPress Import",
        billing: wO.billing || {},
        shipping: wO.shipping || {},
        currencyDisplay: wO.currencyDisplay || { currency: "INR", amount: wO.total },
        createdAt: wO.wpCreatedAt || wO.createdAt
      }));

      orders = [...orders, ...formattedWpOrders];
    } catch (wpErr) {
      console.error("[MyOrders] WP Archive fetch error:", wpErr.message);
    }

    // Ensure gift pass codes exist for any paid gift orders
    for (let i = 0; i < orders.length; i++) {
      if (orders[i].isGift && orders[i].paymentStatus === "Paid") {
        orders[i] = await ensureGiftPassesForOrder(orders[i]);
      }
    }

    // Also fetch any gift passes redeemed by this user
    const redeemedPasses = await GiftPass.find({ redeemedBy: req.user, isRedeemed: true })
      .populate("product")
      .lean();

    const redeemedProductMapByOrder = new Map();
    if (redeemedPasses.length > 0) {
      redeemedPasses.forEach((gp) => {
        const oId = String(gp.order);
        if (!redeemedProductMapByOrder.has(oId)) {
          redeemedProductMapByOrder.set(oId, new Set());
        }
        redeemedProductMapByOrder.get(oId).add(String(gp.product?._id || gp.product));
      });
      const redeemedOrderIds = redeemedPasses.map((gp) => String(gp.order));
      const existingOrderIds = new Set(orders.map((o) => String(o._id)));
      const missingOrderIds = redeemedOrderIds.filter((id) => !existingOrderIds.has(id));

      if (missingOrderIds.length > 0) {
        const giftOrders = await Order.find({ _id: { $in: missingOrderIds } }).lean();
        giftOrders.forEach((gOrder) => {
          gOrder.isRedeemedGift = true;
          orders.push(gOrder);
        });
      }
    }

    const productIds = [];
    const productNames = [];
    orders.forEach((order) => {
      if (order.isWpArchive || String(order._id || "").startsWith("wp_")) return;
      if (Array.isArray(order.items)) {
        order.items.forEach((item) => {
          const pId = String(item.product || item._id || item.id || "").trim();
          if (mongoose.Types.ObjectId.isValid(pId)) {
            productIds.push(pId);
          }
          if (item.name) {
            productNames.push(String(item.name).trim());
          }
          if (Array.isArray(item.bundleItems)) {
            item.bundleItems.forEach((subItem) => {
              const subPId = String(subItem.product || subItem._id || subItem.id || "").trim();
              if (mongoose.Types.ObjectId.isValid(subPId)) {
                productIds.push(subPId);
              }
              if (subItem.name) {
                productNames.push(String(subItem.name).trim());
              }
            });
          }
        });
      }
    });

    const queryConditions = [];
    if (productIds.length > 0) queryConditions.push({ _id: { $in: productIds } });
    if (productNames.length > 0) queryConditions.push({ name: { $in: productNames } });

    if (queryConditions.length > 0) {
      const products = await Product.find({ $or: queryConditions })
        .select("name isDigital digitalType digitalDelivery externalAccessLink externalAccessLabel webReaderLink kindleLink kindleAsin digitalInstructions")
        .lean();

      const productMapById = new Map();
      const productMapByName = new Map();
      products.forEach((p) => {
        productMapById.set(String(p._id), p);
        if (p.name) productMapByName.set(String(p.name).trim().toLowerCase(), p);
      });

      orders.forEach((order) => {
        if (order.isWpArchive || String(order._id || "").startsWith("wp_")) return;
        if (Array.isArray(order.items)) {
          order.items.forEach((item) => {
            const pId = String(item.product || item._id || item.id || "").trim();
            const pName = String(item.name || "").trim().toLowerCase();
            const prod = productMapById.get(pId) || productMapByName.get(pName);
            item.digitalDelivery = item.digitalDelivery || "onsite";
            if (prod) {
              if (prod.isDigital !== undefined) item.isDigital = prod.isDigital;
              if (item.digitalDelivery === "external") {
                if (prod.externalAccessLink) item.externalAccessLink = prod.externalAccessLink;
                if (prod.externalAccessLabel) item.externalAccessLabel = prod.externalAccessLabel;
              }
              if (prod.webReaderLink) item.webReaderLink = prod.webReaderLink;
              if (prod.kindleLink) item.kindleLink = prod.kindleLink;
              if (prod.kindleAsin) item.kindleAsin = prod.kindleAsin;
              if (prod.digitalInstructions) item.digitalInstructions = prod.digitalInstructions;
              if (prod.digitalType) item.digitalType = prod.digitalType;
            }

            if (Array.isArray(item.bundleItems)) {
              item.bundleItems.forEach((subItem) => {
                const subPId = String(subItem.product || subItem._id || subItem.id || "").trim();
                const subPName = String(subItem.name || "").trim().toLowerCase();
                const subProd = productMapById.get(subPId) || productMapByName.get(subPName);
                if (subProd) {
                  if (subProd.isDigital !== undefined) subItem.isDigital = subProd.isDigital;
                  if (subProd.webReaderLink) subItem.webReaderLink = subProd.webReaderLink;
                  if (subProd.kindleLink) subItem.kindleLink = subProd.kindleLink;
                  if (subProd.kindleAsin) subItem.kindleAsin = subProd.kindleAsin;
                  if (subProd.digitalInstructions) subItem.digitalInstructions = subProd.digitalInstructions;
                  if (subProd.digitalType) subItem.digitalType = subProd.digitalType;
                }
              });
            }
          });
        }
      });
    }

    const isWpDigitalLooking = (it) => {
      if (!it) return false;
      if (it.isDigital) return true;
      const name = String(it.name || "").toLowerCase();
      const format = String(it.format || "").toLowerCase();
      const indicators = ["web version", "web-version", "flipbook", "pdf", "ebook", "e-book"];
      return indicators.some((ind) => name.includes(ind) || format.includes(ind)) || format.includes("web");
    };

    const cleanWpItem = (it) => {
      if (!it || typeof it !== "object") return it;
      delete it.webReaderLink;
      delete it.externalAccessLink;
      delete it.externalAccessLabel;
      delete it.kindleLink;
      delete it.kindleAsin;
      delete it.digitalInstructions;
      if (isWpDigitalLooking(it)) {
        it.legacyAccess = true;
      }
      if (Array.isArray(it.bundleItems)) {
        it.bundleItems = it.bundleItems.map((bi) => {
          const sub = { ...bi };
          delete sub.webReaderLink;
          delete sub.externalAccessLink;
          delete sub.externalAccessLabel;
          delete sub.kindleLink;
          delete sub.kindleAsin;
          delete sub.digitalInstructions;
          if (isWpDigitalLooking(sub)) {
            sub.legacyAccess = true;
          }
          return sub;
        });
      }
      return it;
    };

    const serializedOrders = orders.map((o) => {
      const oId = String(o._id);
      const redeemedProductIds = redeemedProductMapByOrder.get(oId) || null;
      const serialized = serializeOrderForOwner(o, req.user, { redeemedProductIds });
      const isWp = Boolean(o.isWpArchive || String(o._id || "").startsWith("wp_") || serialized?.isWpArchive);
      if (isWp && serialized) {
        serialized.legacyAccess = true;
        if (Array.isArray(serialized.items)) {
          serialized.items = serialized.items.map(cleanWpItem);
        }
      }
      return serialized;
    });
    res.json(serializedOrders);
  } catch (err) {
    console.error("Failed to load user orders:", err);
    res.status(500).json({ message: "Failed to load orders" });
  }
});

// Get single order (admin only)
router.get("/:id", protect, admin, requireAdminPage("orders"), async (req, res) => {
  const order = await Order.findById(req.params.id).populate("user", "name email").lean();

  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  res.json(order);
});

// Get tracking details for a specific order (customer who placed it OR admin)
router.get("/:id/tracking", protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check permissions: either admin or the user who placed the order
    const user = await User.findById(req.user);
    if (!user.isAdmin && String(order.user) !== String(req.user)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const trackingData = await getTrackingDetails(order);
    res.json(trackingData);
  } catch (err) {
    console.error("[OrderRoutes] Error fetching tracking:", err.message);
    res.status(500).json({ message: "Failed to load tracking details" });
  }
});

// POST /api/orders/direct-buy (PUBLIC)
router.post("/direct-buy", orderRateLimiter, honeypotMiddleware, async (req, res) => {
  try {
    const rawPaymentStatus = String(req.body?.paymentStatus || "Pending").trim();
    if (!allowedPaymentStatuses.has(rawPaymentStatus)) {
      return res.status(400).json({ message: "Invalid payment status." });
    }

    const shipping = req.body.shipping || {};
    const requestedBilling = req.body.billing || req.body.shipping || {};
    const guestEmail = String(requestedBilling?.email || shipping?.email || "").trim().toLowerCase();
    const guestName = String(requestedBilling?.name || shipping?.name || "Customer").trim();
    const guestPhone = String(requestedBilling?.phone || shipping?.phone || "").trim();

    if (!guestEmail) {
      return res.status(400).json({ message: "Email is required for direct purchase." });
    }

    let targetUser = await User.findOne({ email: guestEmail });
    let tempPassword = "";
    let isNewUserCreated = false;

    if (!targetUser) {
      tempPassword = crypto.randomBytes(5).toString("hex");
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(tempPassword, salt);
      
      targetUser = await User.create({
        name: guestName,
        email: guestEmail,
        password: hashedPassword,
        phone: guestPhone,
        isAdmin: false
      });
      isNewUserCreated = true;
    }

    const settings = await StoreSettings.findOne().lean();

    let calc;
    try {
      // Guest direct-buy does not require login; pass an empty Set so upgrade credit is never granted
      calc = await computeOrderTotals({
        items: req.body?.items,
        shipping,
        couponCode: req.body?.couponCode,
        userId: targetUser ? targetUser._id : null,
        settings,
        ownedDigitalIds: new Set()
      });
    } catch (err) {
      if (err instanceof OrderTotalsError) {
        return res.status(err.statusCode || err.status || 400).json({ message: err.message });
      }
      throw err;
    }

    const razorpayOrderId = String(req.body?.razorpayOrderId || "").trim();
    const razorpayPaymentId = String(req.body?.razorpayPaymentId || "").trim();
    const razorpaySignature = String(req.body?.razorpaySignature || req.body?.razorpay_signature || "").trim();

    let verifiedPayment = null;
    if (rawPaymentStatus === "Paid") {
      if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return res.status(400).json({ message: "Payment reference is required to place paid order." });
      }

      if (await Order.exists({ "paymentMeta.razorpayPaymentId": razorpayPaymentId })) {
        return res.status(409).json({ message: "Payment already used" });
      }

      const v = await verifyRazorpayPaymentForOrder({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        expectedAmount: calc.chargeAmount || calc.totalInInr || calc.total,
        expectedCurrency: calc.chargeCurrency || "INR",
        toleranceMinor: 100
      });

      if (!v.ok) {
        return sendPaymentVerificationError(res, v, razorpayPaymentId);
      }
      verifiedPayment = v.payment;
    }

    let directBuyUserId = req.user || null;
    if (!directBuyUserId && req.headers?.authorization?.startsWith("Bearer ")) {
      try {
        const token = req.headers.authorization.slice(7).trim();
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
        if (decoded?.id) directBuyUserId = decoded.id;
      } catch {
        // ignore invalid token in public route
      }
    }

    if (!verifiedPayment && directBuyUserId) {
      const ownershipCheck = await checkDigitalOwnership({
        userId: directBuyUserId,
        items: req.body?.items,
        isGift: req.body?.isGift === true
      });
      if (ownershipCheck.blocked) {
        return res.status(409).json({
          code: "DIGITAL_ALREADY_OWNED",
          message: ownershipCheck.message,
          ownedItems: ownershipCheck.ownedItems
        });
      }
    }

    const normalizedItems = Array.isArray(calc.normalizedItems) ? calc.normalizedItems : [];

    const isDigitalOnlyOrder = normalizedItems.length > 0 && normalizedItems.every((item) =>
      Boolean(
        item.isDigital ||
        item.webReaderLink ||
        item.externalAccessLink ||
        item.kindleLink ||
        String(item.name || "").toLowerCase().includes("web") ||
        String(item.name || "").toLowerCase().includes("kindle") ||
        String(item.name || "").toLowerCase().includes("flipbook") ||
        String(item.format || "").toLowerCase().includes("web") ||
        String(item.format || "").toLowerCase().includes("flipbook")
      )
    );

    const initialOrderStatus = rawPaymentStatus === "Paid" && isDigitalOnlyOrder
      ? "Completed"
      : "Pending";

    const orderData = {
      user: targetUser._id,
      items: normalizedItems,
      subtotal: calc.subtotal,
      gstPercent: calc.gstPercent,
      gstAmount: calc.gstAmount,
      couponCode: calc.appliedCouponCode || "",
      discount: calc.discount,
      deliveryCharge: calc.deliveryCharge,
      total: calc.total,
      fxRateToInr: calc.fxRateToInr || 1,
      totalInInr: calc.totalInInr || calc.total,
      status: initialOrderStatus,
      paymentStatus: rawPaymentStatus,
      paymentMethod: "Razorpay",
      shipping,
      billing: requestedBilling,
      currencyDisplay: {
        currency: calc.orderCurrency || "INR",
        amount: calc.total,
        detectedCountry: String(shipping?.country || "").trim()
      },
      taxDetails: calc.taxDetails,
      sellerDetails: {
        legalName: String(settings?.businessDetails?.legalName || "Digital Sanskrit Guru"),
        gstin: String(settings?.businessDetails?.gstin || ""),
        address: String(settings?.businessDetails?.address || ""),
        state: String(settings?.businessDetails?.state || ""),
        stateCode: String(settings?.businessDetails?.stateCode || ""),
        email: String(settings?.businessDetails?.email || "")
      },
      paymentMeta: {
        razorpayOrderId: verifiedPayment ? razorpayOrderId : "",
        razorpayPaymentId: verifiedPayment ? razorpayPaymentId : "",
        razorpaySignature: verifiedPayment ? razorpaySignature : "",
        settlementAmountMinor: Math.round((calc.chargeAmount || calc.totalInInr || calc.total) * 100),
        settlementCurrency: calc.chargeCurrency || "INR",
        paidAmountMinor: verifiedPayment ? Number(verifiedPayment.amount) : null,
        paidCurrency: verifiedPayment ? String(verifiedPayment.currency).toUpperCase() : "",
        paidAt: rawPaymentStatus === "Paid" ? new Date() : null
      }
    };

    let order;
    try {
      order = await Order.create(orderData);
    } catch (err) {
      if (isDuplicatePaymentIdError(err)) {
        return res.status(409).json({ message: "This payment reference has already been applied to another order." });
      }
      throw err;
    }

    if (rawPaymentStatus === "Paid") {
      const stockRes = await reserveStockForOrder(order._id);
      if (stockRes && !stockRes.ok) {
        console.warn(`[Order] Direct-buy oversold warning for order ${order._id}:`, stockRes.outOfStock);
        await Order.updateOne({ _id: order._id }, { $set: { stockIssue: true, stockIssueDetails: stockRes.outOfStock } });
      }
      if (calc.appliedCouponCode) {
        try {
          const claimed = await claimCoupon({ code: calc.appliedCouponCode, userId: targetUser._id });
          if (claimed) {
            order.couponClaimed = true;
            await Order.updateOne({ _id: order._id }, { $set: { couponClaimed: true } });
          }
        } catch (couponErr) {
          console.warn("[Order] Coupon claim warning on direct-buy:", couponErr.message);
        }
      }
      if (order.isGift) {
        const issued = await issueGiftPassesForOrder(order._id);
        emailIssuedGiftPasses(order, issued).catch((err) => console.error("[GiftPass] Background email error:", err?.message));
      }
    }

    fireNotifications(async () => {
      if (rawPaymentStatus === "Paid") {
        await sendOrderConfirmation(order, targetUser);
      }

      if (isNewUserCreated && tempPassword) {
        await sendWelcomeCredentialsEmail(targetUser, tempPassword);
      }

      if (rawPaymentStatus === "Paid") {
        await fireLowStockAlerts(normalizedItems);
      }
    });

    res.status(201).json({
      order: serializeOrderForOwner(order, targetUser._id),
      accountCreated: isNewUserCreated,
      email: guestEmail
    });
  } catch (err) {
    console.error("[Order] Direct buy create error:", err.message);
    res.status(500).json({ message: "Failed to place order. Please try again." });
  }
});

// ── GET /api/orders/digital-stream/:orderId/:itemId ─────────────────────────
// Authenticated streaming proxy: verifies order ownership & payment status,
// then securely streams the media from CDN without exposing CDN link to client DOM
// ── GET /api/orders/digital-stream/:orderId/:itemId/ticket & stream ───────
const dns = require("dns").promises;
const net = require("net");
const { Readable, pipeline } = require("stream");

const ALLOWED_STREAM_HOSTS = String(process.env.DIGITAL_MEDIA_ALLOWED_HOSTS || "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

const STREAM_TIMEOUT_MS = Math.max(1000, Number(process.env.DIGITAL_STREAM_TIMEOUT_MS) || 15000);
const STREAM_OK_TYPES = [
  /^application\/pdf\b/,
  /^video\//,
  /^audio\//,
  /^image\/(png|jpe?g|gif|webp|avif)\b/,
  /^application\/epub\+zip\b/,
  /^application\/octet-stream\b/
];

const ticketSecret = () =>
  process.env.STREAM_TICKET_SECRET ||
  crypto.createHash("sha256").update(`digital-stream-ticket:${process.env.JWT_SECRET || ""}`).digest("hex");

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const v = String(ip || "").toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || /^fe[89ab]/.test(v);
}

async function assertSafeStreamUrl(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    throw Object.assign(new Error("Invalid reader URL."), { status: 400 });
  }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) {
    throw Object.assign(new Error("Reader URL protocol or port is not allowed."), { status: 400 });
  }
  const h = u.hostname.toLowerCase();
  if (net.isIP(h)) {
    throw Object.assign(new Error("IP literal reader hosts are not allowed."), { status: 403 });
  }
  if (ALLOWED_STREAM_HOSTS.length > 0) {
    const isAllowedHost = ALLOWED_STREAM_HOSTS.some((r) => (r.startsWith(".") ? h.endsWith(r) : h === r));
    if (!isAllowedHost) {
      throw Object.assign(new Error("Reader host is not in allowed media hosts."), { status: 403 });
    }
  }
  const addrs = await dns.lookup(h, { all: true, verbatim: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
    throw Object.assign(new Error("Reader host resolves to a disallowed private address."), { status: 403 });
  }
  return u;
}

async function fetchSafelyStream(start, headers, signal) {
  let cur = await assertSafeStreamUrl(start);
  for (let hop = 0; hop <= 3; hop++) {
    const r = await fetch(cur, { headers, redirect: "manual", signal });
    const loc = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && loc) {
      await r.body?.cancel().catch(() => {});
      cur = await assertSafeStreamUrl(new URL(loc, cur).toString());
      continue;
    }
    return r;
  }
  throw Object.assign(new Error("Too many redirects from media host."), { status: 502 });
}

async function resolveAuthorizedDigitalItem(userId, orderId, itemId) {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw Object.assign(new Error("Order not found"), { status: 404 });
  }
  const order = await Order.findById(orderId).select("user items isGift paymentStatus status refundStatus").lean();
  if (!order) {
    throw Object.assign(new Error("Order not found"), { status: 404 });
  }
  const line = (order.items || []).find((i) => String(i.product) === String(itemId) || String(i._id) === String(itemId));
  if (!line) {
    throw Object.assign(new Error("Item not found in this order."), { status: 404 });
  }

  const userDoc = await User.findById(userId).select("isAdmin").lean();
  const isAdmin = Boolean(userDoc?.isAdmin);

  if (!isAdmin) {
    const isGiftLine = Boolean(order.isGift || line.giftCode);
    const allowed = isGiftLine
      ? Boolean(
          await GiftPass.exists({
            order: order._id,
            redeemedBy: userId,
            isRedeemed: true,
            isRevoked: { $ne: true },
            product: line.product
          })
        )
      : String(order.user) === String(userId);

    if (!allowed) throw Object.assign(new Error("Access denied for this digital item."), { status: 403 });
    if (!hasDigitalAccess(order) || line.returnRequest?.status === "Refunded") {
      throw Object.assign(new Error("Payment required to access digital content."), { status: 402 });
    }
  }

  const prod = await Product.findById(line.product).select("webReaderLink").lean();
  const link = String(prod?.webReaderLink || "").trim();
  if (!link) {
    throw Object.assign(new Error("Digital reader link not configured for this item."), { status: 404 });
  }
  return { link };
}

const authStream = async (req, res, next) => {
  if (req.headers.authorization) return protect(req, res, next);
  try {
    const rawTicket = String(req.query?.ticket || "");
    const d = jwt.verify(rawTicket, ticketSecret());
    if (d.scope !== "digital-stream" || d.orderId !== req.params.orderId || d.itemId !== req.params.itemId) {
      return res.status(401).json({ message: "Invalid stream ticket scope." });
    }
    const u = await User.findById(d.id).select("isBlocked isDeleted").lean();
    if (!u || u.isBlocked || u.isDeleted) {
      return res.status(401).json({ message: "User account inactive." });
    }
    req.user = d.id;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid stream ticket." });
  }
};

router.get("/digital-stream/:orderId/:itemId/ticket", protect, async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    await resolveAuthorizedDigitalItem(req.user, orderId, itemId);
    const ticket = jwt.sign(
      { id: String(req.user), scope: "digital-stream", orderId, itemId },
      ticketSecret(),
      { expiresIn: "2h" }
    );
    res.setHeader("Cache-Control", "no-store");
    res.json({
      streamPath: `/api/orders/digital-stream/${encodeURIComponent(orderId)}/${encodeURIComponent(itemId)}?ticket=${encodeURIComponent(ticket)}`
    });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.status ? e.message : "Failed to prepare digital stream." });
  }
});

router.get("/digital-stream/:orderId/:itemId", authStream, async (req, res) => {
  const ctrl = new AbortController();
  let timer = setTimeout(() => ctrl.abort(), STREAM_TIMEOUT_MS);
  res.on("close", () => ctrl.abort());

  try {
    const { link } = await resolveAuthorizedDigitalItem(req.user, req.params.orderId, req.params.itemId);
    const headers = { accept: "*/*" };
    const range = String(req.headers.range || "");
    if (/^bytes=\d*-\d*$/.test(range)) headers.range = range;

    const up = await fetchSafelyStream(link, headers, ctrl.signal);
    clearTimeout(timer);

    if (up.status !== 200 && up.status !== 206) {
      await up.body?.cancel().catch(() => {});
      return res.status(502).json({ message: "Media host returned an error." });
    }

    const ct = String(up.headers.get("content-type") || "application/octet-stream").toLowerCase();
    if (!STREAM_OK_TYPES.some((re) => re.test(ct))) {
      await up.body?.cancel().catch(() => {});
      return res.status(415).json({ message: "Unsupported media type." });
    }

    res.status(up.status).set({
      "Content-Type": ct,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "sandbox",
      "Content-Disposition": "inline"
    });

    ["content-length", "content-range", "accept-ranges"].forEach((h) => {
      const v = up.headers.get(h);
      if (v) res.setHeader(h, v);
    });

    if (!up.body) return res.end();
    const body = Readable.fromWeb(up.body);
    const idle = () => {
      clearTimeout(timer);
      timer = setTimeout(() => ctrl.abort(), 30000);
    };
    idle();
    body.on("data", idle);
    pipeline(body, res, () => clearTimeout(timer));
  } catch (e) {
    clearTimeout(timer);
    if (res.headersSent) return res.destroy();
    if (e.name === "AbortError") return res.status(504).json({ message: "Media host timed out." });
    res.status(e.status || 500).json({ message: e.status ? e.message : "Failed to stream media content." });
  }
});

module.exports = router;
