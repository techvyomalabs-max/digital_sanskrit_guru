"use strict";
/**
 * Product types (pure; no DB).
 *
 * The admin keeps one list of the types a product can come in (Paper, Pendrive, Web Version,
 * Audio Book, Kindle...). Each type says whether it is shipped (physical), read or played on our
 * site (digital) or sold on Amazon (kindle), its default HSN/SAC and GST rate, and a one-line
 * "what you get" note for the product page.
 *
 * A product's format picks a type. Its tax follows the type unless the admin sets the format's
 * own HSN/SAC or GST. Past orders keep the tax they were charged (orders store it per line).
 */

const { GST_SLABS } = require("./productTax");

const MAX_TYPES = 20;
const MAX_LABEL_LENGTH = 40;
const MAX_NOTE_LENGTH = 140;
const KINDS = ["physical", "digital", "kindle"];
const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

const DEFAULT_PRODUCT_FORMAT_TYPES = Object.freeze([
  { key: "paper", label: "Paper", kind: "physical", hsnSac: "4901", gstRate: 0, note: "Printed book, delivered to your address." },
  { key: "pendrive", label: "Pendrive", kind: "physical", hsnSac: "8523", gstRate: 18, note: "Delivered to your address. Plays on any computer." },
  { key: "audio-device", label: "Audio Device", kind: "physical", hsnSac: "8518", gstRate: 18, note: "A ready-to-play audio device, delivered to your address." },
  { key: "web-version", label: "Web Version", kind: "digital", hsnSac: "998433", gstRate: 18, note: "Instant access in your Digital Library." },
  { key: "flipbook", label: "Flipbook", kind: "digital", hsnSac: "998433", gstRate: 18, note: "A digital book with real page-turns, read in your Digital Library." },
  { key: "audio-book", label: "Audio Book", kind: "digital", hsnSac: "998433", gstRate: 18, note: "Listen instantly in your Digital Library." },
  { key: "kindle", label: "Kindle", kind: "kindle", hsnSac: "", gstRate: null, note: "Sold on Amazon Kindle." }
].map((type) => Object.freeze(type)));

const slugify = (label) =>
  String(label || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "type";

const isBlank = (value) => value === null || value === undefined || String(value).trim() === "";

/**
 * Checks the admin's list. Returns { types, error }.
 * Keys are kept when valid so formats keep pointing at the same type after a rename.
 */
function normalizeProductFormatTypes(input) {
  if (!Array.isArray(input)) return { types: [], error: "Product types must be a list." };
  if (input.length === 0) return { types: [], error: "Keep at least one product type." };
  if (input.length > MAX_TYPES) return { types: [], error: `At most ${MAX_TYPES} product types.` };

  const usedKeys = new Set();
  const usedLabels = new Set();
  const types = [];
  for (let i = 0; i < input.length; i += 1) {
    const raw = input[i] || {};
    const n = i + 1;
    const label = String(raw.label ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_LABEL_LENGTH);
    if (!label) return { types: [], error: `Type ${n}: add a name (for example Paper or Audio Book).` };
    const labelKey = label.toLowerCase();
    if (usedLabels.has(labelKey)) return { types: [], error: `Type ${n}: "${label}" is already listed.` };
    usedLabels.add(labelKey);

    const kind = String(raw.kind || "").trim().toLowerCase();
    if (!KINDS.includes(kind)) return { types: [], error: `"${label}": choose Physical, Digital or Kindle.` };

    const hsnSac = String(raw.hsnSac ?? "").replace(/\s+/g, "");
    if (hsnSac && !/^\d{4,8}$/.test(hsnSac)) return { types: [], error: `"${label}": HSN/SAC must be 4 to 8 digits (or left blank).` };

    let gstRate = null;
    if (!isBlank(raw.gstRate)) {
      gstRate = Number(raw.gstRate);
      if (!GST_SLABS.includes(gstRate)) return { types: [], error: `"${label}": GST must be one of ${GST_SLABS.join(", ")} %.` };
    }

    const note = String(raw.note ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NOTE_LENGTH);

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

    types.push({ key, label, kind, hsnSac: kind === "kindle" ? "" : hsnSac, gstRate: kind === "kindle" ? null : gstRate, note });
  }
  return { types, error: "" };
}

/** The stored list, or the defaults when nothing valid is stored yet. */
function resolveProductFormatTypes(stored) {
  if (!Array.isArray(stored) || stored.length === 0) return DEFAULT_PRODUCT_FORMAT_TYPES.map((t) => ({ ...t }));
  const { types, error } = normalizeProductFormatTypes(stored);
  return error ? DEFAULT_PRODUCT_FORMAT_TYPES.map((t) => ({ ...t })) : types;
}

function findType(types, key) {
  const wanted = String(key || "").trim().toLowerCase();
  if (!wanted) return null;
  return (Array.isArray(types) ? types : []).find((t) => t.key === wanted) || null;
}

/** The format's product type ("physical" | "digital") for a type kind. Kindle editions are digital. */
function formatTypeForKind(kind) {
  return kind === "physical" ? "physical" : kind === "digital" || kind === "kindle" ? "digital" : "";
}

/**
 * The HSN/SAC and GST a format's product carries: the format's own values when set, otherwise
 * its type's. Returns { hsnSac, gstRate } ("" / null = the automatic rule in utils/tax.js).
 */
function effectiveFormatTax(format = {}, type = null) {
  const ownCode = String(format.hsnSac ?? "").trim();
  const ownRate = isBlank(format.gstRate) ? null : Number(format.gstRate);
  return {
    hsnSac: ownCode || String(type?.hsnSac || ""),
    gstRate: ownRate !== null && Number.isFinite(ownRate) ? ownRate : (type && type.gstRate !== null && type.gstRate !== undefined ? Number(type.gstRate) : null)
  };
}

/** What the shop may show about types (no tax details). */
function publicProductFormatTypes(types) {
  return (Array.isArray(types) ? types : []).map((t, position) => ({ key: t.key, label: t.label, kind: t.kind, note: t.note || "", position }));
}

module.exports = {
  MAX_TYPES,
  KINDS,
  DEFAULT_PRODUCT_FORMAT_TYPES,
  normalizeProductFormatTypes,
  resolveProductFormatTypes,
  findType,
  formatTypeForKind,
  effectiveFormatTax,
  publicProductFormatTypes
};
