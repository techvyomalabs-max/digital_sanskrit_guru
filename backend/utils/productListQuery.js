"use strict";

/**
 * Cleans the query of the paged product list (GET /api/products?page=&limit=&sort=&category=&country=)
 * and builds its cache key from the cleaned values only.
 *
 * The key used to be JSON.stringify(req.query), so any extra or changing parameter
 * (?x=1, ?x=2, ...) made a new cache entry and memory could grow without limit.
 * Results are the same as before: an unknown sort was already treated as "featured".
 */

const LIST_SORTS = new Set(["featured", "priceLow", "priceHigh", "rating", "latest", "name"]);
const PRICE_SORTS = new Set(["priceLow", "priceHigh"]);
const MAX_CACHED_PAGE = 50;
const MAX_TEXT = 100;

function productListQuery(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.max(1, Math.min(48, Number.parseInt(query.limit, 10) || 8));
  const rawSort = typeof query.sort === "string" ? query.sort.trim() : "";
  const sortOption = LIST_SORTS.has(rawSort) ? rawSort : "featured";
  const selectedCategory = (typeof query.category === "string" ? query.category.trim() : "") || "All";
  const country = typeof query.country === "string" && query.country.trim() ? query.country.trim() : undefined;

  // The country only changes the order of a price sort, so other sorts share one entry
  const keyCountry = PRICE_SORTS.has(sortOption) ? String(country || "").toUpperCase() : "";
  const cacheable =
    page <= MAX_CACHED_PAGE && selectedCategory.length <= MAX_TEXT && keyCountry.length <= MAX_TEXT;

  const cacheKey = cacheable
    ? `products:list:${page}:${limit}:${sortOption}:${encodeURIComponent(selectedCategory)}:${encodeURIComponent(keyCountry)}`
    : null;

  return { page, limit, sortOption, selectedCategory, country, cacheKey };
}

module.exports = { productListQuery, LIST_SORTS };
