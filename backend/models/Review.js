const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },
    userName: {
      type: String,
      required: true,
      trim: true
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      default: "",
      trim: true
    },
    // The customer's own photos (public links to our storage), only from verified buyers
    photos: {
      type: [String],
      default: []
    },
    // The reviewer had a paid order with this product when they wrote the review
    verifiedPurchase: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

// Compound index for paginated "latest reviews for this product" queries
reviewSchema.index({ product: 1, createdAt: -1 });
// Admin "reviews with photos" list
reviewSchema.index({ "photos.0": 1, createdAt: -1 });

module.exports = mongoose.model("Review", reviewSchema);
