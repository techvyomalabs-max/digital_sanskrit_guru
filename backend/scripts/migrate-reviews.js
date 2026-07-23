/**
 * migrate-reviews.js
 * 
 * Migration script to move product reviews from embedded sub-documents
 * inside the Product model to a standalone Reviews collection in MongoDB.
 * 
 * Run using: node backend/scripts/migrate-reviews.js
 */

const mongoose = require("mongoose");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const Product = require("../models/Product");
const Review = require("../models/Review");

console.log("================================================================");
console.log("⚠️  WARNING: DATABASE MIGRATION SCRIPT  ⚠️");
console.log("Please ensure you have taken a full database backup (mongodump)");
console.log("before running this script in a production environment!");
console.log("================================================================");

async function run() {
  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/digital_sanskrit_guru_v2";
  console.log(`Connecting to database: ${mongoUri}...`);
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB successfully.");

  let processedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  // Use a cursor to stream products without loading all of them in memory at once
  const cursor = Product.find().cursor();

  for (let product = await cursor.next(); product != null; product = await cursor.next()) {
    const productId = product._id;
    const embeddedReviews = Array.isArray(product.reviews) ? product.reviews : [];

    console.log(`[Product ${productId}] Found ${embeddedReviews.length} embedded review(s). Checking status...`);

    try {
      // Idempotency check: see if we already have records in the Reviews collection for this product
      const existingReviewsCount = await Review.countDocuments({ product: productId });

      if (existingReviewsCount > 0) {
        console.log(`[Product ${productId}] Skipping: Already has ${existingReviewsCount} review(s) in standalone collection.`);
        skippedCount++;
        continue;
      }

      if (embeddedReviews.length === 0) {
        // No reviews to migrate, but let's reset cached stats if needed
        await Product.updateOne(
          { _id: productId },
          { $set: { rating: 0, reviewsCount: 0 } }
        );
        console.log(`[Product ${productId}] Updated: 0 reviews.`);
        processedCount++;
        continue;
      }

      // Prepare standalone review documents
      const reviewDocs = embeddedReviews.map((rev) => {
        return {
          product: productId,
          user: null, // Historical review - user ID reference is unknown
          userName: String(rev.user || "Customer").trim(),
          rating: Number(rev.rating || 5),
          comment: String(rev.comment || "").trim(),
          createdAt: rev.createdAt || product.createdAt || new Date(),
          updatedAt: rev.updatedAt || product.createdAt || new Date()
        };
      });

      // Insert all reviews for this product into the Review collection
      await Review.insertMany(reviewDocs);
      console.log(`[Product ${productId}] Successfully inserted ${reviewDocs.length} review(s) into separate collection.`);

      // Recalculate average rating & reviews count using MongoDB aggregation
      const stats = await Review.aggregate([
        { $match: { product: productId } },
        {
          $group: {
            _id: "$product",
            avgRating: { $avg: "$rating" },
            count: { $sum: 1 }
          }
        }
      ]);

      const avgRating = stats[0] ? Math.round(stats[0].avgRating * 10) / 10 : 0;
      const reviewsCount = stats[0] ? stats[0].count : 0;

      // Save aggregate cached stats to parent Product document (leaving embedded reviews untouched)
      await Product.updateOne(
        { _id: productId },
        {
          $set: {
            rating: avgRating,
            reviewsCount: reviewsCount
          }
        }
      );

      console.log(`[Product ${productId}] Aggregated: rating = ${avgRating}, count = ${reviewsCount}.`);
      processedCount++;
    } catch (err) {
      console.error(`❌ [Product ${productId}] Error during migration:`, err.message);
      errorCount++;
    }
  }

  console.log("================================================================");
  console.log("MIGRATION COMPLETE SUMMARY:");
  console.log(`- Products Migrated/Updated: ${processedCount}`);
  console.log(`- Products Skipped (Already Migrated): ${skippedCount}`);
  console.log(`- Failures/Errors encountered: ${errorCount}`);
  console.log("================================================================");

  await mongoose.disconnect();
  console.log("Disconnected from MongoDB.");
}

run().catch((err) => {
  console.error("Fatal migration error:", err);
  process.exit(1);
});
