import { escapeCsvCell } from "./ordersCsv.js";
/**
 * src/utils/productsCsv.js
 * Product export for Admin → Add Products, and the CSV reader used by Bulk Import.
 * The first columns match the Bulk Import fields, so an exported file can be imported again.
 * The other columns are for reading only; Bulk Import ignores them.
 * No browser APIs.
 */

// Columns Bulk Import reads (headers are matched case-insensitively).
const IMPORT_COLUMNS = [
  "name",
  "price",
  "internationalPrice",
  "internationalCountryPrices",
  "marketPrices",
  "image",
  "images",
  "description",
  "aboutProduct",
  "category",
  "stock"
];

// Columns for reading only.
const INFO_COLUMNS = [
  "id",
  "slug",
  "mrp",
  "productType",
  "mainProduct",
  "formatType",
  "isDigital",
  "digitalType",
  "digitalDelivery",
  "hsnSac",
  "gstRate",
  "weight",
  "length",
  "width",
  "height",
  "hideFromListings",
  "rating",
  "reviewsCount",
  "views",
  "createdAt",
  "updatedAt",
  "lastUpdatedBy"
];

export const PRODUCT_CSV_HEADERS = [...IMPORT_COLUMNS, ...INFO_COLUMNS];
export const PRODUCT_CSV_NUMERIC = new Set([
  "price",
  "internationalPrice",
  "stock",
  "mrp",
  "gstRate",
  "weight",
  "length",
  "width",
  "height",
  "rating",
  "reviewsCount",
  "views"
]);

const idOf = (value) => String(value?._id || value || "");
const numberOrBlank = (value) =>
  value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? "" : Number(value);
const jsonOrBlank = (list) => (Array.isArray(list) && list.length > 0 ? JSON.stringify(list) : "");
const dateOrBlank = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

const productImages = (product) => {
  const list = Array.isArray(product?.images) ? product.images.filter(Boolean) : [];
  if (list.length > 0) return list;
  return product?.image ? [product.image] : [];
};

/** One row of values (keyed by header) for a product. */
export function productToCsvRow(product, productsById = new Map()) {
  const parent = product?.optionParent ? productsById.get(idOf(product.optionParent)) : null;
  return {
    name: product?.name || "",
    price: numberOrBlank(product?.price),
    internationalPrice: numberOrBlank(product?.internationalPrice),
    internationalCountryPrices: jsonOrBlank(
      (product?.internationalCountryPrices || []).map((entry) => ({ country: entry?.country, price: entry?.price }))
    ),
    marketPrices: jsonOrBlank(
      (product?.marketPrices || []).map((entry) => ({
        market: entry?.market,
        regularPrice: entry?.regularPrice,
        salePrice: entry?.salePrice ?? null,
        startDate: entry?.startDate || null,
        endDate: entry?.endDate || null
      }))
    ),
    image: productImages(product)[0] || "",
    // One image per line, the same as the Images box in the product form.
    images: productImages(product).join("\n"),
    description: product?.description || "",
    aboutProduct: product?.aboutProduct || "",
    category: product?.category || "",
    stock: numberOrBlank(product?.stock),
    id: idOf(product),
    slug: product?.slug || "",
    mrp: numberOrBlank(product?.mrp),
    productType: product?.productType || "single",
    mainProduct: parent?.name || "",
    formatType: product?.formatTypeKey || product?.bundleFormatKey || "",
    isDigital: product?.isDigital ? "yes" : "no",
    digitalType: product?.isDigital ? product?.digitalType || "" : "",
    digitalDelivery: product?.isDigital ? product?.digitalDelivery || "" : "",
    hsnSac: product?.hsnSac || "",
    gstRate: numberOrBlank(product?.gstRate),
    weight: numberOrBlank(product?.weight),
    length: numberOrBlank(product?.length),
    width: numberOrBlank(product?.width),
    height: numberOrBlank(product?.height),
    hideFromListings: product?.hideFromListings ? "yes" : "no",
    rating: numberOrBlank(product?.rating),
    reviewsCount: numberOrBlank(product?.reviewsCount),
    views: numberOrBlank(product?.views),
    createdAt: dateOrBlank(product?.createdAt),
    updatedAt: dateOrBlank(product?.updatedAt),
    lastUpdatedBy: product?.lastUpdatedByName || product?.lastUpdatedByEmail || ""
  };
}

/**
 * CSV text for the given products. Main products come first (A–Z), each followed by its formats.
 * Starts with a BOM so Excel shows Devanagari and ₹ correctly.
 */
export function buildProductsCsv(products = []) {
  const list = Array.isArray(products) ? products.filter(Boolean) : [];
  const productsById = new Map(list.map((p) => [idOf(p), p]));
  const byName = (a, b) => String(a?.name || "").localeCompare(String(b?.name || ""));

  const childrenOf = new Map();
  const mains = [];
  list.forEach((product) => {
    const parentId = product?.optionParent ? idOf(product.optionParent) : "";
    if (parentId && productsById.has(parentId)) {
      if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
      childrenOf.get(parentId).push(product);
    } else {
      mains.push(product);
    }
  });

  const ordered = [];
  mains.sort(byName).forEach((product) => {
    ordered.push(product);
    (childrenOf.get(idOf(product)) || []).sort(byName).forEach((child) => ordered.push(child));
  });

  const lines = [PRODUCT_CSV_HEADERS.map((h) => escapeCsvCell(h, false)).join(",")];
  ordered.forEach((product) => {
    const row = productToCsvRow(product, productsById);
    lines.push(
      PRODUCT_CSV_HEADERS.map((h) => escapeCsvCell(row[h] ?? "", PRODUCT_CSV_NUMERIC.has(h))).join(",")
    );
  });
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/** JSON text for the given products: every field as stored, for a full backup. */
export function buildProductsJson(products = []) {
  return JSON.stringify(
    { exportedAt: new Date().toISOString(), count: products.length, products },
    null,
    2
  );
}

/**
 * Reads CSV text into rows keyed by lower-cased header.
 * Handles quoted cells that contain commas, quotes and line breaks, a leading BOM,
 * and the ' that the export puts before cells starting with = + - @.
 */
export function parseCsvText(text) {
  const source = String(text || "").replace(/^\uFEFF/, "");
  const records = [];
  let record = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === "\"") {
        if (source[i + 1] === "\"") {
          cell += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === "\"") {
      inQuotes = true;
    } else if (ch === ",") {
      record.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i += 1;
      record.push(cell);
      records.push(record);
      record = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || record.length > 0) {
    record.push(cell);
    records.push(record);
  }

  const clean = (value) => {
    const trimmed = String(value ?? "").trim();
    return /^'[=+\-@]/.test(trimmed) ? trimmed.slice(1) : trimmed;
  };
  const nonEmpty = records.filter((r) => r.some((value) => String(value).trim() !== ""));
  if (nonEmpty.length < 2) return [];

  const headers = nonEmpty[0].map((h) => clean(h).toLowerCase());
  return nonEmpty.slice(1).map((cols) => {
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = clean(cols[idx]);
    });
    return row;
  });
}
