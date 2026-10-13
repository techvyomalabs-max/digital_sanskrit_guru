const express = require("express");
const WpOrder = require("../models/WpOrder");
const protect = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");
const { requireAdminPage } = require("../middleware/adminMiddleware");

const router = express.Router();

// GET /api/admin/wp-archive/stats — Summary statistics for WordPress era
router.get("/stats", protect, admin, requireAdminPage("orders"), async (req, res) => {
  try {
    const [totalOrders, totalRevenueResult, deliveredCount, customerCount] = await Promise.all([
      WpOrder.countDocuments(),
      WpOrder.aggregate([
        { $match: { paymentStatus: "Paid" } },
        { $group: { _id: "$currencyDisplay.currency", totalRevenue: { $sum: "$total" } } }
      ]),
      WpOrder.countDocuments({ status: "Delivered" }),
      WpOrder.distinct("billingEmail")
    ]);

    const revenueByCurrency = {};
    for (const r of totalRevenueResult) {
      const curr = r._id || "INR";
      revenueByCurrency[curr] = Math.round(r.totalRevenue || 0);
    }

    res.json({
      success: true,
      totalOrders,
      deliveredCount,
      uniqueCustomers: customerCount.length,
      revenueByCurrency
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to load WP Archive stats", error: error.message });
  }
});

// GET /api/admin/wp-archive/orders — Search and paginated list of WP Archive Orders
router.get("/orders", protect, admin, requireAdminPage("orders"), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
    const search = String(req.query.search || "").trim();
    const statusFilter = String(req.query.status || "All").trim();

    const query = {};

    if (statusFilter !== "All") {
      query.status = statusFilter;
    }

    const escapeRegex = (str) => String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    if (search) {
      const cleanSearch = search.replace(/^#/g, "").trim();
      const safeSearch = escapeRegex(cleanSearch);
      const numId = Number(cleanSearch);

      if (!isNaN(numId) && cleanSearch.length < 10) {
        query.$or = [
          { wpOrderId: numId },
          { billingEmail: { $regex: safeSearch, $options: "i" } },
          { billingName: { $regex: safeSearch, $options: "i" } },
          { billingPhone: { $regex: safeSearch, $options: "i" } }
        ];
      } else {
        query.$or = [
          { billingEmail: { $regex: safeSearch, $options: "i" } },
          { billingName: { $regex: safeSearch, $options: "i" } },
          { billingPhone: { $regex: safeSearch, $options: "i" } },
          { couponCode: { $regex: safeSearch, $options: "i" } },
          { transactionId: { $regex: safeSearch, $options: "i" } }
        ];
      }
    }

    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      WpOrder.find(query)
        .sort({ wpOrderId: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WpOrder.countDocuments(query)
    ]);

    res.json({
      success: true,
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to search WP Archive orders", error: error.message });
  }
});

// GET /api/admin/wp-archive/orders/:wpOrderId — Get detailed view of single WP order
router.get("/orders/:wpOrderId", protect, admin, requireAdminPage("orders"), async (req, res) => {
  try {
    const numId = Number(req.params.wpOrderId);
    const order = await WpOrder.findOne({ wpOrderId: numId }).lean();

    if (!order) {
      return res.status(404).json({ message: "WordPress Archive order not found" });
    }

    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ message: "Failed to load WP order details", error: error.message });
  }
});

module.exports = router;
