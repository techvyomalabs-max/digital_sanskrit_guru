"use strict";
/**
 * Suggesting which existing products are the same title in different types (pure; no DB).
 *
 * Today one title is often several separate products: "Sanskrit Vocabulary Builder Part 1",
 * "Sanskrit Vocabulary Builder Part 1 - Web Version", "... (Kindle)". This finds them by name,
 * guesses each one's product type, and returns groups for the admin to review. Nothing is
 * changed here; grouping links the products under one new main product only after approval.
 */

// Most specific first: "audio device" before "audio book", "web version" before "version"
const TYPE_PATTERNS = [
  { typeKey: "kindle", pattern: /\bkindle(?:\s+edition)?\b/gi },
  { typeKey: "audio-device", pattern: /\b(?:audio\s+(?:device|player)|mp3\s+player|speaker|device)\b/gi },
  { typeKey: "audio-book", pattern: /\baudio[\s-]?books?\b|\baudio\s+(?:version|edition)\b|\b(?:web|digital|online)[\s-]?audio\b/gi },
  { typeKey: "flipbook", pattern: /\b(?:digital\s+)?flip[\s-]?books?\b/gi },
  { typeKey: "pendrive", pattern: /\b(?:pen[\s-]?drive|usb(?:\s+drive)?|flash[\s-]?drive)\b/gi },
  { typeKey: "web-version", pattern: /\b(?:web[\s-]?version|web[\s-]?edition|webversion|e[\s-]?books?|online\s+version|digital\s+(?:version|edition))\b/gi },
  { typeKey: "paper", pattern: /\b(?:paperback|hard[\s-]?(?:cover|bound)|printed(?:\s+book)?|print(?:\s+(?:version|edition))?|paper(?:\s+(?:version|edition))?|physical\s+book)\b/gi }
];

/** Cleans a title for comparing: lower case, letters and digits only, single spaces. */
function nameKey(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0900-\u097f]+/g, " ")
    .trim();
}

function tidyTitle(text) {
  let out = String(text || "")
    .replace(/\(\s*\)|\[\s*\]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  // Separators left at either end ("Title –", "- Title"); brackets are kept
  out = out.replace(/[\s\-–—|:,/]+$/, "").replace(/^[\s\-–—|:,/]+/, "").trim();
  // A bracket left open by the removed words: "Title (Sanskrit name" keeps its ")" if the original had it
  const opens = (out.match(/\(/g) || []).length;
  const closes = (out.match(/\)/g) || []).length;
  if (opens > closes) out = `${out})`;
  return out.replace(/\s+\)/g, ")");
}

/**
 * The product's type and its title without the type words.
 * Returns { typeKey, baseName, guessed? }.
 */
function splitTypeFromName(product) {
  const original = String(product?.name || "").trim();
  let typeKey = "";
  let rest = original;
  for (const { typeKey: key, pattern } of TYPE_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(rest)) {
      if (!typeKey) typeKey = key;
      pattern.lastIndex = 0;
      rest = rest.replace(pattern, " ");
    }
  }
  if (typeKey) {
    const baseName = tidyTitle(rest);
    if (baseName.length >= 3) return { typeKey, baseName };
  }
  // No type words: a physical product is the printed edition, a digital one the web version
  const guessedKey = product?.isDigital === true ? (String(product?.digitalType || "").toLowerCase().includes("kindle") ? "kindle" : "web-version") : "paper";
  return { typeKey: guessedKey, baseName: tidyTitle(original), guessed: true };
}

// Words that mark an offer or edition note rather than a different title ("– Festival Offer")
const NOISE_PATTERN = /\b(?:festival|festive|diwali|deepavali|navaratri|special|limited|launch|introductory|sale|discount(?:ed)?|offer|new|latest)\b/gi;

/** A title without offer words, for the main product's name. */
function cleanBaseName(baseName) {
  return tidyTitle(String(baseName || "").replace(NOISE_PATTERN, " ")) || String(baseName || "").trim();
}

/**
 * The key products are grouped by: the title without offer words and without text in brackets,
 * so "Dhaturupa Paricaya (Dhāturūpaparicayaḥ) – Paperback" and "Dhaturupa Paricaya – Web Version"
 * match. Numbers stay, so "Part 1" and "Part 2" never match.
 */
function groupKey(baseName) {
  const withoutBrackets = String(baseName || "").replace(/\([^)]*\)|\[[^\]]*\]/g, " ");
  return nameKey(withoutBrackets.replace(NOISE_PATTERN, " "));
}

function isGroupable(product) {
  if (!product || product.isDeleted === true) return false;
  if (String(product.productType || "single") !== "single") return false;
  if (product.hasOptions === true || product.optionParent || product.bundleFormatKey) return false;
  return true;
}

/**
 * Groups of existing products that look like one title in several types.
 * Each group: { key, name, members: [{ _id, name, typeKey, label, guessed, price, isDigital, stock, slug }], conflicts }
 * conflicts lists type keys that appear more than once (the admin chooses which one to keep).
 */
function suggestFormatGroups(products, types = []) {
  const { DEFAULT_PRODUCT_FORMAT_TYPES } = require("./productFormatTypes");
  const labelFor = (typeKey) =>
    (Array.isArray(types) ? types : []).find((t) => t.key === typeKey)?.label ||
    DEFAULT_PRODUCT_FORMAT_TYPES.find((t) => t.key === typeKey)?.label ||
    typeKey;
  const byKey = new Map();
  for (const product of Array.isArray(products) ? products : []) {
    if (!isGroupable(product)) continue;
    const { typeKey, baseName, guessed } = splitTypeFromName(product);
    const key = groupKey(baseName);
    if (!key) continue;
    const title = cleanBaseName(baseName);
    if (!byKey.has(key)) byKey.set(key, { key, name: title, members: [] });
    const group = byKey.get(key);
    // The main product's name: a title with its Sanskrit name in brackets if one has it,
    // otherwise the shortest
    const hasBracket = (t) => /\(.+\)/.test(t);
    if (
      (hasBracket(title) && !hasBracket(group.name)) ||
      (hasBracket(title) === hasBracket(group.name) && title.length < group.name.length)
    ) {
      group.name = title;
    }
    group.members.push({
      _id: String(product._id),
      name: String(product.name || ""),
      slug: String(product.slug || ""),
      typeKey,
      label: labelFor(typeKey),
      guessed: Boolean(guessed),
      price: Number(product.price || 0),
      isDigital: product.isDigital === true,
      stock: Number(product.stock || 0),
      category: String(product.category || "")
    });
  }
  return [...byKey.values()]
    .filter((group) => group.members.length >= 2 && group.members.some((m) => !m.guessed))
    .map((group) => {
      const counts = new Map();
      group.members.forEach((m) => counts.set(m.typeKey, (counts.get(m.typeKey) || 0) + 1));
      return { ...group, conflicts: [...counts.entries()].filter(([, n]) => n > 1).map(([typeKey]) => typeKey) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Checks what the admin approved for one group. Returns { name, members: [{ product, label, typeKey }] } or { error }.
 */
function normalizeGroupApproval(body = {}) {
  const name = String(body?.name || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (name.length < 3) return { error: "Give the main product a name." };
  const raw = Array.isArray(body?.members) ? body.members : [];
  if (raw.length < 2) return { error: "Choose at least two products to group." };
  if (raw.length > 12) return { error: "At most 12 products in one group." };
  const seenIds = new Set();
  const seenLabels = new Set();
  const members = [];
  for (const m of raw) {
    const product = String(m?.product || m?._id || "").trim();
    const label = String(m?.label || "").replace(/\s+/g, " ").trim().slice(0, 40);
    const typeKey = String(m?.typeKey || "").trim().toLowerCase();
    if (!/^[0-9a-f]{24}$/i.test(product)) return { error: "A product in the group is invalid." };
    if (!label) return { error: "Every product in the group needs a type name." };
    if (seenIds.has(product)) return { error: "The same product is listed twice." };
    if (seenLabels.has(label.toLowerCase())) return { error: `Two products are both "${label}". Untick one, or rename it.` };
    seenIds.add(product);
    seenLabels.add(label.toLowerCase());
    members.push({ product, label, typeKey });
  }
  return { name, members };
}

module.exports = { nameKey, groupKey, cleanBaseName, splitTypeFromName, isGroupable, suggestFormatGroups, normalizeGroupApproval };
