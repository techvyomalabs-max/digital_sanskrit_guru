// Works out the visitor's country for /api/settings/detect-country.
// A CDN header (Cloudflare, Vercel, CloudFront) wins when present. Without one (production on
// Lightsail behind plain nginx), the visitor's IP is looked up in an offline GeoLite2 country
// database (geoip-country). If neither gives an answer, the store's home country (IN) is used.
//
// This product includes GeoLite2 data created by MaxMind, available from https://www.maxmind.com.

const DEFAULT_COUNTRY = "IN";

const COUNTRY_HEADERS = [
  "cf-ipcountry",
  "x-vercel-ip-country",
  "x-country",
  "cloudfront-viewer-country"
];

let geoip;
function getGeoip() {
  if (geoip === undefined) {
    try {
      geoip = require("geoip-country");
    } catch (error) {
      console.warn("[visitorCountry] geoip-country unavailable, IP lookup disabled:", error.message);
      geoip = null;
    }
  }
  return geoip;
}

function isValidCountryCode(value) {
  const code = String(value || "").trim().toUpperCase();
  // "XX" and "T1" are Cloudflare's unknown / Tor values.
  return /^[A-Z]{2}$/.test(code) && code !== "XX" && code !== "T1" ? code : "";
}

function countryFromHeaders(headers = {}) {
  for (const name of COUNTRY_HEADERS) {
    const code = isValidCountryCode(headers[name]);
    if (code) return code;
  }
  return "";
}

function normalizeIp(ip) {
  let value = String(ip || "").trim();
  if (value.startsWith("::ffff:")) value = value.slice(7);
  return value;
}

function isPrivateIp(ip) {
  return (
    !ip ||
    ip === "::1" ||
    /^127\./.test(ip) ||
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^169\.254\./.test(ip) ||
    /^f[cd][0-9a-f]{2}:/i.test(ip) ||
    /^fe80:/i.test(ip)
  );
}

function countryFromIp(ip) {
  const address = normalizeIp(ip);
  if (isPrivateIp(address)) return "";
  const lib = getGeoip();
  if (!lib) return "";
  try {
    return isValidCountryCode(lib.lookup(address)?.country);
  } catch {
    return "";
  }
}

// req.ip is the visitor's address because server.js sets "trust proxy" and nginx/Render pass
// X-Forwarded-For.
function detectVisitorCountry(req) {
  return countryFromHeaders(req?.headers) || countryFromIp(req?.ip) || DEFAULT_COUNTRY;
}

module.exports = { detectVisitorCountry, countryFromHeaders, countryFromIp, DEFAULT_COUNTRY };
