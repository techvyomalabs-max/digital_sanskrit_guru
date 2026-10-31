const express = require("express");
const Coupon = require("../models/Coupon");
const Product = require("../models/Product");
const StoreSettings = require("../models/StoreSettings");
const User = require("../models/User");
const { convertCurrencyAmount, normalizeCurrencyCode } = require("../utils/currency");
const protect = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");
const { requireAdminPage, requireSuperAdmin } = require("../middleware/adminMiddleware");
const { getAdminActorSnapshot, logAdminAction } = require("../utils/adminAudit");
const { cacheAside, invalidateProductCache, TTL } = require("../utils/cache");
const {
  parseFutureCouponExpiry,
  effectiveCouponExpiry,
  isCouponExpired,
  couponNotExpiredFilter
} = require("../utils/couponExpiry");
const { hasUsageLeft, usageLeftFilter, parseCouponValue, parseUsageLimit } = require("../utils/couponRules");

const router = express.Router();

router.post("/", protect, admin, requireAdminPage("coupons"), async (req, res) => {
  try {
    const actor = await getAdminActorSnapshot(req.user);
    const code = String(req.body?.code || "").trim().toUpperCase();
    const type = req.body?.type;
    const { value, error: valueError } = parseCouponValue(type, req.body?.value);
    const minOrder = roundMoney(Math.max(0, Number(req.body?.minOrder || 0)));
    const { expiresAt, error: expiryError } = parseFutureCouponExpiry(req.body?.expiresAt);
    const { usageLimit, error: usageLimitError } = parseUsageLimit(req.body?.usageLimit);
    const assignedUserEmail = req.body?.assignedUserEmail ? String(req.body.assignedUserEmail).trim().toLowerCase() : null;
    const applicableProducts = Array.isArray(req.body?.applicableProducts) ? req.body.applicableProducts : [];

    if (!code) {
      return res.status(400).json({ message: "Coupon code is required" });
    }
    if (!["percentage", "fixed"].includes(type)) {
      return res.status(400).json({ message: "Invalid coupon type" });
    }
    if (valueError) {
      return res.status(400).json({ message: valueError });
    }
    if (!Number.isFinite(minOrder)) {
      return res.status(400).json({ message: "Invalid minimum order" });
    }
    if (expiryError) {
      return res.status(400).json({ message: expiryError });
    }
    if (usageLimitError) {
      return res.status(400).json({ message: usageLimitError });
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
      expiresAt: expiresAt || undefined,
      usageLimit,
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
        usageLimit,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
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
// Public: returns active public coupon details (no browser cache to prevent coupon configuration lag)
router.get("/", async (_req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    const now = new Date();
    const publicCoupons = await cacheAside("coupons:public", TTL.COUPONS_PUBLIC, async () => {
      const coupons = await Coupon.find({
        isDeleted: { $ne: true },
        isActive: { $ne: false },
        $and: [
          {
            $or: [
              { assignedUserEmail: null },
              { assignedUserEmail: "" },
              { assignedUserEmail: { $exists: false } }
            ]
          },
          couponNotExpiredFilter(now),
          usageLeftFilter()
        ]
      }).sort({ createdAt: -1 }).lean();

      // Product-specific coupons carry their product ids (and names for labels), so the shop
      // only offers them for those products. Ids are kept even if a product was removed,
      // so a restricted coupon never turns into a storewide-looking one.
      const productIds = [...new Set(coupons.flatMap((c) => (c.applicableProducts || []).map(String)))];
      const names = productIds.length
        ? new Map(
            (await Product.find({ _id: { $in: productIds } }).select("name").lean()).map((p) => [String(p._id), p.name || ""])
          )
        : new Map();

      return coupons.map((c) => ({
        _id: c._id,
        code: c.code,
        type: c.type,
        value: c.value,
        minOrder: c.minOrder || 0,
        expiresAt: effectiveCouponExpiry(c.expiresAt),
        applicableProducts: (c.applicableProducts || []).map((id) => ({
          _id: String(id),
          name: names.get(String(id)) || ""
        }))
      }));
    });
    res.json(publicCoupons);
  } catch {
    res.status(500).json({ message: "Failed to load coupons" });
  }
});

// Admin: returns full coupon details
router.get("/admin/all", protect, admin, requireAdminPage("coupons"), async (_req, res) => {
  try {
    const coupons = await Coupon.find({ isDeleted: { $ne: true } })
      .populate("applicableProducts", "name")
      .sort({ createdAt: -1 })
      .lean();
    res.json(coupons.map((c) => ({ ...c, expiresAt: effectiveCouponExpiry(c.expiresAt) })));
  } catch {
    res.status(500).json({ message: "Failed to load coupons" });
  }
});

// Renew a coupon: new expiry, optional new usage limit, optionally let past customers use it again.
// Code, type, discount, minimum order and restrictions never change here, and past orders keep
// the discount they were charged.
router.patch("/:id/renew", protect, admin, requireAdminPage("coupons"), async (req, res) => {
  try {
    if (!require("mongoose").Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: "Coupon not found" });
    }
    const { expiresAt, error } = parseFutureCouponExpiry(req.body?.expiresAt);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const coupon = await Coupon.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).lean();
    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }

    const changeLimit = Object.prototype.hasOwnProperty.call(req.body || {}, "usageLimit");
    const usageCount = Number(coupon.usageCount || 0);
    const { usageLimit, error: usageLimitError } = changeLimit
      ? parseUsageLimit(req.body.usageLimit, usageCount)
      : { usageLimit: coupon.usageLimit ?? null };
    if (usageLimitError) {
      return res.status(400).json({ message: usageLimitError });
    }
    const resetCustomerUses = req.body?.resetCustomerUses === true;

    const actor = await getAdminActorSnapshot(req.user);
    const now = new Date();
    const set = {
      expiresAt,
      usageLimit,
      isActive: true,
      lastUpdatedByName: { $literal: actor.name || "" },
      lastUpdatedByEmail: { $literal: actor.email || "" },
      lastUpdatedAt: now
    };
    if (resetCustomerUses) {
      // Move the current customer list into history in the same write, so a checkout
      // claiming the coupon at this moment can't be lost.
      set.usedByResets = {
        $concatArrays: [
          { $ifNull: ["$usedByResets", []] },
          [{
            at: now,
            byName: { $literal: actor.name || "" },
            byEmail: { $literal: actor.email || "" },
            users: { $ifNull: ["$usedBy", []] }
          }]
        ]
      };
      set.usedBy = { $literal: [] };
    }

    const filter = { _id: coupon._id, isDeleted: { $ne: true } };
    if (usageLimit) {
      filter.usageCount = { $lt: usageLimit };
    }
    const updated = await Coupon.findOneAndUpdate(filter, [{ $set: set }], {
      returnDocument: "after",
      updatePipeline: true
    }).lean();
    if (!updated) {
      return res.status(409).json({ message: "Coupon was used again while saving. Refresh and try again." });
    }

    const previousExpiry = effectiveCouponExpiry(coupon.expiresAt);
    const customersReset = resetCustomerUses ? (coupon.usedBy || []).length : 0;
    await logAdminAction({
      req,
      action: "coupon-renewed",
      entityType: "coupon",
      entityId: String(updated._id || ""),
      entityLabel: updated.code,
      summary: `Renewed coupon ${updated.code} until ${expiresAt ? expiresAt.toISOString() : "no expiry"}`,
      details: {
        previousExpiresAt: previousExpiry ? previousExpiry.toISOString() : null,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        previousUsageLimit: coupon.usageLimit ?? null,
        usageLimit,
        usageCount,
        reactivated: coupon.isActive === false,
        customersAllowedAgain: customersReset
      }
    });

    invalidateProductCache();
    return res.json({ ...updated, expiresAt: effectiveCouponExpiry(updated.expiresAt) });
  } catch {
    return res.status(500).json({ message: "Failed to renew coupon" });
  }
});

// Soft delete coupon
router.delete("/:id", protect, admin, requireAdminPage("coupons"), async (req, res) => {
  const actor = await getAdminActorSnapshot(req.user);
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) {
    return res.status(404).json({ message: "Coupon not found" });
  }

  coupon.isDeleted = true;
  coupon.deletedAt = new Date();
  coupon.deletedBy = { name: actor.name, email: actor.email };
  await coupon.save();

  await logAdminAction({
    req,
    action: "coupon-soft-deleted",
    entityType: "coupon",
    entityId: String(coupon._id || ""),
    entityLabel: coupon.code,
    summary: `Soft-deleted coupon ${coupon.code}`,
    details: {
      type: coupon.type
    }
  });

  invalidateProductCache();
  res.json({ message: "Coupon moved to Recycle Bin" });
});

// Restore soft-deleted coupon
router.post("/:id/restore", protect, admin, requireAdminPage("coupons"), async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }

    coupon.isDeleted = false;
    coupon.deletedAt = null;
    coupon.deletedBy = { name: "", email: "" };
    await coupon.save();

    await logAdminAction({
      req,
      action: "coupon-restored",
      entityType: "coupon",
      entityId: String(coupon._id || ""),
      entityLabel: coupon.code,
      summary: `Restored coupon ${coupon.code}`
    });

    invalidateProductCache();
    res.json({ message: "Coupon restored successfully", coupon });
  } catch (error) {
    res.status(500).json({ message: "Failed to restore coupon", error: error.message });
  }
});

// Permanently purge coupon
router.delete("/:id/purge", protect, admin, requireAdminPage("coupons"), async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }

    await Coupon.findByIdAndDelete(req.params.id);

    await logAdminAction({
      req,
      action: "coupon-permanently-deleted",
      entityType: "coupon",
      entityId: String(coupon._id || ""),
      entityLabel: coupon.code,
      summary: `Permanently deleted coupon ${coupon.code}`
    });

    invalidateProductCache();
    res.json({ message: "Coupon permanently deleted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to purge coupon", error: error.message });
  }
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

  const coupon = await Coupon.findOne({ code, isDeleted: { $ne: true } });
  if (!coupon) {
    return res.status(400).json({ message: "Invalid coupon code" });
  }

  if (isCouponExpired(coupon.expiresAt)) {
    return res.status(400).json({ message: "Coupon expired" });
  }

  // Check if active
  if (coupon.isActive === false) {
    return res.status(400).json({ message: "Coupon is inactive" });
  }

  // Check usage limit
  if (!hasUsageLeft(coupon)) {
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
