const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { productListQuery } = require("../utils/productListQuery");
const { appCache, setBounded } = require("../utils/cache");

describe("product list query and cache key", () => {
  it("ignores parameters the route doesn't use", () => {
    const a = productListQuery({ page: "2", limit: "12", sort: "latest", category: "Books" });
    const b = productListQuery({ page: "2", limit: "12", sort: "latest", category: "Books", x: "1", utm_source: "ads" });
    assert.equal(a.cacheKey, b.cacheKey);
  });

  it("cleans values the same way the route always has", () => {
    const q = productListQuery({ page: "-3", limit: "500", sort: "bogus" });
    assert.equal(q.page, 1);
    assert.equal(q.limit, 48);
    assert.equal(q.sortOption, "featured");
    assert.equal(q.selectedCategory, "All");
    assert.equal(productListQuery({ limit: "abc" }).limit, 8);
  });

  it("only uses the country in the key for price sorts", () => {
    assert.equal(
      productListQuery({ page: "1", sort: "latest", country: "US" }).cacheKey,
      productListQuery({ page: "1", sort: "latest", country: "IN" }).cacheKey
    );
    assert.notEqual(
      productListQuery({ page: "1", sort: "priceLow", country: "US" }).cacheKey,
      productListQuery({ page: "1", sort: "priceLow", country: "IN" }).cacheKey
    );
    assert.equal(productListQuery({ sort: "priceLow", country: "IN" }).country, "IN");
  });

  it("doesn't cache far pages or very long values", () => {
    assert.equal(productListQuery({ page: "51" }).cacheKey, null);
    assert.equal(productListQuery({ page: "1", category: "x".repeat(101) }).cacheKey, null);
    assert.equal(productListQuery({ page: "51" }).page, 51, "the page itself still works");
  });

  it("ignores array or object values instead of stringifying them", () => {
    const q = productListQuery({ page: "1", sort: ["priceLow", "x"], category: { $ne: 1 }, country: ["IN"] });
    assert.equal(q.sortOption, "featured");
    assert.equal(q.selectedCategory, "All");
    assert.equal(q.country, undefined);
  });

  it("setBounded stops adding keys past the ceiling", () => {
    const prefix = "test:bounded:";
    for (let i = 0; i < 5; i += 1) setBounded(`${prefix}${i}`, i, 60, { prefix, maxKeys: 3 });
    assert.equal(appCache.keys().filter((k) => k.startsWith(prefix)).length, 3);
    assert.equal(setBounded(`${prefix}0`, "again", 60, { prefix, maxKeys: 3 }), true, "existing keys can be refreshed");
    appCache.del(appCache.keys().filter((k) => k.startsWith(prefix)));
  });
});
