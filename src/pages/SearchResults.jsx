import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import ProductCard from "../components/ProductCard";
import "./Home.css";
import "./SearchResults.css";
import { useDocumentMetadata } from "../hooks/useDocumentMetadata";
import LoadingSpinner from "../components/common/LoadingSpinner";

function stripHtml(text) {
  return String(text || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");
}

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

function SearchResults() {
  const [products, setProducts] = useState([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [sortOption, setSortOption] = useState("default");
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const query = (params.get("q") || params.get("search") || "").trim();
  const normalizedQuery = query.toLowerCase();

  useDocumentMetadata(
    query ? `Search: "${query}"` : "Search Catalog",
    `Search results for "${query}" on Digital Sanskrit Guru. Discover books, scriptures, grammar tutorials, and study aids.`
  );

  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    setSelectedCategory("All");
  }

  useEffect(() => {
    setIsLoadingProducts(true);
    axios
      .get("/api/products")
      .then((res) => setProducts(Array.isArray(res.data) ? res.data : []))
      .catch(() => setProducts([]))
      .finally(() => setIsLoadingProducts(false));
  }, []);

  const searchMatchedProducts = useMemo(() => {
    return products.filter((product) => {
      const name = String(product?.name || "").toLowerCase();
      const description = stripHtml(product?.description).toLowerCase();

      return (
        !normalizedQuery ||
        name.includes(normalizedQuery) ||
        description.includes(normalizedQuery)
      );
    });
  }, [products, normalizedQuery]);

  const { categories, categoryCounts } = useMemo(() => {
    const counts = {};
    const matchedCategories = [];

    searchMatchedProducts.forEach((product) => {
      const category = getCategoryLabel(product);
      if (!counts[category]) {
        counts[category] = 0;
        matchedCategories.push(category);
      }
      counts[category] += 1;
    });

    return {
      categories: ["All", ...matchedCategories],
      categoryCounts: counts,
    };
  }, [searchMatchedProducts]);

  const filteredProducts = useMemo(() => {
    if (selectedCategory === "All") {
      return searchMatchedProducts;
    }

    return searchMatchedProducts.filter((product) => {
      const category = getCategoryLabel(product).toLowerCase();
      return category === String(selectedCategory || "").trim().toLowerCase();
    });
  }, [searchMatchedProducts, selectedCategory]);

  const sortedProducts = useMemo(() => {
    const nextProducts = [...filteredProducts];

    if (sortOption === "priceLow") {
      nextProducts.sort((a, b) => Number(a?.price || 0) - Number(b?.price || 0));
    } else if (sortOption === "priceHigh") {
      nextProducts.sort((a, b) => Number(b?.price || 0) - Number(a?.price || 0));
    } else if (sortOption === "rating") {
      nextProducts.sort((a, b) => getAverageRating(b) - getAverageRating(a));
    } else if (sortOption === "latest") {
      nextProducts.sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());
    }

    return nextProducts;
  }, [filteredProducts, sortOption]);

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

          <div className="search-results-actions">
            <Link className="search-results-home-link" to="/">
              Back to Home
            </Link>
            {query && (
              <button type="button" onClick={() => navigate("/")}>
                Clear Search
              </button>
            )}
          </div>
        </div>

        {query && (
          <div className="search-results-layout">
            <aside className="search-results-sidebar">
              <h3>Department</h3>
              <div className="search-results-category-list">
                {categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className={selectedCategory === category ? "active" : ""}
                    onClick={() => setSelectedCategory(category)}
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
                <span>
                  {sortedProducts.length} result{sortedProducts.length === 1 ? "" : "s"} of {products.length}
                  {selectedCategory !== "All" ? ` in ${selectedCategory}` : ""}
                </span>

                <div className="search-results-sort">
                    <label htmlFor="search-results-sort">Sort by</label>
                    <select id="search-results-sort" value={sortOption} onChange={(e) => setSortOption(e.target.value)}>
                      <option value="default">Default</option>
                      <option value="latest">Latest</option>
                      <option value="rating">Highest Rated</option>
                      <option value="priceLow">Price: Low to High</option>
                      <option value="priceHigh">Price: High to Low</option>
                    </select>
                </div>
              </div>

              <div className="search-results-grid">
              {isLoadingProducts ? (
                <div style={{ gridColumn: "1 / -1" }}>
                  <LoadingSpinner text={`Searching for "${query}"...`} minHeight="240px" />
                </div>
              ) : sortedProducts.length > 0 ? (
                sortedProducts.map((product) => <ProductCard key={product._id} product={product} variant="search" />)
              ) : (
                <div className="home-empty-state">
                  <strong>No results for "{query}"</strong>
                  <p>Try another keyword or return home to browse the full collection.</p>
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

