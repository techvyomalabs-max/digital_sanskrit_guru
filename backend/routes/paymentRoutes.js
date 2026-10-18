const express = require("express");
const mongoose = require("mongoose");
const protect = require("../middleware/authMiddleware");
const Order = require("../models/Order");
const Product = require("../models/Product");
const PaymentIntent = require("../models/PaymentIntent");
const StoreSettings = require("../models/StoreSettings");
const getRazorpayClient = require("../utils/razorpay");
const { toMinorUnits, resolveItemsCurrency, normalizeCurrencyCode } = require("../utils/currency");
const { SETTLEMENT_CURRENCY, getSettlementCharge, verifyRazorpaySignature } = require("../utils/paymentVerification");
const { computeOrderTotals } = require("../utils/orderTotals");
const { expandItemsForStock } = require("../utils/stock");
const { paymentRateLimiter, honeypotMiddleware } = require("../utils/spamFilter");
const { checkDigitalOwnership } = require("../services/digitalOwnershipService");

const router = express.Router();
const MAX_CHARGE = Number(process.env.PAYMENT_MAX_CHARGE_AMOUNT || 500000); // 5 Lakhs max

const protectIfOrderId = (req, res, next) => {
  const authHeader = req.headers?.authorization;
  if (req.body?.orderId || (authHeader && authHeader.startsWith("Bearer "))) {
    return protect(req, res, next);
  }
  return next();
};

router.post("/create-order", paymentRateLimiter, honeypotMiddleware, protectIfOrderId, async (req, res) => {
  try {
    let amount;
    let currency;
    let receipt = `order_${Date.now()}`;
    let itemsToCheck;
    const notes = {};
    if (req.user) {
      notes.userId = String(req.user);
    }

    if (req.body?.orderId) {
      // Authenticated payment retry mode
      const id = String(req.body.orderId).trim();
      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ message: "Invalid order id" });
      }

      const o = await Order.findById(id).select("user items total currencyDisplay paymentStatus status isGift").lean();
      if (!o || String(o.user) !== String(req.user)) {
        return res.status(404).json({ message: "Order not found" });
      }
      if (o.paymentStatus === "Paid") {
        return res.status(409).json({ message: "Order is already paid" });
      }
      if (o.status === "Cancelled") {
        return res.status(400).json({ message: "Cancelled orders cannot be paid" });
      }

      if (!o.isGift) {
        const ownershipCheck = await checkDigitalOwnership({
          userId: req.user,
          items: o.items,
          isGift: false
        });
        if (ownershipCheck.blocked) {
          return res.status(409).json({
            code: "DIGITAL_ALREADY_OWNED",
            message: ownershipCheck.message,
            ownedItems: ownershipCheck.ownedItems
          });
        }
      }

      itemsToCheck = o.items;
      const ic = resolveItemsCurrency(o.items);
      const s = await StoreSettings.findOne().select("currencyConversionRates").lean();
      const settlement = getSettlementCharge({
        total: o.total,
        orderCurrency: ic.ok ? ic.currency : normalizeCurrencyCode(o.currencyDisplay?.currency, "INR"),
        rates: s?.currencyConversionRates || {}
      });

      amount = settlement.amount;
      currency = settlement.currency;
      receipt = `ord_${id}`;
      notes.orderId = id;
    } else if (Array.isArray(req.body?.items) && req.body.items.length > 0) {
      if (req.user) {
        const ownershipCheck = await checkDigitalOwnership({
          userId: req.user,
          items: req.body.items,
          isGift: req.body.isGift === true
        });
        if (ownershipCheck.blocked) {
          return res.status(409).json({
            code: "DIGITAL_ALREADY_OWNED",
            message: ownershipCheck.message,
            ownedItems: ownershipCheck.ownedItems
          });
        }
      }

      // Compute authoritative order totals from database products, delivery settings & coupons
      const settings = (await StoreSettings.findOne().lean()) || {};
      const totals = await computeOrderTotals({
        items: req.body.items,
        shipping: req.body.shipping || {},
        couponCode: req.body.couponCode,
        userId: req.user || null,
        settings
      });
      itemsToCheck = totals.normalizedItems;
      amount = totals.chargeAmount || totals.totalInInr || totals.total;
      currency = totals.chargeCurrency || SETTLEMENT_CURRENCY;
    } else {
      return res.status(400).json({ message: "Order items or order reference required to initiate payment." });
    }

    if (currency !== SETTLEMENT_CURRENCY) {
      return res.status(400).json({ message: `Unsupported payment currency: ${currency}` });
    }

    const minor = toMinorUnits(amount, currency);
    if (!Number.isInteger(minor) || minor < 100 || amount > MAX_CHARGE) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const needed = expandItemsForStock(itemsToCheck || [], { includeComponents: true });
    if (needed.length > 0) {
      const neededIds = needed.map((n) => n.product?._id || n.product).filter(Boolean);
      const dbProducts = await Product.find({ _id: { $in: neededIds }, isDeleted: { $ne: true } })
        .select("name stock isDigital")
        .lean();
      const productMap = new Map(dbProducts.map((p) => [String(p._id), p]));

      for (const entry of needed) {
        const pId = String(entry.product?._id || entry.product || "");
        const prod = productMap.get(pId);
        if (prod?.isDigital === true) {
          continue;
        }
        const currentStock = prod ? Number(prod.stock || 0) : 0;
        const name = prod?.name || entry.name || "Item";
        if (!prod || currentStock < entry.quantity) {
          return res.status(400).json({
            message: `Sorry, "${name}" is out of stock (only ${currentStock} left).`
          });
        }
      }
    }

    const razorpay = getRazorpayClient();
    const order = await razorpay.orders.create({
      amount: minor,
      currency,
      receipt,
      payment_capture: 1,
      notes
    });

    try {
      await PaymentIntent.create({
        razorpayOrderId: order.id,
        amountMinor: minor,
        currency,
        user: req.user || null,
        mode: req.body?.orderId ? "retry" : "checkout",
        orderId: req.body?.orderId ? req.body.orderId : null
      });
    } catch (intentErr) {
      console.error("[Payment] Failed to record PaymentIntent:", intentErr?.message || intentErr);
    }

    return res.json(order);
  } catch (error) {
    const message =
      error?.error?.description ||
      error?.error?.reason ||
      error?.message ||
      "Failed to create Razorpay order";

    console.error("[Payment] create-order failed:", message);
    return res.status(500).json({ message });
  }
});

router.post("/verify", async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature
  } = req.body || {};

  const orderId = razorpay_order_id || razorpayOrderId;
  const paymentId = razorpay_payment_id || razorpayPaymentId;
  const signature = razorpay_signature || razorpaySignature;

  const isValid = verifyRazorpaySignature({
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signature
  });

  if (isValid) {
    return res.json({ success: true });
  }

  return res.status(400).json({ success: false, message: "Invalid signature" });
});

module.exports = router;
