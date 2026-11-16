const test = require("node:test");
const assert = require("node:assert/strict");
const { isReviewPhotoUrl } = require("../utils/mediaPresign");
const { normalizeReviewPhotos, ordersIncludeProduct, hasBoughtProduct, MAX_REVIEW_PHOTOS } = require("../utils/reviewPhotos");

const config = { mediaCdnUrl: "https://cdn.test", prefix: "dsg", configured: true };
const photo = (n = 1, ext = "jpg") => `https://cdn.test/dsg/review-photo/${String(n).padStart(8, "0")}-1111-4111-8111-111111111111.${ext}`;

test("review photo links: only our own review-photo uploads", () => {
  assert.equal(isReviewPhotoUrl(photo(1), config), true);
  assert.equal(isReviewPhotoUrl(photo(1, "webp"), config), true);
  assert.equal(isReviewPhotoUrl("https://cdn.test/dsg/product/00000001-1111-4111-8111-111111111111.jpg", config), false);
  assert.equal(isReviewPhotoUrl("https://evil.test/dsg/review-photo/00000001-1111-4111-8111-111111111111.jpg", config), false);
  assert.equal(isReviewPhotoUrl(photo(1, "gif"), config), false);
  assert.equal(isReviewPhotoUrl("https://cdn.test/dsg/review-photo/../product/x.jpg", config), false);
  assert.equal(isReviewPhotoUrl(null, config), false);
});

test("normalizeReviewPhotos: dedupes, caps, rejects foreign links", () => {
  assert.deepEqual(normalizeReviewPhotos(undefined, config), { photos: [] });
  assert.deepEqual(normalizeReviewPhotos([photo(1), photo(1), " "], config), { photos: [photo(1)] });
  const tooMany = Array.from({ length: MAX_REVIEW_PHOTOS + 1 }, (_, i) => photo(i + 1));
  assert.match(normalizeReviewPhotos(tooMany, config).error, /at most/);
  assert.match(normalizeReviewPhotos(["https://elsewhere.test/a.jpg"], config).error, /could not be used/);
  assert.match(normalizeReviewPhotos("nope", config).error, /list/);
});

const paid = (items, extra = {}) => ({ paymentStatus: "Paid", status: "Delivered", items, ...extra });

test("ordersIncludeProduct: paid orders with the product, a format, or inside a combo", () => {
  const ids = new Set(["P", "P-USB"]);
  assert.equal(ordersIncludeProduct([paid([{ product: "P" }])], ids), true);
  assert.equal(ordersIncludeProduct([paid([{ product: "P-USB" }])], ids), true);
  assert.equal(ordersIncludeProduct([paid([{ product: "COMBO", bundleItems: [{ product: "P" }] }])], ids), true);
  assert.equal(ordersIncludeProduct([paid([{ product: "OTHER" }])], ids), false);
  assert.equal(ordersIncludeProduct([paid([{ product: "P" }], { paymentStatus: "Pending" })], ids), false);
  assert.equal(ordersIncludeProduct([paid([{ product: "P" }], { status: "Cancelled" })], ids), false);
  assert.equal(ordersIncludeProduct([paid([{ product: "P", returnRequest: { status: "Refunded" } }])], ids), false);
  assert.equal(ordersIncludeProduct([], ids), false);
});

test("hasBoughtProduct: looks up the product's formats and the user's orders", async () => {
  const chain = (rows) => ({ select: () => ({ lean: async () => rows }) });
  let orderQuery = null;
  const Product = { find: () => chain([{ _id: "P-USB" }]) };
  const Order = { find: (q) => { orderQuery = q; return chain([paid([{ product: "P-USB" }])]); } };
  assert.equal(await hasBoughtProduct({ userId: "U", product: { _id: "P" }, Product, Order }), true);
  assert.equal(orderQuery.user, "U");
  assert.deepEqual(orderQuery.$or[0]["items.product"].$in.sort(), ["P", "P-USB"]);
  assert.equal(await hasBoughtProduct({ userId: null, product: { _id: "P" }, Product, Order }), false);
});
