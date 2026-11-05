const express = require("express");
const rateLimit = require("express-rate-limit");
const { perWorker } = require("../utils/workerCount");
const WpOrder = require("../models/WpOrder");
const protect = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");
const { requireAdminPage } = require("../middleware/adminMiddleware");
const StoreSettings = require("../models/StoreSettings");
const { logAdminAction } = require("../utils/adminAudit");
const {
  EXPORT_LIMITS,
  parseExportFilters,
  describeFilters,
  checkExportSize,
  buildWpOrderQuery,
  buildWpOrdersCsv,
  totalsByCurrency,
  buildWpInvoice
} = require("../utils/wpArchiveExport");
const { renderWpOrdersReportPdf, renderWpInvoicePdf } = require("../utils/wpArchivePdf");

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

    const query = buildWpOrderQuery({ search, status: statusFilter });

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

function exportFileStamp(date = new Date()) {
  const ist = new Date(date.getTime() + 330 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

// Exports read many orders at once, so each admin gets a modest number per 10 minutes
const exportLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: perWorker(20),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `wp-export:${String(req.user || "")}`,
  message: { message: "Too many exports in a short time. Please wait a few minutes and try again." }
});

/** Validates the filters and counts the matching orders. Sends the error response itself. */
async function prepareExport(req, res, format) {
  const { filters, error } = parseExportFilters(req.query);
  if (error) {
    res.status(400).json({ message: error });
    return null;
  }
  const query = buildWpOrderQuery(filters);
  const count = await WpOrder.countDocuments(query);
  const size = checkExportSize(format, count);
  if (!size.ok) {
    res.status(count > 0 ? 413 : 404).json({ message: size.message, count, limit: size.limit });
    return null;
  }
  return { filters, query, count };
}

// GET /api/admin/wp-archive/orders/export/preview — how many orders the filters match,
// and whether each format is within its limit (shown before the admin downloads)
router.get("/orders/export/preview", protect, admin, requireAdminPage("orders"), async (req, res) => {
  try {
    const { filters, error } = parseExportFilters(req.query);
    if (error) return res.status(400).json({ message: error });
    const count = await WpOrder.countDocuments(buildWpOrderQuery(filters));
    return res.json({
      success: true,
      count,
      limits: EXPORT_LIMITS,
      allowed: { csv: checkExportSize("csv", count).ok, pdf: checkExportSize("pdf", count).ok },
      filterLabel: describeFilters(filters)
    });
  } catch (error) {
    console.error("[WpArchive] Export preview failed:", error.message);
    return res.status(500).json({ message: "Failed to count WP Archive orders" });
  }
});

// GET /api/admin/wp-archive/orders/export.csv — every order matching the filters (up to the limit)
router.get("/orders/export.csv", protect, admin, requireAdminPage("orders"), exportLimiter, async (req, res) => {
  try {
    const prepared = await prepareExport(req, res, "csv");
    if (!prepared) return undefined;
    const { filters, query } = prepared;
    const orders = await WpOrder.find(query).sort({ wpOrderId: -1 }).limit(EXPORT_LIMITS.csv).lean();

    await logAdminAction({
      req,
      action: "wp-archive-exported",
      entityType: "wp-archive",
      entityId: "csv",
      entityLabel: "WP Archive CSV",
      summary: `Exported ${orders.length} WP archive orders as CSV (${describeFilters(filters)})`,
      details: { format: "csv", count: orders.length, filters }
    });

    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="wp-archive-orders-${exportFileStamp()}.csv"`,
      "Cache-Control": "private, no-store"
    });
    return res.send(buildWpOrdersCsv(orders));
  } catch (error) {
    console.error("[WpArchive] CSV export failed:", error.message);
    return res.status(500).json({ message: "Failed to export WP Archive orders" });
  }
});

// GET /api/admin/wp-archive/orders/export.pdf — printable report of the matching orders (up to the limit)
router.get("/orders/export.pdf", protect, admin, requireAdminPage("orders"), exportLimiter, async (req, res) => {
  try {
    const prepared = await prepareExport(req, res, "pdf");
    if (!prepared) return undefined;
    const { filters, query, count } = prepared;
    const orders = await WpOrder.find(query).sort({ wpOrderId: -1 }).limit(EXPORT_LIMITS.pdf).lean();

    const pdf = await renderWpOrdersReportPdf(orders, {
      filterLabel: describeFilters(filters),
      totalMatched: count,
      truncated: false,
      totals: totalsByCurrency(orders),
      generatedAt: new Date()
    });

    await logAdminAction({
      req,
      action: "wp-archive-exported",
      entityType: "wp-archive",
      entityId: "pdf",
      entityLabel: "WP Archive PDF",
      summary: `Exported ${orders.length} WP archive orders as PDF (${describeFilters(filters)})`,
      details: { format: "pdf", count: orders.length, filters }
    });

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="wp-archive-orders-${exportFileStamp()}.pdf"`,
      "Content-Length": pdf.length,
      "Cache-Control": "private, no-store"
    });
    return res.send(pdf);
  } catch (error) {
    console.error("[WpArchive] PDF export failed:", error.message);
    return res.status(500).json({ message: "Failed to export WP Archive orders" });
  }
});

// GET /api/admin/wp-archive/orders/:wpOrderId/invoice — invoice copy of one archived order
router.get("/orders/:wpOrderId/invoice", protect, admin, requireAdminPage("orders"), async (req, res) => {
  try {
    const numId = Number(req.params.wpOrderId);
    if (!Number.isInteger(numId) || numId <= 0) {
      return res.status(400).json({ message: "Invalid WP order number" });
    }
    const order = await WpOrder.findOne({ wpOrderId: numId }).lean();
    if (!order) {
      return res.status(404).json({ message: "WordPress Archive order not found" });
    }

    const settings = await StoreSettings.findOne().select("businessDetails").lean();
    const pdf = await renderWpInvoicePdf(buildWpInvoice(order, settings?.businessDetails || null));

    await logAdminAction({
      req,
      action: "wp-archive-invoice-downloaded",
      entityType: "wp-order",
      entityId: String(order._id),
      entityLabel: `WP #${numId}`,
      summary: `Downloaded invoice copy for WP order #${numId}`
    });

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="WP-Invoice-${numId}.pdf"`,
      "Content-Length": pdf.length,
      "Cache-Control": "private, no-store"
    });
    return res.send(pdf);
  } catch (error) {
    console.error("[WpArchive] Invoice PDF failed:", error.message);
    return res.status(500).json({ message: "Unable to create the invoice right now." });
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
