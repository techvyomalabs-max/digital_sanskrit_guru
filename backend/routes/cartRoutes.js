const express = require("express");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const protect = require("../middleware/authMiddleware");

const router = express.Router();

const normalizeQuantity = (qty) => {
  const parsed = Number(qty);
  if (Number.isNaN(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
};

const getProductId = (productRef) => {
  if (!productRef) return "";
  if (typeof productRef === "string") return productRef;
  if (productRef._id) return String(productRef._id);
  return String(productRef);
};

const formatCart = (cart) => {
  return (cart.items || [])
    .filter((item) => item?.product)
    .map((item) => ({
      id: String(item.product._id),
      _id: String(item.product._id),
      name: item.product.name,
      price: Number(item.product.price || 0),
      internationalPrice:
        item.product.internationalPrice === null || item.product.internationalPrice === undefined
          ? null
          : Number(item.product.internationalPrice || 0),
      internationalCountryPrices: Array.isArray(item.product.internationalCountryPrices)
        ? item.product.internationalCountryPrices.map((entry) => ({
            country: String(entry?.country || "").trim(),
            price: Number(entry?.price || 0)
          }))
        : [],
      marketPrices: Array.isArray(item.product.marketPrices)
        ? item.product.marketPrices.map((entry) => ({
            market: String(entry?.market || "").trim(),
            regularPrice: Number(entry?.regularPrice || 0),
            salePrice:
              entry?.salePrice === null || entry?.salePrice === undefined ? null : Number(entry?.salePrice || 0),
            startDate: entry?.startDate || null,
            endDate: entry?.endDate || null
          }))
        : [],
      image: item.product.image || "",
      description: item.product.description || "",
      category: item.product.category || "General",
      stock: Number(item.product.stock || 0),
      quantity: Number(item.quantity || 1)
    }));
};

async function getCartByUser(userId) {
  return Cart.findOne({ user: userId }).populate("items.product");
}

async function getOrCreateCart(userId) {
  let cart = await getCartByUser(userId);
  if (!cart) {
    cart = await Cart.create({ user: userId, items: [] });
    await cart.populate("items.product");
  }
  return cart;
}

router.get("/", protect, async (req, res) => {
  const cart = await getCartByUser(req.user);
  if (!cart) {
    return res.json({ items: [] });
  }

  res.json({ items: formatCart(cart) });
});

router.post("/", protect, async (req, res) => {
  const { productId, qty } = req.body || {};
  if (!productId) {
    return res.status(400).json({ message: "productId is required" });
  }

  const product = await Product.findById(productId).select("_id");
  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  const cart = await getOrCreateCart(req.user);

  const productKey = String(product._id);
  const index = cart.items.findIndex((item) => getProductId(item.product) === productKey);
  const nextQty = normalizeQuantity(qty);

  if (index >= 0) {
    cart.items[index].quantity = Number(cart.items[index].quantity || 1) + nextQty;
  } else {
    cart.items.push({ product: product._id, quantity: nextQty });
  }

  await cart.save();
  await cart.populate("items.product");

  res.json({ items: formatCart(cart) });
});

router.put("/:productId", protect, async (req, res) => {
  const { productId } = req.params;
  const { qty } = req.body || {};
  const nextQty = normalizeQuantity(qty);

  const cart = await getCartByUser(req.user);
  if (!cart) {
    return res.status(404).json({ message: "Cart not found" });
  }

  const targetProductId = String(productId);
  const index = cart.items.findIndex((item) => getProductId(item.product) === targetProductId);
  if (index < 0) {
    return res.status(404).json({ message: "Cart item not found" });
  }

  cart.items[index].quantity = nextQty;
  await cart.save();
  await cart.populate("items.product");

  res.json({ items: formatCart(cart) });
});

router.delete("/:productId", protect, async (req, res) => {
  const { productId } = req.params;

  const cart = await getCartByUser(req.user);
  if (!cart) {
    return res.json({ items: [] });
  }

  const targetProductId = String(productId);
  cart.items = cart.items.filter((item) => getProductId(item.product) !== targetProductId);
  await cart.save();
  await cart.populate("items.product");

  res.json({ items: formatCart(cart) });
});

router.delete("/", protect, async (req, res) => {
  const cart = await getCartByUser(req.user);
  if (!cart) {
    return res.json({ items: [] });
  }

  cart.items = [];
  await cart.save();

  res.json({ items: [] });
});

module.exports = router;
