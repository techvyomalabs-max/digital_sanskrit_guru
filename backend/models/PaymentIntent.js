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
    }
  },
  { timestamps: true }
);

// Index for background reconciliation sweep queries
paymentIntentSchema.index({ status: 1, capturedAt: 1 });

module.exports = mongoose.model("PaymentIntent", paymentIntentSchema);
