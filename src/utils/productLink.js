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
// (same rules as slugify in backend/utils/productSlug.js).
export function slugPreview(name) {
  const text = String(name ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#039;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2018\u2019`]/g, "");
  const latinOnly = /[a-z0-9]/i.test(text) ? text.replace(/[^\p{ASCII}]+/gu, " ") : text;
  let s = latinOnly
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  if (s.length > 90) {
    const cut = s.slice(0, 90);
    const lastDash = cut.lastIndexOf("-");
    s = (lastDash > 45 ? cut.slice(0, lastDash) : cut).replace(/-+$/g, "");
  }
  return s;
}
