import { parseCsvText } from "./productsCsv.js";
/**
 * src/utils/productImport.js
 * Bulk Import on Admin → Add Products: works out what an uploaded CSV/JSON file would change.
 *
 *  - A row whose id (or, failing that, slug) matches a product UPDATES that product, and only the
 *    cells that differ from what is saved now are sent.
 *  - A row with no id and no matching slug ADDS a new product (as before).
 *  - A row whose id matches nothing is reported, never added.
 *
 * No browser APIs; the page shows the plan and sends it.
 */

export const IMPORT_FIELD_LABELS = {
  name: "Name",
  price: "Price",
  mrp: "MRP",
  stock: "Stock",
  internationalPrice: "International price",
  internationalCountryPrices: "Country prices",
  marketPrices: "Market prices",
  images: "Images",
  description: "Description",
  aboutProduct: "About this product",
  category: "Category"
};

const FORMAT_FROM_MAIN = "set from its main product; change it on the main product";
const COMBO_FORMAT_NO_MARKET = "a combo's formats don't keep their own country or market prices yet (they are cleared when the combo is saved)";
const MAIN_FROM_FORMATS = "worked out from its formats; change the format rows instead";

// Fields the import does not change for some kinds of product, and why.
const BLOCKED = {
  // A format keeps its own price, MRP, international price and stock (the product form reads them
  // back from the format). Its name and category are rebuilt from the main product, and it has no
  // country or market prices of its own.
  format: {
    name: FORMAT_FROM_MAIN,
    category: FORMAT_FROM_MAIN,
    internationalCountryPrices: FORMAT_FROM_MAIN,
    marketPrices: FORMAT_FROM_MAIN
  },
  // A combo's format keeps its own price and international price; it is rebuilt with no
  // country/market prices whenever the combo is saved
  comboFormat: {
    name: FORMAT_FROM_MAIN,
    category: FORMAT_FROM_MAIN,
    internationalCountryPrices: COMBO_FORMAT_NO_MARKET,
    marketPrices: COMBO_FORMAT_NO_MARKET
  },
  main: {
    price: MAIN_FROM_FORMATS,
    stock: MAIN_FROM_FORMATS,
    internationalPrice: MAIN_FROM_FORMATS,
    internationalCountryPrices: MAIN_FROM_FORMATS,
    marketPrices: MAIN_FROM_FORMATS
  },
  product: {}
};

const idOf = (value) => String(value?._id || value || "").trim();
const lowerKeys = (row) =>
  Object.fromEntries(Object.entries(row && typeof row === "object" ? row : {}).map(([k, v]) => [String(k).toLowerCase(), v]));
const isBlank = (value) => value === null || value === undefined || String(value).trim() === "";
const text = (value) => String(value ?? "").replace(/\r\n?/g, "\n").trim();
const lines = (value) =>
  (Array.isArray(value) ? value : String(value ?? "").split(/\r?\n/)).map((x) => String(x ?? "").trim()).filter(Boolean);

export const productKind = (product) => {
  if (product?.bundleFormatKey && product?.optionParent) return product?.productType === "bundle" ? "comboFormat" : "format";
  return product?.hasOptions === true ? "main" : "product";
};

/** Reads an uploaded file into rows with lower-cased keys. */
export function readImportFile(fileName, fileText) {
  const raw = String(fileText || "");
  if (raw.includes("\uFFFD")) {
    return {
      rows: [],
      columns: new Set(),
      error: "This file has broken characters. In Excel, save it as \"CSV UTF-8 (Comma delimited)\" and upload again."
    };
  }
  if (String(fileName || "").toLowerCase().endsWith(".json")) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { rows: [], columns: new Set(), error: "This JSON file could not be read." };
    }
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.products) ? parsed.products : [];
    const rows = list.map(lowerKeys);
    const columns = new Set(rows.flatMap((row) => Object.keys(row)));
    return { rows, columns, error: "" };
  }
  const rows = parseCsvText(raw);
  return { rows, columns: new Set(rows.length ? Object.keys(rows[0]) : []), error: "" };
}

// ── Reading cells ───────────────────────────────────────────────────────────
// Each reader returns { value } for a value to use, { keep: true } for "leave as is",
// or { error } when the cell can't be used.

const readNumber = (cell, { blank = "keep", integer = false } = {}) => {
  if (isBlank(cell)) return blank === "keep" ? { keep: true } : { value: null };
  const n = Number(String(cell).replace(/[,₹\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return { error: `"${cell}" is not a valid number` };
  if (integer && !Number.isInteger(n)) return { error: `"${cell}" is not a whole number` };
  return { value: n };
};

const readJsonList = (cell) => {
  if (Array.isArray(cell)) return { value: cell };
  if (isBlank(cell)) return { value: [] };
  try {
    const parsed = JSON.parse(String(cell));
    return Array.isArray(parsed) ? { value: parsed } : { error: "is not a list" };
  } catch {
    return { error: "could not be read (it must stay in the exported format)" };
  }
};

const isoOrNull = (value) => {
  if (isBlank(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).trim() : date.toISOString();
};

const normCountryPrices = (list) =>
  (list || [])
    .map((e) => ({ country: String(e?.country || "").trim(), price: Number(e?.price) }))
    .filter((e) => e.country && Number.isFinite(e.price) && e.price >= 0);

const normMarketPrices = (list) =>
  (list || [])
    .map((e) => ({
      market: String(e?.market || "").trim(),
      regularPrice: Number(e?.regularPrice),
      salePrice: isBlank(e?.salePrice) ? null : Number(e.salePrice),
      startDate: isoOrNull(e?.startDate),
      endDate: isoOrNull(e?.endDate)
    }))
    .filter((e) => e.market && Number.isFinite(e.regularPrice) && e.regularPrice >= 0);

const productImages = (product) => {
  const list = lines(product?.images);
  if (list.length) return list;
  return product?.image ? [String(product.image).trim()] : [];
};

// What is saved now, in the same shape the readers produce.
const CURRENT = {
  name: (p) => text(p?.name),
  price: (p) => (isBlank(p?.price) ? null : Number(p.price)),
  mrp: (p) => (isBlank(p?.mrp) ? null : Number(p.mrp)),
  stock: (p) => (isBlank(p?.stock) ? 0 : Number(p.stock)),
  internationalPrice: (p) => (isBlank(p?.internationalPrice) ? null : Number(p.internationalPrice)),
  internationalCountryPrices: (p) => normCountryPrices(p?.internationalCountryPrices),
  marketPrices: (p) => normMarketPrices(p?.marketPrices),
  images: (p) => productImages(p),
  description: (p) => text(p?.description),
  aboutProduct: (p) => lines(p?.aboutProduct),
  category: (p) => text(p?.category)
};

// The row's value for each field, given the columns the file has. Absent column = not changed.
function readRowFields(row, columns, product) {
  const has = (col) => columns.has(col);
  const out = {};
  const put = (field, result) => {
    if (result) out[field] = result;
  };

  if (has("name")) put("name", isBlank(row.name) ? { keep: true } : { value: text(row.name) });
  if (has("price")) put("price", readNumber(row.price));
  if (has("mrp")) put("mrp", readNumber(row.mrp, { blank: "clear" }));
  if (has("stock")) put("stock", readNumber(row.stock, { integer: true }));
  if (has("internationalprice")) put("internationalPrice", readNumber(row.internationalprice, { blank: "clear" }));
  if (has("internationalcountryprices")) {
    const r = readJsonList(row.internationalcountryprices);
    put("internationalCountryPrices", r.error ? r : { value: normCountryPrices(r.value) });
  }
  if (has("marketprices")) {
    const r = readJsonList(row.marketprices);
    put("marketPrices", r.error ? r : { value: normMarketPrices(r.value) });
  }
  if (has("description")) put("description", { value: text(row.description) });
  if (has("aboutproduct") || has("about_product")) {
    put("aboutProduct", { value: lines(has("aboutproduct") ? row.aboutproduct : row.about_product) });
  }
  if (has("category")) put("category", isBlank(row.category) ? { keep: true } : { value: text(row.category) });

  // Images: the "images" column is the whole list (one per line); "image" is the first one.
  // Editing only "image" puts that image first and keeps the rest.
  if (has("images") || has("image")) {
    const current = productImages(product);
    const listCell = has("images") ? lines(row.images) : null;
    const firstCell = has("image") ? text(row.image) : "";
    let next = current;
    if (listCell && listCell.length && JSON.stringify(listCell) !== JSON.stringify(current)) {
      next = listCell;
    } else if (firstCell && firstCell !== current[0]) {
      next = [firstCell, ...current.filter((img) => img !== firstCell)];
    }
    put("images", { value: next });
  }
  return out;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const NON_ASCII = /[\u0080-\uFFFF]/;
const countChar = (s, ch) => s.split(ch).length - 1;
/** Excel's plain "CSV" save turns Devanagari and ₹ into "?". */
export function looksGarbled(before, after) {
  const a = Array.isArray(before) ? before.join("\n") : String(before ?? "");
  const b = Array.isArray(after) ? after.join("\n") : String(after ?? "");
  return NON_ASCII.test(a) && !NON_ASCII.test(b) && countChar(b, "?") > countChar(a, "?");
}

const TEXT_FIELDS = new Set(["name", "category", "description", "aboutProduct"]);

/** Short text for showing a value in the preview. */
export function showValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (typeof value[0] === "object") {
      return value
        .map((e) => (e.country ? `${e.country}: ${e.price}` : `${e.market}: ${e.regularPrice}${e.salePrice !== null ? ` (sale ${e.salePrice})` : ""}`))
        .join(", ");
    }
    return value.length > 1 ? `${value.length} items: ${value[0]} …` : String(value[0]);
  }
  const str = String(value).replace(/\s+/g, " ").trim();
  return str.length > 90 ? `${str.slice(0, 87)}…` : str;
}

/** A new product from a row with no id (same fields Bulk Import always accepted). */
export function toNewProductPayload(rawRow) {
  const row = lowerKeys(rawRow);
  const name = text(row.name);
  const price = readNumber(row.price);
  if (!name || price.keep || price.error) return null;
  const intl = readNumber(row.internationalprice, { blank: "clear" });
  const country = readJsonList(row.internationalcountryprices);
  const market = readJsonList(row.marketprices);
  const images = lines(row.images).length ? lines(row.images) : lines(row.image);
  const stock = readNumber(row.stock, { integer: true });
  return {
    name,
    price: price.value,
    internationalPrice: intl.error ? null : intl.value,
    internationalCountryPrices: country.error ? [] : normCountryPrices(country.value),
    marketPrices: market.error ? [] : normMarketPrices(market.value),
    image: images[0] || "",
    images: images.join("\n"),
    description: text(row.description),
    aboutProduct: lines(row.aboutproduct ?? row.about_product).join("\n"),
    category: text(row.category) || "General",
    stock: stock.value ?? 0
  };
}

/**
 * The plan for a file: which products change and how, what is added, what can't be used.
 * products = every product as /api/products/admin/all returns them.
 */
export function planProductImport(rows, columns, products = []) {
  const list = (products || []).filter((p) => p && p.isDeleted !== true);
  const byId = new Map(list.map((p) => [idOf(p), p]));
  const bySlug = new Map(list.filter((p) => p.slug).map((p) => [String(p.slug).trim().toLowerCase(), p]));
  const nameById = (id) => byId.get(idOf(id))?.name || "";

  const plan = { updates: [], creates: [], notFound: [], problems: [], unchanged: 0, garbled: false };
  const seen = new Set();

  (rows || []).forEach((rawRow, index) => {
    const row = lowerKeys(rawRow);
    const rowNo = index + 2; // the spreadsheet row (row 1 is the header)
    const rowName = text(row.name) || "(no name)";
    const ref = text(row.id ?? row._id);
    const slug = text(row.slug).toLowerCase();
    const product = (ref && byId.get(ref)) || (slug && bySlug.get(slug)) || null;

    if (!product) {
      if (ref) {
        plan.notFound.push({ rowNo, name: rowName, ref });
        return;
      }
      const payload = toNewProductPayload(row);
      if (payload) plan.creates.push({ rowNo, payload });
      else plan.problems.push({ rowNo, name: rowName, message: "New product needs a name and a price." });
      return;
    }

    const productId = idOf(product);
    if (seen.has(productId)) {
      plan.problems.push({ rowNo, name: product.name, message: "This product is in the file more than once; only its first row is used." });
      return;
    }
    seen.add(productId);

    const kind = productKind(product);
    const fields = readRowFields(row, columns, product);
    const changes = [];
    const skipped = [];
    const payload = {};

    Object.entries(fields).forEach(([field, result]) => {
      const label = IMPORT_FIELD_LABELS[field];
      if (result.keep) return;
      const before = CURRENT[field](product);
      if (result.error) {
        skipped.push({ field, label, reason: result.error });
        return;
      }
      if (same(before, result.value)) return;
      if (BLOCKED[kind][field]) {
        skipped.push({ field, label, reason: BLOCKED[kind][field] });
        return;
      }
      if (TEXT_FIELDS.has(field) && looksGarbled(before, result.value)) {
        plan.garbled = true;
        skipped.push({ field, label, reason: "its Sanskrit/₹ characters were lost when the file was saved" });
        return;
      }
      changes.push({ field, label, from: before, to: result.value });
      if (field === "images") {
        payload.images = result.value;
        payload.image = result.value[0] || "";
      } else {
        payload[field] = result.value;
      }
    });

    if (changes.length === 0 && skipped.length === 0) {
      plan.unchanged += 1;
      return;
    }
    plan.updates.push({
      rowNo,
      productId,
      name: product.name,
      mainName: kind === "format" || kind === "comboFormat" ? nameById(product.optionParent) : "",
      kind,
      changes,
      skipped,
      payload
    });
  });

  return plan;
}
