import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import axios from "axios";
import { SlidersHorizontal, ArrowUpDown, X } from "lucide-react";
import ProductCard from "../components/ProductCard";
import "./Collection.css";
import { useDocumentMetadata } from "../hooks/useDocumentMetadata";
import LoadingSpinner from "../components/common/LoadingSpinner";
import { resolveCategoryAlias } from "../utils/categoryKey";

const PRODUCTS_PER_PAGE = 8;
const MAX_PAGE_SIZE = 48; // the products API caps "limit" at 48
const SORT_OPTIONS = ["featured", "latest", "rating", "priceLow", "priceHigh", "name"];
const VIEW_STORAGE_PREFIX = "collection-view:";

// The address bar holds the filters (?category=…&sort=…), so Back, refresh and
// shared links all keep them.
function readFiltersFromSearch(search) {
  const params = new URLSearchParams(search);
  const category = String(params.get("category") || "All").trim() || "All";
  const sort = String(params.get("sort") || "").trim();
  return { category, sort: SORT_OPTIONS.includes(sort) ? sort : "featured" };
}

function buildCollectionUrl(category, sort) {
  const params = new URLSearchParams();
  if (category && category !== "All") params.set("category", category);
  if (sort && sort !== "featured") params.set("sort", sort);
  const query = params.toString();
  return query ? `/collection?${query}` : "/collection";
}

// How many pages were loaded and where the shopper had scrolled, so returning
// from a product page shows the same list at the same place.
function readSavedView(search) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(VIEW_STORAGE_PREFIX + search) || "null");
    const pages = Math.max(1, Math.floor(Number(saved?.pages) || 1));
    return { search, pages, scrollY: Math.max(0, Number(saved?.scrollY) || 0) };
  } catch {
    return null;
  }
}

function saveView(search, view) {
  try {
    sessionStorage.setItem(VIEW_STORAGE_PREFIX + search, JSON.stringify(view));
  } catch {
    // Storage unavailable: the list simply starts from the first page next time
  }
}

async function fetchCollectionProducts({ category, sort, pages }) {
  const needed = pages * PRODUCTS_PER_PAGE;
  const pageSize = needed <= MAX_PAGE_SIZE ? needed : MAX_PAGE_SIZE;
  const items = [];
  let data = null;
  let page = 1;
  do {
    ({ data } = await axios.get("/api/products", {
      params: { page, limit: pageSize, sort, category }
    }));
    items.push(...(Array.isArray(data?.items) ? data.items : []));
    page += 1;
  } while (data?.hasMore && items.length < needed);

  const total = Number(data?.total || 0);
  const shown = items.slice(0, needed);
  return { data, items: shown, total, hasMore: shown.length < total };
}

function Collection() {
  useDocumentMetadata("Collection", "Browse our complete catalog of premium Sanskrit literature, grammar tutorials, scriptures, and ritual kit items.");

  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const { category: selectedCategory, sort: sortOption } = readFiltersFromSearch(location.search);
  const [products, setProducts] = useState([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isLoadingMoreProducts, setIsLoadingMoreProducts] = useState(false);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [availableProducts, setAvailableProducts] = useState(0);
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const [categories, setCategories] = useState(["All"]);
  const [categoryCounts, setCategoryCounts] = useState({ All: 0 });

  // Only a Back/Forward (or refresh) visit restores the previous list and scroll position
  const restoreViewRef = useRef(navigationType === "POP" ? readSavedView(location.search) : null);
  const currentPageRef = useRef(1);
  const pendingScrollRef = useRef(null);
  const pageRootRef = useRef(null);
  const lastScrollYRef = useRef(0);
  const searchRef = useRef(location.search);
  currentPageRef.current = currentPage;
  searchRef.current = location.search;

  useEffect(() => {
    // Track the scroll position only while this page is on screen: when a product
    // link is clicked the page is hidden while the product page loads, and the
    // browser then clamps the scroll position, which must not be saved.
    const handleScroll = () => {
      if (pageRootRef.current?.offsetParent) {
        lastScrollYRef.current = window.scrollY;
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      saveView(searchRef.current, { pages: currentPageRef.current, scrollY: lastScrollYRef.current });
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    // Kept (not cleared) here so React's development double-run still restores;
    // any filter change by the shopper clears it instead
    const restoreView =
      restoreViewRef.current?.search === searchRef.current ? restoreViewRef.current : null;
    const pages = restoreView?.pages || 1;

    const fetchProducts = async () => {
      setIsLoadingProducts(true);
      setCurrentPage(1);

      try {
        const { data, items, total, hasMore } = await fetchCollectionProducts({
          category: selectedCategory,
          sort: sortOption,
          pages
        });

        if (!isMounted) return;

        setProducts(items);
        setCurrentPage(pages);
        setTotalProducts(total);
        setAvailableProducts(Number(data?.totalBase || 0));
        setHasMoreProducts(hasMore);
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
          if (restoreView?.scrollY) {
            pendingScrollRef.current = restoreView.scrollY;
          }
        }
      }
    };

    fetchProducts();

    return () => {
      isMounted = false;
    };
  }, [selectedCategory, sortOption]);

  // Scroll back to where the shopper was, once the restored products are on screen
  useEffect(() => {
    if (isLoadingProducts || pendingScrollRef.current === null) return undefined;
    const top = pendingScrollRef.current;
    pendingScrollRef.current = null;
    const frame = requestAnimationFrame(() => window.scrollTo({ top, behavior: "instant" }));
    return () => cancelAnimationFrame(frame);
  }, [isLoadingProducts, products]);

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

  // Old or differently spelled links (?category=Bundle, ?category=Book - Paperback)
  // are switched to the category the shop now lists, so its button is highlighted
  useEffect(() => {
    if (isLoadingProducts) return;
    const resolved = resolveCategoryAlias(selectedCategory, categories);
    if (resolved !== selectedCategory) {
      navigate(buildCollectionUrl(resolved, sortOption), { replace: true });
    }
  }, [categories, isLoadingProducts, navigate, selectedCategory, sortOption]);

  const handleCategorySelect = (category) => {
    restoreViewRef.current = null;
    navigate(buildCollectionUrl(category, sortOption), { replace: true });
  };

  const handleSortChange = (sort) => {
    restoreViewRef.current = null;
    navigate(buildCollectionUrl(selectedCategory, sort), { replace: true });
  };

  const resetFilters = () => {
    restoreViewRef.current = null;
    navigate(buildCollectionUrl("All", "featured"), { replace: true });
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
    <div className="collection-page" ref={pageRootRef}>
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
                    onClick={() => handleCategorySelect(category)}
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
                  onChange={(e) => handleSortChange(e.target.value)}
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
                      onClick={() => handleCategorySelect("All")}
                      aria-label={`Remove ${selectedCategory} filter`}
                    >
                      {selectedCategory}
                      <X size={14} className="ui-inline-icon-end" aria-hidden="true" />
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
                  <select id="collection-sort" value={sortOption} onChange={(e) => handleSortChange(e.target.value)}>
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
                <LoadingSpinner text="Loading catalog items..." minHeight="240px" />
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
