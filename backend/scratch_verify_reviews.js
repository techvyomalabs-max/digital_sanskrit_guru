/**
 * scratch_verify_reviews.js
 * 
 * End-to-end QA verification test for product reviews standalone migration.
 * Creates a mock product, registers a test user, submits 3 reviews via HTTP endpoints,
 * queries product details, and asserts exact counts and averages.
 * 
 * Run using: node backend/scratch_verify_reviews.js
 */

const axios = require("axios");
const mongoose = require("mongoose");
require("dotenv").config();

const Product = require("./models/Product");
const Review = require("./models/Review");
const User = require("./models/User");

const BASE_URL = "http://localhost:5001";

async function verify() {
  console.log("Starting E2E QA Verification for standalone reviews...");

  // 1. Connect to DB to insert mock product and handle cleanup
  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/digital_sanskrit_guru_v2";
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB.");

  // Clean up any previous test artifacts
  await Product.deleteMany({ name: "QA E2E Standalone Review Test Product" });
  await User.deleteMany({ email: "qa_tester_reviews@sanskrit.guru" });

  // Create mock product directly in DB
  const product = await Product.create({
    name: "QA E2E Standalone Review Test Product",
    price: 399,
    description: "Mock product description for QA testing",
    category: "Sanskrit",
    stock: 50,
    rating: 0,
    reviewsCount: 0,
    reviews: [] // empty embedded array
  });
  console.log(`Created mock product: ${product.name} (ID: ${product._id})`);

  try {
    // 2. Register a temporary tester user via real HTTP endpoint
    const userPayload = {
      name: "QA Review Tester",
      email: "qa_tester_reviews@sanskrit.guru",
      password: "SecurityPass123!",
      rememberMe: false
    };

    console.log("Registering temporary user via real POST /api/auth/register endpoint...");
    const regRes = await axios.post(`${BASE_URL}/api/auth/register`, userPayload);
    const token = regRes.data.token;
    const userId = regRes.data._id;
    console.log(`User registered successfully. ID: ${userId}, Token: [redacted]`);

    // 3. Submit 3 reviews through the real POST endpoints
    const headers = { Authorization: `Bearer ${token}` };
    const reviewDataList = [
      { rating: 4, comment: "Excellent material, very clean print!" },
      { rating: 5, comment: "Extremely helpful, highly recommended!" },
      { rating: 3, comment: "Decent book but expected more diagrams." }
    ];

    for (let i = 0; i < reviewDataList.length; i++) {
      const data = reviewDataList[i];
      console.log(`Submitting review ${i + 1}/3 (Rating: ${data.rating})...`);
      await axios.post(`${BASE_URL}/api/products/${product._id}/reviews`, data, { headers });
    }

    // 4. Fetch the product details via real GET endpoint to confirm reviews load
    console.log(`Fetching product details via GET /api/products/${product._id}...`);
    const getRes = await axios.get(`${BASE_URL}/api/products/${product._id}`);
    const updatedProduct = getRes.data;

    // 5. Assertions
    console.log("================================================================");
    console.log("RUNNING VERIFICATION ASSERTIONS:");

    const expectedRating = 4.0; // (4 + 5 + 3) / 3 = 4.0
    const expectedCount = 3;

    console.log(`- Product Rating: Expected ${expectedRating}, got ${updatedProduct.rating}`);
    console.log(`- Reviews Count: Expected ${expectedCount}, got ${updatedProduct.reviewsCount}`);
    console.log(`- Reviews Array length in response: Expected ${expectedCount}, got ${updatedProduct.reviews.length}`);

    if (updatedProduct.rating !== expectedRating) {
      throw new Error(`Rating mismatch! Expected ${expectedRating}, got ${updatedProduct.rating}`);
    }
    if (updatedProduct.reviewsCount !== expectedCount) {
      throw new Error(`ReviewsCount mismatch! Expected ${expectedCount}, got ${updatedProduct.reviewsCount}`);
    }
    if (updatedProduct.reviews.length !== expectedCount) {
      throw new Error(`Reviews length mismatch! Expected ${expectedCount}, got ${updatedProduct.reviews.length}`);
    }

    // Check if the user name matches
    updatedProduct.reviews.forEach((r, idx) => {
      console.log(`  * Review ${idx + 1}: User "${r.user}", Rating: ${r.rating}, Comment: "${r.comment}"`);
      if (r.user !== "QA Review Tester") {
        throw new Error(`User name mismatch! Expected "QA Review Tester", got "${r.user}"`);
      }
    });

    // 6. Verify standalone Review collection documents exist in DB
    const dbReviewsCount = await Review.countDocuments({ product: product._id });
    console.log(`- Standalone database Review records found: Expected ${expectedCount}, got ${dbReviewsCount}`);
    if (dbReviewsCount !== expectedCount) {
      throw new Error(`Database Review documents count mismatch! Expected ${expectedCount}, got ${dbReviewsCount}`);
    }

    console.log("✅ E2E VERIFICATION TEST PASSED SUCCESSFULLY!");
    console.log("================================================================");
  } catch (err) {
    console.error("❌ E2E VERIFICATION TEST FAILED:", err.response?.data?.message || err.message);
    process.exitCode = 1;
  } finally {
    // 7. DB Cleanup
    console.log("Cleaning up mock database test records...");
    await Product.deleteMany({ name: "QA E2E Standalone Review Test Product" });
    await Review.deleteMany({ product: product._id });
    await User.deleteMany({ email: "qa_tester_reviews@sanskrit.guru" });
    console.log("Cleanup done.");

    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

verify().catch((err) => {
  console.error("Fatal E2E verify error:", err);
  process.exit(1);
});
