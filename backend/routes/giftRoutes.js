const express = require("express");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const GiftPass = require("../models/GiftPass");
const Product = require("../models/Product");
const Order = require("../models/Order");
const protect = require("../middleware/authMiddleware");
const { PUBLIC_PRODUCT_EXCLUDE, toPublicProduct } = require("../utils/productProjection");

const router = express.Router();

const giftRedeemLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                  // max 10 attempts per IP per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many gift pass redemption attempts. Please try again later." }
});

// Helper to generate a cryptographically secure Gift Pass Code (e.g. GIFT-DSG-849201)
const generateGiftCode = () => {
  const randomStr = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `GIFT-DSG-${randomStr}`;
};

// Redeem a Gift Pass Code (logged-in recipient)
router.post("/redeem", protect, giftRedeemLimiter, async (req, res) => {
  try {
    const rawCode = String(req.body?.code || "").trim().toUpperCase();
    if (!rawCode) {
      return res.status(400).json({ message: "Please enter a Gift Pass Code." });
    }

    const existingPass = await GiftPass.findOne({ code: rawCode });
    if (!existingPass) {
      return res.status(404).json({ message: "Invalid Gift Pass Code. Please double check the code." });
    }

    if (existingPass.isRedeemed) {
      return res.status(400).json({ message: "This Gift Pass has already been redeemed." });
    }

    // Check if the user already owns this product
    const alreadyPurchased = await Order.findOne({
      user: req.user,
      paymentStatus: "Paid",
      "items.product": existingPass.product
    });

    const alreadyRedeemed = await GiftPass.findOne({
      redeemedBy: req.user,
      product: existingPass.product,
      isRedeemed: true
    });

    if (alreadyPurchased || alreadyRedeemed) {
      return res.status(400).json({
        message: "You already own this web version in your library. Please share this Gift Pass code with someone else."
      });
    }

    // Atomically claim the gift pass
    const giftPass = await GiftPass.findOneAndUpdate(
      { code: rawCode, isRedeemed: false },
      {
        $set: {
          isRedeemed: true,
          redeemedBy: req.user,
          redeemedAt: new Date()
        }
      },
      { new: true }
    );

    if (!giftPass) {
      return res.status(400).json({ message: "This Gift Pass has already been redeemed." });
    }

    const product = await Product.findById(giftPass.product)
      .select(PUBLIC_PRODUCT_EXCLUDE)
      .lean();

    return res.json({
      success: true,
      message: `Congratulations! You have successfully redeemed "${giftPass.productName || product?.name || 'Digital Item'}"!`,
      product: toPublicProduct(product)
    });
  } catch (err) {
    console.error("[GiftRoutes] Redeem error:", err.message);
    return res.status(500).json({ message: "Failed to redeem Gift Pass. Please try again." });
  }
});

// Get user's redeemed gift passes
router.get("/my-redeemed", protect, async (req, res) => {
  try {
    const redeemedPasses = await GiftPass.find({ redeemedBy: req.user, isRedeemed: true })
      .populate({ path: "product", select: PUBLIC_PRODUCT_EXCLUDE })
      .sort({ redeemedAt: -1 })
      .lean();

    const sanitizedPasses = (redeemedPasses || []).map((gp) => ({
      ...gp,
      product: toPublicProduct(gp.product)
    }));

    return res.json(sanitizedPasses);
  } catch (err) {
    console.error("[GiftRoutes] Fetch redeemed error:", err.message);
    return res.status(500).json({ message: "Failed to fetch redeemed gift passes." });
  }
});

module.exports = {
  router,
  generateGiftCode
};
