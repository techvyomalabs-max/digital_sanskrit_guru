/**
 * Other editions of the same title among separate products ("X – Paperback", "X (Kindle
 * Edition)", "X – Digital Flipbook"), so a product page can offer them as choices.
 * Mirrors splitTypeFromName in backend/utils/formatGrouping.js; keep the two in step.
 * Pure (no browser APIs), so backend tests can import it.
 */

const TYPE_PATTERNS = [
  { key: "kindle", label: "Kindle", pattern: /\bkindle(?:\s+edition)?\b/gi },
  { key: "audio-device", label: "Audio Device", pattern: /\b(?:audio\s+(?:device|player)|mp3\s+player|speaker|device)\b/gi },
  { key: "audio-book", label: "Audio Book", pattern: /\baudio[\s-]?books?\b|\baudio\s+(?:version|edition)\b|\b(?:web|digital|online)[\s-]?audio\b/gi },
  { key: "flipbook", label: "Flipbook", pattern: /\b(?:digital\s+)?flip[\s-]?books?\b/gi },
  { key: "pendrive", label: "Pendrive", pattern: /\b(?:pen[\s-]?drive|usb(?:\s+drive)?|flash[\s-]?drive)\b/gi },
  { key: "web-version", label: "Web Version", pattern: /\b(?:web[\s-]?version|web[\s-]?edition|webversion|e[\s-]?books?|online\s+version|digital\s+(?:version|edition))\b/gi },
  { key: "paper", label: "Paperback", pattern: /\b(?:paperback|hard[\s-]?(?:cover|bound)|printed(?:\s+book)?|print(?:\s+(?:version|edition))?|paper(?:\s+(?:version|edition))?|physical\s+book)\b/gi }
];

const titleKey = (text) =>
  String(text || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Letters and digits only, so "Dhāturūpa-paricayaḥ" and "Dhāturūpaparicayaḥ" match
    .replace(/[^a-z0-9]+/g, "");

/** { key, label, base } for a product: its edition (guessed from digital/physical when unnamed) and plain title. */
export function editionOf(product) {
  let rest = String(product?.name || "");
  let found = null;
  for (const type of TYPE_PATTERNS) {
    type.pattern.lastIndex = 0;
    if (type.pattern.test(rest)) {
      if (!found) found = type;
      type.pattern.lastIndex = 0;
      rest = rest.replace(type.pattern, " ");
    }
  }
  const isDigital = product?.isDigital === true;
  const kindle = String(product?.digitalType || "").toLowerCase().includes("kindle");
  const edition = found || (isDigital ? (kindle ? TYPE_PATTERNS[0] : TYPE_PATTERNS[5]) : TYPE_PATTERNS[6]);
  return { key: edition.key, label: edition.label, base: titleKey(rest) };
}

/**
 * Separate products that are other editions of this one: same plain title, a different
 * edition, shown in the shop. One per edition (the first found).
 */
export function otherEditions(product, catalog = []) {
  if (!product?._id) return [];
  const mine = editionOf(product);
  if (!mine.base || mine.base.length < 8) return [];
  const seen = new Set([mine.key]);
  const out = [];
  for (const p of Array.isArray(catalog) ? catalog : []) {
    if (!p?._id || String(p._id) === String(product._id) || p.hideFromListings || p.hasOptions) continue;
    if (String(p.productType || "single") !== "single") continue;
    const other = editionOf(p);
    if (other.base !== mine.base || seen.has(other.key)) continue;
    seen.add(other.key);
    out.push({ product: p, label: other.label, key: other.key });
  }
  return out;
}
