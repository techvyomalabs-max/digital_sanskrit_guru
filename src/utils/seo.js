/**
 * seo.js — canonical URL and indexing rules for the storefront.
 *
 * The production storefront URL comes from VITE_SITE_URL at build time. Every
 * canonical link and structured-data URL is built from it, never from
 * window.location, so a preview deployment always points search engines at
 * the real store.
 *
 * Keep these rules in step with backend/utils/seo.js, which applies the same
 * tags to the HTML the server sends before any JavaScript runs.
 */

export const DEFAULT_SITE_URL = "https://digitalsanskritguru.com";

export const SITE_URL = (
  String(import.meta.env.VITE_SITE_URL || "").trim() || DEFAULT_SITE_URL
).replace(/(?:\/#|\/|#)+$/, "");

const SITE_HOST = (() => {
  try {
    return new URL(SITE_URL).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
})();

// Public pages and the canonical path each one should report.
// Alias routes point at their main page.
const CANONICAL_PATHS = {
  "/": "/",
  "/collection": "/collection",
  "/about": "/about",
  "/faq": "/faq",
  "/contact": "/contact",
  "/support-us": "/support-us",
  "/shipping-refund-policy": "/shipping-refund-policy",
  "/refund-policy": "/shipping-refund-policy",
  "/privacy-policy": "/privacy-policy",
  "/privacy": "/privacy-policy",
  "/terms-and-conditions": "/terms-and-conditions",
  "/terms-conditions": "/terms-and-conditions",
  "/terms": "/terms-and-conditions",
};

const PRODUCT_PATH = /^\/product\/([^/]+)$/;

function normalizePath(pathname) {
  let p = String(pathname || "/").split(/[?#]/)[0].replace(/\/+/g, "/");
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p || "/";
}

/** Canonical path for a route, or "" when the route should not be indexed. */
export function canonicalPathFor(pathname) {
  const p = normalizePath(pathname);
  if (CANONICAL_PATHS[p]) return CANONICAL_PATHS[p];
  const productMatch = p.match(PRODUCT_PATH);
  if (productMatch) return `/product/${productMatch[1]}`;
  return "";
}

/** Full storefront URL for a path; any query string or #anchor is kept. */
export function absoluteUrl(path = "/") {
  const raw = String(path || "/");
  const splitAt = raw.search(/[?#]/);
  const pathPart = splitAt === -1 ? raw : raw.slice(0, splitAt);
  const rest = splitAt === -1 ? "" : raw.slice(splitAt);
  return `${SITE_URL}${normalizePath(pathPart)}${rest}`;
}

/** True only on the production storefront host (with or without www). */
export function isProductionHost(hostname = typeof window !== "undefined" ? window.location.hostname : "") {
  const host = String(hostname || "").toLowerCase().replace(/^www\./, "");
  return Boolean(SITE_HOST) && host === SITE_HOST;
}

function upsertHeadElement(selector, create) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  return el;
}

function setMetaProperty(property, content) {
  const el = upsertHeadElement(`meta[property="${property}"]`, () => {
    const meta = document.createElement("meta");
    meta.setAttribute("property", property);
    return meta;
  });
  el.setAttribute("content", content);
}

/**
 * Applies the canonical link, robots meta and og:url for the current route.
 * `canonicalOverride` lets a page point at a different public page
 * (for example a product format pointing at its main product).
 */
export function applySeoTags(pathname, canonicalOverride = "") {
  if (typeof document === "undefined") return;

  const canonicalPath = canonicalOverride || canonicalPathFor(pathname);
  const indexable = Boolean(canonicalPath) && isProductionHost();

  const robots = upsertHeadElement('meta[name="robots"]', () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "robots");
    return meta;
  });
  robots.setAttribute("content", indexable ? "index, follow" : "noindex, follow");

  const existingCanonical = document.head.querySelector('link[rel="canonical"]');
  if (canonicalPath) {
    const href = absoluteUrl(canonicalPath);
    const link = existingCanonical || document.createElement("link");
    link.setAttribute("rel", "canonical");
    link.setAttribute("href", href);
    if (!existingCanonical) document.head.appendChild(link);
    setMetaProperty("og:url", href);
  } else if (existingCanonical) {
    existingCanonical.remove();
  }
}
