// Product page links: /product/<link name>, e.g. /product/bhagavad-gita-paperback.
// Falls back to the product id when a product has no link name yet; the product page
// then switches the address to the link name.

export function productPath(product) {
  const key = String(product?.slug || product?._id || product?.id || "").trim();
  return key ? `/product/${encodeURIComponent(key)}` : "/collection";
}

export function productUrl(product, origin = typeof window !== "undefined" ? window.location.origin : "") {
  return `${origin}${productPath(product)}`;
}

// Preview of the link name the server will make from a product name
// (same rules as backend/utils/productSlug.js).
export function slugPreview(name) {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’‘`]/g, "")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90)
    .replace(/-+$/g, "");
}
