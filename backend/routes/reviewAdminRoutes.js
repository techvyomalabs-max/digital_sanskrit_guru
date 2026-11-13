const express = require("express");
const mongoose = require("mongoose");
const Review = require("../models/Review");
const Product = require("../models/Product");
const protect = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");
const { requireAdminPage } = require("../middleware/adminMiddleware");
const { logAdminAction } = require("../utils/adminAudit");
const { invalidateProductCache } = require("../utils/cache");
const { refreshProductReviewStats } = require("../utils/reviewStats");

const router = express.Router();

// Reviews are managed by admins who can manage products
router.use(protect, admin, requireAdminPage("products"));

const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// GET /api/admin/reviews?photos=1&q=&skip=0&limit=20 — newest first
router.get("/", async (req, res) => {
  try {
    const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const filter = {};
    if (String(req.query.photos || "") === "1") filter["photos.0"] = { $exists: true };
    const q = String(req.query.q || "").trim().slice(0, 80);
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      const products = await Product.find({ name: rx }).select("_id").limit(200).lean();
      filter.$or = [{ userName: rx }, { comment: rx }, { product: { $in: products.map((p) => p._id) } }];
    }
    const [total, reviews] = await Promise.all([
      Review.countDocuments(filter),
      Review.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("product", "name slug image")
        .lean()
    ]);
    res.json({
      total,
      reviews: reviews.map((r) => ({
        _id: r._id,
        userName: r.userName,
        rating: r.rating,
        comment: r.comment,
        photos: Array.isArray(r.photos) ? r.photos : [],
        verifiedPurchase: r.verifiedPurchase === true,
        createdAt: r.createdAt,
        product: r.product ? { _id: r.product._id, name: r.product.name, slug: r.product.slug, image: r.product.image } : null
      }))
    });
  } catch (error) {
    res.status(500).json({ message: "Could not load reviews." });
  }
});

// DELETE /api/admin/reviews/:reviewId/photos  body { url } — hide one photo from a review
router.delete("/:reviewId/photos", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.reviewId)) {
      return res.status(400).json({ message: "Invalid review" });
    }
    const url = String(req.body?.url || "").trim();
    const review = await Review.findById(req.params.reviewId);
    if (!review) return res.status(404).json({ message: "Review not found" });
    if (!review.photos.includes(url)) return res.status(404).json({ message: "Photo not found on this review" });
    review.photos = review.photos.filter((p) => p !== url);
    await review.save();
    invalidateProductCache();
    await logAdminAction({
      req,
      action: "review-photo-removed",
      entityType: "review",
      entityId: String(review._id),
      entityLabel: review.userName,
      summary: `Removed a photo from ${review.userName}'s review`,
      details: { product: String(review.product), url }
    });
    res.json({ _id: review._id, photos: review.photos });
  } catch (error) {
    res.status(500).json({ message: "Could not remove the photo." });
  }
});

// DELETE /api/admin/reviews/:reviewId — delete a review and update the product's rating
router.delete("/:reviewId", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.reviewId)) {
      return res.status(400).json({ message: "Invalid review" });
    }
    const review = await Review.findByIdAndDelete(req.params.reviewId).lean();
    if (!review) return res.status(404).json({ message: "Review not found" });

    // Also drop it from the product's short embedded copy of recent reviews
    const product = await Product.findById(review.product);
    if (product && Array.isArray(product.reviews)) {
      product.reviews = product.reviews.filter(
        (r) => !(r.user === review.userName && r.comment === review.comment && Number(r.rating) === Number(review.rating))
      );
      await product.save();
    }
    const stats = await refreshProductReviewStats({ productId: review.product, Product, Review });
    invalidateProductCache();
    await logAdminAction({
      req,
      action: "review-deleted",
      entityType: "review",
      entityId: String(review._id),
      entityLabel: review.userName,
      summary: `Deleted ${review.userName}'s ${review.rating}-star review`,
      details: { product: String(review.product), comment: String(review.comment || "").slice(0, 300) }
    });
    res.json({ deleted: true, rating: stats?.rating ?? 0, reviewsCount: stats?.reviewsCount ?? 0 });
  } catch (error) {
    res.status(500).json({ message: "Could not delete the review." });
  }
});

module.exports = router;
