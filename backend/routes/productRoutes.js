const express = require("express");
const Product = require("../models/Product");
const Order = require("../models/Order");
const StoreSettings = require("../models/StoreSettings");
const User = require("../models/User");
const protect = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");
const { getProductPriceDetails } = require("../utils/productPricing");

const router = express.Router();

const getItemProductId = (item) => {
  if (!item) return "";
  if (item.product) return String(item.product);
  if (item._id) return String(item._id);
  if (item.id) return String(item.id);
  return "";
};

const normalizeImages = (rawImages, fallbackImage = "") => {
  const list = Array.isArray(rawImages)
    ? rawImages
    : String(rawImages || "")
        .split(/\r?\n|,/)
        .map((image) => image.trim())
        .filter(Boolean);

  if (list.length > 0) {
    return list;
  }

  const normalizedFallback = String(fallbackImage || "").trim();
  return normalizedFallback ? [normalizedFallback] : [];
};

const normalizeAboutProduct = (rawAboutProduct = []) => {
  if (Array.isArray(rawAboutProduct)) {
    return rawAboutProduct.map((item) => String(item || "").trim()).filter(Boolean);
  }

  return String(rawAboutProduct || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const isBundleProduct = (product) =>
  String(product?.productType || "single") === "bundle" ||
  (Array.isArray(product?.bundleItems) && product.bundleItems.length > 0);

const isFestiveOfferProduct = (product) => product?.festiveOffer === true;

const normalizeFestiveDiscountPercent = (value) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return 0;
  return Math.min(95, Math.max(0, Math.round(parsed)));
};

const normalizeBundleItems = (rawBundleItems = []) => {
  if (!Array.isArray(rawBundleItems)) {
    return [];
  }

  const seen = new Set();

  return rawBundleItems.reduce((acc, item) => {
    const productId = String(item?.product || item?.productId || item?._id || "").trim();
    if (!productId || seen.has(productId)) {
      return acc;
    }

    seen.add(productId);
    acc.push({
      product: productId,
      quantity: Math.max(1, Number(item?.quantity || 1))
    });
    return acc;
  }, []);
};

const normalizeRelatedProducts = (rawRelatedProducts = [], currentProductId = "") => {
  if (!Array.isArray(rawRelatedProducts)) {
    return [];
  }

  const currentId = String(currentProductId || "").trim();
  const seen = new Set();

  return rawRelatedProducts.reduce((acc, item) => {
    const productId = String(item?.product || item?.productId || item?._id || item?.id || item || "").trim();
    if (!productId || productId === currentId || seen.has(productId)) {
      return acc;
    }

    seen.add(productId);
    acc.push(productId);
    return acc;
  }, []);
};

const normalizeProductPrice = (value, fallback = 0) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return Math.max(0, Number(fallback) || 0);
  }
  return Math.max(0, parsed);
};

const normalizeInternationalPrice = (value, fallback = null) => {
  if (value === null || value === undefined || String(value).trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.max(0, parsed);
};

const normalizeInternationalCountryPrices = (rawItems = []) => {
  if (!Array.isArray(rawItems)) {
    return [];
  }

  const seen = new Set();

  return rawItems.reduce((acc, item) => {
    const country = String(item?.country || "").trim();
    const price = Number(item?.price);
    const key = country.toLowerCase();

    if (!country || seen.has(key) || Number.isNaN(price) || price < 0) {
      return acc;
    }

    seen.add(key);
    acc.push({
      country,
      price: Math.max(0, price)
    });
    return acc;
  }, []);
};

const getCategoryLabel = (product) => {
  const raw = String(product?.category || "").trim();

  if (raw && raw.toLowerCase() !== "general") {
    return raw;
  }

  const name = String(product?.name || "").toLowerCase();
  if (name.includes("gita")) return "Gita";
  if (name.includes("grammar")) return "Grammar";
  if (name.includes("vedanta")) return "Vedanta";
  if (name.includes("chant")) return "Chanting";
  return "General";
};

const getAverageRating = (product) => {
  const reviews = Array.isArray(product?.reviews) ? product.reviews : [];
  if (reviews.length === 0) return Number(product?.rating || 0);

  return reviews.reduce((sum, review) => sum + Number(review?.rating || 0), 0) / reviews.length;
};

// Create product (ADMIN)
router.post("/", protect, admin, async (req, res) => {
  try {
    const images = normalizeImages(req.body.images, req.body.image);
    const productType = String(req.body?.productType || "single").trim().toLowerCase() === "bundle" ? "bundle" : "single";
    const bundleItems = productType === "bundle" ? normalizeBundleItems(req.body.bundleItems) : [];
    const relatedProducts = normalizeRelatedProducts(req.body.relatedProducts);
    const festiveOffer = req.body?.festiveOffer === true;
    const price = normalizeProductPrice(req.body?.price);
    const internationalPrice = normalizeInternationalPrice(req.body?.internationalPrice, null);
    const internationalCountryPrices = normalizeInternationalCountryPrices(req.body?.internationalCountryPrices);
    if (productType === "bundle" && bundleItems.length === 0) {
      return res.status(400).json({ message: "Select at least one product for the bundle." });
    }
    const product = await Product.create({
      ...req.body,
      price,
      internationalPrice,
      internationalCountryPrices,
      aboutProduct: normalizeAboutProduct(req.body.aboutProduct),
      image: images[0] || String(req.body.image || "").trim(),
      images,
      festiveOffer,
      festiveDiscountPercent: festiveOffer ? normalizeFestiveDiscountPercent(req.body?.festiveDiscountPercent) : 0,
      productType,
      bundleItems,
      relatedProducts
    });
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: "Failed to create product", error: error.message });
  }
});

// UPDATE product (ADMIN)
router.put("/:id", protect, admin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    product.name = req.body.name ?? product.name;
    product.price = req.body.price !== undefined ? normalizeProductPrice(req.body.price, product.price) : product.price;
    product.internationalPrice =
      req.body.internationalPrice !== undefined
        ? normalizeInternationalPrice(req.body.internationalPrice, product.internationalPrice)
        : product.internationalPrice;
    product.internationalCountryPrices =
      req.body.internationalCountryPrices !== undefined
        ? normalizeInternationalCountryPrices(req.body.internationalCountryPrices)
        : product.internationalCountryPrices;
    product.description = req.body.description ?? product.description;
    product.aboutProduct = req.body.aboutProduct !== undefined
      ? normalizeAboutProduct(req.body.aboutProduct)
      : product.aboutProduct;
    product.stock = req.body.stock ?? product.stock;
    product.category = req.body.category ?? product.category;
    product.festiveOffer = req.body?.festiveOffer === true;
    product.festiveDiscountPercent = product.festiveOffer
      ? normalizeFestiveDiscountPercent(req.body?.festiveDiscountPercent)
      : 0;
    product.productType = String(req.body?.productType || product.productType || "single").trim().toLowerCase() === "bundle"
      ? "bundle"
      : "single";
    product.bundleItems = product.productType === "bundle"
      ? normalizeBundleItems(req.body.bundleItems ?? product.bundleItems)
      : [];
    product.relatedProducts =
      req.body.relatedProducts !== undefined
        ? normalizeRelatedProducts(req.body.relatedProducts, product._id)
        : product.relatedProducts;
    if (product.productType === "bundle" && product.bundleItems.length === 0) {
      return res.status(400).json({ message: "Select at least one product for the bundle." });
    }
    const nextImageValue = req.body.image ?? product.image;
    const nextImages = normalizeImages(req.body.images ?? product.images, nextImageValue);
    product.image = nextImages[0] || String(nextImageValue || "").trim();
    product.images = nextImages;

    const updatedProduct = await product.save();
    res.json(updatedProduct);
  } catch (error) {
    res.status(500).json({ message: "Failed to update product", error: error.message });
  }
});

// Get all products
router.get("/", async (req, res) => {
  try {
    const hasPaginationQuery =
      req.query.page !== undefined ||
      req.query.limit !== undefined ||
      req.query.sort !== undefined ||
      req.query.category !== undefined;

    if (!hasPaginationQuery) {
      const products = await Product.find()
        .populate("bundleItems.product", "name image price internationalPrice internationalCountryPrices category")
        .populate("relatedProducts", "name image price internationalPrice internationalCountryPrices category stock");
      return res.json(products);
    }

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(48, Number.parseInt(req.query.limit, 10) || 8));
    const sortOption = String(req.query.sort || "featured").trim();
    const selectedCategory = String(req.query.category || "All").trim();

    const products = await Product.find()
      .populate("bundleItems.product", "name image price internationalPrice internationalCountryPrices category")
      .populate("relatedProducts", "name image price internationalPrice internationalCountryPrices category stock")
      .lean();
    const baseProducts = products;
    const settings = await StoreSettings.findOne().lean();
    const festiveOffersFilterEnabled = settings?.collectionFilterVisibility?.festiveOffers !== false;

    const regularCategories = [...new Set(baseProducts.map((product) => getCategoryLabel(product)))];
    const categories = [
      "All",
      ...(festiveOffersFilterEnabled && baseProducts.some((product) => isFestiveOfferProduct(product)) ? ["Festive Offer"] : []),
      ...(baseProducts.some((product) => isBundleProduct(product)) ? ["Bundle"] : []),
      ...regularCategories.filter((category) => category !== "Festive Offer" && category !== "Bundle")
    ];
    const categoryCounts = { All: baseProducts.length };
    categories.forEach((category) => {
      if (category === "All") return;
      if (category === "Festive Offer") {
        categoryCounts[category] = baseProducts.filter((product) => isFestiveOfferProduct(product)).length;
        return;
      }
      if (category === "Bundle") {
        categoryCounts[category] = baseProducts.filter((product) => isBundleProduct(product)).length;
        return;
      }
      categoryCounts[category] = baseProducts.filter((product) => getCategoryLabel(product).toLowerCase() === category.toLowerCase()).length;
    });

    const filteredProducts = baseProducts.filter((product) => {
      if (selectedCategory === "All") return true;
      if (selectedCategory === "Festive Offer") return festiveOffersFilterEnabled && isFestiveOfferProduct(product);
      if (selectedCategory === "Bundle") return isBundleProduct(product);
      return getCategoryLabel(product).toLowerCase() === selectedCategory.toLowerCase();
    });

    filteredProducts.sort((a, b) => {
      if (sortOption === "priceLow") {
        return getProductPriceDetails(a, req.query.country).price - getProductPriceDetails(b, req.query.country).price;
      }

      if (sortOption === "priceHigh") {
        return getProductPriceDetails(b, req.query.country).price - getProductPriceDetails(a, req.query.country).price;
      }

      if (sortOption === "rating") {
        return getAverageRating(b) - getAverageRating(a);
      }

      if (sortOption === "latest") {
        return new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime();
      }

      if (sortOption === "name") {
        return String(a?.name || "").localeCompare(String(b?.name || ""));
      }

      const stockDelta = Number(b?.stock || 0) - Number(a?.stock || 0);
      if (stockDelta !== 0) return stockDelta;
      return getAverageRating(b) - getAverageRating(a);
    });

    const total = filteredProducts.length;
    const startIndex = (page - 1) * limit;
    const items = filteredProducts.slice(startIndex, startIndex + limit);

    return res.json({
      items,
      page,
      limit,
      total,
      totalBase: baseProducts.length,
      hasMore: startIndex + items.length < total,
      categories,
      categoryCounts
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to load products", error: error.message });
  }
});

// Quick DB diagnostic for products
router.get("/debug/summary", async (req, res) => {
  try {
    const count = await Product.countDocuments();
    const sample = await Product.findOne().select("_id name category").lean();
    res.json({ count, sample: sample || null });
  } catch (error) {
    res.status(500).json({ message: "Failed to load product summary", error: error.message });
  }
});
// Get recommended products based on co-purchase history
router.get("/recommend/:productId", async (req, res) => {
  try {
    const { productId } = req.params;

    const orders = await Order.find({
      $or: [
        { "items.product": productId },
        { "items._id": productId },
        { "items.id": productId }
      ]
    }).select("items");

    const counts = {};

    // Count co-occurrence per order (unique product IDs per order),
    // so orders with many items are handled correctly without double-counting duplicates.
    orders.forEach((order) => {
      const uniqueIds = new Set(
        (order.items || [])
          .map((item) => getItemProductId(item))
          .filter(Boolean)
      );

      if (!uniqueIds.has(productId)) return;
      uniqueIds.forEach((id) => {
        if (id === productId) return;
        counts[id] = (counts[id] || 0) + 1;
      });
    });

    const sortedIds = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map((entry) => entry[0]);

    if (sortedIds.length === 0) {
      return res.json([]);
    }

    const products = await Product.find({
      _id: { $in: sortedIds }
    });

    const rank = new Map(sortedIds.map((id, index) => [id, index]));
    products.sort((a, b) => (rank.get(String(a._id)) ?? 999) - (rank.get(String(b._id)) ?? 999));

    res.json(
      products.map((product) => ({
        ...product.toObject(),
        boughtTogetherCount: counts[String(product._id)] || 0
      }))
    );
  } catch {
    res.status(500).json({ message: "Failed to load recommendations" });
  }
});

// Get one product by id
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate("bundleItems.product", "name image price internationalPrice internationalCountryPrices category stock")
      .populate("relatedProducts", "name image price internationalPrice internationalCountryPrices category stock");

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(product);
  } catch {
    res.status(404).json({ message: "Product not found" });
  }
});

// Add product review (logged-in user)
router.post("/:id/reviews", protect, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const rating = Number(req.body.rating);
    const comment = (req.body.comment || "").trim();

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    const user = await User.findById(req.user).select("name");
    const userName = user?.name || "User";

    const review = {
      user: userName,
      rating,
      comment
    };

    product.reviews.push(review);
    product.rating =
      product.reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) /
      product.reviews.length;

    await product.save();
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ message: "Failed to submit review", error: error.message });
  }
});

// DELETE product (ADMIN)
router.delete("/:id", protect, admin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    await product.deleteOne();
    res.json({ message: "Product deleted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete product", error: error.message });
  }
});

module.exports = router;
