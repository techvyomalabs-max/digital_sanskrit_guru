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
    // Which copy of the order line this code is (0, 1, 2 ...) when several copies were bought
    copyIndex: {
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

giftPassSchema.index({ order: 1, product: 1, lineIndex: 1, copyIndex: 1 }, { unique: true });
giftPassSchema.index({ buyer: 1, createdAt: -1 });
giftPassSchema.index({ redeemedBy: 1, isRedeemed: 1 });

const GiftPass = mongoose.model("GiftPass", giftPassSchema);

/**
 * One-time index change for multiple copies: the old unique index allowed only one code per
 * order line, so it is dropped and replaced by one that includes copyIndex. Safe to run on every
 * start; does nothing once done.
 */
GiftPass.migrateCopyIndex = async function migrateCopyIndex() {
  try {
    const indexes = await GiftPass.collection.indexes();
    if (indexes.some((ix) => ix.name === "order_1_product_1_lineIndex_1")) {
      await GiftPass.collection.dropIndex("order_1_product_1_lineIndex_1");
      console.log("[GiftPass] Dropped the one-code-per-line index (multiple copies).");
    }
    await GiftPass.createIndexes();
  } catch (err) {
    if (err?.codeName === "NamespaceNotFound" || err?.code === 26) return;
    console.error("[GiftPass] Index migration failed:", err.message);
  }
};

module.exports = GiftPass;
