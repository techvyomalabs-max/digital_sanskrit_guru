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

const { normalizeProductTax } = require("./productTax");
const { validateExternalDelivery } = require("./digitalDelivery");

const TYPE_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MAX_URL_LENGTH = 500;

const isWebUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

/**
 * A digital format's own online access (single products only). Returns { digital } or { error };
 * digital is undefined when the browser sent none (the format then uses the main product's settings).
 */
function normalizeFormatDigital(raw, label) {
  if (raw === undefined || raw === null) return { digital: undefined };
  if (typeof raw !== "object" || Array.isArray(raw)) return { error: `Format "${label}": online access settings are invalid.` };
  const text = (value, max = MAX_URL_LENGTH) => String(value ?? "").trim().slice(0, max);
  const links = {
    webReaderLink: text(raw.webReaderLink),
    kindleLink: text(raw.kindleLink),
    courseLink: text(raw.courseLink)
  };
  for (const [field, value] of Object.entries(links)) {
    if (value && !isWebUrl(value)) {
      const name = field === "kindleLink" ? "Amazon link" : field === "courseLink" ? "course link" : "access link";
      return { error: `Format "${label}": the ${name} must start with https://.` };
    }
  }
  const delivery = validateExternalDelivery({
    isDigital: true,
    productType: "single",
    digitalDelivery: raw.digitalDelivery,
    externalAccessLink: raw.externalAccessLink,
    externalAccessLabel: raw.externalAccessLabel,
    externalAccessManual: raw.externalAccessManual === true
  });
  if (!delivery.isValid) return { error: `Format "${label}": ${delivery.error}` };
  return {
    digital: {
      digitalType: text(raw.digitalType, 40) || "Web Version",
      ...links,
      kindleAsin: text(raw.kindleAsin, 20),
      digitalInstructions: text(raw.digitalInstructions, 2000),
      digitalDelivery: delivery.digitalDelivery,
      externalAccessLink: delivery.externalAccessLink,
      externalAccessLabel: delivery.externalAccessLabel,
      externalAccessManual: delivery.externalAccessManual
    }
  };
}

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

    // Own HSN/SAC and GST rate of the format (single products only; stored on the format's product).
    // Blank = the standard rule for its type (printed book 4901 at 0%, digital 998433 at 18%).
    const sentTax = raw.hsnSac !== undefined || raw.gstRate !== undefined;
    const tax = sentTax ? normalizeProductTax({ hsnSac: raw.hsnSac, gstRate: raw.gstRate }) : {};
    if (tax.error) return { formats: [], error: `Format "${label}": ${tax.error}` };

    // M.R.P. of the format (single products only; stored on the format's product)
    let mrp;
    if (raw.mrp !== undefined) {
      mrp = isBlank(raw.mrp) ? null : Number(raw.mrp);
      if (mrp !== null && (!Number.isFinite(mrp) || mrp < 0)) {
        return { formats: [], error: `Format "${label}": M.R.P. must be 0 or more (or left blank).` };
      }
      if (mrp !== null) mrp = Math.round(mrp * 100) / 100;
      if (mrp !== null && price !== null && mrp < price) {
        return { formats: [], error: `Format "${label}": M.R.P. can't be lower than its price.` };
      }
    }

    // Single products: the format's product type, own image, overseas price and online access
    const typeKey = String(raw.typeKey ?? "").trim().toLowerCase();
    if (typeKey && !TYPE_KEY_PATTERN.test(typeKey)) return { formats: [], error: `Format "${label}": unknown product type.` };

    let image;
    if (raw.image !== undefined) {
      image = String(raw.image || "").trim();
      if (image && (image.length > MAX_URL_LENGTH || !/^https:\/\//i.test(image))) {
        return { formats: [], error: `Format "${label}": the image must be an https:// address.` };
      }
    }

    let internationalPrice;
    if (raw.internationalPrice !== undefined) {
      internationalPrice = isBlank(raw.internationalPrice) ? null : Number(raw.internationalPrice);
      if (internationalPrice !== null && (!Number.isFinite(internationalPrice) || internationalPrice < 0)) {
        return { formats: [], error: `Format "${label}": the international price must be 0 or more (or left blank).` };
      }
      if (internationalPrice !== null) internationalPrice = Math.round(internationalPrice * 100) / 100;
    }

    const digitalRes = normalizeFormatDigital(raw.digital, label);
    if (digitalRes.error) return { formats: [], error: digitalRes.error };

    // A single product's format can have its own category (e.g. Paperback in "Book - Paperback");
    // blank = the same as the product
    const category =
      raw.category === undefined ? undefined : String(raw.category ?? "").replace(/\s+/g, " ").trim().slice(0, 80);

    const position = Number(raw.position);
    formats.push({
      key,
      label,
      type: normalizeFormatType(raw.type),
      ...(category !== undefined ? { category } : {}),
      price,
      stock,
      ...pack,
      ...(sentTax ? { hsnSac: tax.hsnSac, gstRate: tax.gstRate } : {}),
      ...(mrp !== undefined ? { mrp } : {}),
      ...(raw.typeKey !== undefined ? { typeKey } : {}),
      ...(image !== undefined ? { image } : {}),
      ...(internationalPrice !== undefined ? { internationalPrice } : {}),
      ...(digitalRes.digital ? { digital: digitalRes.digital } : {}),
      ...(Number.isFinite(position) ? { position } : {})
    });
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

// What a single product's format copies from the main product on every save.
const SINGLE_COPY_FIELDS = [
  "category",
  "description",
  "aboutProduct",
  "image",
  "images",
  "trailerVideoUrl",
  "discountType",
  "festiveOffer",
  "festiveDiscountPercent"
];

// Content a type of a product can make its own: edited on the type, it stays when the main
// product is saved. "images" covers the primary image and the gallery together.
const FORMAT_OWN_CONTENT_FIELDS = ["description", "aboutProduct", "images", "trailerVideoUrl"];
const OWN_CONTENT_PATHS = {
  description: ["description"],
  aboutProduct: ["aboutProduct"],
  images: ["image", "images"],
  trailerVideoUrl: ["trailerVideoUrl"]
};

const normText = (v) => String(v ?? "").trim();
const normList = (v) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => String(x ?? "").trim()).filter(Boolean);

function sameContent(field, a, b) {
  if (field === "images") {
    return normText(a?.image) === normText(b?.image) && normList(a?.images).join("\n") === normList(b?.images).join("\n");
  }
  if (field === "aboutProduct") return normList(a?.aboutProduct).join("\n") === normList(b?.aboutProduct).join("\n");
  return normText(a?.[field]) === normText(b?.[field]);
}

/** The content fields where a type differs from what the main product would give it. */
function ownContentDiff(child, expected) {
  return FORMAT_OWN_CONTENT_FIELDS.filter((field) => !sameContent(field, child, expected));
}

/** Leaves a type's own content out of the fields copied from the main product. */
function withoutOwnContent(fields, owned = []) {
  const next = { ...fields };
  for (const field of Array.isArray(owned) ? owned : []) {
    for (const path of OWN_CONTENT_PATHS[field] || []) delete next[path];
  }
  return next;
}

// A digital format's own empty link/notes fall back to the main product's
const FALLBACK_DIGITAL_FIELDS = ["webReaderLink", "kindleLink", "courseLink", "digitalInstructions"];

// Online access settings: a Digital format uses the main product's; a Physical one has none.
const SINGLE_DIGITAL_FIELDS = [
  "digitalType",
  "webReaderLink",
  "kindleLink",
  "kindleAsin",
  "digitalInstructions",
  "courseLink",
  "digitalDelivery",
  "externalAccessLink",
  "externalAccessLabel",
  "externalAccessManual"
];

/**
 * The fields of the hidden product for one format of a single product (e.g. "Print" or
 * "Web Version" of a book). Unlike combo formats there are no items: the format is the product
 * itself in another form, with its own price, stock, package size and tax settings.
 * The main product's HSN/SAC and GST rate are never copied, because a printed book and its web
 * version are taxed differently.
 */
function buildSingleFormatChildFields(parent, format, tax = null) {
  const src = plain(parent) || {};
  const isDigital = normalizeFormatType(format.type) === "digital";
  const taxValues = tax || { hsnSac: format.hsnSac || "", gstRate: format.gstRate === undefined ? null : format.gstRate };
  const fields = {
    name: `${String(src.name || "").trim()} – ${format.label}`.slice(0, 200),
    price: Number.isFinite(Number(format.price)) ? Number(format.price) : 0,
    productType: "single",
    bundleItems: [],
    hideFromListings: true,
    optionParent: src._id || null,
    bundleFormatKey: format.key,
    hasOptions: false,
    options: [],
    bundleFormats: [],
    internationalPrice: format.internationalPrice === undefined ? null : format.internationalPrice,
    internationalCountryPrices: [],
    marketPrices: [],
    isDigital,
    skipOwnershipRules: false,
    hsnSac: taxValues.hsnSac || "",
    gstRate: taxValues.gstRate === undefined ? null : taxValues.gstRate,
    mrp: format.mrp === undefined ? null : format.mrp,
    formatTypeKey: String(format.typeKey || ""),
    isDeleted: false,
    deletedAt: null
  };
  for (const field of SINGLE_COPY_FIELDS) {
    if (src[field] !== undefined) fields[field] = Array.isArray(src[field]) ? [...src[field]] : src[field];
  }
  // The format's own image comes first; the main product's photos follow
  if (format.image) {
    fields.image = format.image;
    fields.images = [format.image, ...(Array.isArray(src.images) ? src.images : []).filter((img) => img && img !== format.image)];
  }
  for (const field of SINGLE_DIGITAL_FIELDS) {
    if (isDigital && format.digital) {
      // The format's own online access (e.g. Web Version and Audio Book with different links).
      // A link or note left empty uses the main product's, as formats did before.
      const own = format.digital[field];
      const fallsBack = FALLBACK_DIGITAL_FIELDS.includes(field) && !own;
      fields[field] = fallsBack ? (src[field] || "") : own !== undefined ? own : field === "externalAccessManual" ? false : "";
    } else if (isDigital) {
      if (src[field] !== undefined) fields[field] = src[field];
    } else {
      fields[field] = field === "digitalDelivery" ? "onsite" : field === "externalAccessManual" ? false : "";
    }
  }
  for (const field of PACKAGE_FIELDS) {
    fields[field] = isDigital ? 0 : Math.max(0, Number(format[field]) || 0);
  }
  if (format.stock !== null && format.stock !== undefined) fields.stock = format.stock;
  // Its own category when one was chosen; otherwise the product's (copied above)
  if (typeof format.category === "string" && format.category) fields.category = format.category;
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
  buildFormatChildFields,
  buildSingleFormatChildFields,
  FORMAT_OWN_CONTENT_FIELDS,
  OWN_CONTENT_PATHS,
  ownContentDiff,
  withoutOwnContent
};
