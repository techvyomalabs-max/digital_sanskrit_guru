const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_SITE_URL,
  getSeoSiteUrl,
  isProductionHost,
  canonicalPathFor,
  injectSeoTags,
  buildRobotsTxt,
  buildSitemapXml
} = require("../utils/seo");

const SITE = "https://digitalsanskritguru.com";
const HTML = "<html><head><title>x</title></head><body></body></html>";

describe("seo utility", () => {
  const original = { SITE_URL: process.env.SITE_URL, VITE_SITE_URL: process.env.VITE_SITE_URL };
  afterEach(() => {
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("never uses localhost as the canonical site", () => {
    delete process.env.VITE_SITE_URL;
    process.env.SITE_URL = "http://localhost:5173";
    assert.equal(getSeoSiteUrl(), DEFAULT_SITE_URL);
    process.env.SITE_URL = "https://shop.example.com/";
    assert.equal(getSeoSiteUrl(), "https://shop.example.com");
  });

  it("recognises the production host with or without www", () => {
    assert.equal(isProductionHost("digitalsanskritguru.com", SITE), true);
    assert.equal(isProductionHost("www.digitalsanskritguru.com", SITE), true);
    assert.equal(isProductionHost("digital-sanskrit-guru.vercel.app", SITE), false);
    assert.equal(isProductionHost("13.233.1.1", SITE), false);
  });

  it("maps public routes and aliases to their canonical path", () => {
    assert.equal(canonicalPathFor("/"), "/");
    assert.equal(canonicalPathFor("/collection/"), "/collection");
    assert.equal(canonicalPathFor("/collection?category=books"), "/collection");
    assert.equal(canonicalPathFor("/terms"), "/terms-and-conditions");
    assert.equal(canonicalPathFor("/product/abc123"), "/product/abc123");
    assert.equal(canonicalPathFor("/cart"), "");
    assert.equal(canonicalPathFor("/admin/orders"), "");
    assert.equal(canonicalPathFor("/search"), "");
  });

  it("adds canonical + index on production product and home pages", () => {
    const { html, indexable } = injectSeoTags(HTML, { pathname: "/product/abc123", hostname: "digitalsanskritguru.com", siteUrl: SITE });
    assert.equal(indexable, true);
    assert.match(html, /<link rel="canonical" href="https:\/\/digitalsanskritguru\.com\/product\/abc123" \/>/);
    assert.match(html, /<meta name="robots" content="index, follow" \/>/);
    const home = injectSeoTags(HTML, { pathname: "/", hostname: "digitalsanskritguru.com", siteUrl: SITE });
    assert.match(home.html, /href="https:\/\/digitalsanskritguru\.com\/"/);
  });

  it("keeps the production canonical but noindexes on other hosts", () => {
    const { html, indexable } = injectSeoTags(HTML, { pathname: "/", hostname: "digital-sanskrit-guru.vercel.app", siteUrl: SITE });
    assert.equal(indexable, false);
    assert.match(html, /noindex/);
    assert.match(html, /href="https:\/\/digitalsanskritguru\.com\/"/);
    assert.doesNotMatch(html, /vercel\.app/);
  });

  it("noindexes private pages and gives them no canonical", () => {
    const { html } = injectSeoTags(HTML, { pathname: "/checkout", hostname: "digitalsanskritguru.com", siteUrl: SITE });
    assert.match(html, /noindex/);
    assert.doesNotMatch(html, /rel="canonical"/);
  });

  it("only advertises the sitemap on the production host", () => {
    assert.match(buildRobotsTxt({ hostname: "digitalsanskritguru.com", siteUrl: SITE }), /Sitemap: https:\/\/digitalsanskritguru\.com\/sitemap\.xml/);
    assert.doesNotMatch(buildRobotsTxt({ hostname: "x.vercel.app", siteUrl: SITE }), /Sitemap/);
  });

  it("lists static pages and products with real paths", () => {
    const xml = buildSitemapXml({ products: [{ _id: "p1", updatedAt: "2026-10-01T00:00:00Z" }], siteUrl: SITE, today: new Date("2026-11-04") });
    assert.match(xml, /<loc>https:\/\/digitalsanskritguru\.com\/<\/loc>/);
    assert.match(xml, /<loc>https:\/\/digitalsanskritguru\.com\/product\/p1<\/loc>\n    <lastmod>2026-10-01<\/lastmod>/);
    assert.doesNotMatch(xml, /#\//);
  });
});
