const mongoose = require("mongoose");

const emailLogSchema = new mongoose.Schema(
  {
    to: { type: String, required: true, trim: true },
    subject: { type: String, default: "", trim: true },
    type: {
      type: String,
      enum: [
        "order-confirm",
        "status-update",
        "campaign",
        "low-stock-admin",
        "wishlist-alert",
        "wishlist-reminder",
        "broadcast",
        "test",
        "password-reset",
        "gift-pass",
        "bulk-enquiry",
        "support-interest",
        "welcome-credentials",
        "access-granted",
        "access-pending-admin",
        "orphan-payment-admin",
        "refund-update",
        "return-status"
      ],
      default: "campaign"
    },
    // Which SMTP server sent it: "transactional" or "marketing" (empty on older entries)
    stream: { type: String, default: "" },
    orderId: { type: String, default: "" },
    productId: { type: String, default: "" },
    status: { type: String, enum: ["sent", "failed"], default: "sent" },
    error: { type: String, default: "" },
    sentAt: { type: Date, default: Date.now }
  },
  { timestamps: false }
);

emailLogSchema.index({ sentAt: -1 });
emailLogSchema.index({ type: 1, sentAt: -1 });

module.exports = mongoose.model("EmailLog", emailLogSchema);
