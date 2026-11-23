// What each format is, in one friendly line, for the "Choose format" spotlight on the
// product page. The admin can write their own line per format (product.formatNotes);
// otherwise one is chosen from what the format actually is.
//
// Returns { kind, text, chips: [{ kind, text }] }. "kind" picks the icon in the UI.

import { isExternalDelivery } from "./digitalDelivery";

const lower = (value) => String(value || "").toLowerCase();

// Order matters: the first match wins (a "Kindle eBook" is Kindle, not a generic e-book).
const KINDS = [
  {
    kind: "kindle",
    test: (t) => /kindle/.test(t),
    text: "Read it on the Kindle app or any Kindle device — you buy and download it on Amazon."
  },
  {
    kind: "flipbook",
    test: (t) => /flip ?book/.test(t),
    text: "A digital book with real page-turns, read online from your Digital Library."
  },
  {
    kind: "web",
    test: (t) => /web ?version|web ?reader|online ?(version|edition|reader)|browser/.test(t),
    text: "Opens right in your browser on phone, tablet or laptop — nothing to install."
  },
  {
    kind: "course",
    test: (t) => /course|class|workshop|lesson/.test(t),
    text: "A guided online course you can follow at your own pace."
  },
  {
    kind: "pendrive",
    test: (t) => /pen ?drive|usb|flash ?drive/.test(t),
    text: "A USB drive with everything preloaded — plug it in and use it, no internet needed."
  },
  {
    kind: "audio",
    test: (t) => /chant|japa|yantra|audio|speaker|box|device|player/.test(t),
    text: "A ready-to-play audio device with the recitations preloaded — press play and follow along."
  },
  {
    kind: "disc",
    test: (t) => /\b(cd|dvd|disc|disk)\b/.test(t),
    text: "A disc with the content, shipped to your door."
  },
  {
    kind: "ebook",
    test: (t) => /e-?book|pdf|epub|digital (book|copy|edition)/.test(t),
    text: "A digital edition you can read on any device from your Digital Library."
  },
  {
    kind: "hardcover",
    test: (t) => /hard ?(cover|bound|back)/.test(t),
    text: "A sturdy hardbound edition, shipped to your door — made to last on the shelf."
  },
  {
    kind: "book",
    test: (t) => /book|paperback|print|copy|volume|set/.test(t),
    text: "A printed copy, shipped to your door — for slow reading and notes in the margin."
  }
];

function isManualAccess(product) {
  if (!product) return false;
  if (product.externalAccessManual === true && isExternalDelivery(product)) return true;
  const items = Array.isArray(product.bundleItems) ? product.bundleItems : [];
  return items.some((bi) => {
    const bp = bi?.product && typeof bi.product === "object" ? bi.product : null;
    const manual = bp?.externalAccessManual === true || bi?.externalAccessManual === true;
    return manual && (bp?.digitalDelivery || bi?.digitalDelivery) === "external";
  });
}

function deliveryChips(product, kind) {
  if (!product) return [];
  if (product.isDigital !== true) {
    return [{ kind: "ships", text: "Ships to your address" }];
  }
  if (kind === "kindle" || (isExternalDelivery(product) && product.kindleLink)) {
    return [{ kind: "external", text: "Delivered by Amazon" }];
  }
  if (isManualAccess(product)) {
    return [
      { kind: "later", text: "Access within 24–48 hours" },
      { kind: "devices", text: "Any device" }
    ];
  }
  return [
    { kind: "instant", text: "Instant access" },
    { kind: "devices", text: "Any device" }
  ];
}

/**
 * @param {{ label?: string, product?: object }} option  one entry of product.publicOptions
 * @param {Array<{label: string, note: string}>} notes  product.formatNotes (admin-written lines)
 * @param {string} typeNote  the product type's "what you get" line from Settings (used when the
 *   product has no line of its own for this format)
 */
export function getFormatBlurb(option, notes = [], typeNote = "") {
  const label = String(option?.label || "").trim();
  const product = option?.product || null;

  // The format's own name is the strongest hint, then the product's digital type,
  // category and name ("Web Version", "E-Book - Kindle", "... - Paperback").
  const hints = [label, product?.isDigital === true ? product?.digitalType : "", product?.category, product?.name]
    .map(lower)
    .filter(Boolean);
  let match = null;
  for (const hint of hints) {
    match = KINDS.find((k) => k.test(hint));
    if (match) break;
  }

  const fallbackKind = product?.isDigital === true ? "digital" : "physical";
  const kind = match?.kind || fallbackKind;
  const autoText =
    match?.text ||
    (product?.isDigital === true
      ? "Digital access from your Digital Library, on any device."
      : "A physical item, shipped to your address.");

  const own = Array.isArray(notes)
    ? notes.find((n) => lower(n?.label).trim() === lower(label) && String(n?.note || "").trim())
    : null;

  return {
    kind,
    text: own ? String(own.note).trim() : String(typeNote || "").trim() || autoText,
    chips: deliveryChips(product, kind)
  };
}
