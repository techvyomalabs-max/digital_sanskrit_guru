const BUILT_IN_DIGITAL_FORMAT_TYPES = Object.freeze(["Web Version", "Flipbook", "Kindle"]);

const DEFAULT_DIGITAL_FORMAT_TYPES = Object.freeze([
  "Web Version",
  "Flipbook",
  "Kindle",
  "E-Book",
  "PDF",
  "Other"
]);

const PRODUCT_SETTINGS_KEYS = Object.freeze(new Set(["productCategories", "digitalFormatTypes"]));

function isBuiltInDigitalFormatType(type) {
  const normalized = String(type || "").trim().toLowerCase();
  return BUILT_IN_DIGITAL_FORMAT_TYPES.some((b) => b.toLowerCase() === normalized);
}

function normalizeDigitalFormatTypes(input, options = {}) {
  if (!Array.isArray(input)) {
    return [...DEFAULT_DIGITAL_FORMAT_TYPES];
  }

  const { autoAddBuiltIns = false } = options;

  // Trim and limit to 40 chars
  const rawList = input
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((item) => item.slice(0, 40));

  const lowerList = rawList.map((item) => item.toLowerCase());

  // Check if any built-in is missing
  for (const builtIn of BUILT_IN_DIGITAL_FORMAT_TYPES) {
    if (!lowerList.includes(builtIn.toLowerCase())) {
      if (!autoAddBuiltIns) {
        throw new Error(
          `Built-in digital format types ('Web Version', 'Flipbook', 'Kindle') cannot be renamed or deleted.`
        );
      }
    }
  }

  const seen = new Set();
  const normalized = [];

  for (const item of rawList) {
    const key = item.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    const isBuiltIn = isBuiltInDigitalFormatType(item);
    if (!isBuiltIn) {
      if (key.includes("kindle")) {
        throw new Error(`Digital format type name cannot contain 'kindle': "${item}".`);
      }
      if (key.includes("flipbook")) {
        throw new Error(`Digital format type name cannot contain 'flipbook': "${item}".`);
      }
    }

    seen.add(key);

    // Canonical casing for built-ins
    const canonicalBuiltIn = BUILT_IN_DIGITAL_FORMAT_TYPES.find(
      (b) => b.toLowerCase() === key
    );
    normalized.push(canonicalBuiltIn || item);
  }

  // If autoAddBuiltIns was requested, ensure any missing built-ins are prepended
  if (autoAddBuiltIns) {
    for (let i = BUILT_IN_DIGITAL_FORMAT_TYPES.length - 1; i >= 0; i--) {
      const b = BUILT_IN_DIGITAL_FORMAT_TYPES[i];
      if (!seen.has(b.toLowerCase())) {
        seen.add(b.toLowerCase());
        normalized.unshift(b);
      }
    }
  }

  return normalized;
}

function canSaveProductSettings(bodyKeys, allowedPages) {
  const pages = Array.isArray(allowedPages) ? allowedPages : [];
  const keys = Array.isArray(bodyKeys) ? bodyKeys : [];
  const hasPageAccess = pages.includes("products") || pages.includes("add-products");

  return (
    keys.length > 0 &&
    keys.every((k) => PRODUCT_SETTINGS_KEYS.has(k)) &&
    hasPageAccess
  );
}

module.exports = {
  BUILT_IN_DIGITAL_FORMAT_TYPES,
  DEFAULT_DIGITAL_FORMAT_TYPES,
  PRODUCT_SETTINGS_KEYS,
  isBuiltInDigitalFormatType,
  normalizeDigitalFormatTypes,
  canSaveProductSettings
};
