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

function broadcastInvalidation(payload) {
  if (typeof process.send === "function") {
    process.send({ type: "cache:invalidate", ...payload, from: process.pid });
  }
}

if (typeof process.send === "function") {
  process.on("message", (msg) => {
    if (msg?.type === "cache:invalidate" && msg.from !== process.pid) {
      if (msg.scope === "products") {
        invalidateProductCacheLocal();
      } else if (Array.isArray(msg.keys)) {
        appCache.del(msg.keys);
      }
    }
  });
}

// Bumped on every product invalidation, so a background refresh that started
// before an edit never puts the old data back
let productCacheGeneration = 0;

function invalidateProductCacheLocal() {
  productCacheGeneration += 1;
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
 * Invalidate all product-related cache keys.
 * Call this after any product create/update/delete or settings change.
 */
function invalidateProductCache() {
  invalidateProductCacheLocal();
  broadcastInvalidation({ scope: "products" });
}

function invalidateKeys(keys) {
  const normalized = Array.isArray(keys) ? keys : [keys];
  if (normalized.length > 0) {
    appCache.del(normalized);
    broadcastInvalidation({ keys: normalized });
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

// How long past its TTL an entry may still be served while it refreshes
const STALE_SERVE_SECONDS = 60 * 60;
const refreshesInFlight = new Map();

function loadAndStore(key, ttl, fetch) {
  if (refreshesInFlight.has(key)) return refreshesInFlight.get(key);
  const generation = productCacheGeneration;
  const promise = Promise.resolve()
    .then(fetch)
    .then((data) => {
      if (data !== undefined && data !== null && generation === productCacheGeneration) {
        appCache.set(key, { value: data, freshUntil: Date.now() + ttl * 1000 }, ttl + STALE_SERVE_SECONDS);
      }
      return data;
    })
    .finally(() => refreshesInFlight.delete(key));
  refreshesInFlight.set(key, promise);
  return promise;
}

/**
 * Cache-aside that never makes a visitor wait for a refresh. After `ttl` seconds
 * the old value is still returned (for up to STALE_SERVE_SECONDS more) while a
 * fresh copy loads in the background. Product invalidation clears these entries
 * like any other key, so the next request after an edit loads fresh data.
 * Concurrent misses share one load.
 *
 * @param {string}   key    Cache key; use a prefix that invalidateProductCache() clears
 * @param {number}   ttl    Seconds before a background refresh is started
 * @param {Function} fetch  Async function that returns the fresh data
 * @returns {Promise<any>}
 */
async function cacheStaleWhileRevalidate(key, ttl, fetch) {
  const entry = appCache.get(key);
  if (entry === undefined) return loadAndStore(key, ttl, fetch);
  if (Date.now() >= entry.freshUntil) {
    loadAndStore(key, ttl, fetch).catch((err) => {
      console.error(`[Cache] Background refresh of ${key} failed:`, err?.message || err);
    });
  }
  return entry.value;
}

/**
 * set() with a ceiling on how many keys may share a prefix. Keys built from request
 * input (page, sort, category...) could otherwise grow without limit if someone sends
 * endless variations; past the ceiling the value is simply not cached.
 */
function setBounded(key, value, ttl, { prefix, maxKeys }) {
  if (!appCache.has(key)) {
    const count = appCache.keys().reduce((n, k) => (k.startsWith(prefix) ? n + 1 : n), 0);
    if (count >= maxKeys) return false;
  }
  return appCache.set(key, value, ttl);
}

module.exports = { appCache, TTL, invalidateProductCache, invalidateKeys, cacheAside, cacheStaleWhileRevalidate, setBounded };
