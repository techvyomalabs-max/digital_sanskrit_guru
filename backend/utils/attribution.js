const STRING_CAPS = {
  source: 100,
  medium: 100,
  campaign: 150,
  term: 150,
  content: 150,
  referrerHost: 255,
  landingPath: 255
};

const ALLOWED_STRING_KEYS = Object.keys(STRING_CAPS);

function sanitizeString(val, maxLen) {
  if (typeof val !== "string") return null;
  // Remove control characters (ASCII 0-31, 127) and < >
  const cleaned = val.replace(/[\x00-\x1F\x7F<>]/g, "").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLen);
}

/**
 * Pure function to sanitize an incoming attribution object.
 * Rejects non-plain objects, strips disallowed keys, sanitizes string fields,
 * validates firstSeenAt, and returns null if nothing valid remains.
 *
 * @param {*} input
 * @returns {object|null}
 */
function sanitizeAttribution(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const result = {};

  for (const key of ALLOWED_STRING_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      const sanitized = sanitizeString(input[key], STRING_CAPS[key]);
      if (sanitized !== null) {
        result[key] = sanitized;
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "firstSeenAt") && input.firstSeenAt) {
    const d = new Date(input.firstSeenAt);
    const time = d.getTime();
    if (!Number.isNaN(time)) {
      const now = Date.now();
      const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
      // Must not be in the future, and not older than 90 days
      if (time <= now && time >= now - ninetyDaysMs) {
        result.firstSeenAt = d;
      }
    }
  }

  if (Object.keys(result).length === 0) {
    return null;
  }

  return result;
}

module.exports = {
  sanitizeAttribution
};
