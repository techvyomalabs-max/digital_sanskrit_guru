"use strict";

const { isReviewPhotoUrl, getMediaConfig } = require("./mediaPresign");

const MAX_REVIEW_PHOTOS = 4;

/**
 * Checks the photo links sent with a review: only our own review-photo uploads, no repeats,
 * at most MAX_REVIEW_PHOTOS. Returns { photos } or { error }.
 */
function normalizeReviewPhotos(input, config = getMediaConfig()) {
  if (input === undefined || input === null) return { photos: [] };
  if (!Array.isArray(input)) return { error: "Photos must be a list." };
  const photos = [...new Set(input.map((url) => String(url || "").trim()).filter(Boolean))];
  if (photos.length > MAX_REVIEW_PHOTOS) {
    return { error: `Add at most ${MAX_REVIEW_PHOTOS} photos.` };
  }
  if (photos.some((url) => !isReviewPhotoUrl(url, config))) {
    return { error: "One of the photos could not be used. Please upload it again." };
  }
  return { photos };
}

const idOf = (value) => String(value?._id ?? value ?? "").trim();

/**
 * Did any of these orders buy one of these products? Counts paid, not-cancelled orders, the
 * product itself or one of its formats (productIds), bought alone or inside a combo, and not
 * refunded.
 */
function ordersIncludeProduct(orders, productIds) {
  const wanted = new Set([...productIds].map(idOf).filter(Boolean));
  if (wanted.size === 0) return false;
  return (Array.isArray(orders) ? orders : []).some((order) => {
    if (String(order?.paymentStatus || "") !== "Paid") return false;
    if (String(order?.status || "") === "Cancelled") return false;
    return (Array.isArray(order.items) ? order.items : []).some((item) => {
      if (String(item?.returnRequest?.status || "").toLowerCase() === "refunded") return false;
      if (wanted.has(idOf(item?.product))) return true;
      return (Array.isArray(item?.bundleItems) ? item.bundleItems : []).some((bi) => wanted.has(idOf(bi?.product)));
    });
  });
}

/**
 * Has this user bought the product? Loads the product's formats and the user's paid orders.
 * Models are passed in so the check is easy to test.
 */
async function hasBoughtProduct({ userId, product, Product, Order }) {
  if (!userId || !product?._id) return false;
  const ids = new Set([idOf(product._id)]);
  const formats = await Product.find({ optionParent: product._id }).select("_id").lean();
  formats.forEach((f) => ids.add(idOf(f._id)));
  (Array.isArray(product.options) ? product.options : []).forEach((o) => ids.add(idOf(o?.product)));
  ids.delete("");
  const list = [...ids];
  const orders = await Order.find({
    user: userId,
    paymentStatus: "Paid",
    status: { $ne: "Cancelled" },
    $or: [{ "items.product": { $in: list } }, { "items.bundleItems.product": { $in: list } }]
  })
    .select("paymentStatus status items.product items.returnRequest items.bundleItems.product")
    .lean();
  return ordersIncludeProduct(orders, ids);
}

module.exports = { MAX_REVIEW_PHOTOS, normalizeReviewPhotos, ordersIncludeProduct, hasBoughtProduct };
