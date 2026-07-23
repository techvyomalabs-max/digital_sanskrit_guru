const express = require("express");
const Coupon = require("../models/Coupon");
const StoreSettings = require("../models/StoreSettings");
const User = require("../models/User");
const { convertCurrencyAmount, normalizeCurrencyCode } = require("../utils/currency");
const protect = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");
const { getAdminActorSnapshot, logAdminAction } = require("../utils/adminAudit");
const { cacheAside, invalidateProductCache, TTL } = require("../utils/cache");

const router = express.Router();

router.post("/", protect, admin, async (req, res) => {
  try {
    const actor = await getAdminActorSnapshot(req.user);
    const code = String(req.body?.code || "").trim().toUpperCase();
    const type = req.body?.type;
    const value = Number(req.body?.value || 0);
    const minOrder = Math.max(0, Number(req.body?.minOrder || 0));
    const expiresAt = req.body?.expiresAt ? new Date(req.body.expiresAt) : undefined;
    const assignedUserEmail = req.body?.assignedUserEmail ? String(req.body.assignedUserEmail).trim().toLowerCase() : null;
    const applicableProducts = Array.isArray(req.body?.applicableProducts) ? req.body.applicableProducts : [];

    if (!code) {
      return res.status(400).json({ message: "Coupon code is required" });
    }
    if (!["percentage", "fixed"].includes(type)) {
      return res.status(400).json({ message: "Invalid coupon type" });
    }
    if (Number.isNaN(value) || value <= 0) {
      return res.status(400).json({ message: "Discount value must be greater than 0" });
    }
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      return res.status(400).json({ message: "Invalid expiry date" });
    }
    if (assignedUserEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(assignedUserEmail)) {
        return res.status(400).json({ message: "Invalid user email format" });
      }
    }
    const mongoose = require("mongoose");
    for (const pId of applicableProducts) {
      if (!mongoose.Types.ObjectId.isValid(pId)) {
        return res.status(400).json({ message: "Invalid product selection" });
      }
    }

    const coupon = await Coupon.create({
      code,
      type,
      value,
      minOrder,
      expiresAt,
      assignedUserEmail,
      applicableProducts,
      lastUpdatedByName: actor.name,
      lastUpdatedByEmail: actor.email,
      lastUpdatedAt: new Date()
    });

    await logAdminAction({
      req,
      action: "coupon-created",
      entityType: "coupon",
      entityId: String(coupon._id || ""),
      entityLabel: coupon.code,
      summary: `Created coupon ${coupon.code}`,
      details: {
        type: coupon.type,
        value: Number(coupon.value || 0),
        minOrder: Number(coupon.minOrder || 0),
        assignedUserEmail,
        applicableProductsCount: applicableProducts.length
      }
    });

    invalidateProductCache();
    return res.json(coupon);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(400).json({ message: "Coupon already exists" });
    }
    return res.status(500).json({ message: "Failed to create coupon" });
  }
});
// Public: returns coupon details (no browser cache to prevent coupon configuration lag)
router.get("/", async (_req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    const publicCoupons = await cacheAside("coupons:public", TTL.COUPONS_PUBLIC, async () => {
      const coupons = await Coupon.find().sort({ createdAt: -1 });
      return coupons.map((c) => ({
        _id: c._id,
        code: c.code,
        type: c.type,
        value: c.value,
        minOrder: c.minOrder || 0,
        expiresAt: c.expiresAt || null
      }));
    });
    res.json(publicCoupons);
  } catch {
    res.status(500).json({ message: "Failed to load coupons" });
  }
});

// Admin: returns full coupon details
router.get("/admin/all", protect, admin, async (_req, res) => {
  try {
    const coupons = await Coupon.find()
      .populate("applicableProducts", "name")
      .sort({ createdAt: -1 });
    res.json(coupons);
  } catch {
    res.status(500).json({ message: "Failed to load coupons" });
  }
});

router.delete("/:id", protect, admin, async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);
  await Coupon.findByIdAndDelete(req.params.id);

  if (coupon) {
    await logAdminAction({
      req,
      action: "coupon-deleted",
      entityType: "coupon",
      entityId: String(coupon._id || ""),
      entityLabel: coupon.code,
      summary: `Deleted coupon ${coupon.code}`,
      details: {
        type: coupon.type
      }
    });
  }

  invalidateProductCache();
  res.json({ message: "Coupon deleted" });
});

router.post("/apply", protect, async (req, res) => {
  const code = String(req.body?.code || "").trim().toUpperCase();
  const total = Number(req.body?.total || 0);
  const currency = normalizeCurrencyCode(req.body?.currency, "INR");
  const settings = await StoreSettings.findOne().lean();
  const currencyRates = settings?.currencyConversionRates || {};

  if (!code) {
    return res.status(400).json({ message: "Coupon code is required" });
  }

  if (Number.isNaN(total) || total < 0) {
    return res.status(400).json({ message: "Invalid order total" });
  }

  const coupon = await Coupon.findOne({ code });
  if (!coupon) {
    return res.status(400).json({ message: "Invalid coupon code" });
  }

  if (coupon.expiresAt && new Date() > coupon.expiresAt) {
    return res.status(400).json({ message: "Coupon expired" });
  }

  // Check if active
  if (coupon.isActive === false) {
    return res.status(400).json({ message: "Coupon is inactive" });
  }

  // Check usage limit
  if (coupon.usageLimit !== null && coupon.usageLimit !== undefined && coupon.usageCount >= coupon.usageLimit) {
    return res.status(400).json({ message: "Coupon usage limit has been reached" });
  }

  // 1. Check if user already used this coupon
  if (coupon.usedBy && coupon.usedBy.some((uId) => String(uId) === String(req.user))) {
    return res.status(400).json({ message: "You have already used this coupon code" });
  }

  // 2. Check if user email matches assignment
  if (coupon.assignedUserEmail) {
    const user = await User.findById(req.user).select("email").lean();
    if (String(coupon.assignedUserEmail).toLowerCase() !== String(user?.email || "").toLowerCase()) {
      return res.status(400).json({ message: "This coupon is gifted/assigned to another user's account" });
    }
  }

  // 3. Product-restricted check
  if (Array.isArray(coupon.applicableProducts) && coupon.applicableProducts.length > 0) {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const matchingItems = items.filter((item) => {
      const itemId = String(item.product || item._id || item.id || "");
      return coupon.applicableProducts.some((pId) => String(pId) === itemId);
    });

    if (matchingItems.length === 0) {
      return res.status(400).json({ message: "This coupon code is not applicable to the products in your cart" });
    }

    const matchingTotal = matchingItems.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1),
      0
    );
    const minOrder = roundMoney(convertCurrencyAmount(Number(coupon.minOrder || 0), { currency, rates: currencyRates }));

    if (matchingTotal < minOrder) {
      return res.status(400).json({
        message: `Minimum order for qualifying products is ${minOrder} ${currency}`
      });
    }

    let discount = 0;
    if (coupon.type === "percentage") {
      discount = (matchingTotal * Number(coupon.value || 0)) / 100;
    } else if (coupon.type === "fixed") {
      discount = convertCurrencyAmount(Number(coupon.value || 0), { currency, rates: currencyRates });
    }

    const safeDiscount = Math.max(0, Math.min(matchingTotal, discount));
    return res.json({
      discount: safeDiscount,
      newTotal: Math.max(0, total - safeDiscount),
      currency
    });
  }

  const minOrder = roundMoney(convertCurrencyAmount(Number(coupon.minOrder || 0), { currency, rates: currencyRates }));

  if (total < minOrder) {
    return res.status(400).json({
      message: `Minimum order ${minOrder} ${currency}`
    });
  }

  let discount = 0;
  if (coupon.type === "percentage") {
    discount = (total * Number(coupon.value || 0)) / 100;
  } else if (coupon.type === "fixed") {
    discount = convertCurrencyAmount(Number(coupon.value || 0), { currency, rates: currencyRates });
  }

  const safeDiscount = Math.max(0, Math.min(total, discount));
  return res.json({
    discount: safeDiscount,
    newTotal: Math.max(0, total - safeDiscount),
    currency
  });
});

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

module.exports = router;
