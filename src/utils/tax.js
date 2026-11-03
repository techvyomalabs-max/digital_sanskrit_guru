// GST rules for showing tax at the cart and checkout. Same rules as backend/utils/tax.js, which
// decides what is charged and invoiced (finance, November 2026):
//   Printed books 4901 nil · USB devices 8523 18% · Audio devices 8518 18% ·
//   Digital products (web versions, flipbooks, e-books) 998433 18%.
// A product's own HSN/SAC and GST rate always win. A combo is taxed by its components.

export const TAX_CATEGORIES = [
  { key: "printed-book", label: "Printed book", code: "4901", rate: 0 },
  { key: "usb-device", label: "USB device", code: "8523", rate: 18 },
  { key: "audio-device", label: "Audio device", code: "8518", rate: 18 },
  { key: "digital", label: "Digital product (web version, flipbook, e-book)", code: "998433", rate: 18 }
];

const CODE_RATES = Object.fromEntries(TAX_CATEGORIES.map((c) => [c.code, c.rate]));
const DIGITAL_WORDS = ["ebook", "e-book", "kindle", "web version", "web-version", "flipbook", "epub", "pdf"];
const BOOK_WORDS = ["book", "sanskrit", "gita", "scriptures", "grammar", "dharma", "paperback", "volume", "vol.", "hardcover"];
const USB_WORDS = ["usb", "pen drive", "pendrive", "flash drive"];
const AUDIO_DEVICE_WORDS = ["speaker", "headphone", "earphone", "earbud", "audio device", "audio player", "mp3 player", "microphone"];
const has = (text, words) => words.some((w) => text.includes(w));

/** HSN/SAC code: the product's own, else a best guess (digital 998433, USB 8523, audio device 8518, book 4901, else 8523). */
export function getItemHsnSac(item) {
  if (item?.hsnSac) return String(item.hsnSac).trim();
  const name = String(item?.name || item?.product?.name || "").trim().toLowerCase();
  const category = String(item?.category || item?.product?.category || "").trim().toLowerCase();
  const text = `${category} ${name}`;
  if (item?.isDigital === true || has(text, DIGITAL_WORDS)) return "998433";
  if (has(text, USB_WORDS)) return "8523";
  if (has(text, AUDIO_DEVICE_WORDS)) return "8518";
  if (has(text, BOOK_WORDS)) return "4901";
  return "8523";
}

/** GST rate %: 0 outside India; the product's own rate; the rate of its code; else the store rate. */
export function itemGstRate(item, { isInternational = false, storeRate = 0 } = {}) {
  if (isInternational) return 0;
  const own = item?.gstRate;
  if (own !== null && own !== undefined && own !== "" && Number.isFinite(Number(own))) return Number(own);
  const code = getItemHsnSac(item);
  if (Object.prototype.hasOwnProperty.call(CODE_RATES, code)) return CODE_RATES[code];
  return Math.max(0, Number(storeRate) || 0);
}

/** Is this a combo (taxed by its components)? */
export function isComboItem(item) {
  return item?.productType === "bundle" || (Array.isArray(item?.bundleItems) && item.bundleItems.length > 0);
}
