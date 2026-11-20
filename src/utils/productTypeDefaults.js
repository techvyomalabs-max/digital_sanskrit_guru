/**
 * src/utils/productTypeDefaults.js
 * Product types shown until Settings load (same defaults as backend/utils/productFormatTypes.js).
 */
export const DEFAULT_PRODUCT_TYPES = [
  { key: "paper", label: "Paper", kind: "physical", hsnSac: "4901", gstRate: 0, note: "Printed book, delivered to your address." },
  { key: "pendrive", label: "Pendrive", kind: "physical", hsnSac: "8523", gstRate: 18, note: "Delivered to your address. Plays on any computer." },
  { key: "audio-device", label: "Audio Device", kind: "physical", hsnSac: "8518", gstRate: 18, note: "A ready-to-play audio device, delivered to your address." },
  { key: "web-version", label: "Web Version", kind: "digital", hsnSac: "998433", gstRate: 18, note: "Instant access in your Digital Library." },
  { key: "flipbook", label: "Flipbook", kind: "digital", hsnSac: "998433", gstRate: 18, note: "A digital book with real page-turns, read in your Digital Library." },
  { key: "audio-book", label: "Audio Book", kind: "digital", hsnSac: "998433", gstRate: 18, note: "Listen instantly in your Digital Library." },
  { key: "kindle", label: "Kindle", kind: "kindle", hsnSac: "", gstRate: null, note: "Sold on Amazon Kindle." }
];
