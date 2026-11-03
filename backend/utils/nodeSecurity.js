"use strict";

/**
 * Node.js security release of 21 October 2026 (CVE-2026-111497 Brotli decoder, plus TLS,
 * DNS and HTTP fixes): https://nodejs.org/en/blog/vulnerability/october-2026-security-releases
 * The first patched version of each supported release line. Any other line (20, 23, 25 …)
 * is end-of-life and no longer gets security fixes.
 */
const PATCHED = { 22: "22.23.4", 24: "24.22.1", 26: "26.12.1" };

const parse = (v) => String(v || "").replace(/^v/, "").split(".").map((n) => Number(n) || 0);

function isAtLeast(version, minimum) {
  const a = parse(version);
  const b = parse(minimum);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

/** { ok, version, minimum, message } for a Node version (defaults to the running one). */
function checkNodeVersion(version = process.version) {
  const major = parse(version)[0];
  const minimum = PATCHED[major];
  if (!minimum) {
    return {
      ok: false,
      version,
      minimum: PATCHED[24],
      message: `Node.js ${version} no longer receives security fixes. Upgrade to Node.js ${PATCHED[24]} or later on the 24.x line.`
    };
  }
  if (!isAtLeast(version, minimum)) {
    return {
      ok: false,
      version,
      minimum,
      message: `Node.js ${version} is missing the October 2026 security fixes. Upgrade to ${minimum} or later.`
    };
  }
  return { ok: true, version, minimum, message: "" };
}

/**
 * Refuses request bodies sent Brotli-compressed (Content-Encoding: br). The JSON and form
 * parsers would otherwise decompress them, and the Brotli decoder in unpatched Node.js can be
 * attacked with a malformed body. Browsers, the app and Razorpay never send compressed bodies,
 * so nothing real is turned away. (Compressing our own responses is unaffected.)
 */
function rejectBrotliBodies(req, res, next) {
  const encoding = String(req.headers["content-encoding"] || "").toLowerCase();
  if (encoding.split(",").some((e) => e.trim() === "br")) {
    return res.status(415).json({ message: "Compressed request bodies are not accepted." });
  }
  return next();
}

module.exports = { PATCHED, checkNodeVersion, isAtLeast, rejectBrotliBodies };
