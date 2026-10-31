const express = require("express");
const Product = require("../models/Product");
const Coupon = require("../models/Coupon");
const User = require("../models/User");
const protect = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");
const { requireAdminPage } = require("../middleware/adminMiddleware");
const { logAdminAction } = require("../utils/adminAudit");
const { invalidateProductCache } = require("../utils/cache");
const { TYPES, trashFilter, parsePaging, mergeTrashPage } = require("../utils/trashList");

const router = express.Router();

// GET /api/trash - Fetch soft-deleted items with permission filtering (ADMIN)
router.get("/", protect, admin, (req, res, next) => {
  const pages = Array.isArray(req.allowedPages) ? req.allowedPages : [];
  const canAccess = req.adminLevel === 1 || pages.includes("products") || pages.includes("coupons") || pages.includes("users");
  if (canAccess) return next();
  return res.status(403).json({ message: "Access denied. Insufficient permissions to view Recycle Bin." });
}, async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");

    const pages = Array.isArray(req.allowedPages) ? req.allowedPages : [];
    const isSuper = req.adminLevel === 1;
    const canSeeProducts = isSuper || pages.includes("products") || pages.includes("add-products");
    const canSeeCoupons = isSuper || pages.includes("coupons");
    const canSeeUsers = isSuper || pages.includes("users");

    // One page at a time, newest first. Only the fields shown are read, and each collection
    // gives at most page*limit items, so a full bin no longer loads every deleted record.
    const { page, limit, type, search } = parsePaging(req.query);
    const models = { product: Product, coupon: Coupon, user: User };
    const fields = {
      product: "_id name price category deletedAt updatedAt deletedBy",
      coupon: "_id code type value usageCount deletedAt updatedAt deletedBy",
      user: "_id name email isAdmin adminRole deletedAt updatedAt deletedBy"
    };
    const visible = { product: canSeeProducts, coupon: canSeeCoupons, user: canSeeUsers };
    const wanted = TYPES.filter((t) => visible[t] && (type === "all" || type === t));

    const countFor = (t, filter) => (visible[t] ? models[t].countDocuments(filter) : Promise.resolve(0));
    const [products, coupons, users, ...matchingCounts] = await Promise.all([
      countFor("product", { isDeleted: true }),
      countFor("coupon", { isDeleted: true }),
      countFor("user", { isDeleted: true }),
      ...wanted.map((t) => models[t].countDocuments(trashFilter(t, search)))
    ]);
    const lists = {};
    await Promise.all(
      wanted.map(async (t) => {
        lists[t] = await models[t]
          .find(trashFilter(t, search))
          .select(fields[t])
          .sort({ deletedAt: -1, updatedAt: -1, _id: -1 })
          .limit(page * limit)
          .lean();
      })
    );

    const result = mergeTrashPage(lists, {
      page,
      limit,
      matching: matchingCounts.reduce((sum, n) => sum + n, 0)
    });

    res.json({
      ...result,
      summary: { total: products + coupons + users, products, coupons, users }
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch trash items", error: error.message });
  }
});

// POST /api/trash/restore-all - Restore all soft-deleted items (SUPER ADMIN)
router.post("/restore-all", protect, admin, admin.requireSuperAdmin, async (req, res) => {
  try {
    const [pRes, cRes, uRes] = await Promise.all([
      Product.updateMany({ isDeleted: true }, { isDeleted: false, deletedAt: null, deletedBy: { name: "", email: "" } }),
      Coupon.updateMany({ isDeleted: true }, { isDeleted: false, deletedAt: null, deletedBy: { name: "", email: "" } }),
      User.updateMany({ isDeleted: true }, { isDeleted: false, deletedAt: null, deletedBy: { name: "", email: "" } })
    ]);

    await logAdminAction({
      req,
      action: "trash-restored-all",
      entityType: "trash",
      entityId: "all",
      entityLabel: "All Trash Items",
      summary: `Restored ${pRes.modifiedCount} products, ${cRes.modifiedCount} coupons, and ${uRes.modifiedCount} users from Recycle Bin`
    });

    invalidateProductCache();
    res.json({ message: `Restored ${pRes.modifiedCount} products, ${cRes.modifiedCount} coupons, and ${uRes.modifiedCount} users` });
    try {
      await require("./productRoutes").syncAllOptionParents();
    } catch (syncErr) {
      console.error("Failed to sync option parents after restore-all:", syncErr);
    }
  } catch (error) {
    res.status(500).json({ message: "Failed to restore all items", error: error.message });
  }
});

// DELETE /api/trash/empty - Permanently delete all soft-deleted items (SUPER ADMIN)
router.delete("/empty", protect, admin, admin.requireSuperAdmin, async (req, res) => {
  try {
    const [pRes, cRes, uRes] = await Promise.all([
      Product.deleteMany({ isDeleted: true }),
      Coupon.deleteMany({ isDeleted: true }),
      User.deleteMany({ isDeleted: true })
    ]);

    await logAdminAction({
      req,
      action: "trash-emptied",
      entityType: "trash",
      entityId: "all",
      entityLabel: "Empty Recycle Bin",
      summary: `Permanently purged ${pRes.deletedCount} products, ${cRes.deletedCount} coupons, and ${uRes.deletedCount} users from Recycle Bin`
    });

    invalidateProductCache();
    res.json({ message: `Permanently purged ${pRes.deletedCount} products, ${cRes.deletedCount} coupons, and ${uRes.deletedCount} users` });
    try {
      await require("./productRoutes").syncAllOptionParents();
    } catch (syncErr) {
      console.error("Failed to sync option parents after empty trash:", syncErr);
    }
  } catch (error) {
    res.status(500).json({ message: "Failed to empty trash", error: error.message });
  }
});

module.exports = router;
