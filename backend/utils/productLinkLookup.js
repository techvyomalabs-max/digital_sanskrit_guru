/**
 * productLinkLookup.js — finds the product behind a /product/<key> address,
 * the same way GET /api/products/:id does (id, old site number, link name,
 * earlier link name), so the server can send search engines a real redirect
 * to the current link name and the right canonical link.
 */

const mongoose = require("mongoose");
const { normalizeSlug } = require("./productSlug");

const LOOKUP_SELECT = "_id slug optionParent isDeleted hideFromListings";

async function findProductForLink(Product, rawKey) {
  const key = String(rawKey || "").trim();
  if (!key) return null;
  const live = { isDeleted: { $ne: true } };

  let product = null;
  if (mongoose.Types.ObjectId.isValid(key)) {
    product = await Product.findOne({ _id: key, ...live }).select(LOOKUP_SELECT).lean();
  }
  if (!product && /^\d+$/.test(key)) {
    product = await Product.findOne({ wpProductId: Number(key), ...live }).select(LOOKUP_SELECT).lean();
  }
  if (!product) {
    const slug = normalizeSlug(key);
    if (slug) {
      product = await Product.findOne({ $or: [{ slug }, { slugHistory: slug }], ...live })
        .select(LOOKUP_SELECT)
        .lean();
    }
  }
  if (!product) return null;

  let parent = null;
  if (product.optionParent) {
    parent = await Product.findOne({ _id: product.optionParent, ...live }).select("_id slug").lean();
  }
  return { product, parent };
}

function linkKey(product) {
  return String(product?.slug || product?._id || "").trim();
}

/**
 * What the server should do for a product address:
 *   { notFound: true }                       — no such live product
 *   { redirect: "/product/<slug>" }          — old id / old name; move to the current link
 *   { canonicalPath: "/product/<slug>", noindex } — serve the page with this canonical
 */
function resolveProductLink(found, requestedKey) {
  if (!found?.product) return { notFound: true };
  const currentKey = linkKey(found.product);
  let requested = String(requestedKey || "");
  try {
    requested = decodeURIComponent(requested);
  } catch {
    // keep the raw value
  }
  if (found.product.slug && requested !== currentKey) {
    return { redirect: `/product/${encodeURIComponent(currentKey)}` };
  }
  // A format of a combo shares the main product's content
  const canonicalKey = found.parent ? linkKey(found.parent) : currentKey;
  // Hidden products (not formats) are only reached by direct link: keep them out of search
  const noindex = found.product.hideFromListings === true && !found.parent;
  return { canonicalPath: `/product/${encodeURIComponent(canonicalKey)}`, noindex };
}

module.exports = { findProductForLink, resolveProductLink };
