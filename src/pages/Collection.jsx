import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import axios from "axios";
import { SlidersHorizontal, ArrowUpDown, X } from "lucide-react";
import ProductCard from "../components/ProductCard";
import "./Collection.css";

const PRODUCTS_PER_PAGE = 8;

function Collection() {
  const location = useLocation();
  const [products, setProducts] = useState([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isLoadingMoreProducts, setIsLoadingMoreProducts] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [sortOption, setSortOption] = useState("featured");
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [availableProducts, setAvailableProducts] = useState(0);
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const [categories, setCategories] = useState(["All"]);
  const [categoryCounts, setCategoryCounts] = useState({ All: 0 });

  useEffect(() => {
    let isMounted = true;

    const fetchProducts = async () => {
      setIsLoadingProducts(true);
      setCurrentPage(1);

      try {
        const { data } = await axios.get("/api/products", {
          params: {
            page: 1,
            limit: PRODUCTS_PER_PAGE,
            sort: sortOption,
            category: selectedCategory
          }
        });

        if (!isMounted) return;

        setProducts(Array.isArray(data?.items) ? data.items : []);
        setTotalProducts(Number(data?.total || 0));
        setAvailableProducts(Number(data?.totalBase || 0));
        setHasMoreProducts(Boolean(data?.hasMore));
        setCategories(Array.isArray(data?.categories) && data.categories.length > 0 ? data.categories : ["All"]);
        setCategoryCounts(
          data?.categoryCounts && typeof data.categoryCounts === "object" ? data.categoryCounts : { All: 0 }
        );
      } catch {
        if (!isMounted) return;
        setProducts([]);
        setTotalProducts(0);
        setAvailableProducts(0);
        setHasMoreProducts(false);
        setCategories(["All"]);
        setCategoryCounts({ All: 0 });
      } finally {
        if (isMounted) {
          setIsLoadingProducts(false);
        }
      }
    };

    fetchProducts();

    return () => {
      isMounted = false;
    };
  }, [selectedCategory, sortOption]);

  useEffect(() => {
    if (!isMobileFilterOpen) return undefined;

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsMobileFilterOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isMobileFilterOpen]);

  useEffect(() => {
    if (selectedCategory !== "All" && !categories.includes(selectedCategory)) {
      setSelectedCategory("All");
    }
  }, [categories, selectedCategory]);

  useEffect(() => {
    const categoryFromQuery = String(new URLSearchParams(location.search).get("category") || "All").trim() || "All";
    setSelectedCategory(categoryFromQuery);
  }, [location.search]);

  const collectionStats = useMemo(
    () => ({
      total: availableProducts,
      visible: totalProducts
    }),
    [availableProducts, totalProducts]
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedCategory !== "All") count += 1;
    return count;
  }, [selectedCategory]);

  const resetFilters = () => {
    setSelectedCategory("All");
    setSortOption("featured");
  };

  const handleResetFilters = () => {
    resetFilters();
    setIsMobileFilterOpen(false);
  };

  const handleLoadMoreProducts = async () => {
    if (isLoadingMoreProducts || !hasMoreProducts) return;

    const nextPage = currentPage + 1;
    setIsLoadingMoreProducts(true);

    try {
      const { data } = await axios.get("/api/products", {
        params: {
          page: nextPage,
          limit: PRODUCTS_PER_PAGE,
          sort: sortOption,
          category: selectedCategory
        }
      });

      setProducts((current) => [...current, ...(Array.isArray(data?.items) ? data.items : [])]);
      setCurrentPage(Number(data?.page || nextPage));
      setTotalProducts(Number(data?.total || 0));
      setAvailableProducts(Number(data?.totalBase || 0));
      setHasMoreProducts(Boolean(data?.hasMore));
    } catch {
      setHasMoreProducts(false);
    } finally {
      setIsLoadingMoreProducts(false);
    }
  };

  return (
    <div className="collection-page">
      <section className="collection-shell">
        <div className="collection-head">
          <div>
            <span className="collection-kicker">Catalog</span>
            <h1>Browse the full collection</h1>
            <p>Narrow down categories and shop faster with a cleaner filter flow.</p>
          </div>
          <Link to="/" className="collection-back-link">
            Back to Home
          </Link>
        </div>

        <div className="collection-content">
          {isMobileFilterOpen ? (
            <button
              type="button"
              className="collection-filter-backdrop"
              aria-label="Close filters"
              onClick={() => setIsMobileFilterOpen(false)}
            />
          ) : null}

          <aside className={`collection-sidebar${isMobileFilterOpen ? " open" : ""}`}>
            <div className="collection-sidebar-card">
              <div className="collection-mobile-filter-head">
                <h3>Filters</h3>
                <button type="button" onClick={() => setIsMobileFilterOpen(false)} aria-label="Close filters">
                  <X size={18} className="lucide-icon" />
                </button>
              </div>

              <h3>Category</h3>
              <div className="collection-device-row">
                {categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className={selectedCategory === category ? "active" : ""}
                    onClick={() => setSelectedCategory(category)}
                  >
                    {category} ({categoryCounts[category] || 0})
                  </button>
                ))}
              </div>

              <button type="button" className="collection-mobile-reset-btn" onClick={handleResetFilters}>
                Reset filters
              </button>

              <button
                type="button"
                className="collection-mobile-apply-btn"
                onClick={() => setIsMobileFilterOpen(false)}
              >
                View {collectionStats.visible} items
              </button>
            </div>
          </aside>

          <div className="collection-main">
            <div className="collection-mobile-toolbar">
              <button
                type="button"
                className="collection-mobile-filter-btn"
                onClick={() => setIsMobileFilterOpen(true)}
                aria-label="Filters"
              >
                <SlidersHorizontal size={18} className="lucide-icon" />
                {activeFilterCount > 0 ? (
                  <span className="filter-badge">{activeFilterCount}</span>
                ) : null}
              </button>

              <div className="collection-sort-box collection-sort-box-mobile">
                <label htmlFor="collection-sort-mobile" aria-label="Sort by" style={{ display: "inline-flex" }}>
                  <ArrowUpDown size={16} className="lucide-icon" style={{ color: "var(--site-text-soft)" }} />
                </label>
                <select
                  id="collection-sort-mobile"
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value)}
                >
                  <option value="featured">Featured</option>
                  <option value="latest">Latest</option>
                  <option value="rating">Highest Rated</option>
                  <option value="priceLow">Price: Low to High</option>
                  <option value="priceHigh">Price: High to Low</option>
                  <option value="name">Name: A to Z</option>
                </select>
              </div>
            </div>

            <div className="collection-main-head">
              <div>
                <div className="collection-results-meta">
                  Showing {products.length} of {collectionStats.visible}
                  {selectedCategory !== "All" ? ` in ${selectedCategory}` : ""}
                </div>

                {selectedCategory !== "All" ? (
                  <div className="collection-active-filters">
                    <button
                      type="button"
                      className="collection-filter-chip"
                      onClick={() => setSelectedCategory("All")}
                    >
                      {selectedCategory} {"\u00D7"}
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="collection-head-actions">
                <button type="button" className="collection-clear-btn" onClick={resetFilters}>
                  Clear all
                </button>

                <div className="collection-sort-box">
                  <label htmlFor="collection-sort" aria-label="Sort by" style={{ display: "inline-flex" }}>
                    <ArrowUpDown size={16} className="lucide-icon" style={{ color: "var(--site-text-soft)" }} />
                  </label>
                  <select id="collection-sort" value={sortOption} onChange={(e) => setSortOption(e.target.value)}>
                    <option value="featured">Featured</option>
                    <option value="latest">Latest</option>
                    <option value="rating">Highest Rated</option>
                    <option value="priceLow">Price: Low to High</option>
                    <option value="priceHigh">Price: High to Low</option>
                    <option value="name">Name: A to Z</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="collection-grid">
              {isLoadingProducts ? (
                Array.from({ length: PRODUCTS_PER_PAGE }).map((_, index) => (
                  <div key={`collection-skeleton-${index}`} className="collection-skeleton-card">
                    <span className="collection-skeleton collection-skeleton-image" />
                    <span className="collection-skeleton collection-skeleton-line short" />
                    <span className="collection-skeleton collection-skeleton-line" />
                    <span className="collection-skeleton collection-skeleton-line medium" />
                  </div>
                ))
              ) : products.length > 0 ? (
                products.map((product) => (
                  <ProductCard key={product._id} product={product} showDescription={false} variant="home" />
                ))
              ) : (
                <div className="collection-empty-state">
                  <strong>No products found</strong>
                  <p>Try changing your filters or clearing them to see more products.</p>
                </div>
              )}
            </div>

            {!isLoadingProducts && hasMoreProducts ? (
              <div className="collection-load-more-wrap">
                <button
                  type="button"
                  className="collection-load-more-btn"
                  onClick={handleLoadMoreProducts}
                  disabled={isLoadingMoreProducts}
                >
                  {isLoadingMoreProducts ? "Loading..." : "Load More Products"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

export default Collection;
