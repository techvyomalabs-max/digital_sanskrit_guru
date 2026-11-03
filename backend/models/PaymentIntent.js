const mongoose = require("mongoose");

const paymentIntentSchema = new mongoose.Schema(
  {
    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    amountMinor: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: "INR",
      trim: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    mode: {
      type: String,
      enum: ["checkout", "retry"],
      default: "checkout"
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null
    },
    razorpayPaymentId: {
      type: String,
      default: "",
      trim: true
    },
    status: {
      type: String,
      enum: ["created", "captured", "linked", "orphan", "refunding", "refunded", "resolved"],
      default: "created"
    },
    capturedAt: {
      type: Date,
      default: null
    },
    orphanedAt: {
      type: Date,
      default: null
    },
    alertSentAt: {
      type: Date,
      default: null
    },
    resolvedAt: {
      type: Date,
      default: null
    },
    resolvedBy: {
      type: String,
      default: "",
      trim: true
    },
    resolutionNote: {
      type: String,
      default: "",
      trim: true
    },
    refundId: {
      type: String,
      default: "",
      trim: true
    },
    // Failed tries on this checkout (from Razorpay's payment.failed webhook). The customer may
    // still pay successfully afterwards, in which case status moves on to captured/linked.
    failedAttempts: {
      type: Number,
      default: 0
    },
    lastFailure: {
      paymentId: { type: String, default: "" },
      code: { type: String, default: "" },
      description: { type: String, default: "" },
      reason: { type: String, default: "" },
      source: { type: String, default: "" },
      step: { type: String, default: "" },
      method: { type: String, default: "" },
      at: { type: Date, default: null }
    }
  },
  { timestamps: true }
);

// Index for background reconciliation sweep queries
paymentIntentSchema.index({ status: 1, capturedAt: 1 });

module.exports = mongoose.model("PaymentIntent", paymentIntentSchema);
