const express = require("express");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const StoreSettings = require("../models/StoreSettings");
const Coupon = require("../models/Coupon");
const Product = require("../models/Product");
const User = require("../models/User");
const Wishlist = require("../models/Wishlist");
const GiftPass = require("../models/GiftPass");
const { generateGiftCode } = require("./giftRoutes");
const { resolveDeliveryCharge } = require("../utils/deliveryPricing");
const { convertCurrencyAmount, normalizeCurrencyCode } = require("../utils/currency");
const { getProductPriceDetails } = require("../utils/productPricing");
const protect = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");
const { getAdminActorSnapshot, logAdminAction } = require("../utils/adminAudit");
const {
  sendOrderConfirmation,
  sendOrderStatusUpdate,
  sendLowStockAdminAlert,
  sendWishlistLowStockAlert
} = require("../utils/email");
const {
  sendPushToUser,
  broadcastPush,
  orderPayload,
  lowStockPayload,
  wishlistLowStockPayload
} = require("../utils/webPush");

const { getTrackingDetails } = require("../utils/trackingService");

const router = express.Router();

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
const allowedPaymentStatuses = new Set(["Pending", "Paid", "Failed"]);
const allowedRefundStatuses = new Set(["Not Applicable", "Pending", "Processing", "Refunded", "Rejected"]);
const allowedReturnStatuses = new Set(["Requested", "Approved", "Rejected", "Refunded"]);
const RETURN_WINDOW_DAYS = 7;

// ── Notification helper (fire-and-forget — never blocks the response) ─────────

async function fireNotifications(fn) {
  try {
    await fn();
  } catch (err) {
    console.error("[Notification] Non-blocking error:", err.message);
  }
}

// ── Low-stock alert helper: called after stock is decremented ─────────────────
// Checks which of the just-ordered products are now at/below threshold
// and sends push + email to admin + all users who wishlisted those products.
async function fireLowStockAlerts(normalizedItems) {
  try {
    const settings = await StoreSettings.findOne()
      .select("lowStockThreshold notificationEmail pushEnabled emailEnabled")
      .lean();
    const threshold = Number(settings?.lowStockThreshold ?? 5);

    const productIds = normalizedItems.map((i) => i.product);
    const lowStockProducts = await Product.find({
      _id: { $in: productIds },
      stock: { $lte: threshold }
    }).select("_id name stock category").lean();

    if (lowStockProducts.length === 0) return;

    // 1. Admin alert
    const admins = await User.find({ isAdmin: true }).select("_id").lean();
    const enriched = lowStockProducts.map((p) => ({ ...p, wishlistCount: 0 }));
    await sendLowStockAdminAlert(enriched);
    for (const adminUser of admins) {
      await sendPushToUser(adminUser._id,
        lowStockPayload(`${lowStockProducts.length} item(s)`, lowStockProducts.map((p) => p.stock).join(", "))
      );
    }

    // 2. Wishlist user alerts
    const lowStockIds = lowStockProducts.map((p) => p._id);
    const wishlistDocs = await Wishlist.find({ productIds: { $in: lowStockIds } })
      .populate("user", "name email")
      .lean();

    for (const wl of wishlistDocs) {
      if (!wl.user?._id) continue;
      const affected = lowStockProducts.filter((p) =>
        wl.productIds.some((id) => String(id) === String(p._id))
      );
      if (affected.length === 0) continue;
      const names = affected.map((p) => p.name);
      const minStock = Math.min(...affected.map((p) => p.stock));
      await sendPushToUser(wl.user._id, wishlistLowStockPayload(names, minStock));
      await sendWishlistLowStockAlert(wl.user, affected);
    }
  } catch (err) {
    console.error("[Low-Stock Alert] Error:", err.message);
  }
}

const getReturnReferenceDate = (order, item) => {
  const candidates = [item?.deliveredAt, order?.deliveredAt, order?.updatedAt, order?.createdAt];
  for (const candidate of candidates) {
    const date = candidate ? new Date(candidate) : null;
    if (date && !Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return null;
};

const getOrderItemById = (order, itemId) =>
  Array.isArray(order?.items)
    ? order.items.find((item) => String(item?._id || item?.id || item?.product || "").trim() === String(itemId || "").trim())
    : null;

const canRequestReturnForItem = (order, item) => {
  if (!order || !item) return false;
  if (String(order?.status || "").trim() !== "Delivered") return false;
  if (String(order?.paymentStatus || "").trim() !== "Paid") return false;
  if (String(item?.returnRequest?.status || "Not Requested").trim() !== "Not Requested") return false;

  const referenceDate = getReturnReferenceDate(order, item);
  if (!referenceDate) return false;

  const msSinceDelivered = Date.now() - referenceDate.getTime();
  return msSinceDelivered <= RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
};

// ── Stock helpers ────────────────────────────────────────────────────────────

/**
 * Atomically decrement stock for each item in the order.
 * Uses bulkWrite with a $gte guard so stock can never go below 0.
 * Returns an array of product IDs that were out-of-stock (should be empty on success).
 */
async function decrementStock(normalizedItems) {
  const ops = normalizedItems.map((item) => ({
    updateOne: {
      filter: { _id: item.product, stock: { $gte: item.quantity } },
      update: { $inc: { stock: -item.quantity } }
    }
  }));

  const result = await Product.bulkWrite(ops, { ordered: false });
  const modifiedCount = result.modifiedCount || 0;

  if (modifiedCount < normalizedItems.length) {
    // Some products didn't have enough stock — find which ones
    const productIds = normalizedItems.map((i) => i.product);
    const stockRecords = await Product.find({ _id: { $in: productIds } })
      .select("_id name stock")
      .lean();

    const stockMap = new Map(stockRecords.map((p) => [String(p._id), p]));
    const outOfStock = normalizedItems
      .filter((item) => {
        const record = stockMap.get(String(item.product));
        return !record || Number(record.stock) < Number(item.quantity);
      })
      .map((item) => {
        const record = stockMap.get(String(item.product));
        return `${item.name} (available: ${record ? record.stock : 0}, requested: ${item.quantity})`;
      });

    return outOfStock;
  }

  return [];
}

/**
 * Restore stock for all items in a cancelled order.
 * Safe to call even if decrementStock was partial — $inc up is always safe.
 */
async function restoreStockForOrder(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (items.length === 0) return;

  const ops = items
    .filter((item) => item.product && item.quantity > 0)
    .map((item) => ({
      updateOne: {
        filter: { _id: item.product },
        update: { $inc: { stock: item.quantity } }
      }
    }));

  if (ops.length > 0) {
    await Product.bulkWrite(ops, { ordered: false });
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Helper to determine HSN/SAC based on product classification (matching invoicePdf.js)
function getItemHsnSac(item) {
  if (item?.hsnSac) return String(item.hsnSac).trim();
  const name = String(item?.name || "").trim().toLowerCase();
  const category = String(item?.category || "").trim().toLowerCase();
  
  // E-books, Kindle books, Web versions, and Digital formats are taxed at 18% GST
  const isDigital = 
    category.includes("ebook") ||
    category.includes("e-book") ||
    category.includes("kindle") ||
    category.includes("web version") ||
    category.includes("web-version") ||
    name.includes("ebook") ||
    name.includes("e-book") ||
    name.includes("kindle") ||
    name.includes("web version") ||
    name.includes("web-version") ||
    name.includes("epub") ||
    name.includes("pdf");
    
  if (isDigital) {
    return "9973"; // Digital products/services (18% GST)
  }

  // Exempt printed books: category or name based check (HSN Chapter 49)
  const isPrintedBook = 
    category.includes("book") ||
    category.includes("sanskrit") ||
    category.includes("gita") ||
    category.includes("scriptures") ||
    category.includes("grammar") ||
    category.includes("dharma") ||
    category.includes("paperback") ||
    name.includes("book") ||
    name.includes("volume") ||
    name.includes("vol.") ||
    name.includes("hardcover") ||
    name.includes("paperback");
    
  return isPrintedBook ? "4901" : "8523";
}

// Calculate order totals (logged-in user)
router.post("/calculate-totals", protect, async (req, res) => {
  try {
    const shipping = req.body.shipping || {};
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const couponCode = String(req.body?.couponCode || "").trim().toUpperCase();
    const shippingCountry = String(shipping?.country || "").trim();
    const requestedProductIds = [...new Set(
      items.map((item) => String(item?._id || item?.id || item?.product || "").trim()).filter(Boolean)
    )];

    const products = await Product.find({ _id: { $in: requestedProductIds } })
      .populate("bundleItems.product")
      .lean();
    const productsById = new Map(products.map((product) => [String(product._id), product]));
    const settings =
      (await StoreSettings.findOne()) || {
        gstPercent: 0,
        deliveryCharge: 0,
        pricingMarkets: [],
        internationalPricingDefaults: { currency: "USD" },
        currencyConversionRates: {}
      };
    const pricingConfig = {
      pricingMarkets: settings?.pricingMarkets || [],
      internationalPricingDefaults: settings?.internationalPricingDefaults || {},
      currencyConversionRates: settings?.currencyConversionRates || {}
    };

    const normalizedItems = items.reduce((acc, item) => {
      const productId = String(item?._id || item?.id || item?.product || "").trim();
      const product = productsById.get(productId);
      if (!product) {
        return acc;
      }

      const quantity = Math.max(1, Number(item?.quantity || 1));
      const pricing = getProductPriceDetails(product, shippingCountry, pricingConfig);

      acc.push({
        product: productId,
        _id: productId,
        id: productId,
        name: String(product?.name || item?.name || "").trim(),
        image: String(product?.image || item?.image || "").trim(),
        category: String(product?.category || item?.category || "General").trim() || "General",
        format: String(item?.format || item?.selectedFormat || product?.format || "").trim(),
        isDigital: Boolean(product?.isDigital || item?.isDigital),
        quantity,
        price: roundMoney(pricing.price),
        currency: String(pricing.currency || "INR").trim().toUpperCase()
      });
      return acc;
    }, []);

    if (normalizedItems.length === 0) {
      return res.status(400).json({ message: "No valid products found for this calculation." });
    }

    const subtotal = roundMoney(
      normalizedItems.reduce((sum, item) => sum + Number(item?.price || 0) * Math.max(1, Number(item?.quantity || 1)), 0)
    );
    const orderCurrency = normalizeCurrencyCode(
      req.body?.currencyDisplay?.currency || normalizedItems[0]?.currency || "INR",
      "INR"
    );

    const gstPercent = Math.min(50, Math.max(0, Number(settings.gstPercent || 0)));
    const deliveryCharge = roundMoney(
      convertCurrencyAmount(resolveDeliveryCharge(settings, shipping, normalizedItems), {
        sourceCurrency: "INR",
        currency: orderCurrency,
        rates: settings?.currencyConversionRates || {}
      })
    );

    let totalItemGst = 0;
    normalizedItems.forEach((item) => {
      const qty = Math.max(1, Number(item.quantity || 1));
      const price = Number(item.price || 0);
      const lineTotal = qty * price;
      const hsnSac = getItemHsnSac(item);
      const gstRate = hsnSac === "4901" ? 0 : gstPercent;
      const itemGst = Math.round(((lineTotal * gstRate) / 100) * 100) / 100;
      totalItemGst += itemGst;
    });

    const gstAmount = roundMoney(totalItemGst);
    const grossTotal = roundMoney(subtotal + gstAmount + deliveryCharge);

    let discount = 0;
    let appliedCouponCode = "";
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode });
      if (coupon && (!coupon.expiresAt || new Date() <= coupon.expiresAt)) {
        if (coupon.usedBy && coupon.usedBy.some((uId) => String(uId) === String(req.user))) {
          return res.status(400).json({ message: "You have already used this coupon code." });
        }

        if (coupon.assignedUserEmail) {
          const user = await User.findById(req.user).select("email").lean();
          if (String(coupon.assignedUserEmail).toLowerCase() !== String(user?.email || "").toLowerCase()) {
            return res.status(400).json({ message: "This coupon is gifted/assigned to another user's account." });
          }
        }

        if (Array.isArray(coupon.applicableProducts) && coupon.applicableProducts.length > 0) {
          const matchingItems = normalizedItems.filter((item) => {
            const itemId = String(item.product || item._id || item.id || "");
            return coupon.applicableProducts.some((pId) => String(pId) === itemId);
          });

          if (matchingItems.length === 0) {
            return res.status(400).json({ message: "This coupon code is not applicable to the products in your order." });
          }

          const matchingTotal = matchingItems.reduce(
            (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1),
            0
          );
          const minOrder = roundMoney(
            convertCurrencyAmount(Number(coupon.minOrder || 0), {
              sourceCurrency: "INR",
              currency: orderCurrency,
              rates: settings?.currencyConversionRates || {}
            })
          );

          if (matchingTotal < minOrder) {
            return res.status(400).json({
              message: `Minimum order for qualifying products is ${minOrder} ${orderCurrency}`
            });
          }

          if (coupon.type === "percentage") {
            discount = roundMoney((matchingTotal * Number(coupon.value || 0)) / 100);
          } else if (coupon.type === "fixed") {
            discount = roundMoney(
              convertCurrencyAmount(Number(coupon.value || 0), {
                sourceCurrency: "INR",
                currency: orderCurrency,
                rates: settings?.currencyConversionRates || {}
              })
            );
          }

          discount = Math.max(0, Math.min(matchingTotal, discount));
          appliedCouponCode = couponCode;
        } else {
          const minOrder = roundMoney(
            convertCurrencyAmount(Number(coupon.minOrder || 0), {
              sourceCurrency: "INR",
              currency: orderCurrency,
              rates: settings?.currencyConversionRates || {}
            })
          );
          if (grossTotal >= minOrder) {
            if (coupon.type === "percentage") {
              discount = roundMoney((grossTotal * Number(coupon.value || 0)) / 100);
            } else if (coupon.type === "fixed") {
              discount = roundMoney(
                convertCurrencyAmount(Number(coupon.value || 0), {
                  sourceCurrency: "INR",
                  currency: orderCurrency,
                  rates: settings?.currencyConversionRates || {}
                })
              );
            }
            discount = Math.max(0, Math.min(grossTotal, discount));
            appliedCouponCode = couponCode;
          } else {
            return res.status(400).json({ message: `Minimum order ${minOrder} ${orderCurrency}` });
          }
        }
      } else {
        return res.status(400).json({ message: "Invalid or expired coupon code." });
      }
    }

    const total = roundMoney(Math.max(0, grossTotal - discount));

    return res.json({
      subtotal,
      gstPercent,
      gstAmount,
      deliveryCharge,
      discount,
      total,
      currency: orderCurrency,
      couponCode: appliedCouponCode
    });
  } catch (error) {
    console.error("calculate-totals error:", error);
    return res.status(500).json({ message: error.message || "Failed to calculate totals." });
  }
});

const ensureGiftPassesForOrder = async (order) => {
  if (!order || String(order.paymentStatus) !== "Paid") return order;

  const items = Array.isArray(order.items) ? [...order.items] : [];
  let updated = false;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const isDigitalItem = Boolean(
      item.isDigital ||
      item.webReaderLink ||
      item.kindleLink ||
      String(item.name || "").toLowerCase().includes("flipbook") ||
      String(item.name || "").toLowerCase().includes("web") ||
      String(item.name || "").toLowerCase().includes("kindle") ||
      String(item.format || "").toLowerCase().includes("web") ||
      String(item.format || "").toLowerCase().includes("flipbook")
    );

    if ((order.isGift || item.isGift) && !item.giftCode) {
      const code = generateGiftCode();
      try {
        await GiftPass.create({
          code,
          product: item.product || item._id || item.id,
          productName: item.name || "Digital Item",
          order: order._id,
          buyer: order.user,
          isRedeemed: false
        });
        item.giftCode = code;
        updated = true;
      } catch (err) {
        console.error("[GiftPass] Creation error:", err.message);
      }
    }
  }

  if (updated) {
    await Order.updateOne({ _id: order._id }, { $set: { items } });
    order.items = items;
  }
  return order;
};

// Create order (logged-in user)
router.post("/", protect, async (req, res) => {
  const shipping = req.body.shipping || {};
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const couponCode = String(req.body?.couponCode || "").trim().toUpperCase();
  const shippingCountry = String(shipping?.country || "").trim();
  const requestedProductIds = [...new Set(
    items.map((item) => String(item?._id || item?.id || item?.product || "").trim()).filter(Boolean)
  )];

  const products = await Product.find({ _id: { $in: requestedProductIds } })
    .populate("bundleItems.product")
    .lean();
  const productsById = new Map(products.map((product) => [String(product._id), product]));
  const settings =
    (await StoreSettings.findOne()) || {
      gstPercent: 0,
      deliveryCharge: 0,
      pricingMarkets: [],
      internationalPricingDefaults: { currency: "USD" },
      currencyConversionRates: {}
    };
  const pricingConfig = {
    pricingMarkets: settings?.pricingMarkets || [],
    internationalPricingDefaults: settings?.internationalPricingDefaults || {},
    currencyConversionRates: settings?.currencyConversionRates || {}
  };

  const normalizedItems = items.reduce((acc, item) => {
    const productId = String(item?._id || item?.id || item?.product || "").trim();
    const product = productsById.get(productId);
    if (!product) {
      return acc;
    }

    const quantity = Math.max(1, Number(item?.quantity || 1));
    const pricing = getProductPriceDetails(product, shippingCountry, pricingConfig);

    acc.push({
      product: productId,
      _id: productId,
      id: productId,
      name: String(product?.name || item?.name || "").trim(),
      image: String(product?.image || item?.image || "").trim(),
      category: String(product?.category || item?.category || "General").trim() || "General",
      format: String(item?.format || item?.selectedFormat || product?.format || "").trim(),
      isDigital: Boolean(product?.isDigital || item?.isDigital),
      digitalType: String(product?.digitalType || item?.digitalType || "Web Version").trim(),
      webReaderLink: String(product?.webReaderLink || item?.webReaderLink || "").trim(),
      kindleLink: String(product?.kindleLink || item?.kindleLink || "").trim(),
      kindleAsin: String(product?.kindleAsin || item?.kindleAsin || "").trim(),
      digitalInstructions: String(product?.digitalInstructions || item?.digitalInstructions || "").trim(),
      quantity,
      price: roundMoney(pricing.price),
      currency: String(pricing.currency || "INR").trim().toUpperCase(),
      weight: Number(product?.weight || 0),
      height: Number(product?.height || 0),
      width: Number(product?.width || 0),
      length: Number(product?.length || 0),
      domesticPrice: roundMoney(pricing.domesticPrice),
      internationalPrice: roundMoney(pricing.internationalPrice),
      internationalCountryPrices: Array.isArray(product?.internationalCountryPrices)
        ? product.internationalCountryPrices.map((entry) => ({
            country: String(entry?.country || "").trim(),
            price: roundMoney(Number(entry?.price || 0))
          }))
        : [],
      marketPrices: Array.isArray(product?.marketPrices)
        ? product.marketPrices.map((entry) => ({
            market: String(entry?.market || "").trim(),
            regularPrice: roundMoney(Number(entry?.regularPrice || 0)),
            salePrice:
              entry?.salePrice === null || entry?.salePrice === undefined
                ? null
                : roundMoney(Number(entry?.salePrice || 0)),
            startDate: entry?.startDate || null,
            endDate: entry?.endDate || null
          }))
        : [],
      appliedPriceType: pricing.priceType,
      matchedMarket: pricing.matchedMarket || "",
      productType: String(product?.productType || "single"),
      bundleItems: Array.isArray(product?.bundleItems)
        ? product.bundleItems.map((bi) => ({
            product: bi.product?._id ? String(bi.product._id) : String(bi.product),
            name: bi.product?.name || "Product",
            image: bi.product?.image || "",
            quantity: Number(bi.quantity || 1)
          }))
        : [],
      deliveredAt: null,
      returnRequest: {
        status: "Not Requested",
        requestedAt: null,
        resolvedAt: null,
        reason: ""
      }
    });
    return acc;
  }, []);

  if (normalizedItems.length === 0) {
    return res.status(400).json({ message: "No valid products found for this order." });
  }

  // ── Stock check + atomic decrement ───────────────────────────────────────
  // Only decrement for non-Failed orders (Failed = payment didn't go through,
  // so we still record the attempt but don't hold stock).
  const rawPaymentStatusEarly = String(req.body?.paymentStatus || "").trim();
  if (!allowedPaymentStatuses.has(rawPaymentStatusEarly)) {
    return res.status(400).json({ message: "Invalid payment status." });
  }

  if (rawPaymentStatusEarly !== "Failed") {
    const outOfStock = await decrementStock(normalizedItems);
    if (outOfStock.length > 0) {
      return res.status(409).json({
        message: "Some items are out of stock: " + outOfStock.join("; ")
      });
    }
  }

  const subtotal = roundMoney(
    normalizedItems.reduce((sum, item) => sum + Number(item?.price || 0) * Math.max(1, Number(item?.quantity || 1)), 0)
  );
  const orderCurrency = normalizeCurrencyCode(
    req.body?.currencyDisplay?.currency || normalizedItems[0]?.currency || "INR",
    "INR"
  );

  const gstPercent = Math.min(50, Math.max(0, Number(settings.gstPercent || 0)));
  const deliveryCharge = roundMoney(
    convertCurrencyAmount(resolveDeliveryCharge(settings, shipping, normalizedItems), {
      sourceCurrency: "INR",
      currency: orderCurrency,
      rates: settings?.currencyConversionRates || {}
    })
  );



  let totalItemGst = 0;
  normalizedItems.forEach((item) => {
    const qty = Math.max(1, Number(item.quantity || 1));
    const price = Number(item.price || 0);
    const lineTotal = qty * price;
    const hsnSac = getItemHsnSac(item);
    const gstRate = hsnSac === "4901" ? 0 : gstPercent;
    const itemGst = Math.round(((lineTotal * gstRate) / 100) * 100) / 100;
    totalItemGst += itemGst;
  });

  const gstAmount = roundMoney(totalItemGst);
  const grossTotal = roundMoney(subtotal + gstAmount + deliveryCharge);

  let discount = 0;
  let appliedCouponCode = "";
  if (couponCode) {
    const coupon = await Coupon.findOne({ code: couponCode });
    if (coupon && (!coupon.expiresAt || new Date() <= coupon.expiresAt)) {
      // 1. Check if user already used this coupon
      if (coupon.usedBy && coupon.usedBy.some((uId) => String(uId) === String(req.user))) {
        await restoreStockForOrder({ items: normalizedItems });
        return res.status(400).json({ message: "You have already used this coupon code." });
      }

      // 2. Check if user email matches assignment
      if (coupon.assignedUserEmail) {
        const user = await User.findById(req.user).select("email").lean();
        if (String(coupon.assignedUserEmail).toLowerCase() !== String(user?.email || "").toLowerCase()) {
          await restoreStockForOrder({ items: normalizedItems });
          return res.status(400).json({ message: "This coupon is gifted/assigned to another user's account." });
        }
      }

      // 3. Product-restricted check or General check
      if (Array.isArray(coupon.applicableProducts) && coupon.applicableProducts.length > 0) {
        const matchingItems = normalizedItems.filter((item) => {
          const itemId = String(item.product || item._id || item.id || "");
          return coupon.applicableProducts.some((pId) => String(pId) === itemId);
        });

        if (matchingItems.length === 0) {
          await restoreStockForOrder({ items: normalizedItems });
          return res.status(400).json({ message: "This coupon code is not applicable to the products in your order." });
        }

        const matchingTotal = matchingItems.reduce(
          (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1),
          0
        );
        const minOrder = roundMoney(
          convertCurrencyAmount(Number(coupon.minOrder || 0), {
            sourceCurrency: "INR",
            currency: orderCurrency,
            rates: settings?.currencyConversionRates || {}
          })
        );

        if (matchingTotal < minOrder) {
          await restoreStockForOrder({ items: normalizedItems });
          return res.status(400).json({
            message: `Minimum order for qualifying products is ${minOrder} ${orderCurrency}`
          });
        }

        if (coupon.type === "percentage") {
          discount = roundMoney((matchingTotal * Number(coupon.value || 0)) / 100);
        } else if (coupon.type === "fixed") {
          discount = roundMoney(
            convertCurrencyAmount(Number(coupon.value || 0), {
              sourceCurrency: "INR",
              currency: orderCurrency,
              rates: settings?.currencyConversionRates || {}
            })
          );
        }

        discount = Math.max(0, Math.min(matchingTotal, discount));
        appliedCouponCode = couponCode;
      } else {
        const minOrder = roundMoney(
          convertCurrencyAmount(Number(coupon.minOrder || 0), {
            sourceCurrency: "INR",
            currency: orderCurrency,
            rates: settings?.currencyConversionRates || {}
          })
        );
        if (grossTotal >= minOrder) {
          if (coupon.type === "percentage") {
            discount = roundMoney((grossTotal * Number(coupon.value || 0)) / 100);
          } else if (coupon.type === "fixed") {
            discount = roundMoney(
              convertCurrencyAmount(Number(coupon.value || 0), {
                sourceCurrency: "INR",
                currency: orderCurrency,
                rates: settings?.currencyConversionRates || {}
              })
            );
          }
          discount = Math.max(0, Math.min(grossTotal, discount));
          appliedCouponCode = couponCode;
        } else {
          await restoreStockForOrder({ items: normalizedItems });
          return res.status(400).json({ message: `Minimum order ${minOrder} ${orderCurrency}` });
        }
      }
    } else {
      await restoreStockForOrder({ items: normalizedItems });
      return res.status(400).json({ message: "Invalid or expired coupon code." });
    }
  }

  const total = roundMoney(Math.max(0, grossTotal - discount));

  if (req.body.total !== undefined && Math.abs(total - Number(req.body.total)) > 0.05) {
    // Roll back stock since we already decremented it
    await restoreStockForOrder({ items: normalizedItems });
    return res.status(400).json({
      message: `Order total mismatch. Server calculated: ${total}, Client provided: ${req.body.total}`
    });
  }

  const rawPaymentStatus = rawPaymentStatusEarly;

  const razorpayOrderId = String(req.body?.razorpayOrderId || "").trim();
  const razorpayPaymentId = String(req.body?.razorpayPaymentId || "").trim();
  if (rawPaymentStatus === "Paid" && (!razorpayOrderId || !razorpayPaymentId)) {
    // Roll back stock since we already decremented it
    await restoreStockForOrder({ items: normalizedItems });
    return res.status(400).json({ message: "Payment reference is required to place paid order." });
  }

  const requestedCurrency = String(req.body?.currencyDisplay?.currency || "")
    .trim()
    .toUpperCase();
  const requestedDisplayAmount = Number(req.body?.currencyDisplay?.amount);
  const requestedDetectedCountry = String(req.body?.currencyDisplay?.detectedCountry || "")
    .trim()
    .toUpperCase();

  const requestedBilling = req.body.billing || req.body.shipping || {};

  const isDigitalOnlyOrder = normalizedItems.length > 0 && normalizedItems.every((item) =>
    Boolean(
      item.isDigital ||
      item.webReaderLink ||
      item.kindleLink ||
      String(item.name || "").toLowerCase().includes("web") ||
      String(item.name || "").toLowerCase().includes("kindle") ||
      String(item.name || "").toLowerCase().includes("flipbook") ||
      String(item.format || "").toLowerCase().includes("web") ||
      String(item.format || "").toLowerCase().includes("flipbook")
    )
  );

  const initialOrderStatus = rawPaymentStatus === "Paid" && isDigitalOnlyOrder
    ? "Completed"
    : rawPaymentStatus === "Paid"
    ? "Pending"
    : "On Hold";

  let order;
  try {
    order = await Order.create({
      user: req.user,
      items: normalizedItems,
      subtotal,
      gstPercent,
      gstAmount,
      couponCode: appliedCouponCode,
      discount,
      deliveryCharge,
      total,
      orderStatus: initialOrderStatus,
      paymentStatus: rawPaymentStatus,
      paymentMeta: {
        razorpayOrderId,
        razorpayPaymentId,
        paidAt: rawPaymentStatus === "Paid" ? new Date() : null
      },
      isGift: req.body?.isGift === true,
      refundStatus: "Not Applicable",
      currencyDisplay: {
        currency: requestedCurrency || orderCurrency,
        amount: Number.isFinite(requestedDisplayAmount) ? requestedDisplayAmount : null,
        detectedCountry: requestedDetectedCountry
      },
      billing: {
        name: requestedBilling.name || "",
        phone: requestedBilling.phone || "",
        email: requestedBilling.email || "",
        address: requestedBilling.address || "",
        city: requestedBilling.city || "",
        state: requestedBilling.state || "",
        pincode: requestedBilling.pincode || "",
        country: requestedBilling.country || ""
      },
      shipping: {
        name: shipping.name || "",
        phone: shipping.phone || "",
        address: shipping.address || "",
        city: shipping.city || "",
        state: shipping.state || "",
        pincode: shipping.pincode || "",
        country: shipping.country || "",
        latitude: shipping.latitude === null || shipping.latitude === undefined ? null : Number(shipping.latitude),
        longitude: shipping.longitude === null || shipping.longitude === undefined ? null : Number(shipping.longitude)
      }
    });
  } catch (createErr) {
    // Order save failed — restore stock so it isn't permanently lost
    await restoreStockForOrder({ items: normalizedItems });
    throw createErr;
  }

  // Record coupon usage
  if (order && appliedCouponCode) {
    await Coupon.updateOne(
      { code: appliedCouponCode },
      { $addToSet: { usedBy: req.user } }
    );
  }

  await ensureGiftPassesForOrder(order);

  res.json(order);

  // ── Fire-and-forget: order confirmation push + email ─────────────────────
  fireNotifications(async () => {
    const user = await User.findById(req.user).select("name email").lean();
    if (!user) return;
    await sendPushToUser(req.user, orderPayload(order, "placed"));
    await sendOrderConfirmation(order, user);
  });

  // ── Fire-and-forget: low-stock alerts after stock decrement ───────────────
  if (rawPaymentStatus !== "Failed") {
    fireNotifications(() => fireLowStockAlerts(normalizedItems));
  }
});

const autoCompletePaidDigitalOrders = async (orders) => {
  if (!Array.isArray(orders) || orders.length === 0) return orders;

  const orderIdsToComplete = [];
  orders.forEach((order) => {
    const isPaid = String(order.paymentStatus || "").toLowerCase() === "paid";
    const items = Array.isArray(order.items) ? order.items : [];
    const isDigitalOnly = items.length > 0 && items.every((item) =>
      Boolean(
        item.isDigital ||
        item.webReaderLink ||
        item.kindleLink ||
        String(item.name || "").toLowerCase().includes("web") ||
        String(item.name || "").toLowerCase().includes("kindle") ||
        String(item.name || "").toLowerCase().includes("flipbook") ||
        String(item.format || "").toLowerCase().includes("web") ||
        String(item.format || "").toLowerCase().includes("flipbook")
      )
    );

    if (isPaid && isDigitalOnly && order.orderStatus !== "Completed" && order.status !== "Completed" && order.orderStatus !== "Cancelled" && order.status !== "Cancelled") {
      order.orderStatus = "Completed";
      order.status = "Completed";
      if (order._id) orderIdsToComplete.push(order._id);
    }
  });

  if (orderIdsToComplete.length > 0) {
    try {
      await Order.updateMany(
        { _id: { $in: orderIdsToComplete } },
        { $set: { orderStatus: "Completed", status: "Completed" } }
      );
    } catch (err) {
      console.error("Failed to auto-complete digital orders:", err);
    }
  }

  return orders;
};

// Get all orders (admin only)
router.get("/", protect, admin, async (req, res) => {
  try {
    const settings = await StoreSettings.findOne().select("currencyConversionRates").lean();
    const rates = settings?.currencyConversionRates || {};

    const branches = Object.entries(rates)
      .filter(([currency, rate]) => currency !== "INR" && Number(rate) > 0)
      .map(([currency, rate]) => ({
        case: { $eq: ["$currencyDisplay.currency", currency.toUpperCase()] },
        then: Number(rate)
      }));

    const paidAmountExpression = { $ifNull: ["$currencyDisplay.amount", "$total"] };

    const totalInBaseExpression = branches.length > 0
      ? {
          $divide: [
            paidAmountExpression,
            {
              $switch: {
                branches,
                default: 1
              }
            }
          ]
        }
      : paidAmountExpression;

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limitQuery = req.query.limit;
    const isPaginated = limitQuery !== "all";
    const limit = Math.max(1, parseInt(limitQuery) || 20);
    const skip = (page - 1) * limit;

    const sortOrder = req.query.sort === "oldest" ? 1 : -1;
    const searchText = req.query.search ? String(req.query.search).trim() : "";
    const statusFilter = req.query.status ? String(req.query.status).trim() : "All";
    const fromDateTime = req.query.fromDateTime;
    const toDateTime = req.query.toDateTime;

    // 1. Build base query (matching search text and date range)
    let baseQuery = {};

    if (searchText) {
      // Find matching users first (for user.name and user.email search)
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: searchText, $options: "i" } },
          { email: { $regex: searchText, $options: "i" } }
        ]
      }).select("_id");
      const userIds = matchingUsers.map((u) => u._id);

      const conditions = [
        { "billing.name": { $regex: searchText, $options: "i" } },
        { "billing.email": { $regex: searchText, $options: "i" } },
        { "shipping.name": { $regex: searchText, $options: "i" } },
        { "items.name": { $regex: searchText, $options: "i" } }
      ];

      if (mongoose.Types.ObjectId.isValid(searchText)) {
        conditions.push({ _id: searchText });
      }

      if (userIds.length > 0) {
        conditions.push({ user: { $in: userIds } });
      }

      baseQuery.$or = conditions;
    }

    if (fromDateTime || toDateTime) {
      baseQuery.createdAt = {};
      if (fromDateTime) {
        baseQuery.createdAt.$gte = new Date(fromDateTime);
      }
      if (toDateTime) {
        baseQuery.createdAt.$lte = new Date(toDateTime);
      }
    }

    // 2. Build final query adding status constraints
    let finalQuery = { ...baseQuery };

    if (statusFilter === "On Hold") {
      finalQuery.status = { $ne: "Cancelled" };
      finalQuery.paymentStatus = { $ne: "Paid" };
    } else if (statusFilter === "Pending") {
      finalQuery.status = "Pending";
      finalQuery.paymentStatus = "Paid";
    } else if (statusFilter === "Shipped") {
      finalQuery.status = "Shipped";
      finalQuery.paymentStatus = "Paid";
    } else if (statusFilter === "Delivered") {
      finalQuery.status = "Delivered";
      finalQuery.paymentStatus = "Paid";
    } else if (statusFilter === "Cancelled") {
      finalQuery.status = "Cancelled";
    } else if (statusFilter === "Return Requests") {
      finalQuery["items.returnRequest.status"] = { $ne: "Not Requested" };
    }

    // 3. Query paginated orders
    let queryExec = Order.find(finalQuery)
      .populate("user", "name email")
      .sort({ createdAt: sortOrder });

    if (isPaginated) {
      queryExec = queryExec.skip(skip).limit(limit);
    }

    const orders = await queryExec;
    await autoCompletePaidDigitalOrders(orders);

    // 4. Calculate total count for matching active status query
    const totalMatchingOrders = await Order.countDocuments(finalQuery);

    // 5. Gather counts for each chip status (using baseQuery)
    const [
      totalCount,
      onHoldCount,
      pendingCount,
      shippedCount,
      deliveredCount,
      cancelledCount,
      returnCount,
      statsResult
    ] = await Promise.all([
      Order.countDocuments(baseQuery),
      Order.countDocuments({ ...baseQuery, status: { $ne: "Cancelled" }, paymentStatus: { $ne: "Paid" } }),
      Order.countDocuments({ ...baseQuery, status: "Pending", paymentStatus: "Paid" }),
      Order.countDocuments({ ...baseQuery, status: "Shipped", paymentStatus: "Paid" }),
      Order.countDocuments({ ...baseQuery, status: "Delivered", paymentStatus: "Paid" }),
      Order.countDocuments({ ...baseQuery, status: "Cancelled" }),
      Order.countDocuments({ ...baseQuery, "items.returnRequest.status": { $ne: "Not Requested" } }),
      Order.aggregate([
        { $match: finalQuery },
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      { $eq: ["$status", "Cancelled"] },
                      { $eq: ["$refundStatus", "Refunded"] }
                    ]
                  },
                  0,
                  totalInBaseExpression
                ]
              }
            },
            pendingPaymentsCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$paymentStatus", "Paid"] },
                      { $ne: ["$refundStatus", "Refunded"] }
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            fulfilledCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $in: ["$status", ["Shipped", "Delivered"]] },
                      { $eq: ["$paymentStatus", "Paid"] }
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ])
    ]);

    const overviewStats = statsResult[0] || {
      totalRevenue: 0,
      pendingPaymentsCount: 0,
      fulfilledCount: 0
    };

    res.json({
      orders,
      totalOrders: totalMatchingOrders,
      totalPages: isPaginated ? Math.ceil(totalMatchingOrders / limit) : 1,
      currentPage: page,
      statusSummary: {
        All: totalCount,
        "On Hold": onHoldCount,
        Pending: pendingCount,
        Shipped: shippedCount,
        Delivered: deliveredCount,
        Cancelled: cancelledCount,
        "Return Requests": returnCount
      },
      overviewStats: {
        totalOrders: totalMatchingOrders,
        totalRevenue: overviewStats.totalRevenue || 0,
        pendingPayments: overviewStats.pendingPaymentsCount || 0,
        fulfilledOrders: overviewStats.fulfilledCount || 0
      }
    });
  } catch (error) {
    console.error("Fetch orders error:", error);
    res.status(500).json({ message: error.message || "Failed to load orders." });
  }
});
// UPDATE order status (ADMIN)
router.put("/:id/status", protect, admin, async (req, res) => {
  const actor = await getAdminActorSnapshot(req.user);
  const statusMap = {
    pending: "Pending",
    shipped: "Shipped",
    delivered: "Delivered",
    cancelled: "Cancelled"
  };
  const rawStatus = String(req.body.status || "").trim().toLowerCase();
  const normalizedStatus = statusMap[rawStatus];

  if (!normalizedStatus) {
    return res.status(400).json({ message: "Invalid order status" });
  }

  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const previousStatus = String(order.status || "").trim() || "Pending";

  if (String(order.status || "").trim() === "Cancelled" && normalizedStatus !== "Cancelled") {
    return res.status(400).json({ message: "Cancelled orders cannot be moved back to shipping states." });
  }

  if (normalizedStatus !== "Cancelled" && String(order.paymentStatus || "").trim() !== "Paid") {
    return res.status(400).json({ message: "Order status can be updated only after payment is completed." });
  }

  // Stock-holding states: Pending and Shipped (goods not yet returned)
  const stockHoldingStates = new Set(["Pending", "Shipped"]);

  // If status is updated to Shipped, or if the order is already in a state that supports tracking, update tracking details.
  if (normalizedStatus === "Shipped" || order.status === "Shipped" || order.status === "Delivered") {
    if (req.body.trackingId !== undefined) {
      order.trackingId = String(req.body.trackingId || "").trim();
    }
    if (req.body.courierPartner !== undefined) {
      order.courierPartner = String(req.body.courierPartner || "").trim();
    }
    if (normalizedStatus === "Shipped") {
      order.shippedAt = order.shippedAt || new Date();
    }
  }

  order.status = normalizedStatus;
  if (normalizedStatus === "Cancelled") {
    order.cancelledAt = order.cancelledAt || new Date();
    order.refundStatus = String(order.paymentStatus || "").trim() === "Paid" ? "Pending" : "Not Applicable";
  }
  if (normalizedStatus === "Delivered") {
    order.deliveredAt = order.deliveredAt || new Date();
    if (Array.isArray(order.items)) {
      order.items = order.items.map((item) => ({
        ...item,
        deliveredAt: item?.deliveredAt || order.deliveredAt
      }));
    }
  }
  order.lastUpdatedByName = actor.name;
  order.lastUpdatedByEmail = actor.email;
  order.lastUpdatedAt = new Date();
  const updated = await order.save();

  // Restore stock when admin cancels an order that was still holding stock
  if (normalizedStatus === "Cancelled" && stockHoldingStates.has(previousStatus)) {
    await restoreStockForOrder(updated);
  }

  // Restore coupon eligibility on cancellation
  if (normalizedStatus === "Cancelled" && updated.couponCode) {
    await Coupon.updateOne(
      { code: updated.couponCode.toUpperCase() },
      { $pull: { usedBy: updated.user } }
    );
  }

  await logAdminAction({
    req,
    action: "order-status-updated",
    entityType: "order",
    entityId: String(updated._id || ""),
    entityLabel: String(updated._id || ""),
    summary: `Updated order ${String(updated._id || "").slice(-6)} status: ${previousStatus} -> ${normalizedStatus}`,
    details: {
      previousStatus,
      nextStatus: normalizedStatus
    }
  });

  res.json(updated);

  // ── Fire-and-forget: status-change push + email to customer ──────────────
  if (["Shipped", "Delivered", "Cancelled"].includes(normalizedStatus)) {
    fireNotifications(async () => {
      const populatedOrder = await Order.findById(updated._id).populate("user", "name email").lean();
      if (!populatedOrder?.user) return;

      const isDigitalOnly = Array.isArray(populatedOrder.items) && populatedOrder.items.length > 0 && populatedOrder.items.every((item) =>
        Boolean(
          item.isDigital ||
          item.webReaderLink ||
          item.kindleLink ||
          String(item.name || "").toLowerCase().includes("web") ||
          String(item.name || "").toLowerCase().includes("kindle") ||
          String(item.name || "").toLowerCase().includes("flipbook") ||
          String(item.format || "").toLowerCase().includes("web") ||
          String(item.format || "").toLowerCase().includes("flipbook")
        )
      );

      // Digital-only orders get instant online access upon payment; skip physical shipping/delivery notification emails
      if (isDigitalOnly && ["Shipped", "Delivered"].includes(normalizedStatus)) {
        return;
      }

      await sendPushToUser(populatedOrder.user._id, orderPayload(updated, normalizedStatus.toLowerCase()));
      await sendOrderStatusUpdate(updated, populatedOrder.user, normalizedStatus);
    });
  }
});

router.put("/:id/cancel", protect, async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const isOwner = String(order.user) === String(req.user);
  if (!isOwner) {
    return res.status(403).json({ message: "You can only cancel your own orders." });
  }

  if (String(order.status || "").trim() !== "Pending") {
    return res.status(400).json({ message: "Only pending orders can be cancelled before shipping." });
  }

  order.status = "Cancelled";
  order.cancelledAt = new Date();
  order.refundStatus = String(order.paymentStatus || "").trim() === "Paid" ? "Pending" : "Not Applicable";

  const updated = await order.save();

  // Restore stock — user can only cancel Pending orders, so stock was held
  await restoreStockForOrder(updated);

  // Restore coupon eligibility on cancellation
  if (updated.couponCode) {
    await Coupon.updateOne(
      { code: updated.couponCode.toUpperCase() },
      { $pull: { usedBy: req.user } }
    );
  }

  res.json(updated);
});

router.put("/:id/payment-status", protect, async (req, res) => {
  const rawPaymentStatus = String(req.body?.paymentStatus || "").trim();
  const mutablePaymentStatuses = new Set(["Pending", "Paid", "Failed"]);
  if (!mutablePaymentStatuses.has(rawPaymentStatus)) {
    return res.status(400).json({ message: "Invalid payment status" });
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const isOwner = String(order.user) === String(req.user);
  if (!isOwner) {
    return res.status(403).json({ message: "You can only update your own orders." });
  }

  order.paymentStatus = rawPaymentStatus;
  if (rawPaymentStatus === "Paid") {
    order.paymentMeta = {
      razorpayOrderId: String(req.body?.razorpayOrderId || ""),
      razorpayPaymentId: String(req.body?.razorpayPaymentId || ""),
      paidAt: new Date()
    };

    const isDigitalOnly = Array.isArray(order.items) && order.items.length > 0 && order.items.every((item) =>
      Boolean(
        item.isDigital ||
        item.webReaderLink ||
        item.kindleLink ||
        String(item.name || "").toLowerCase().includes("web") ||
        String(item.name || "").toLowerCase().includes("kindle") ||
        String(item.name || "").toLowerCase().includes("flipbook") ||
        String(item.format || "").toLowerCase().includes("web") ||
        String(item.format || "").toLowerCase().includes("flipbook")
      )
    );

    if (isDigitalOnly) {
      order.orderStatus = "Completed";
    }
  }

  const updated = await order.save();
  await ensureGiftPassesForOrder(updated);
  res.json(updated);
});

router.put("/:id/items/:itemId/return-request", protect, async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const isOwner = String(order.user) === String(req.user);
  if (!isOwner) {
    return res.status(403).json({ message: "You can only request a return for your own orders." });
  }

  const item = getOrderItemById(order, req.params.itemId);
  if (!item) {
    return res.status(404).json({ message: "Order item not found" });
  }

  if (!canRequestReturnForItem(order, item)) {
    return res.status(400).json({ message: "Returns are only available for delivered paid items within 7 days." });
  }

  item.returnRequest = {
    status: "Requested",
    requestedAt: new Date(),
    resolvedAt: null,
    reason: String(req.body?.reason || "").trim()
  };
  order.refundStatus = "Pending";

  order.markModified("items");
  const updated = await order.save();
  res.json(updated);
});

router.put("/:id/refund-status", protect, admin, async (req, res) => {
  const actor = await getAdminActorSnapshot(req.user);
  const refundStatus = String(req.body?.refundStatus || "").trim();
  if (!allowedRefundStatuses.has(refundStatus)) {
    return res.status(400).json({ message: "Invalid refund status" });
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const previousRefundStatus = String(order.refundStatus || "").trim() || "Not Applicable";

  if (String(order.status || "").trim() !== "Cancelled" || String(order.paymentStatus || "").trim() !== "Paid") {
    return res.status(400).json({ message: "Refund status can be updated only for paid cancelled orders." });
  }

  order.refundStatus = refundStatus;
  order.lastUpdatedByName = actor.name;
  order.lastUpdatedByEmail = actor.email;
  order.lastUpdatedAt = new Date();
  const updated = await order.save();

  await logAdminAction({
    req,
    action: "order-refund-updated",
    entityType: "order",
    entityId: String(updated._id || ""),
    entityLabel: String(updated._id || ""),
    summary: `Updated refund for order ${String(updated._id || "").slice(-6)}: ${previousRefundStatus} -> ${refundStatus}`,
    details: {
      previousRefundStatus,
      nextRefundStatus: refundStatus
    }
  });

  res.json(updated);
});

router.put("/:id/items/:itemId/return-status", protect, admin, async (req, res) => {
  const actor = await getAdminActorSnapshot(req.user);
  const returnStatus = String(req.body?.returnStatus || "").trim();
  const adminReason = String(req.body?.adminReason || "").trim();
  if (!allowedReturnStatuses.has(returnStatus)) {
    return res.status(400).json({ message: "Invalid return status" });
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const item = getOrderItemById(order, req.params.itemId);
  if (!item) {
    return res.status(404).json({ message: "Order item not found" });
  }

  const previousReturnStatus = String(item?.returnRequest?.status || "Not Requested").trim();

  if (String(item?.returnRequest?.status || "Not Requested").trim() === "Not Requested") {
    return res.status(400).json({ message: "This item does not have a return request." });
  }

  if (returnStatus === "Rejected" && !adminReason) {
    return res.status(400).json({ message: "Please provide a reason before rejecting this return request." });
  }

  item.returnRequest.status = returnStatus;
  item.returnRequest.resolvedAt = returnStatus === "Requested" ? null : new Date();
  item.returnRequest.adminReason = returnStatus === "Rejected" ? adminReason : String(item?.returnRequest?.adminReason || "").trim();

  if (returnStatus === "Requested") {
    order.refundStatus = "Pending";
  } else if (returnStatus === "Approved") {
    order.refundStatus = "Processing";
  } else if (returnStatus === "Rejected") {
    order.refundStatus = "Rejected";
  } else if (returnStatus === "Refunded") {
    order.refundStatus = "Refunded";
  }

  order.markModified("items");
  order.lastUpdatedByName = actor.name;
  order.lastUpdatedByEmail = actor.email;
  order.lastUpdatedAt = new Date();
  const updated = await order.save();

  await logAdminAction({
    req,
    action: "order-return-updated",
    entityType: "order-item-return",
    entityId: `${String(updated._id || "")}:${String(req.params.itemId || "")}`,
    entityLabel: String(item?.name || req.params.itemId || "").trim(),
    summary:
      `Updated return for order ${String(updated._id || "").slice(-6)} item ${String(item?.name || "").trim() || "item"}: ` +
      `${previousReturnStatus} -> ${returnStatus}`,
    details: {
      orderId: String(updated._id || ""),
      itemId: String(req.params.itemId || ""),
      itemName: String(item?.name || "").trim(),
      previousReturnStatus,
      nextReturnStatus: returnStatus
    }
  });

  res.json(updated);
});

// GET logged-in user's orders
router.get("/my", protect, async (req, res) => {
  try {
    let orders = await Order.find({ user: req.user }).sort({ createdAt: -1 }).lean();

    // Ensure gift pass codes exist for any paid gift orders
    for (let i = 0; i < orders.length; i++) {
      if (orders[i].isGift && orders[i].paymentStatus === "Paid") {
        orders[i] = await ensureGiftPassesForOrder(orders[i]);
      }
    }

    // Also fetch any gift passes redeemed by this user
    const redeemedPasses = await GiftPass.find({ redeemedBy: req.user, isRedeemed: true })
      .populate("product")
      .lean();

    if (redeemedPasses.length > 0) {
      const redeemedOrderIds = redeemedPasses.map((gp) => String(gp.order));
      const existingOrderIds = new Set(orders.map((o) => String(o._id)));
      const missingOrderIds = redeemedOrderIds.filter((id) => !existingOrderIds.has(id));

      if (missingOrderIds.length > 0) {
        const giftOrders = await Order.find({ _id: { $in: missingOrderIds } }).lean();
        giftOrders.forEach((gOrder) => {
          gOrder.isRedeemedGift = true;
          orders.push(gOrder);
        });
      }
    }

    const productIds = [];
    orders.forEach((order) => {
      if (Array.isArray(order.items)) {
        order.items.forEach((item) => {
          const pId = String(item.product || item._id || item.id || "").trim();
          if (pId) productIds.push(pId);
        });
      }
    });

    if (productIds.length > 0) {
      const products = await Product.find({ _id: { $in: productIds } })
        .select("isDigital digitalType webReaderLink kindleLink kindleAsin digitalInstructions")
        .lean();
      const productMap = new Map(products.map((p) => [String(p._id), p]));

      orders.forEach((order) => {
        if (Array.isArray(order.items)) {
          order.items.forEach((item) => {
            const pId = String(item.product || item._id || item.id || "").trim();
            const prod = productMap.get(pId);
            if (prod) {
              if (!item.isDigital && prod.isDigital) item.isDigital = true;
              if (!item.webReaderLink && prod.webReaderLink) item.webReaderLink = prod.webReaderLink;
              if (!item.kindleLink && prod.kindleLink) item.kindleLink = prod.kindleLink;
              if (!item.kindleAsin && prod.kindleAsin) item.kindleAsin = prod.kindleAsin;
              if (!item.digitalInstructions && prod.digitalInstructions) item.digitalInstructions = prod.digitalInstructions;
              if (!item.digitalType && prod.digitalType) item.digitalType = prod.digitalType;
            }
          });
        }
      });
    }

    res.json(orders);
  } catch (err) {
    console.error("Failed to load user orders:", err);
    res.status(500).json({ message: "Failed to load orders" });
  }
});

// Get single order (admin only)
router.get("/:id", protect, admin, async (req, res) => {
  const order = await Order.findById(req.params.id).populate("user", "name email").lean();

  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  res.json(order);
});

// Get tracking details for a specific order (customer who placed it OR admin)
router.get("/:id/tracking", protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check permissions: either admin or the user who placed the order
    const user = await User.findById(req.user);
    if (!user.isAdmin && String(order.user) !== String(req.user)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const trackingData = await getTrackingDetails(order);
    res.json(trackingData);
  } catch (err) {
    console.error("[OrderRoutes] Error fetching tracking:", err.message);
    res.status(500).json({ message: "Failed to load tracking details" });
  }
});

module.exports = router;
