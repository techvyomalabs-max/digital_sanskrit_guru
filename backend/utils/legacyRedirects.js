/**
 * Legacy URL redirect resolution and trailing-slash normalization utilities.
 * Pure CommonJS module with no Express or fs dependencies.
 */

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid"
]);

/**
 * Normalizes a URL pathname:
 * - Lowercases
 * - Safely decodes (reverts to lowercased input on decode failure)
 * - Collapses repeated slashes
 * - Removes a single trailing slash unless path is "/"
 * 
 * @param {string} pathname
 * @returns {string}
 */
function normalizePath(pathname) {
  if (typeof pathname !== "string") {
    return "";
  }

  let p = pathname.toLowerCase();
  try {
    p = decodeURI(p);
  } catch {
    return pathname.toLowerCase();
  }

  p = p.replace(/\/+/g, "/");
  if (p.length > 1 && p.endsWith("/")) {
    p = p.slice(0, -1);
  }

  return p;
}

/**
 * Validates whether a path string starts with exactly one "/"
 * and does not contain backslashes, "://", or control characters.
 * 
 * @param {string} str
 * @returns {boolean}
 */
function isValidPathString(str) {
  if (typeof str !== "string") return false;
  if (!str.startsWith("/") || str.startsWith("//")) return false;
  if (str.includes("\\") || str.includes("://")) return false;

  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if ((code >= 0 && code <= 31) || code === 127) {
      return false;
    }
  }

  return true;
}

/**
 * Validates a redirect configuration list and builds a Map of normalized from -> to.
 * Throws an Error listing all invalid entries if validation fails.
 * 
 * @param {Array<{ from: string, to: string }>} list
 * @returns {Map<string, string>}
 */
function buildRedirectMap(list) {
  if (!Array.isArray(list)) {
    throw new Error("Redirect list must be an array");
  }

  const errors = [];
  const fromSet = new Set();
  const normalizedFromMap = new Map();

  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    const desc = `Entry #${i + 1} (${JSON.stringify(entry)})`;

    if (!entry || typeof entry !== "object") {
      errors.push(`${desc}: Entry must be an object with "from" and "to" string properties`);
      continue;
    }

    const { from, to } = entry;

    if (!isValidPathString(from)) {
      errors.push(`${desc}: "from" must be a string starting with exactly one "/" and contain no backslashes, "://", or control characters`);
    }

    if (!isValidPathString(to)) {
      errors.push(`${desc}: "to" must be a string starting with exactly one "/" and contain no backslashes, "://", or control characters`);
    }

    if (isValidPathString(from) && isValidPathString(to)) {
      if (from === to || normalizePath(from) === normalizePath(to)) {
        errors.push(`${desc}: "from" must not equal "to" ("${from}" -> "${to}")`);
      }

      const normFrom = normalizePath(from);
      if (normalizedFromMap.has(normFrom)) {
        errors.push(`${desc}: Duplicate "from" path "${from}" (already defined in entry #${normalizedFromMap.get(normFrom) + 1})`);
      } else {
        normalizedFromMap.set(normFrom, i);
        fromSet.add(normFrom);
      }
    }
  }

  // Second pass: detect redirect chains or loops
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    if (entry && isValidPathString(entry.from) && isValidPathString(entry.to)) {
      const normTo = normalizePath(entry.to);
      if (fromSet.has(normTo)) {
        const targetIndex = normalizedFromMap.get(normTo);
        errors.push(
          `Entry #${i + 1} ("${entry.from}" -> "${entry.to}"): "to" matches "from" of entry #${targetIndex + 1} (redirect chains/loops are prohibited)`
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid legacy redirects configuration (${errors.length} error${errors.length > 1 ? "s" : ""}):\n` +
        errors.map((err) => `  - ${err}`).join("\n")
    );
  }

  const map = new Map();
  for (const entry of list) {
    map.set(normalizePath(entry.from), entry.to);
  }

  return map;
}

/**
 * Retains only permitted marketing/analytics tracking parameters from a query string.
 * 
 * @param {string} search
 * @returns {string} "" or "?key=val&key2=val2"
 */
function keepTrackingParams(search) {
  if (typeof search !== "string" || !search) {
    return "";
  }

  const rawQuery = search.startsWith("?") ? search.slice(1) : search;
  if (!rawQuery.trim()) {
    return "";
  }

  const params = new URLSearchParams(rawQuery);
  const filtered = new URLSearchParams();

  for (const [key, value] of params.entries()) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) {
      filtered.append(key, value);
    }
  }

  const result = filtered.toString();
  return result ? `?${result}` : "";
}

/**
 * Resolves an explicit legacy redirect from the configured redirect map.
 * 
 * @param {Map<string, string>} map
 * @param {string} pathname
 * @param {string} search
 * @returns {{ status: number, location: string } | null}
 */
function resolveRedirect(map, pathname, search) {
  if (!map || typeof map.get !== "function") {
    return null;
  }

  const normalized = normalizePath(pathname);
  if (map.has(normalized)) {
    const to = map.get(normalized);
    const tracking = keepTrackingParams(search);
    return {
      status: 301,
      location: `${to}${tracking}`
    };
  }

  return null;
}

/**
 * Redirects paths ending with a trailing slash to their canonical non-slash counterpart.
 * 
 * @param {string} pathname
 * @param {string} search
 * @returns {{ status: number, location: string } | null}
 */
function trailingSlashRedirect(pathname, search) {
  if (typeof pathname !== "string" || pathname.length <= 1 || !pathname.endsWith("/")) {
    return null;
  }

  const lower = pathname.toLowerCase();
  if (
    lower.startsWith("/api/") ||
    lower === "/api/" ||
    lower.startsWith("/uploads/") ||
    lower.startsWith("/wp-content/")
  ) {
    return null;
  }

  // Skip if the last segment contains a file extension
  const withoutTrailing = pathname.replace(/\/+$/, "");
  const lastSegment = withoutTrailing.split("/").pop() || "";
  if (/\.[a-zA-Z0-9]{1,8}$/.test(lastSegment)) {
    return null;
  }

  // Collapse repeated slashes and remove trailing slashes
  let cleanPath = pathname.replace(/\/+/g, "/").replace(/\/+$/, "");
  if (!cleanPath || cleanPath === "") {
    cleanPath = "/";
  }

  // Open redirect safety: Never produce a location starting with "//"
  if (cleanPath.startsWith("//")) {
    return null;
  }

  const formattedSearch =
    typeof search === "string" && search
      ? search.startsWith("?")
        ? search
        : `?${search}`
      : "";

  const location = `${cleanPath}${formattedSearch}`;
  if (location.startsWith("//")) {
    return null;
  }

  return {
    status: 301,
    location
  };
}

/**
 * Creates an Express middleware for legacy redirects and trailing slash normalization.
 * 
 * @param {Map<string, string>} map
 * @returns {Function} Express middleware (req, res, next)
 */
function createRedirectMiddleware(map) {
  return function legacyRedirectMiddleware(req, res, next) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return next();
    }

    const pathname = req.path || (req.url ? req.url.split("?")[0] : "");
    if (!pathname || pathname.startsWith("/api/") || pathname === "/api" || pathname.startsWith("/api?")) {
      return next();
    }

    let search = "";
    if (typeof req.url === "string" && req.url.includes("?")) {
      search = req.url.slice(req.url.indexOf("?"));
    } else if (typeof req.originalUrl === "string" && req.originalUrl.includes("?")) {
      search = req.originalUrl.slice(req.originalUrl.indexOf("?"));
    }

    const redirect = resolveRedirect(map, pathname, search) || trailingSlashRedirect(pathname, search);
    if (redirect) {
      return res.redirect(redirect.status, redirect.location);
    }

    return next();
  };
}

module.exports = {
  normalizePath,
  buildRedirectMap,
  keepTrackingParams,
  resolveRedirect,
  trailingSlashRedirect,
  createRedirectMiddleware
};
