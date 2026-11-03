const express = require("express");
const mongoose = require("mongoose");
const SupportInterest = require("../models/SupportInterest");
const protect = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");
const { requireAdminPage } = require("../middleware/adminMiddleware");
const { honeypotMiddleware, turnstileMiddleware, supportInterestLimiter } = require("../utils/spamFilter");
const { logAdminAction } = require("../utils/adminAudit");
const { sendSupportInterestEmail } = require("../utils/email");
const {
  SUPPORT_STATUSES,
  supportTypeLabel,
  validateSupportInterest,
  validateSupportInterestUpdate
} = require("../utils/supportInterest");

const router = express.Router();

// POST /api/support-interest (PUBLIC) - the "Support us" form
router.post("/", supportInterestLimiter, honeypotMiddleware, turnstileMiddleware, async (req, res) => {
  try {
    const result = validateSupportInterest(req.body);
    if (!result.ok) {
      return res.status(400).json({ message: "Please check the highlighted fields.", errors: result.errors });
    }

    const saved = await SupportInterest.create(result.value);

    // The request is already saved, so a mail problem must not fail it
    sendSupportInterestEmail({ ...result.value, supportTypeLabel: supportTypeLabel(result.value.supportType) }).catch((error) => {
      console.error("[SupportInterest] Notification email failed:", error?.message || error);
    });

    return res.status(201).json({ message: "Thank you! Our team will get in touch with you soon.", id: saved._id });
  } catch (error) {
    console.error("[SupportInterest] Save failed:", error?.message || error);
    return res.status(500).json({ message: "We could not send your request just now. Please try again in a moment." });
  }
});

// GET /api/support-interest/admin (ADMIN) - list, newest first
router.get("/admin", protect, admin, requireAdminPage("marketing"), async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const status = SUPPORT_STATUSES.includes(req.query.status) ? req.query.status : "";
    const filter = status ? { status } : {};

    const [items, total, grouped] = await Promise.all([
      SupportInterest.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      SupportInterest.countDocuments(filter),
      SupportInterest.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }])
    ]);

    const counts = Object.fromEntries(SUPPORT_STATUSES.map((s) => [s, 0]));
    for (const row of grouped) counts[row._id] = row.count;

    return res.json({
      items: items.map((item) => ({ ...item, supportTypeLabel: supportTypeLabel(item.supportType) })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      counts
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load support requests." });
  }
});

// PATCH /api/support-interest/admin/:id (ADMIN) - change status or note
router.patch("/admin/:id", protect, admin, requireAdminPage("marketing"), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid request ID." });
    }

    const result = validateSupportInterestUpdate(req.body);
    if (!result.ok) {
      return res.status(400).json({ message: Object.values(result.errors)[0], errors: result.errors });
    }

    const existing = await SupportInterest.findById(req.params.id).lean();
    if (!existing) return res.status(404).json({ message: "Support request not found." });

    const update = { ...result.update };
    if (update.status && update.status !== existing.status) update.statusChangedAt = new Date();

    const updated = await SupportInterest.findByIdAndUpdate(req.params.id, { $set: update }, { returnDocument: "after" }).lean();

    await logAdminAction({
      req,
      action: "support_interest.update",
      entityType: "support_interest",
      entityId: String(updated._id),
      entityLabel: `${updated.name} <${updated.email}>`,
      summary: update.status && update.status !== existing.status
        ? `Support request marked ${update.status}`
        : "Support request note updated",
      details: { from: { status: existing.status }, to: { status: updated.status }, noteChanged: update.adminNote !== undefined }
    });

    return res.json({ item: { ...updated, supportTypeLabel: supportTypeLabel(updated.supportType) } });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update the support request." });
  }
});

module.exports = router;
