const express = require("express");
const Order = require("../models/Order");
const StoreSettings = require("../models/StoreSettings");
const Coupon = require("../models/Coupon");
const Product = require("../models/Product");
const { resolveDeliveryCharge } = require("../utils/deliveryPricing");
const { getProductPriceDetails } = require("../utils/productPricing");
const protect = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");

const router = express.Router();

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
const allowedPaymentStatuses = new Set(["Pending", "Paid", "Failed"]);
const allowedRefundStatuses = new Set(["Not Applicable", "Pending", "Processing", "Refunded", "Rejected"]);
const allowedReturnStatuses = new Set(["Requested", "Approved", "Rejected", "Refunded"]);
const RETURN_WINDOW_DAYS = 7;

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

// Create order (logged-in user)
router.post("/", protect, async (req, res) => {
  const shipping = req.body.shipping || {};
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const couponCode = String(req.body?.couponCode || "").trim().toUpperCase();
  const shippingCountry = String(shipping?.country || "").trim();
  const requestedProductIds = [...new Set(
    items.map((item) => String(item?._id || item?.id || item?.product || "").trim()).filter(Boolean)
  )];

  const products = await Product.find({ _id: { $in: requestedProductIds } }).lean();
  const productsById = new Map(products.map((product) => [String(product._id), product]));

  const normalizedItems = items.reduce((acc, item) => {
    const productId = String(item?._id || item?.id || item?.product || "").trim();
    const product = productsById.get(productId);
    if (!product) {
      return acc;
    }

    const quantity = Math.max(1, Number(item?.quantity || 1));
    const pricing = getProductPriceDetails(product, shippingCountry);

    acc.push({
      product: productId,
      _id: productId,
      id: productId,
      name: String(product?.name || item?.name || "").trim(),
      image: String(product?.image || item?.image || "").trim(),
      category: String(product?.category || item?.category || "General").trim() || "General",
      quantity,
      price: roundMoney(pricing.price),
      domesticPrice: roundMoney(pricing.domesticPrice),
      internationalPrice: roundMoney(pricing.internationalPrice),
      internationalCountryPrices: Array.isArray(product?.internationalCountryPrices)
        ? product.internationalCountryPrices.map((entry) => ({
            country: String(entry?.country || "").trim(),
            price: roundMoney(Number(entry?.price || 0))
          }))
        : [],
      appliedPriceType: pricing.priceType,
      deliveredAt: null,
      returnRequest: {
        status: "Not Requested",
        requestedAt: null,
        resolvedAt: null,
        reason: ""
      }
    });
    return acc;
  }, []);

  if (normalizedItems.length === 0) {
    return res.status(400).json({ message: "No valid products found for this order." });
  }

  const subtotal = roundMoney(
    normalizedItems.reduce((sum, item) => sum + Number(item?.price || 0) * Math.max(1, Number(item?.quantity || 1)), 0)
  );

  const settings = (await StoreSettings.findOne()) || { gstPercent: 0, deliveryCharge: 0 };
  const gstPercent = Math.min(50, Math.max(0, Number(settings.gstPercent || 0)));
  const deliveryCharge = resolveDeliveryCharge(settings, shipping);
  const gstAmount = roundMoney((subtotal * gstPercent) / 100);
  const grossTotal = roundMoney(subtotal + gstAmount + deliveryCharge);

  let discount = 0;
  let appliedCouponCode = "";
  if (couponCode) {
    const coupon = await Coupon.findOne({ code: couponCode });
    if (coupon && (!coupon.expiresAt || new Date() <= coupon.expiresAt)) {
      const minOrder = Number(coupon.minOrder || 0);
      if (grossTotal >= minOrder) {
        if (coupon.type === "percentage") {
          discount = roundMoney((grossTotal * Number(coupon.value || 0)) / 100);
        } else if (coupon.type === "fixed") {
          discount = roundMoney(Number(coupon.value || 0));
        }
        discount = Math.max(0, Math.min(grossTotal, discount));
        appliedCouponCode = couponCode;
      }
    }
  }

  const total = roundMoney(Math.max(0, grossTotal - discount));
  const rawPaymentStatus = String(req.body?.paymentStatus || "").trim();
  if (!allowedPaymentStatuses.has(rawPaymentStatus)) {
    return res.status(400).json({ message: "Invalid payment status." });
  }

  const razorpayOrderId = String(req.body?.razorpayOrderId || "").trim();
  const razorpayPaymentId = String(req.body?.razorpayPaymentId || "").trim();
  if (rawPaymentStatus === "Paid" && (!razorpayOrderId || !razorpayPaymentId)) {
    return res.status(400).json({ message: "Payment reference is required to place paid order." });
  }

  const requestedCurrency = String(req.body?.currencyDisplay?.currency || "")
    .trim()
    .toUpperCase();
  const requestedDisplayAmount = Number(req.body?.currencyDisplay?.amount);
  const requestedDetectedCountry = String(req.body?.currencyDisplay?.detectedCountry || "")
    .trim()
    .toUpperCase();

  const order = await Order.create({
    user: req.user,
    items: normalizedItems,
    subtotal,
    gstPercent,
    gstAmount,
    couponCode: appliedCouponCode,
    discount,
    deliveryCharge,
    total,
    paymentStatus: rawPaymentStatus,
    paymentMeta: {
      razorpayOrderId,
      razorpayPaymentId,
      paidAt: rawPaymentStatus === "Paid" ? new Date() : null
    },
    refundStatus: "Not Applicable",
    currencyDisplay: {
      currency: requestedCurrency,
      amount: Number.isFinite(requestedDisplayAmount) ? requestedDisplayAmount : null,
      detectedCountry: requestedDetectedCountry
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

  res.json(order);
});

// Get all orders (admin only)
router.get("/", protect, admin, async (req, res) => {
  const orders = await Order.find()
    .populate("user", "name email")
    .sort({ createdAt: -1 });

  res.json(orders);
});
// UPDATE order status (ADMIN)
router.put("/:id/status", protect, admin, async (req, res) => {
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

  if (String(order.status || "").trim() === "Cancelled" && normalizedStatus !== "Cancelled") {
    return res.status(400).json({ message: "Cancelled orders cannot be moved back to shipping states." });
  }

  if (normalizedStatus !== "Cancelled" && String(order.paymentStatus || "").trim() !== "Paid") {
    return res.status(400).json({ message: "Order status can be updated only after payment is completed." });
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
  const updated = await order.save();

  res.json(updated);
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
  res.json(updated);
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

  const isOwner = String(order.user) === String(req.user);
  if (!isOwner) {
    return res.status(403).json({ message: "You can only update your own orders." });
  }

  order.paymentStatus = rawPaymentStatus;
  if (rawPaymentStatus === "Paid") {
    order.paymentMeta = {
      razorpayOrderId: String(req.body?.razorpayOrderId || ""),
      razorpayPaymentId: String(req.body?.razorpayPaymentId || ""),
      paidAt: new Date()
    };
  }

  const updated = await order.save();
  res.json(updated);
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

  if (!canRequestReturnForItem(order, item)) {
    return res.status(400).json({ message: "Returns are only available for delivered paid items within 7 days." });
  }

  item.returnRequest = {
    status: "Requested",
    requestedAt: new Date(),
    resolvedAt: null,
    reason: String(req.body?.reason || "").trim()
  };
  order.refundStatus = "Pending";

  order.markModified("items");
  const updated = await order.save();
  res.json(updated);
});

router.put("/:id/refund-status", protect, admin, async (req, res) => {
  const refundStatus = String(req.body?.refundStatus || "").trim();
  if (!allowedRefundStatuses.has(refundStatus)) {
    return res.status(400).json({ message: "Invalid refund status" });
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  if (String(order.status || "").trim() !== "Cancelled" || String(order.paymentStatus || "").trim() !== "Paid") {
    return res.status(400).json({ message: "Refund status can be updated only for paid cancelled orders." });
  }

  order.refundStatus = refundStatus;
  const updated = await order.save();
  res.json(updated);
});

router.put("/:id/items/:itemId/return-status", protect, admin, async (req, res) => {
  const returnStatus = String(req.body?.returnStatus || "").trim();
  const adminReason = String(req.body?.adminReason || "").trim();
  if (!allowedReturnStatuses.has(returnStatus)) {
    return res.status(400).json({ message: "Invalid return status" });
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const item = getOrderItemById(order, req.params.itemId);
  if (!item) {
    return res.status(404).json({ message: "Order item not found" });
  }

  if (String(item?.returnRequest?.status || "Not Requested").trim() === "Not Requested") {
    return res.status(400).json({ message: "This item does not have a return request." });
  }

  if (returnStatus === "Rejected" && !adminReason) {
    return res.status(400).json({ message: "Please provide a reason before rejecting this return request." });
  }

  item.returnRequest.status = returnStatus;
  item.returnRequest.resolvedAt = returnStatus === "Requested" ? null : new Date();
  item.returnRequest.adminReason = returnStatus === "Rejected" ? adminReason : String(item?.returnRequest?.adminReason || "").trim();

  if (returnStatus === "Requested") {
    order.refundStatus = "Pending";
  } else if (returnStatus === "Approved") {
    order.refundStatus = "Processing";
  } else if (returnStatus === "Rejected") {
    order.refundStatus = "Rejected";
  } else if (returnStatus === "Refunded") {
    order.refundStatus = "Refunded";
  }

  order.markModified("items");
  const updated = await order.save();
  res.json(updated);
});

// GET logged-in user's orders
router.get("/my", protect, async (req, res) => {
  const orders = await Order.find({ user: req.user }).sort({ createdAt: -1 });
  res.json(orders);
});

// Get single order (admin only)
router.get("/:id", protect, admin, async (req, res) => {
  const order = await Order.findById(req.params.id).populate("user", "name email").lean();

  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  res.json(order);
});

module.exports = router;
