const mongoose = require("mongoose");

const PRIVATE = ["webReaderLink", "digitalInstructions", "lastUpdatedByEmail", "deletedBy"];
const PRIVATE_BUNDLE = ["webReaderLink"];

const PUBLIC_PRODUCT_EXCLUDE = [
  ...PRIVATE,
  ...PRIVATE_BUNDLE.map((f) => `bundleItems.${f}`)
]
  .map((f) => `-${f}`)
  .join(" ");

const plain = (v) => (v && typeof v.toObject === "function" ? v.toObject() : v);

function toPublicProduct(doc) {
  const src = plain(doc);
  if (!src || typeof src !== "object" || Array.isArray(src) || src instanceof mongoose.Types.ObjectId) {
    return src;
  }

  const out = { ...src };
  PRIVATE.forEach((f) => delete out[f]);

  if (Array.isArray(out.bundleItems)) {
    out.bundleItems = out.bundleItems.map((b) => {
      const i = { ...plain(b) };
      PRIVATE_BUNDLE.forEach((f) => delete i[f]);
      if (i.product && typeof i.product === "object") {
        i.product = toPublicProduct(i.product);
      }
      return i;
    });
  }

  if (Array.isArray(out.relatedProducts)) {
    out.relatedProducts = out.relatedProducts.map((p) =>
      typeof p === "object" ? toPublicProduct(p) : p
    );
  }

  return out;
}

module.exports = {
  PUBLIC_PRODUCT_EXCLUDE,
  toPublicProduct
};
