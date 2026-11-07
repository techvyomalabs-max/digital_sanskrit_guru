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

const { findProductForLink, resolveProductLink } = require("../utils/productLinkLookup");

// Minimal stand-in for the Product model: findOne(filter).select().lean()
function fakeProductModel(docs) {
  const matches = (doc, filter) => Object.entries(filter).every(([k, v]) => {
    if (k === "$or") return v.some((f) => matches(doc, f));
    if (v && typeof v === "object" && "$ne" in v) return doc[k] !== v.$ne;
    if (k === "slugHistory") return (doc.slugHistory || []).includes(v);
    return String(doc[k]) === String(v);
  });
  return {
    findOne(filter) {
      const doc = docs.find((d) => matches(d, filter)) || null;
      return { select: () => ({ lean: async () => doc }) };
    }
  };
}

describe("product link resolution", () => {
  const PARENT_ID = "64b000000000000000000001";
  const FORMAT_ID = "64b000000000000000000002";
  const Product = fakeProductModel([
    { _id: PARENT_ID, slug: "dhaturupa-parichaya", slugHistory: ["dhatu-rupa-old"], wpProductId: 4321 },
    { _id: FORMAT_ID, slug: "dhaturupa-parichaya-usb", optionParent: PARENT_ID, hideFromListings: true },
    { _id: "64b000000000000000000003", slug: "gone", isDeleted: true },
    { _id: "64b000000000000000000004", slug: "private-bulk", hideFromListings: true }
  ]);

  it("serves the current link name with itself as canonical", async () => {
    const r = resolveProductLink(await findProductForLink(Product, "dhaturupa-parichaya"), "dhaturupa-parichaya");
    assert.equal(r.canonicalPath, "/product/dhaturupa-parichaya");
    assert.equal(r.noindex, false);
  });

  it("redirects ids, old site numbers and earlier names to the current link", async () => {
    for (const key of [PARENT_ID, "4321", "dhatu-rupa-old"]) {
      const r = resolveProductLink(await findProductForLink(Product, key), key);
      assert.deepEqual(r, { redirect: "/product/dhaturupa-parichaya" }, key);
    }
  });

  it("points a format at its main product and reports missing products", async () => {
    const fmt = resolveProductLink(await findProductForLink(Product, "dhaturupa-parichaya-usb"), "dhaturupa-parichaya-usb");
    assert.equal(fmt.canonicalPath, "/product/dhaturupa-parichaya");
    assert.equal(fmt.noindex, false);
    assert.deepEqual(resolveProductLink(await findProductForLink(Product, "gone"), "gone"), { notFound: true });
    assert.deepEqual(resolveProductLink(await findProductForLink(Product, "nothing-here"), "nothing-here"), { notFound: true });
  });

  it("keeps hidden non-format products out of search", async () => {
    const r = resolveProductLink(await findProductForLink(Product, "private-bulk"), "private-bulk");
    assert.equal(r.noindex, true);
  });

  it("uses the canonical override and noindex in the HTML", () => {
    const { html, indexable } = injectSeoTags(HTML, { pathname: "/product/x", hostname: "digitalsanskritguru.com", siteUrl: SITE, canonicalPath: "/product/dhaturupa-parichaya" });
    assert.equal(indexable, true);
    assert.match(html, /href="https:\/\/digitalsanskritguru\.com\/product\/dhaturupa-parichaya"/);
    const gone = injectSeoTags(HTML, { pathname: "/product/x", hostname: "digitalsanskritguru.com", siteUrl: SITE, noindex: "hard" });
    assert.doesNotMatch(gone.html, /canonical/);
    assert.match(gone.html, /noindex/);
  });

  it("lists products in the sitemap by link name", () => {
    const xml = buildSitemapXml({ products: [{ _id: PARENT_ID, slug: "dhaturupa-parichaya" }], siteUrl: SITE });
    assert.match(xml, /<loc>https:\/\/digitalsanskritguru\.com\/product\/dhaturupa-parichaya<\/loc>/);
    assert.doesNotMatch(xml, new RegExp(PARENT_ID));
  });
});

describe("link previews (WhatsApp, Facebook) for product pages", () => {
  const { productShareInfo, plainText, absoluteAsset } = require("../utils/seo");
  const fs = require("fs");
  const path = require("path");
  const SHELL = fs.readFileSync(path.join(__dirname, "../../index.html"), "utf8");
  const meta = (html, attr, name) => {
    const m = html.match(new RegExp(`<meta[^>]+${attr}="${name}"[^>]+content="([^"]*)"`, "i"));
    return m ? m[1] : null;
  };
  const count = (html, re) => (html.match(re) || []).length;

  const product = {
    _id: "64b000000000000000000001",
    slug: "dhaturupaparicayah",
    name: "Dhaturupa Parichaya (Dhāturūpa-paricayaḥ )",
    description: "<p>Master the most important <strong>verb-forms</strong> &amp; their usage.&nbsp;A reference book for beginners.</p>",
    image: "https://cdn.example.com/products/dhaturupa.jpg"
  };

  it("uses the product's name, a plain-text summary and its image", () => {
    const share = productShareInfo(product);
    assert.equal(share.title, "Dhaturupa Parichaya (Dhāturūpa-paricayaḥ )");
    assert.equal(share.description, "Master the most important verb-forms & their usage. A reference book for beginners.");
    assert.equal(share.image, "https://cdn.example.com/products/dhaturupa.jpg");
  });

  it("puts them in the HTML the server sends, with the final product URL", () => {
    const { html } = injectSeoTags(SHELL, {
      pathname: "/product/dhaturupaparicayah", hostname: "digitalsanskritguru.com", siteUrl: SITE,
      canonicalPath: "/product/dhaturupaparicayah", share: productShareInfo(product), assetOrigin: "https://digitalsanskritguru.com"
    });
    assert.equal(meta(html, "property", "og:title"), "Dhaturupa Parichaya (Dhāturūpa-paricayaḥ ) | Digital Sanskrit Guru");
    assert.equal(meta(html, "property", "og:description"), "Master the most important verb-forms &amp; their usage. A reference book for beginners.");
    assert.equal(meta(html, "property", "og:image"), "https://cdn.example.com/products/dhaturupa.jpg");
    assert.equal(meta(html, "property", "og:url"), "https://digitalsanskritguru.com/product/dhaturupaparicayah");
    assert.equal(meta(html, "property", "og:type"), "product");
    assert.equal(meta(html, "name", "twitter:title"), "Dhaturupa Parichaya (Dhāturūpa-paricayaḥ ) | Digital Sanskrit Guru");
    assert.match(html, /<title>Dhaturupa Parichaya \(Dhāturūpa-paricayaḥ \) \| Digital Sanskrit Guru<\/title>/);
    assert.equal(meta(html, "name", "description"), "Master the most important verb-forms &amp; their usage. A reference book for beginners.");
    // Each tag once: the store-wide ones from index.html are replaced, not duplicated
    assert.equal(count(html, /property="og:title"/g), 1);
    assert.equal(count(html, /property="og:image"/g), 1);
    assert.equal(count(html, /name="twitter:image"/g), 1);
    assert.equal(count(html, /<title>/g), 1);
  });

  it("other pages keep the store title and get an absolute logo image", () => {
    const { html } = injectSeoTags(SHELL, { pathname: "/", hostname: "digitalsanskritguru.com", siteUrl: SITE, assetOrigin: "https://digitalsanskritguru.com" });
    assert.equal(meta(html, "property", "og:image"), "https://digitalsanskritguru.com/logo.png");
    assert.match(meta(html, "property", "og:title"), /^Digital Sanskrit Guru/);
    assert.equal(meta(html, "property", "og:url"), "https://digitalsanskritguru.com/");
    assert.equal(count(html, /property="og:title"/g), 1);
  });

  it("makes relative product images absolute on this server; falls back to images[0], then the logo", () => {
    assert.equal(absoluteAsset("/uploads/a.jpg", "http://3.111.27.167"), "http://3.111.27.167/uploads/a.jpg");
    assert.equal(absoluteAsset("//cdn.x/a.jpg", "http://h"), "https://cdn.x/a.jpg");
    assert.equal(productShareInfo({ name: "X", images: ["https://c/i.jpg"] }).image, "https://c/i.jpg");
    const { html } = injectSeoTags(SHELL, { pathname: "/product/x", hostname: "h", siteUrl: SITE, canonicalPath: "/product/x", share: productShareInfo({ name: "X" }), assetOrigin: "http://3.111.27.167" });
    assert.equal(meta(html, "property", "og:image"), "http://3.111.27.167/logo.png");
  });

  it("summary falls back to the About points, then to a sentence with the name, and is kept short", () => {
    assert.equal(productShareInfo({ name: "Gita", aboutProduct: ["<b>Audio</b> device", "18 chapters"] }).description, "Audio device 18 chapters");
    assert.equal(productShareInfo({ name: "Gita" }).description, "Gita from Digital Sanskrit Guru.");
    const long = productShareInfo({ name: "L", description: "word ".repeat(100) }).description;
    assert.ok(long.length <= 200 && long.endsWith("…"));
    assert.equal(plainText("<script>x()</script>Hi&#39;s"), "Hi's");
  });

  it("product link lookup returns the preview details", async () => {
    const Product = fakeProductModel([product]);
    const r = resolveProductLink(await findProductForLink(Product, "dhaturupaparicayah"), "dhaturupaparicayah");
    assert.equal(r.share.title, product.name);
    assert.equal(r.share.image, product.image);
  });
});
