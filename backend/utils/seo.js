/**
 * seo.js — canonical URL and indexing rules, applied by the server.
 *
 * The server adds the canonical link and robots meta to index.html for each
 * request, so crawlers see them before any JavaScript runs. The storefront
 * keeps them up to date as visitors move between pages (src/utils/seo.js) —
 * keep the two route lists in step.
 *
 * The production URL comes from SITE_URL (or VITE_SITE_URL). Requests to any
 * other host — a preview, a raw server IP — are marked noindex.
 */

const DEFAULT_SITE_URL = "https://digitalsanskritguru.com";

function getSeoSiteUrl() {
  const raw = String(process.env.SITE_URL || process.env.VITE_SITE_URL || "").trim();
  const url = raw.replace(/(?:\/#|\/|#)+$/, "");
  // A localhost value is for building email links in development; it must
  // never become the canonical address of the live store
  if (!url || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url)) return DEFAULT_SITE_URL;
  return url;
}

function siteHost(siteUrl = getSeoSiteUrl()) {
  try {
    return new URL(siteUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isProductionHost(hostname, siteUrl = getSeoSiteUrl()) {
  const host = String(hostname || "").toLowerCase().split(":")[0].replace(/^www\./, "");
  const expected = siteHost(siteUrl);
  return Boolean(expected) && host === expected;
}

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
  "/terms": "/terms-and-conditions"
};

// Pages listed in the sitemap (main paths only, no aliases)
const SITEMAP_STATIC_PATHS = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/collection", changefreq: "daily", priority: "0.9" },
  { path: "/about", changefreq: "monthly", priority: "0.5" },
  { path: "/faq", changefreq: "monthly", priority: "0.5" },
  { path: "/contact", changefreq: "yearly", priority: "0.4" },
  { path: "/support-us", changefreq: "monthly", priority: "0.4" },
  { path: "/shipping-refund-policy", changefreq: "yearly", priority: "0.3" },
  { path: "/privacy-policy", changefreq: "yearly", priority: "0.3" },
  { path: "/terms-and-conditions", changefreq: "yearly", priority: "0.3" }
];

const PRODUCT_PATH = /^\/product\/([^/]+)$/;

function normalizePath(pathname) {
  let p = String(pathname || "/").split(/[?#]/)[0].replace(/\/+/g, "/");
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p || "/";
}

/** Canonical path for a route, or "" when the route should not be indexed. */
function canonicalPathFor(pathname) {
  const p = normalizePath(pathname);
  if (CANONICAL_PATHS[p]) return CANONICAL_PATHS[p];
  const productMatch = p.match(PRODUCT_PATH);
  if (productMatch) return `/product/${productMatch[1]}`;
  return "";
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeXml(value) {
  return escapeAttr(value).replace(/'/g, "&apos;");
}

/** The head tags for one request: canonical link (public pages) and robots meta. */
function seoHeadTags({ pathname, hostname, siteUrl = getSeoSiteUrl() }) {
  const canonicalPath = canonicalPathFor(pathname);
  const indexable = Boolean(canonicalPath) && isProductionHost(hostname, siteUrl);
  const tags = [`<meta name="robots" content="${indexable ? "index, follow" : "noindex, follow"}" />`];
  if (canonicalPath) {
    const href = escapeAttr(`${siteUrl}${canonicalPath}`);
    tags.push(`<link rel="canonical" href="${href}" />`);
    tags.push(`<meta property="og:url" content="${href}" />`);
  }
  return { tags: tags.join("\n    "), indexable };
}

/** Adds the request's SEO tags to the built index.html. */
function injectSeoTags(html, options) {
  const { tags, indexable } = seoHeadTags(options);
  const cleaned = String(html)
    .replace(/\s*<link[^>]+rel=["']canonical["'][^>]*>/gi, "")
    .replace(/\s*<meta[^>]+name=["']robots["'][^>]*>/gi, "")
    .replace(/\s*<meta[^>]+property=["']og:url["'][^>]*>/gi, "");
  return { html: cleaned.replace(/<\/head>/i, `    ${tags}\n  </head>`), indexable };
}

function buildRobotsTxt({ hostname, siteUrl = getSeoSiteUrl() }) {
  if (!isProductionHost(hostname, siteUrl)) {
    // Not the live store: let crawlers fetch pages so they see noindex,
    // but give them no sitemap to follow
    return "User-agent: *\nAllow: /\n";
  }
  return [
    "User-agent: *",
    "Disallow: /admin",
    "Disallow: /cart",
    "Disallow: /checkout",
    "Disallow: /account",
    "Disallow: /my-orders",
    "Disallow: /my-library",
    "Disallow: /api/",
    "",
    `Sitemap: ${siteUrl}/sitemap.xml`,
    ""
  ].join("\n");
}

function toDateOnly(value) {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : "";
}

/** products: [{ _id, updatedAt }] — listed, non-deleted main products only. */
function buildSitemapXml({ products = [], siteUrl = getSeoSiteUrl(), today = new Date() } = {}) {
  const todayStr = toDateOnly(today);
  const entries = SITEMAP_STATIC_PATHS.map(({ path, changefreq, priority }) => ({
    loc: `${siteUrl}${path}`,
    lastmod: todayStr,
    changefreq,
    priority
  }));
  for (const product of products) {
    const id = String(product?._id || "").trim();
    if (!id) continue;
    entries.push({
      loc: `${siteUrl}/product/${encodeURIComponent(id)}`,
      lastmod: toDateOnly(product.updatedAt) || todayStr,
      changefreq: "weekly",
      priority: "0.8"
    });
  }
  const body = entries
    .map((e) => [
      "  <url>",
      `    <loc>${escapeXml(e.loc)}</loc>`,
      e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : "",
      `    <changefreq>${e.changefreq}</changefreq>`,
      `    <priority>${e.priority}</priority>`,
      "  </url>"
    ].filter(Boolean).join("\n"))
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

module.exports = {
  DEFAULT_SITE_URL,
  getSeoSiteUrl,
  isProductionHost,
  canonicalPathFor,
  seoHeadTags,
  injectSeoTags,
  buildRobotsTxt,
  buildSitemapXml
};
