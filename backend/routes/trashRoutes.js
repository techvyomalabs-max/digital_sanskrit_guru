const express = require("express");
const Product = require("../models/Product");
const Coupon = require("../models/Coupon");
const User = require("../models/User");
const protect = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");
const { requireAdminPage } = require("../middleware/adminMiddleware");
const { logAdminAction } = require("../utils/adminAudit");
const { invalidateProductCache } = require("../utils/cache");

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

    const [deletedProducts, deletedCoupons, deletedUsers] = await Promise.all([
      canSeeProducts ? Product.find({ isDeleted: true }).lean() : Promise.resolve([]),
      canSeeCoupons ? Coupon.find({ isDeleted: true }).lean() : Promise.resolve([]),
      canSeeUsers ? User.find({ isDeleted: true }).lean() : Promise.resolve([])
    ]);

    const formattedProducts = deletedProducts.map((p) => ({
      _id: String(p._id),
      entityType: "product",
      name: p.name || "Unnamed Product",
      category: p.category || "General",
      deletedAt: p.deletedAt || p.updatedAt || new Date(),
      deletedBy: p.deletedBy?.name ? `${p.deletedBy.name} (${p.deletedBy.email})` : p.deletedBy?.email || "Admin",
      details: `Price: ₹${p.price || 0} | Category: ${p.category || "General"}`
    }));

    const formattedCoupons = deletedCoupons.map((c) => ({
      _id: String(c._id),
      entityType: "coupon",
      name: `Coupon Code: ${c.code}`,
      category: "Coupon",
      deletedAt: c.deletedAt || c.updatedAt || new Date(),
      deletedBy: c.deletedBy?.name ? `${c.deletedBy.name} (${c.deletedBy.email})` : c.deletedBy?.email || "Admin",
      details: `Type: ${c.type} | Value: ${c.value} | Uses: ${c.usageCount || 0}`
    }));

    const formattedUsers = deletedUsers.map((u) => ({
      _id: String(u._id),
      entityType: "user",
      name: u.name || "User",
      category: u.isAdmin ? "Admin User" : "Customer",
      deletedAt: u.deletedAt || u.updatedAt || new Date(),
      deletedBy: u.deletedBy?.name ? `${u.deletedBy.name} (${u.deletedBy.email})` : u.deletedBy?.email || "Admin",
      details: `Email: ${u.email} | Role: ${u.isAdmin ? u.adminRole || "Admin" : "Customer"}`
    }));

    const allTrash = [...formattedProducts, ...formattedCoupons, ...formattedUsers].sort(
      (a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime()
    );

    res.json({
      trash: allTrash,
      summary: {
        total: allTrash.length,
        products: formattedProducts.length,
        coupons: formattedCoupons.length,
        users: formattedUsers.length
      }
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
  } catch (error) {
    res.status(500).json({ message: "Failed to empty trash", error: error.message });
  }
});

module.exports = router;
