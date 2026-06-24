/**
 * cache.js — Centralised in-memory cache with TTL management.
 *
 * Uses node-cache under the hood.  Import the singleton `appCache` wherever
 * you need caching instead of creating new instances per-module.
 *
 * Key helpers:
 *   appCache.get(key)              → value | undefined
 *   appCache.set(key, value, ttl)  → true
 *   appCache.del(key | key[])      → number of deleted keys
 *   appCache.flush()               → clears ALL keys
 *   invalidateProductCache()       → clears all product/home/settings keys
 */

const NodeCache = require("node-cache");

// ── TTL constants (seconds) ───────────────────────────────────────────────────
const TTL = {
  PRODUCTS_LIST: 60,      // /api/products   — refreshes every 60 s
  PRODUCTS_HOME: 90,      // /api/products/home
  PRODUCT_SINGLE: 120,    // /api/products/:id
  SETTINGS_PUBLIC: 300,   // /api/settings/public — rarely changes
  COUPONS_PUBLIC: 120,    // /api/coupons public list
  RECOMMENDATIONS: 180    // /api/products/recommend/:id
};

// stdTTL = 0 means no global default; each set() call specifies its own TTL.
const appCache = new NodeCache({ stdTTL: 0, checkperiod: 30, useClones: false });

/**
 * Invalidate all product-related cache keys.
 * Call this after any product create/update/delete or settings change.
 */
function invalidateProductCache() {
  const keys = appCache.keys().filter((k) =>
    k.startsWith("products:") ||
    k.startsWith("home:") ||
    k.startsWith("product:") ||
    k.startsWith("recommend:") ||
    k.startsWith("settings:") ||
    k.startsWith("coupons:")
  );
  if (keys.length > 0) {
    appCache.del(keys);
  }
}

/**
 * Simple cache-aside wrapper.
 *
 * @param {string}   key    Cache key
 * @param {number}   ttl    TTL in seconds
 * @param {Function} fetch  Async function that returns the fresh data
 * @returns {Promise<any>}
 */
async function cacheAside(key, ttl, fetch) {
  const cached = appCache.get(key);
  if (cached !== undefined) return cached;
  const data = await fetch();
  if (data !== undefined && data !== null) {
    appCache.set(key, data, ttl);
  }
  return data;
}

module.exports = { appCache, TTL, invalidateProductCache, cacheAside };
