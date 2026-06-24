const mongoose = require("mongoose");

/**
 * Server-side wishlist per user.
 * Mirrors the localStorage wishlist so the backend can answer:
 * "which users have product X wishlisted?" for low-stock alerts.
 *
 * productIds stores ObjectId refs but we keep it as a plain array
 * (not populated) because we only need the IDs for lookups.
 */
const wishlistSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true
    },
    productIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product"
      }
    ]
  },
  { timestamps: true }
);

wishlistSchema.index({ productIds: 1 });

module.exports = mongoose.model("Wishlist", wishlistSchema);
