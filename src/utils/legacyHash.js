/**
 * Legacy hash & query URL migration utilities.
 * Pure ES module with no external dependencies.
 */

/**
 * Converts legacy hash routes (e.g., "#/product/123", "#/account#addresses")
 * into real paths ("/product/123", "/account#addresses").
 * 
 * @param {string} hash - The location hash (e.g. window.location.hash)
 * @param {string} search - The location query string (e.g. window.location.search)
 * @returns {string|null} - Sanitized real path or null if invalid/unsafe
 */
export function legacyHashToPath(hash, search = "") {
  if (typeof hash !== "string" || !hash.startsWith("#/")) {
    return null;
  }

  const rawPath = hash.slice(1);

  let path = rawPath;
  if (!rawPath.includes("?") && typeof search === "string" && search.trim() !== "") {
    const s = search.trim();
    const formattedSearch = s.startsWith("?") ? s : `?${s}`;
    const hashIdx = rawPath.indexOf("#");
    if (hashIdx !== -1) {
      path = rawPath.slice(0, hashIdx) + formattedSearch + rawPath.slice(hashIdx);
    } else {
      path = rawPath + formattedSearch;
    }
  }

  // SECURITY: Must start with exactly one "/" (reject "//evil.com", "/\evil.com"),
  // and must never contain backslashes or control characters to prevent open redirects.
  if (!path.startsWith("/") || path.startsWith("//")) {
    return null;
  }

  if (path.includes("\\") || hasControlCharacter(path)) {
    return null;
  }

  return path;
}

function hasControlCharacter(str) {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if ((code >= 0 && code <= 31) || code === 127) {
      return true;
    }
  }
  return false;
}

/**
 * Converts legacy query URLs (e.g., "?product=64abc")
 * into real product paths ("/product/64abc").
 * 
 * @param {string} search - The query string (e.g. window.location.search)
 * @returns {string|null} - Real product path or null
 */
export function legacyQueryToPath(search) {
  if (typeof search !== "string" || !search) {
    return null;
  }

  try {
    const normalizedSearch = search.startsWith("?") ? search : `?${search}`;
    const params = new URLSearchParams(normalizedSearch);
    const id = params.get("product");
    if (id && /^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      return `/product/${id}`;
    }
  } catch {
    return null;
  }

  return null;
}
