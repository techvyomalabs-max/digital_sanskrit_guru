"use strict";

/**
 * Combo formats (pure helpers, no DB).
 *
 * A combo ("bundle") can be sold in formats such as "USB" and "Web Version". The admin keeps one
 * list of items and ticks which formats each item belongs to. For every format the server keeps a
 * hidden child product (productType "bundle") that holds only that format's items; the combo becomes
 * a product with options pointing at those children. Cart, checkout, stock, delivery and digital
 * access therefore work on the child exactly like on any other combo.
 */

const MAX_FORMATS = 8;
const MAX_LABEL_LENGTH = 40;
const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

const slugify = (label) =>
  String(label || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "format";

const FORMAT_TYPES = ["physical", "digital"];
const normalizeFormatType = (value) => {
  const t = String(value || "").trim().toLowerCase();
  return FORMAT_TYPES.includes(t) ? t : "";
};

const PACKAGE_FIELDS = ["weight", "length", "width", "height"];

const isBlank = (value) => value === null || value === undefined || String(value).trim() === "";

/**
 * Validate the admin's format list.
 * input: [{ key?, label, type?, price?, stock?, weight?, length?, width?, height? }]
 * Returns { formats: [{ key, label, type ("physical" | "digital" | ""), price (number|null), stock (number|null),
 *   weight, length, width, height (numbers, 0 when blank) }], error }.
 * type "" (older saves) means: work it out from the format's items.
 * stock is null when the admin did not send one (the child keeps its current stock).
 */
function normalizeBundleFormatsInput(input) {
  if (input === undefined || input === null) return { formats: [], error: "" };
  if (!Array.isArray(input)) return { formats: [], error: "Formats must be a list." };
  if (input.length > MAX_FORMATS) return { formats: [], error: `At most ${MAX_FORMATS} formats.` };

  const usedKeys = new Set();
  const usedLabels = new Set();
  const formats = [];

  for (let i = 0; i < input.length; i += 1) {
    const n = i + 1;
    const raw = input[i] || {};
    const label = String(raw.label ?? "").trim().slice(0, MAX_LABEL_LENGTH);
    if (!label) return { formats: [], error: `Format ${n}: add a name (for example USB or Web Version).` };

    const labelKey = label.toLowerCase();
    if (usedLabels.has(labelKey)) return { formats: [], error: `Format ${n}: "${label}" is already listed.` };
    usedLabels.add(labelKey);

    let price = null;
    if (!isBlank(raw.price)) {
      price = Number(raw.price);
      if (!Number.isFinite(price) || price < 0) return { formats: [], error: `Format ${n}: price must be 0 or more.` };
      price = Math.round(price * 100) / 100;
    }

    let stock = null;
    if (!isBlank(raw.stock)) {
      stock = Number(raw.stock);
      if (!Number.isFinite(stock) || stock < 0) return { formats: [], error: `Format ${n}: stock must be 0 or more.` };
      stock = Math.floor(stock);
    }

    const pack = {};
    for (const field of PACKAGE_FIELDS) {
      if (isBlank(raw[field])) {
        pack[field] = 0;
        continue;
      }
      const value = Number(raw[field]);
      if (!Number.isFinite(value) || value < 0) return { formats: [], error: `Format ${n}: ${field} must be 0 or more.` };
      pack[field] = Math.round(value * 100) / 100;
    }

    let key = String(raw.key || "").trim().toLowerCase();
    if (!KEY_PATTERN.test(key) || usedKeys.has(key)) {
      const base = slugify(label);
      key = base;
      let suffix = 2;
      while (usedKeys.has(key)) {
        key = `${base}-${suffix}`;
        suffix += 1;
      }
    }
    usedKeys.add(key);

    formats.push({ key, label, type: normalizeFormatType(raw.type), price, stock, ...pack });
  }

  return { formats, error: "" };
}

/**
 * Clean an item's format tags as sent by the browser (unique, trimmed, lower-case, max 40 chars).
 * Tags can be a format's key or, for a format that is new in this save, its name; they are turned
 * into keys by applyFormatsToItems.
 */
function normalizeItemFormats(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const value of raw) {
    const tag = String(value || "").trim().toLowerCase().slice(0, MAX_LABEL_LENGTH);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= MAX_FORMATS) break;
  }
  return out;
}

/**
 * Items may be tagged by the admin with a format's label or key (a brand-new format has no key yet
 * in the browser). Map each item's tags onto the final keys, drop unknown tags, and check that every
 * format has at least one item.
 * Returns { items, error } where items are shallow copies with a clean `formats` array.
 */
function applyFormatsToItems(formats, items) {
  const list = Array.isArray(items) ? items : [];
  if (!Array.isArray(formats) || formats.length === 0) {
    return { items: list.map((item) => ({ ...item, formats: [] })), error: "" };
  }

  const toKey = new Map();
  for (const f of formats) {
    toKey.set(f.key, f.key);
    toKey.set(String(f.label).toLowerCase(), f.key);
    toKey.set(slugify(f.label), f.key);
  }

  const mapped = list.map((item) => {
    const tags = Array.isArray(item?.formats) ? item.formats : [];
    const keys = [];
    for (const tag of tags) {
      const k = toKey.get(String(tag || "").trim().toLowerCase());
      if (k && !keys.includes(k)) keys.push(k);
    }
    return { ...item, formats: keys };
  });

  for (const f of formats) {
    if (!mapped.some((item) => item.formats.includes(f.key))) {
      return { items: [], error: `Format "${f.label}": tick at least one item for it.` };
    }
  }

  return { items: mapped, error: "" };
}

const itemProductId = (item) => {
  const p = item?.product;
  if (!p) return "";
  return String(p._id || p || "").trim();
};

/** Value of one item: linked product's current price for catalogue items, the typed price for custom ones. */
function itemUnitPrice(item, priceById = {}) {
  const id = itemProductId(item);
  if (id) {
    const lookup = priceById instanceof Map ? priceById.get(id) : priceById[id];
    if (lookup !== undefined && lookup !== null && Number.isFinite(Number(lookup))) return Number(lookup);
  }
  return Math.max(0, Number(item?.price || 0));
}

/** Items of one format, in the combo's order. */
function itemsForFormat(items, formatKey) {
  return (Array.isArray(items) ? items : []).filter(
    (item) => Array.isArray(item?.formats) && item.formats.includes(formatKey)
  );
}

/** Sum of quantity × value of the format's items (2 decimals). */
function computeFormatTotal(items, formatKey, priceById = {}) {
  const total = itemsForFormat(items, formatKey).reduce(
    (sum, item) => sum + itemUnitPrice(item, priceById) * Math.max(1, Number(item?.quantity || 1)),
    0
  );
  return Math.round(total * 100) / 100;
}

const CHILD_COPY_FIELDS = [
  "category",
  "description",
  "aboutProduct",
  "image",
  "images",
  "skipOwnershipRules",
  "discountType",
  "festiveOffer",
  "festiveDiscountPercent"
];

const plain = (v) => (v && typeof v.toObject === "function" ? v.toObject() : v);

// The combo's own digital-delivery settings (link / "team gives access"). A format only gets them
// when it actually contains something digital; a physical-only format (e.g. USB) never does.
const COMBO_DELIVERY_FIELDS = ["digitalDelivery", "externalAccessLink", "externalAccessLabel", "externalAccessManual"];
const ITEM_ACCESS_FIELDS = ["webReaderLink", "kindleLink", "externalAccessLink", "externalAccessLabel"];

/** Is this combo item digital? Catalogue items use the linked product's flag, custom items their own. */
function isItemDigital(item, digitalById = {}) {
  const id = itemProductId(item);
  if (id) {
    const flag = digitalById instanceof Map ? digitalById.get(id) : digitalById[id];
    if (typeof flag === "boolean") return flag;
  }
  return item?.isDigital === true;
}

/**
 * In a physical format (e.g. USB) a digital catalogue product is only the content that is shipped,
 * so the format keeps a plain copy of it (name, picture, value) instead of a link. That way buying
 * the USB never gives web/reader access and never touches the web product, while physical
 * catalogue products stay linked so their own stock still goes down.
 */
function toShippedCopy(item, linkedById = {}, priceById = {}, formatLabel = "") {
  const id = itemProductId(item);
  const linked = id ? (linkedById instanceof Map ? linkedById.get(id) : linkedById[id]) : null;
  const copy = {
    ...item,
    itemType: "custom",
    product: null,
    name: String(item?.name || linked?.name || "").trim() || "Item",
    image: String(item?.image || linked?.image || "").trim(),
    price: itemUnitPrice(item, priceById),
    isDigital: false,
    // Shown on the shop as the item's format (e.g. "USB"): the content comes on that medium.
    digitalType: String(formatLabel || "").trim().slice(0, 40),
    digitalDelivery: "onsite",
    externalAccessManual: false
  };
  for (const field of ITEM_ACCESS_FIELDS) copy[field] = "";
  return copy;
}

/**
 * The fields the hidden child product for one format should have.
 * stock is only included when the admin sent one (otherwise the child keeps its stock).
 * linkedById: id -> { name, image } of linked catalogue products (used for shipped copies).
 */
function buildFormatChildFields(parent, format, items, priceById = {}, digitalById = {}, linkedById = {}) {
  const src = plain(parent) || {};
  const formatType = normalizeFormatType(format.type);
  const sourceItems = itemsForFormat(items, format.key).map((item) => ({ ...plain(item) }));
  const digitalFlags = sourceItems.map((item) => isItemDigital(item, digitalById));

  const formatItems = sourceItems.map((item, index) => {
    let copy = { ...item };
    delete copy.formats;
    if (formatType === "physical" && digitalFlags[index]) {
      copy = toShippedCopy(copy, linkedById, priceById, format.label);
    } else {
      const id = itemProductId(copy);
      if (id) copy.product = id;
    }
    return copy;
  });

  const total = computeFormatTotal(items, format.key, priceById);
  const fields = {
    name: `${String(src.name || "").trim()} – ${format.label}`.slice(0, 200),
    price: format.price !== null && format.price !== undefined ? format.price : total,
    productType: "bundle",
    bundleItems: formatItems,
    hideFromListings: true,
    optionParent: src._id || null,
    bundleFormatKey: format.key,
    hasOptions: false,
    options: [],
    bundleFormats: [],
    internationalPrice: null,
    internationalCountryPrices: [],
    marketPrices: [],
    isDeleted: false,
    deletedAt: null
  };
  for (const field of CHILD_COPY_FIELDS) {
    if (src[field] !== undefined) fields[field] = Array.isArray(src[field]) ? [...src[field]] : src[field];
  }

  // Physical formats (chosen by the admin) are always shipped. Otherwise digital or not follows the
  // format's own items, never the combo as a whole.
  const isPhysical = formatType === "physical";
  fields.isDigital = !isPhysical && digitalFlags.length > 0 && digitalFlags.every(Boolean);
  if (!isPhysical && digitalFlags.some(Boolean)) {
    for (const field of COMBO_DELIVERY_FIELDS) {
      if (src[field] !== undefined) fields[field] = src[field];
    }
  } else {
    fields.digitalDelivery = "onsite";
    fields.externalAccessLink = "";
    fields.externalAccessLabel = "";
    fields.externalAccessManual = false;
  }
  // Package size for delivery charges: from the format when it is shipped, none when it is digital.
  for (const field of PACKAGE_FIELDS) {
    fields[field] = fields.isDigital ? 0 : Math.max(0, Number(format[field]) || 0);
  }
  if (format.stock !== null && format.stock !== undefined) fields.stock = format.stock;
  return fields;
}

module.exports = {
  MAX_FORMATS,
  MAX_LABEL_LENGTH,
  FORMAT_TYPES,
  normalizeFormatType,
  slugify,
  normalizeBundleFormatsInput,
  normalizeItemFormats,
  applyFormatsToItems,
  itemUnitPrice,
  itemsForFormat,
  isItemDigital,
  computeFormatTotal,
  buildFormatChildFields
};
