const express = require("express");
const mongoose = require("mongoose");
const Product = require("../models/Product");
const Order = require("../models/Order");
const StoreSettings = require("../models/StoreSettings");
const User = require("../models/User");
const Review = require("../models/Review");
const protect = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");
const { getProductPriceDetails } = require("../utils/productPricing");
const { getAdminActorSnapshot, logAdminAction } = require("../utils/adminAudit");
const { appCache, TTL, invalidateProductCache, cacheAside } = require("../utils/cache");
const { honeypotMiddleware, reviewRateLimiter } = require("../utils/spamFilter");

const router = express.Router();

// 25mb JSON body — only for admin product write routes (images can be large URLs)
const largeJson = express.json({ limit: "25mb" });

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
        .split(/\r?\n/)
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

const normalizeTrailerVideoUrl = (value) => String(value || "").trim();

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
    const customName = String(item?.name || "").trim();
    const rawProductId = String(item?.product?._id || item?.product || item?.productId || item?._id || "").trim();
    const isValidObjectId = mongoose.Types.ObjectId.isValid(rawProductId);

    // Automatically recognize custom item if explicitly selected, if item.name is present, or if no valid catalog ObjectId
    const isCustom = item?.itemType === "custom" || (Boolean(customName) && !isValidObjectId) || !rawProductId;

    if (isCustom) {
      if (!customName) return acc;
      acc.push({
        itemType: "custom",
        product: null,
        name: customName,
        image: String(item?.image || "").trim(),
        description: String(item?.description || "").trim(),
        price: Math.max(0, Number(item?.price || 0)),
        isDigital: item?.isDigital === true,
        webReaderLink: String(item?.webReaderLink || "").trim(),
        kindleLink: String(item?.kindleLink || "").trim(),
        quantity: Math.max(1, Number(item?.quantity || 1))
      });
      return acc;
    }

    if (seen.has(rawProductId)) {
      return acc;
    }

    seen.add(rawProductId);
    acc.push({
      itemType: "existing",
      product: rawProductId,
      name: customName,
      image: String(item?.image || "").trim(),
      price: Math.max(0, Number(item?.price || 0)),
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

const hasNumericInput = (value) =>
  value !== null && value !== undefined && String(value).trim() !== "";

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
    const price = hasNumericInput(item?.price) ? Number(item.price) : Number.NaN;
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

const normalizeDateValue = (value) => {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeMarketPrices = (rawItems = []) => {
  if (!Array.isArray(rawItems)) {
    return [];
  }

  const seen = new Set();

  return rawItems.reduce((acc, item) => {
    const market = String(item?.market || "").trim();
    const regularPrice = hasNumericInput(item?.regularPrice) ? Number(item.regularPrice) : Number.NaN;
    const salePrice =
      !hasNumericInput(item?.salePrice)
        ? null
        : Number(item.salePrice);
    const key = market.toLowerCase();

    if (!market || seen.has(key) || Number.isNaN(regularPrice) || regularPrice < 0) {
      return acc;
    }

    seen.add(key);
    acc.push({
      market,
      regularPrice: Math.max(0, regularPrice),
      salePrice: salePrice === null || Number.isNaN(salePrice) || salePrice < 0 ? null : Math.max(0, salePrice),
      startDate: normalizeDateValue(item?.startDate),
      endDate: normalizeDateValue(item?.endDate)
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

const HOME_PRODUCT_SELECT =
  "_id name image images category price internationalPrice internationalCountryPrices marketPrices stock " +
  "festiveOffer festiveDiscountPercent productType bundleItems rating reviews reviewsCount createdAt relatedProducts";

const HOME_BUNDLE_PRODUCT_SELECT =
  "name image price internationalPrice internationalCountryPrices marketPrices category stock";

const sortByNewest = (a, b) =>
  new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime();

const getHomePricingConfig = (settings = {}) => ({
  pricingMarkets: settings?.pricingMarkets || [],
  internationalPricingDefaults: settings?.internationalPricingDefaults || {},
  currencyConversionRates: settings?.currencyConversionRates || {}
});

const buildHomePayload = (products = [], settings = {}) => {
  const pricingConfig = getHomePricingConfig(settings);
  const topRatedProducts = [...products].sort((a, b) => getAverageRating(b) - getAverageRating(a)).slice(0, 8);
  const newArrivals = [...products].sort(sortByNewest).slice(0, 4);
  const budgetPicks = [...products]
    .sort(
      (a, b) =>
        Number(getProductPriceDetails(a, null, pricingConfig).price || 0) -
        Number(getProductPriceDetails(b, null, pricingConfig).price || 0)
    )
    .slice(0, 4);
  const bundleProducts = products
    .filter((product) => isBundleProduct(product))
    .slice(0, 8);
  const festiveOfferProducts = products
    .filter((product) => product?.festiveOffer === true)
    .slice(0, 8);
  const catalogPreviewProducts = products.slice(0, 8);

  return {
    heroBanners: Array.isArray(settings?.heroBanners) ? settings.heroBanners : [],
    showFestiveOffersSection: settings?.homeSectionVisibility?.festiveOffers !== false,
    pricingConfig,
    topRatedProducts,
    newArrivals,
    budgetPicks,
    bundleProducts,
    festiveOfferProducts,
    catalogPreviewProducts,
    sponsors: Array.isArray(settings?.sponsors) ? settings.sponsors : []
  };
};

const getProductAuditFields = (product = {}) => ({
  name: String(product?.name || "").trim(),
  price: Number(product?.price || 0),
  internationalPrice:
    product?.internationalPrice === null || product?.internationalPrice === undefined
      ? null
      : Number(product.internationalPrice),
  internationalCountryPrices: Array.isArray(product?.internationalCountryPrices) ? product.internationalCountryPrices : [],
  marketPrices: Array.isArray(product?.marketPrices) ? product.marketPrices : [],
  stock: Number(product?.stock || 0),
  category: String(product?.category || "").trim(),
  festiveOffer: product?.festiveOffer === true,
  festiveDiscountPercent: Number(product?.festiveDiscountPercent || 0),
  productType: String(product?.productType || "single").trim(),
  bundleItems: Array.isArray(product?.bundleItems) ? product.bundleItems : [],
  relatedProducts: Array.isArray(product?.relatedProducts) ? product.relatedProducts : [],
  image: String(product?.image || "").trim(),
  images: Array.isArray(product?.images) ? product.images : [],
  trailerVideoUrl: String(product?.trailerVideoUrl || "").trim(),
  isDigital: product?.isDigital === true,
  digitalType: String(product?.digitalType || "").trim(),
  webReaderLink: String(product?.webReaderLink || "").trim(),
  kindleLink: String(product?.kindleLink || "").trim(),
  kindleAsin: String(product?.kindleAsin || "").trim(),
  digitalInstructions: String(product?.digitalInstructions || "").trim(),
  courseLink: String(product?.courseLink || "").trim()
});

const summarizeProductChanges = (before = {}, after = {}) => {
  const changes = [];
  if (String(before.name || "") !== String(after.name || "")) changes.push("name");
  if (Number(before.price || 0) !== Number(after.price || 0)) changes.push("price");
  if (Number(before.internationalPrice ?? -1) !== Number(after.internationalPrice ?? -1)) changes.push("international price");
  if (JSON.stringify(before.internationalCountryPrices || []) !== JSON.stringify(after.internationalCountryPrices || [])) changes.push("country prices");
  if (JSON.stringify(before.marketPrices || []) !== JSON.stringify(after.marketPrices || [])) changes.push("market prices");
  if (Number(before.stock || 0) !== Number(after.stock || 0)) changes.push("stock");
  if (String(before.category || "") !== String(after.category || "")) changes.push("category");
  if (Boolean(before.festiveOffer) !== Boolean(after.festiveOffer)) changes.push("festive offer");
  if (Number(before.festiveDiscountPercent || 0) !== Number(after.festiveDiscountPercent || 0)) changes.push("festive discount");
  if (String(before.productType || "") !== String(after.productType || "")) changes.push("product type");
  if (JSON.stringify(before.bundleItems || []) !== JSON.stringify(after.bundleItems || [])) changes.push("bundle items");
  if (JSON.stringify(before.relatedProducts || []) !== JSON.stringify(after.relatedProducts || [])) changes.push("related products");
  if (String(before.image || "") !== String(after.image || "")) changes.push("primary image");
  if (JSON.stringify(before.images || []) !== JSON.stringify(after.images || [])) changes.push("gallery");
  if (String(before.trailerVideoUrl || "") !== String(after.trailerVideoUrl || "")) changes.push("trailer video");
  if (Boolean(before.isDigital) !== Boolean(after.isDigital)) changes.push("digital item status");
  if (String(before.kindleLink || "") !== String(after.kindleLink || "")) changes.push("kindle link");
  if (String(before.webReaderLink || "") !== String(after.webReaderLink || "")) changes.push("web reader link");
  if (String(before.courseLink || "") !== String(after.courseLink || "")) changes.push("SFH course link");
  return changes;
};

// Create product (ADMIN) — 25mb for image URLs
router.post("/", protect, admin, largeJson, async (req, res) => {
  try {
    const actor = await getAdminActorSnapshot(req.user);
    const images = normalizeImages(req.body.images, req.body.image);
    const rawBundleItems = normalizeBundleItems(req.body.bundleItems);
    const typeCandidate = String(req.body?.productType || "single").trim().toLowerCase();
    const productType = typeCandidate === "bundle" ? "bundle" : (["single", "bulk"].includes(typeCandidate) ? typeCandidate : "single");
    const bundleItems = productType === "bundle" ? rawBundleItems : [];
    const relatedProducts = normalizeRelatedProducts(req.body.relatedProducts);
    const festiveOffer = req.body?.festiveOffer === true;
    const price = normalizeProductPrice(req.body?.price);
    const internationalPrice = normalizeInternationalPrice(req.body?.internationalPrice, null);
    const internationalCountryPrices = normalizeInternationalCountryPrices(req.body?.internationalCountryPrices);
    const marketPrices = normalizeMarketPrices(req.body?.marketPrices);
    if (productType === "bundle" && bundleItems.length === 0) {
      return res.status(400).json({ message: "Select at least one product for the bundle." });
    }
    const product = await Product.create({
      ...req.body,
      price,
      internationalPrice,
      internationalCountryPrices,
      marketPrices,
      aboutProduct: normalizeAboutProduct(req.body.aboutProduct),
      image: images[0] || String(req.body.image || "").trim(),
      images,
      trailerVideoUrl: normalizeTrailerVideoUrl(req.body?.trailerVideoUrl),
      festiveOffer,
      festiveDiscountPercent: festiveOffer ? normalizeFestiveDiscountPercent(req.body?.festiveDiscountPercent) : 0,
      productType,
      bundleItems,
      relatedProducts,
      lastUpdatedByName: actor.name,
      lastUpdatedByEmail: actor.email,
      lastUpdatedAt: new Date()
    });

    await logAdminAction({
      req,
      action: "product-created",
      entityType: "product",
      entityId: String(product._id || ""),
      entityLabel: String(product.name || "").trim(),
      summary: `Created product ${product.name}`,
      details: {
        productType,
        category: String(product.category || "").trim(),
        festiveOffer
      }
    });

    res.json(product);
    // Invalidate cache so next request gets fresh product list
    invalidateProductCache();
  } catch (error) {
    res.status(500).json({ message: "Failed to create product", error: error.message });
  }
});

// UPDATE product (ADMIN) — 25mb for image URLs
router.put("/:id", protect, admin, largeJson, async (req, res) => {
  try {
    const actor = await getAdminActorSnapshot(req.user);
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const previousFields = getProductAuditFields(product.toObject ? product.toObject() : product);

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
    product.marketPrices =
      req.body.marketPrices !== undefined
        ? normalizeMarketPrices(req.body.marketPrices)
        : product.marketPrices;
    product.description = req.body.description ?? product.description;
    product.aboutProduct = req.body.aboutProduct !== undefined
      ? normalizeAboutProduct(req.body.aboutProduct)
      : product.aboutProduct;
    product.trailerVideoUrl =
      req.body.trailerVideoUrl !== undefined
        ? normalizeTrailerVideoUrl(req.body.trailerVideoUrl)
        : product.trailerVideoUrl;
    product.stock = req.body.stock ?? product.stock;
    product.category = req.body.category ?? product.category;
    product.weight = req.body.weight !== undefined ? Math.max(0, Number(req.body.weight)) : product.weight;
    product.height = req.body.height !== undefined ? Math.max(0, Number(req.body.height)) : product.height;
    product.width = req.body.width !== undefined ? Math.max(0, Number(req.body.width)) : product.width;
    product.length = req.body.length !== undefined ? Math.max(0, Number(req.body.length)) : product.length;
    product.festiveOffer = req.body?.festiveOffer === true;
    product.festiveDiscountPercent = product.festiveOffer
      ? normalizeFestiveDiscountPercent(req.body?.festiveDiscountPercent)
      : 0;
    const rawBundleItemsUpdate = req.body.bundleItems !== undefined
      ? normalizeBundleItems(req.body.bundleItems)
      : normalizeBundleItems(product.bundleItems);
    const typeCandidateUpdate = String(req.body?.productType || product.productType || "single").trim().toLowerCase();
    product.productType = typeCandidateUpdate === "bundle" ? "bundle" : (["single", "bulk"].includes(typeCandidateUpdate) ? typeCandidateUpdate : "single");
    product.bundleItems = product.productType === "bundle" ? rawBundleItemsUpdate : [];
    product.relatedProducts =
      req.body.relatedProducts !== undefined
        ? normalizeRelatedProducts(req.body.relatedProducts, product._id)
        : product.relatedProducts;
    if (req.body.isDigital !== undefined) {
      product.isDigital = req.body.isDigital === true;
    }
    if (req.body.digitalType !== undefined) {
      product.digitalType = String(req.body.digitalType || "Web Version").trim();
    }
    if (req.body.webReaderLink !== undefined) {
      product.webReaderLink = String(req.body.webReaderLink || "").trim();
    }
    if (req.body.kindleLink !== undefined) {
      product.kindleLink = String(req.body.kindleLink || "").trim();
    }
    if (req.body.kindleAsin !== undefined) {
      product.kindleAsin = String(req.body.kindleAsin || "").trim();
    }
    if (req.body.digitalInstructions !== undefined) {
      product.digitalInstructions = String(req.body.digitalInstructions || "").trim();
    }
    if (req.body.courseLink !== undefined) {
      product.courseLink = String(req.body.courseLink || "").trim();
    }
    if (product.productType === "bundle" && product.bundleItems.length === 0) {
      return res.status(400).json({ message: "Select at least one product for the bundle." });
    }
    const nextImageValue = req.body.image ?? product.image;
    const nextImages = normalizeImages(req.body.images ?? product.images, nextImageValue);
    product.image = nextImages[0] || String(nextImageValue || "").trim();
    product.images = nextImages;
    product.lastUpdatedByName = actor.name;
    product.lastUpdatedByEmail = actor.email;
    product.lastUpdatedAt = new Date();

    const updatedProduct = await product.save();

    const changedFields = summarizeProductChanges(
      previousFields,
      getProductAuditFields(updatedProduct.toObject ? updatedProduct.toObject() : updatedProduct)
    );

    await logAdminAction({
      req,
      action: "product-updated",
      entityType: "product",
      entityId: String(updatedProduct._id || ""),
      entityLabel: String(updatedProduct.name || "").trim(),
      summary:
        changedFields.length > 0
          ? `Updated product ${updatedProduct.name}: ${changedFields.slice(0, 4).join(", ")}`
          : `Updated product ${updatedProduct.name}`,
      details: {
        changedFields
      }
    });

    res.json(updatedProduct);
    // Invalidate cache after any product update
    invalidateProductCache();
  } catch (error) {
    res.status(500).json({ message: "Failed to update product", error: error.message });
  }
});

// Get home page data — cached in-memory only to prevent client configuration lag
router.get("/home", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    const data = await cacheAside("home:payload", TTL.PRODUCTS_HOME, async () => {
      const [products, settings] = await Promise.all([
        Product.find({ isDeleted: { $ne: true } })
          .select(HOME_PRODUCT_SELECT)
          .populate("bundleItems.product", HOME_BUNDLE_PRODUCT_SELECT)
          .lean(),
        StoreSettings.findOne().lean()
      ]);
      return buildHomePayload(Array.isArray(products) ? products : [], settings || {});
    });

    return res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to load home products", error: error.message });
  }
});

// Get products with pagination — cached in-memory only to prevent client configuration lag
router.get("/", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    const hasPaginationQuery =
      req.query.page !== undefined ||
      req.query.limit !== undefined ||
      req.query.sort !== undefined ||
      req.query.category !== undefined;

    if (!hasPaginationQuery) {
      // Full product list (admin panel, etc.) — always fetch fresh from DB
      const products = await Product.find({ isDeleted: { $ne: true } })
        .populate("bundleItems.product", "name image price internationalPrice internationalCountryPrices marketPrices category stock")
        .populate("relatedProducts", "name image price internationalPrice internationalCountryPrices marketPrices category stock")
        .lean();
      return res.json(products);
    }

    // Build a deterministic cache key from all query params
    const cacheKey = `products:list:${JSON.stringify(req.query)}`;
    const cached = appCache.get(cacheKey);
    if (cached) return res.json(cached);

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(48, Number.parseInt(req.query.limit, 10) || 8));
    const sortOption = String(req.query.sort || "featured").trim();
    const selectedCategory = String(req.query.category || "All").trim();

    const products = await Product.find({ isDeleted: { $ne: true } })
      .populate("bundleItems.product", "name image price internationalPrice internationalCountryPrices marketPrices category")
      .populate("relatedProducts", "name image price internationalPrice internationalCountryPrices marketPrices category stock")
      .lean();
    const baseProducts = products;
    const settings = await StoreSettings.findOne().lean();
    const pricingConfig = {
      pricingMarkets: settings?.pricingMarkets || [],
      internationalPricingDefaults: settings?.internationalPricingDefaults || {},
      currencyConversionRates: settings?.currencyConversionRates || {}
    };
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
        return (
          getProductPriceDetails(a, req.query.country, pricingConfig).price -
          getProductPriceDetails(b, req.query.country, pricingConfig).price
        );
      }

      if (sortOption === "priceHigh") {
        return (
          getProductPriceDetails(b, req.query.country, pricingConfig).price -
          getProductPriceDetails(a, req.query.country, pricingConfig).price
        );
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

    const payload = {
      items,
      page,
      limit,
      total,
      totalBase: baseProducts.length,
      hasMore: startIndex + items.length < total,
      categories,
      categoryCounts
    };

    // Cache paginated result for 60 seconds
    appCache.set(cacheKey, payload, TTL.PRODUCTS_LIST);

    return res.json(payload);
  } catch (error) {
    res.status(500).json({ message: "Failed to load products", error: error.message });
  }
});

// Quick DB diagnostic for products (Admin only)
router.get("/debug/summary", protect, admin, async (req, res) => {
  try {
    const count = await Product.countDocuments();
    const sample = await Product.findOne().select("_id name category").lean();
    res.json({ count, sample: sample || null });
  } catch (error) {
    res.status(500).json({ message: "Failed to load product summary", error: error.message });
  }
});
// GET /api/products/cleanup-imported-data (Admin only)
router.get("/cleanup-imported-data", protect, admin, async (req, res) => {
  try {
    const products = await Product.find({});
    let updatedCount = 0;

    for (const p of products) {
      let modified = false;

      // 1. Replace old IP/domain URLs with live domain
      if (p.image && /https?:\/\/(?:3\.108\.166\.236|localhost|vyomalabs\.in)/i.test(p.image)) {
        p.image = p.image.replace(/https?:\/\/[^\/]+/gi, "https://digitalsanskritguru.com");
        modified = true;
      }

      if (Array.isArray(p.images)) {
        const fixedImgs = p.images.map((img) =>
          img ? String(img).replace(/https?:\/\/[^\/]+/gi, "https://digitalsanskritguru.com") : ""
        ).filter(Boolean);

        if (JSON.stringify(fixedImgs) !== JSON.stringify(p.images)) {
          p.images = fixedImgs;
          modified = true;
        }
      }

      // 2. Strip WordPress/Divi shortcodes [et_pb_...]
      if (p.description && p.description.includes("[")) {
        let cleaned = String(p.description);
        cleaned = cleaned.replace(/\[\/?et_pb_[^\]]*\]/gi, "");
        cleaned = cleaned.replace(/\[\/?vc_[^\]]*\]/gi, "");
        cleaned = cleaned.replace(/\[\/?elementor[^\]]*\]/gi, "");
        cleaned = cleaned.replace(/\[\/?[a-z0-9_-]+(?:\s+[^\]]+)?\]/gi, "");
        cleaned = cleaned.replace(/&nbsp;/gi, " ");
        cleaned = cleaned.replace(/&amp;/gi, "&");
        cleaned = cleaned.replace(/&lt;/gi, "<");
        cleaned = cleaned.replace(/&gt;/gi, ">");
        cleaned = cleaned.replace(/\r\n/g, "\n");
        cleaned = cleaned.replace(/\n\s*\n+/g, "\n\n").trim();

        p.description = cleaned || p.name;
        modified = true;
      }

      if (modified) {
        await p.save();
        updatedCount++;
      }
    }

    // Invalidate product caches
    invalidateProductCache();

    res.json({ success: true, updatedCount, totalChecked: products.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get recommended products — cached 3 minutes
router.get("/recommend/:productId", async (req, res) => {
  try {
    const { productId } = req.params;
    const cacheKey = `recommend:${productId}`;
    const cached = appCache.get(cacheKey);
    if (cached) return res.json(cached);

    const currentProduct = await Product.findById(productId).select("category");
    const category = currentProduct ? currentProduct.category : null;

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

    let products = [];
    if (sortedIds.length > 0) {
      products = await Product.find({
        _id: { $in: sortedIds },
        isDeleted: { $ne: true }
      });
    }

    const rank = new Map(sortedIds.map((id, index) => [id, index]));
    products.sort((a, b) => (rank.get(String(a._id)) ?? 999) - (rank.get(String(b._id)) ?? 999));

    // Fallback 1: Same category
    if (products.length < 4 && category) {
      const existingIds = products.map((p) => String(p._id));
      existingIds.push(productId);

      const categoryFallback = await Product.find({
        category: category,
        _id: { $nin: existingIds },
        isDeleted: { $ne: true }
      }).limit(4 - products.length);

      products = [...products, ...categoryFallback];
    }

    // Fallback 2: Any random recent products
    if (products.length < 4) {
      const existingIds = products.map((p) => String(p._id));
      existingIds.push(productId);

      const anyFallback = await Product.find({
        _id: { $nin: existingIds },
        isDeleted: { $ne: true }
      }).sort({ createdAt: -1 }).limit(4 - products.length);

      products = [...products, ...anyFallback];
    }

    const ranked = products.map((product) => ({
      ...(product.toObject ? product.toObject() : product),
      boughtTogetherCount: counts[String(product._id)] || 0
    }));

    // Cache for 3 minutes — recommendations change slowly
    appCache.set(cacheKey, ranked, TTL.RECOMMENDATIONS);
    res.json(ranked);
  } catch {
    res.status(500).json({ message: "Failed to load recommendations" });
  }
});

// Get product reviews with pagination (skip and limit)
router.get("/:id/reviews", async (req, res) => {
  try {
    const skip = Math.max(0, parseInt(req.query.skip) || 0);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);

    // Try fetching from the new standalone Reviews collection first
    const reviews = await Review.find({ product: req.params.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    if (reviews.length > 0) {
      const formattedReviews = reviews.map((r) => ({
        ...r,
        user: r.userName
      }));
      return res.json(formattedReviews);
    }

    // Fallback to embedded array if standalone collection is empty (e.g. unmigrated)
    const product = await Product.findById(req.params.id)
      .select({ reviews: { $slice: [skip, limit] } })
      .lean();

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(product.reviews || []);
  } catch (error) {
    res.status(500).json({ message: "Failed to load reviews", error: error.message });
  }
});

// Get one product by id — cached in-memory only to prevent client configuration lag
router.get("/:id", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    const cacheKey = `product:${req.params.id}`;
    const cached = appCache.get(cacheKey);
    if (cached) return res.json(cached);

    const targetId = req.params.id;
    let product = null;

    if (mongoose.Types.ObjectId.isValid(targetId)) {
      product = await Product.findById(targetId)
        .populate("bundleItems.product", "name image price internationalPrice internationalCountryPrices marketPrices category stock")
        .populate("relatedProducts", "name image price internationalPrice internationalCountryPrices marketPrices category stock")
        .lean();
    }

    if (!product) {
      const numId = Number(targetId);
      if (!isNaN(numId)) {
        product = await Product.findOne({ wpProductId: numId, isDeleted: { $ne: true } })
          .populate("bundleItems.product", "name image price internationalPrice internationalCountryPrices marketPrices category stock")
          .populate("relatedProducts", "name image price internationalPrice internationalCountryPrices marketPrices category stock")
          .lean();
      }
    }

    if (!product || product.isDeleted === true) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Try loading reviews from the new standalone collection
    const reviewsCount = await Review.countDocuments({ product: req.params.id });
    const latestReviews = await Review.find({ product: req.params.id })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    if (latestReviews.length > 0) {
      product.reviews = latestReviews.map((r) => ({
        ...r,
        user: r.userName
      }));
      product.reviewsCount = reviewsCount;
    } else {
      // Fallback: use old embedded reviews array if standalone is empty
      const embeddedReviews = Array.isArray(product.reviews) ? product.reviews : [];
      product.reviews = embeddedReviews.slice(0, 5);
      product.reviewsCount = product.reviewsCount !== undefined ? product.reviewsCount : embeddedReviews.length;
    }

    appCache.set(cacheKey, product, TTL.PRODUCT_SINGLE);
    res.json(product);
  } catch {
    res.status(404).json({ message: "Product not found" });
  }
});

// Add product review (logged-in user)
router.post("/:id/reviews", protect, reviewRateLimiter, async (req, res) => {
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

    // 1. Create review document in standalone collection
    await Review.create({
      product: req.params.id,
      user: req.user,
      userName: userName,
      rating,
      comment
    });

    // 2. Recalculate average rating & reviews count using MongoDB aggregation
    const stats = await Review.aggregate([
      { $match: { product: product._id } },
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

    // 3. Keep embedded array updated alongside cached stats for safety/dual-write
    if (Array.isArray(product.reviews)) {
      product.reviews.push({
        user: userName,
        rating,
        comment,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      // Cap the embedded reviews array to the latest 5 reviews to prevent product document bloat
      if (product.reviews.length > 5) {
        product.reviews = product.reviews.slice(-5);
      }
    }
    product.rating = avgRating;
    product.reviewsCount = reviewsCount;

    await product.save();

    // 4. Retrieve latest 5 reviews to send back as expected shape
    const latestReviews = await Review.find({ product: req.params.id })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const returnedProduct = product.toObject();
    returnedProduct.reviews = latestReviews.map((r) => ({
      ...r,
      user: r.userName
    }));
    returnedProduct.reviewsCount = reviewsCount;

    // Invalidate single product cache after review
    appCache.del(`product:${req.params.id}`);
    res.status(201).json(returnedProduct);
  } catch (error) {
    res.status(500).json({ message: "Failed to submit review", error: error.message });
  }
});

// DELETE product (ADMIN) — Soft delete
router.delete("/:id", protect, admin, async (req, res) => {
  try {
    const actor = await getAdminActorSnapshot(req.user);
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const productName = String(product.name || "").trim();
    product.isDeleted = true;
    product.deletedAt = new Date();
    product.deletedBy = { name: actor.name, email: actor.email };
    await product.save();

    await logAdminAction({
      req,
      action: "product-soft-deleted",
      entityType: "product",
      entityId: String(product._id || ""),
      entityLabel: productName,
      summary: `Soft-deleted product ${productName}`,
      details: {
        category: String(product.category || "").trim()
      }
    });

    res.json({ message: "Product moved to Recycle Bin" });
    invalidateProductCache();
  } catch (error) {
    res.status(500).json({ message: "Failed to delete product", error: error.message });
  }
});

// RESTORE product (ADMIN)
router.post("/:id/restore", protect, admin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const productName = String(product.name || "").trim();
    product.isDeleted = false;
    product.deletedAt = null;
    product.deletedBy = { name: "", email: "" };
    await product.save();

    await logAdminAction({
      req,
      action: "product-restored",
      entityType: "product",
      entityId: String(product._id || ""),
      entityLabel: productName,
      summary: `Restored product ${productName}`
    });

    res.json({ message: "Product restored successfully", product });
    invalidateProductCache();
  } catch (error) {
    res.status(500).json({ message: "Failed to restore product", error: error.message });
  }
});

// PURGE product (ADMIN) — Permanent deletion
router.delete("/:id/purge", protect, admin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const productName = String(product.name || "").trim();
    await product.deleteOne();

    await logAdminAction({
      req,
      action: "product-permanently-deleted",
      entityType: "product",
      entityId: String(product._id || ""),
      entityLabel: productName,
      summary: `Permanently deleted product ${productName}`,
      details: {
        category: String(product.category || "").trim()
      }
    });

    res.json({ message: "Product permanently deleted" });
    invalidateProductCache();
  } catch (error) {
    res.status(500).json({ message: "Failed to purge product", error: error.message });
  }
});

const { sendBulkEnquiryEmail } = require("../utils/email");

// POST /api/products/:id/bulk-enquiry (PUBLIC)
router.post("/:id/bulk-enquiry", honeypotMiddleware, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const { name, email, phone, quantity, institution, message } = req.body;
    if (!name || !email || !quantity) {
      return res.status(400).json({ message: "Name, email, and quantity are required." });
    }

    await sendBulkEnquiryEmail({
      name,
      email,
      phone,
      quantity: Number(quantity),
      productName: product.name,
      institution,
      message
    });

    res.json({ message: "Bulk enquiry submitted successfully. Our team will contact you soon." });
  } catch (error) {
    res.status(500).json({ message: "Failed to submit enquiry", error: error.message });
  }
});

module.exports = router;

// POST /api/products/:id/view (PUBLIC - Anonymous Aggregate View Counter)
router.post("/:id/view", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { returnDocument: 'after', select: "views" }
    );

    if (!updated) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json({ success: true, views: updated.views });
  } catch (error) {
    res.status(500).json({ message: "Failed to log view", error: error.message });
  }
});

module.exports = router;
