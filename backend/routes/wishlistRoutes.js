const express = require("express");
const Wishlist = require("../models/Wishlist");
const protect = require("../middleware/authMiddleware");

const router = express.Router();

// GET /api/wishlist — get the logged-in user's server-side wishlist product IDs
router.get("/", protect, async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user }).lean();
    res.json({ productIds: wishlist ? wishlist.productIds.map(String) : [] });
  } catch {
    res.status(500).json({ message: "Failed to load wishlist." });
  }
});

// POST /api/wishlist/sync — full sync: replace server wishlist with client list
// Called on login to merge the localStorage wishlist into the DB
router.post("/sync", protect, async (req, res) => {
  try {
    const rawIds = Array.isArray(req.body?.productIds) ? req.body.productIds : [];
    const productIds = [...new Set(rawIds.map((id) => String(id || "").trim()).filter(Boolean))];

    const wishlist = await Wishlist.findOneAndUpdate(
      { user: req.user },
      { $set: { productIds } },
      { upsert: true, new: true }
    );

    res.json({ productIds: wishlist.productIds.map(String) });
  } catch {
    res.status(500).json({ message: "Failed to sync wishlist." });
  }
});

// POST /api/wishlist/add — add a single product to server wishlist
router.post("/add", protect, async (req, res) => {
  try {
    const productId = String(req.body?.productId || "").trim();
    if (!productId) return res.status(400).json({ message: "productId required." });

    const wishlist = await Wishlist.findOneAndUpdate(
      { user: req.user },
      { $addToSet: { productIds: productId } },
      { upsert: true, new: true }
    );

    res.json({ productIds: wishlist.productIds.map(String) });
  } catch {
    res.status(500).json({ message: "Failed to add to wishlist." });
  }
});

// DELETE /api/wishlist/:productId — remove a product from server wishlist
router.delete("/:productId", protect, async (req, res) => {
  try {
    const productId = String(req.params.productId || "").trim();
    if (!productId) return res.status(400).json({ message: "productId required." });

    const wishlist = await Wishlist.findOneAndUpdate(
      { user: req.user },
      { $pull: { productIds: productId } },
      { new: true }
    );

    res.json({ productIds: wishlist ? wishlist.productIds.map(String) : [] });
  } catch {
    res.status(500).json({ message: "Failed to remove from wishlist." });
  }
});

module.exports = router;
