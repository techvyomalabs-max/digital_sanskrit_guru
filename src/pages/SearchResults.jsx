import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import {
  Sparkles,
  Truck,
  BookOpen,
  HelpCircle,
  Mail,
  Package,
  User,
  Heart,
  ShoppingCart,
  Gift,
  Info,
  Shield,
  FileText,
  Grid
} from "lucide-react";
import ProductCard from "../components/ProductCard";
import "./Home.css";
import "./SearchResults.css";
import { useDocumentMetadata } from "../hooks/useDocumentMetadata";
import { scoreProduct, getSearchSuggestion, searchWebsite } from "../utils/searchText";

const VALID_SORT_OPTIONS = ["relevance", "latest", "rating", "priceLow", "priceHigh"];

function getCategoryLabel(product) {
  const raw = String(product?.category || "").trim();

  if (raw && raw.toLowerCase() !== "general") {
    return raw;
  }

  const name = String(product?.name || "").toLowerCase();
  if (name.includes("gita")) return "Gita";
  if (name.includes("grammar")) return "Grammar";
  if (name.includes("vedanta")) return "Vedanta";
  if (name.includes("chant")) return "Chanting";
  return "General";
}

function getAverageRating(product) {
  const reviews = Array.isArray(product?.reviews) ? product.reviews : [];
  if (reviews.length === 0) return Number(product?.rating || 0);
  return reviews.reduce((sum, review) => sum + Number(review?.rating || 0), 0) / reviews.length;
}

function getReviewCount(product) {
  const arrCount = Array.isArray(product?.reviews) ? product.reviews.length : 0;
  const numCount = Number(product?.reviewsCount || 0);
  return Math.max(arrCount, numCount);
}

function SearchResults() {
  const [products, setProducts] = useState([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const query = (searchParams.get("q") || searchParams.get("search") || "").trim();
  const noCorrect = searchParams.get("no_correct") === "1";
  const defaultSort = "relevance";

  const rawCategory = searchParams.get("cat");

  const rawSort = searchParams.get("sort");
  const sortOption = rawSort && VALID_SORT_OPTIONS.includes(rawSort) ? rawSort : defaultSort;

  useDocumentMetadata(
    query ? `Search: "${query}"` : "Search Catalog",
    `Search results for "${query}" on Digital Sanskrit Guru. Discover books, scriptures, grammar tutorials, and study aids.`
  );

  useEffect(() => {
    axios
      .get("/api/products")
      .then((res) => setProducts(Array.isArray(res.data) ? res.data : []))
      .catch(() => setProducts([]))
      .finally(() => setIsLoadingProducts(false));
  }, []);

  const handleCategorySelect = (category) => {
    const nextParams = new URLSearchParams(searchParams);
    if (category && category !== "All") {
      nextParams.set("cat", category);
    } else {
      nextParams.delete("cat");
    }
    setSearchParams(nextParams, { replace: true });
  };

  const handleSortChange = (newSort) => {
    const nextParams = new URLSearchParams(searchParams);
    if (newSort && newSort !== defaultSort && VALID_SORT_OPTIONS.includes(newSort)) {
      nextParams.set("sort", newSort);
    } else {
      nextParams.delete("sort");
    }
    setSearchParams(nextParams, { replace: true });
  };

  const websiteSearch = useMemo(() => {
    if (!query || isLoadingProducts || products.length === 0) {
      return {
        query,
        effectiveQuery: query,
        isAutoCorrected: false,
        autoCorrection: null,
        matchingCategories: [],
        matchingPages: [],
        matchingProducts: [],
        totalProductsCount: 0,
        totalResultsCount: 0
      };
    }

    return searchWebsite(query, {
      catalogProducts: products,
      enableAutoCorrection: !noCorrect
    });
  }, [query, products, isLoadingProducts, noCorrect]);

  const searchMatchedProducts = websiteSearch.matchingProducts;
  const isAutoCorrected = websiteSearch.isAutoCorrected;
  const effectiveQuery = websiteSearch.effectiveQuery;
  const matchingCategories = websiteSearch.matchingCategories;
  const matchingPages = websiteSearch.matchingPages;

  const { categories, categoryCounts, matchedCategories } = useMemo(() => {
    const counts = {};
    const matched = [];

    searchMatchedProducts.forEach((product) => {
      const category = getCategoryLabel(product);
      if (!counts[category]) {
        counts[category] = 0;
        matched.push(category);
      }
      counts[category] += 1;
    });

    return {
      categories: ["All", ...matched],
      categoryCounts: counts,
      matchedCategories: matched,
    };
  }, [searchMatchedProducts]);

  const activeCategory = useMemo(() => {
    if (!rawCategory || !rawCategory.trim()) return "All";
    const trimmed = rawCategory.trim();
    if (trimmed.toLowerCase() === "all") return "All";

    const matched = matchedCategories.find(
      (cat) => cat.toLowerCase() === trimmed.toLowerCase()
    );
    return matched || null;
  }, [rawCategory, matchedCategories]);

  const filteredProducts = useMemo(() => {
    if (!activeCategory || activeCategory === "All") {
      return searchMatchedProducts;
    }

    return searchMatchedProducts.filter((product) => {
      const category = getCategoryLabel(product).toLowerCase();
      return category === activeCategory.toLowerCase();
    });
  }, [searchMatchedProducts, activeCategory]);

  const sortedProducts = useMemo(() => {
    const nextProducts = [...filteredProducts];

    if (sortOption === "relevance") {
      nextProducts.sort((a, b) => {
        const scoreDiff = Number(b?._score || 0) - Number(a?._score || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return getAverageRating(b) - getAverageRating(a);
      });
    } else if (sortOption === "priceLow") {
      nextProducts.sort((a, b) => Number(a?.price || 0) - Number(b?.price || 0));
    } else if (sortOption === "priceHigh") {
      nextProducts.sort((a, b) => Number(b?.price || 0) - Number(a?.price || 0));
    } else if (sortOption === "rating") {
      nextProducts.sort((a, b) => getAverageRating(b) - getAverageRating(a));
    } else if (sortOption === "latest") {
      nextProducts.sort(
        (a, b) =>
          new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime()
      );
    }

    return nextProducts;
  }, [filteredProducts, sortOption]);

  const popularProducts = useMemo(() => {
    if (!Array.isArray(products) || products.length === 0) return [];
    return [...products]
      .sort((a, b) => {
        const countDiff = getReviewCount(b) - getReviewCount(a);
        if (countDiff !== 0) return countDiff;
        return (
          new Date(b?.createdAt || 0).getTime() -
          new Date(a?.createdAt || 0).getTime()
        );
      })
      .slice(0, 4);
  }, [products]);

  return (
    <div className="home-page search-results-page">
      <section className="search-results-shell">
        <div className="search-results-header">
          <div>
            <span className="search-results-kicker">Search results</span>
            <h1>{query ? `Results for "${query}"` : "Search the catalog"}</h1>
            <p>
              {query
                ? `${sortedProducts.length} product${sortedProducts.length === 1 ? "" : "s"} matched your search.`
                : "Use the search box in the navbar to find products by name or description."}
            </p>
          </div>

          <div className={`search-results-actions${query ? " has-query" : ""}`}>
            <Link className="search-results-home-link" to="/">
              Back to Home
            </Link>
            {query && (
              <button type="button" onClick={() => navigate("/")}>
                Clear search
              </button>
            )}
          </div>
        </div>

        {isAutoCorrected && (
          <div className="search-results-autocorrect-banner" role="alert">
            <div className="search-results-autocorrect-content">
              <span className="search-results-autocorrect-badge">
                <Sparkles size={14} /> AI Auto-Corrected
              </span>
              <span className="search-results-autocorrect-title">
                Showing results for <strong>&ldquo;{effectiveQuery}&rdquo;</strong>
              </span>
            </div>
            <div className="search-results-autocorrect-actions">
              <span>Searched for &ldquo;{query}&rdquo; &bull; </span>
              <button
                type="button"
                className="search-results-autocorrect-link"
                onClick={() => {
                  const nextParams = new URLSearchParams(searchParams);
                  nextParams.set("q", query);
                  nextParams.set("no_correct", "1");
                  setSearchParams(nextParams);
                }}
              >
                Search for original &ldquo;{query}&rdquo; instead
              </button>
            </div>
          </div>
        )}

        {/* Matching Categories & Formats */}
        {matchingCategories.length > 0 && (
          <div className="search-results-categories-section">
            <span className="search-results-categories-title">
              <Grid size={14} /> Matching Categories:
            </span>
            <div className="search-results-category-chips">
              {matchingCategories.map((cat) => (
                <Link key={cat.name} to={cat.url} className="search-results-category-chip">
                  <span className="search-results-chip-icon">{cat.icon}</span>
                  <span className="search-results-chip-name">{cat.name}</span>
                  {cat.count > 0 && <span className="search-results-chip-count">({cat.count})</span>}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Matching Website Content & Pages */}
        {matchingPages.length > 0 && (
          <div className="search-results-pages-section">
            <div className="search-results-pages-header">
              <BookOpen size={14} />
              <span>Related Website Pages & Help ({matchingPages.length})</span>
            </div>
            <div className="search-results-pages-grid">
              {matchingPages.map((page) => (
                <Link key={page.id} to={page.url} className="search-results-page-card">
                  <div className="search-results-page-card-icon">
                    {page.icon === "Truck" && <Truck size={18} />}
                    {page.icon === "BookOpen" && <BookOpen size={18} />}
                    {page.icon === "HelpCircle" && <HelpCircle size={18} />}
                    {page.icon === "Mail" && <Mail size={18} />}
                    {page.icon === "Package" && <Package size={18} />}
                    {page.icon === "User" && <User size={18} />}
                    {page.icon === "Heart" && <Heart size={18} />}
                    {page.icon === "ShoppingCart" && <ShoppingCart size={18} />}
                    {page.icon === "Gift" && <Gift size={18} />}
                    {page.icon === "Info" && <Info size={18} />}
                    {page.icon === "Shield" && <Shield size={18} />}
                    {page.icon === "FileText" && <FileText size={18} />}
                  </div>
                  <div className="search-results-page-card-content">
                    <div className="search-results-page-card-title-row">
                      <h4>{page.title}</h4>
                      {page.badge && <span className="search-results-page-card-badge">{page.badge}</span>}
                    </div>
                    <p>{page.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {query && (
          <div className="search-results-layout">
            <aside className="search-results-sidebar">
              <h3>Department</h3>
              <div className="search-results-category-list">
                {categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    aria-pressed={activeCategory === category}
                    className={activeCategory === category ? "active" : ""}
                    onClick={() => handleCategorySelect(category)}
                  >
                    {category === "All"
                      ? "All"
                      : `${category} (${categoryCounts[category] || 0})`}
                  </button>
                ))}
              </div>
            </aside>

            <div className="search-results-main">
              <div className="search-results-toolbar">
                <span role="status" aria-live="polite">
                  {sortedProducts.length} result{sortedProducts.length === 1 ? "" : "s"} of {products.length}
                  {activeCategory && activeCategory !== "All" ? ` in ${activeCategory}` : ""}
                </span>

                <div className="search-results-sort">
                  <label htmlFor="search-results-sort">Sort by</label>
                  <select
                    id="search-results-sort"
                    value={sortOption}
                    onChange={(e) => handleSortChange(e.target.value)}
                  >
                    <option value="relevance">Best match</option>
                    <option value="latest">Latest</option>
                    <option value="rating">Highest Rated</option>
                    <option value="priceLow">Price: Low to High</option>
                    <option value="priceHigh">Price: High to Low</option>
                  </select>
                </div>
              </div>

              <div
                className="search-results-grid"
                {...(isLoadingProducts
                  ? {
                      role: "status",
                      "aria-busy": "true",
                      "aria-label": query ? `Searching for "${query}"...` : "Searching the catalog..."
                    }
                  : {})}
              >
                {isLoadingProducts ? (
                  Array.from({ length: 8 }).map((_, index) => (
                    <div
                      key={`search-skeleton-${index}`}
                      className="home-skeleton-card search-skeleton-card"
                      aria-hidden="true"
                    >
                      <span className="home-skeleton home-skeleton-image" />
                      <span className="home-skeleton home-skeleton-line short" />
                      <span className="home-skeleton home-skeleton-line" />
                      <span className="home-skeleton home-skeleton-line medium" />
                    </div>
                  ))
                ) : sortedProducts.length > 0 ? (
                  sortedProducts.map((product) => (
                    <ProductCard key={product._id} product={product} variant="search" />
                  ))
                ) : (
                  <div className="search-empty-state-wrap">
                    <div className="home-empty-state">
                      <strong>No results for "{query}"</strong>
                      <p className="search-empty-tips">
                        Check the spelling or try fewer words. You can search without accents, for example 'gita' finds 'Gītā'.
                      </p>
                    </div>

                    {popularProducts.length > 0 && (
                      <div className="search-popular-section">
                        <h2 className="search-popular-title">You may also like</h2>
                        <div className="search-popular-grid">
                          {popularProducts.map((product) => (
                            <ProductCard key={product._id} product={product} variant="search" />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default SearchResults;
