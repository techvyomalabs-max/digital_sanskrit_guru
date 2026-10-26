const mongoose = require("mongoose");

const giftPassSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },
    productName: {
      type: String,
      default: ""
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true
    },
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    isRedeemed: {
      type: Boolean,
      default: false
    },
    recipientEmail: {
      type: String,
      default: ""
    },
    redeemedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    redeemedAt: {
      type: Date,
      default: null
    },
    lineIndex: {
      type: Number,
      default: 0
    },
    isRevoked: {
      type: Boolean,
      default: false
    },
    revokedAt: {
      type: Date,
      default: null
    },
    revokedReason: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

giftPassSchema.index({ order: 1, product: 1, lineIndex: 1 }, { unique: true });
giftPassSchema.index({ redeemedBy: 1, isRedeemed: 1 });

module.exports = mongoose.model("GiftPass", giftPassSchema);
