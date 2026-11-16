"use strict";

/**
 * One-line descriptions the admin writes for a product's formats ("Book", "Flipbook"...),
 * shown under the format picker. Matched to a format by its name (case-insensitive).
 * Formats without a note get an automatic line on the product page.
 * Stored as a list, not a map, because format names may contain dots ("Vol. 1").
 */

const MAX_NOTES = 12;
const MAX_LABEL_LENGTH = 40;
const MAX_NOTE_LENGTH = 140;

function normalizeFormatNotes(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const item of input) {
    if (out.length >= MAX_NOTES) break;
    const label = String(item?.label ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_LABEL_LENGTH);
    const note = String(item?.note ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NOTE_LENGTH);
    const key = label.toLowerCase();
    if (!label || !note || seen.has(key)) continue;
    seen.add(key);
    out.push({ label, note });
  }
  return out;
}

module.exports = { normalizeFormatNotes, MAX_NOTES, MAX_NOTE_LENGTH };
