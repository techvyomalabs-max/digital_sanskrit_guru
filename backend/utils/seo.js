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

/**
 * The head tags for one request: canonical link (public pages) and robots meta.
 * canonicalPath overrides the route rule (product pages use the current link
 * name); noindex: true keeps the canonical but marks noindex, "hard" drops both.
 */
function seoHeadTags({ pathname, hostname, siteUrl = getSeoSiteUrl(), canonicalPath: override = "", noindex = false }) {
  const canonicalPath = noindex === "hard" ? "" : override || canonicalPathFor(pathname);
  const indexable = Boolean(canonicalPath) && !noindex && isProductionHost(hostname, siteUrl);
  const tags = [`<meta name="robots" content="${indexable ? "index, follow" : "noindex, follow"}" />`];
  const canonicalUrl = canonicalPath ? `${siteUrl}${canonicalPath}` : "";
  if (canonicalPath) {
    tags.push(`<link rel="canonical" href="${escapeAttr(canonicalUrl)}" />`);
  }
  return { tags: tags.join("\n    "), indexable, canonicalUrl };
}

const SITE_NAME = "Digital Sanskrit Guru";
const DEFAULT_SHARE_IMAGE = "/logo.png";

/** Plain text from product HTML: tags and entities removed, spaces collapsed. */
function plainText(value) {
  return String(value || "")
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/gi, '"')
    .replace(/&(apos|#039);/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Shortens text at a word boundary, adding an ellipsis when cut. */
function shorten(text, max = 200) {
  const t = String(text || "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

/** A full URL for an image: kept if already absolute, else on assetOrigin (this server). */
function absoluteAsset(src, assetOrigin) {
  const s = String(src || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  return `${String(assetOrigin || "").replace(/\/+$/, "")}${s.startsWith("/") ? "" : "/"}${s}`;
}

/** What link previews (WhatsApp, Facebook, LinkedIn, X) should show for a product. */
function productShareInfo(product) {
  if (!product) return null;
  const name = plainText(product.name);
  if (!name) return null;
  const about = Array.isArray(product.aboutProduct) ? product.aboutProduct.map(plainText).filter(Boolean).join(" ") : "";
  const description = shorten(plainText(product.description) || about || `${name} from ${SITE_NAME}.`);
  const image = String(product.image || (Array.isArray(product.images) ? product.images[0] : "") || "").trim();
  return { title: name, description, image };
}

/**
 * Link-preview tags. share: { title, description, image } for a product page; without it
 * the page keeps its own title and description and only the image is made absolute.
 */
function shareTags({ share, url, assetOrigin, siteTitle, siteDescription }) {
  const title = share ? `${share.title} | ${SITE_NAME}` : siteTitle;
  const description = share ? share.description : siteDescription;
  const image = absoluteAsset((share && share.image) || DEFAULT_SHARE_IMAGE, assetOrigin);
  const tags = [
    `<meta property="og:site_name" content="${escapeAttr(SITE_NAME)}" />`,
    `<meta property="og:type" content="${share ? "product" : "website"}" />`,
    `<meta property="og:title" content="${escapeAttr(title)}" />`,
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
    `<meta property="og:image" content="${escapeAttr(image)}" />`,
    `<meta property="og:image:alt" content="${escapeAttr(share ? share.title : SITE_NAME)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttr(title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
    `<meta name="twitter:image" content="${escapeAttr(image)}" />`
  ];
  if (url) tags.push(`<meta property="og:url" content="${escapeAttr(url)}" />`);
  return tags;
}

const attrOf = (html, re) => {
  const m = String(html).match(re);
  return m ? m[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">") : "";
};

/**
 * Adds the request's SEO and link-preview tags to the built index.html.
 * options.share (product pages) also sets the page title and meta description.
 * options.assetOrigin: where this server serves its own files (for relative image paths).
 */
function injectSeoTags(html, options = {}) {
  const { tags, indexable, canonicalUrl } = seoHeadTags(options);
  const source = String(html);
  const siteTitle = attrOf(source, /<title>([^<]*)<\/title>/i) || SITE_NAME;
  const siteDescription = attrOf(source, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
  const share = options.share || null;

  let cleaned = source
    .replace(/\s*<link[^>]+rel=["']canonical["'][^>]*>/gi, "")
    .replace(/\s*<meta[^>]+name=["']robots["'][^>]*>/gi, "")
    .replace(/\s*<meta[^>]+property=["']og:[^"']+["'][^>]*>/gi, "")
    .replace(/\s*<meta[^>]+name=["']twitter:[^"']+["'][^>]*>/gi, "");
  if (share) {
    const pageTitle = escapeAttr(`${share.title} | ${SITE_NAME}`);
    cleaned = cleaned
      .replace(/<title>[^<]*<\/title>/i, `<title>${pageTitle}</title>`)
      .replace(
        /(<meta[^>]+name=["']description["'][^>]+content=)["'][^"']*["']/i,
        `$1"${escapeAttr(share.description)}"`
      );
  }
  const all = [tags, ...shareTags({ share, url: canonicalUrl, assetOrigin: options.assetOrigin || options.siteUrl || getSeoSiteUrl(), siteTitle, siteDescription })];
  return { html: cleaned.replace(/<\/head>/i, `    ${all.join("\n    ")}\n  </head>`), indexable };
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

/** products: [{ _id, slug, updatedAt }] — listed, non-deleted main products only. */
function buildSitemapXml({ products = [], siteUrl = getSeoSiteUrl(), today = new Date() } = {}) {
  const todayStr = toDateOnly(today);
  const entries = SITEMAP_STATIC_PATHS.map(({ path, changefreq, priority }) => ({
    loc: `${siteUrl}${path}`,
    lastmod: todayStr,
    changefreq,
    priority
  }));
  for (const product of products) {
    const key = String(product?.slug || product?._id || "").trim();
    if (!key) continue;
    entries.push({
      loc: `${siteUrl}/product/${encodeURIComponent(key)}`,
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
  productShareInfo,
  plainText,
  absoluteAsset,
  buildRobotsTxt,
  buildSitemapXml
};
