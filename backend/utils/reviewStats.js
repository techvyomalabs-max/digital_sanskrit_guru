"use strict";

/**
 * Recomputes a product's average rating and review count from the Reviews collection and
 * saves them on the product. Returns { rating, reviewsCount }.
 */
async function refreshProductReviewStats({ productId, Product, Review }) {
  const product = await Product.findById(productId);
  if (!product) return null;
  const stats = await Review.aggregate([
    { $match: { product: product._id } },
    { $group: { _id: "$product", avgRating: { $avg: "$rating" }, count: { $sum: 1 } } }
  ]);
  const rating = stats[0] ? Math.round(stats[0].avgRating * 10) / 10 : 0;
  const reviewsCount = stats[0] ? stats[0].count : 0;
  product.rating = rating;
  product.reviewsCount = reviewsCount;
  await product.save();
  return { rating, reviewsCount, product };
}

module.exports = { refreshProductReviewStats };
