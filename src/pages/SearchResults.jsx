import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import ProductCard from "../components/ProductCard";
import "./Home.css";
import "./SearchResults.css";

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

  useEffect(() => {
    setIsLoadingProducts(true);
    axios
      .get("/api/products")
      .then((res) => setProducts(Array.isArray(res.data) ? res.data : []))
      .catch(() => setProducts([]))
      .finally(() => setIsLoadingProducts(false));
  }, []);

  const categories = useMemo(
    () => ["All", ...new Set(products.map((product) => getCategoryLabel(product)))],
    [products]
  );

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const name = String(product?.name || "").toLowerCase();
      const description = String(product?.description || "").toLowerCase();
      const category = getCategoryLabel(product).toLowerCase();

      const matchesSearch =
        !normalizedQuery || name.includes(normalizedQuery) || description.includes(normalizedQuery);
      const matchesCategory =
        selectedCategory === "All" || category === String(selectedCategory || "").trim().toLowerCase();

      return matchesSearch && matchesCategory;
    });
  }, [normalizedQuery, products, selectedCategory]);

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
                    {category}
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
                Array.from({ length: 8 }).map((_, index) => (
                  <div key={`search-results-skeleton-${index}`} className="home-skeleton-card">
                    <span className="home-skeleton home-skeleton-image" />
                    <span className="home-skeleton home-skeleton-line short" />
                    <span className="home-skeleton home-skeleton-line" />
                    <span className="home-skeleton home-skeleton-line medium" />
                  </div>
                ))
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

