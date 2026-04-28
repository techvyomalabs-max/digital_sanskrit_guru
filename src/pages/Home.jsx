import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import ProductCard from "../components/ProductCard";
import RecentlyViewed from "../components/RecentlyViewed";
import "./Home.css";

const PRODUCT_CATEGORY_FILTERS = [
  "General",
  "Dharma",
  "Grammar",
  "Scriptures",
  "Gita",
  "Chanting",
  "Sanskrit",
  "Books"
];

const CATEGORY_SELECTOR_OPTIONS = ["All", ...PRODUCT_CATEGORY_FILTERS];
const CATALOG_PREVIEW_LIMIT = 12;

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

function formatPrice(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function Home() {
  const [products, setProducts] = useState([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [productCategoryFilters, setProductCategoryFilters] = useState(PRODUCT_CATEGORY_FILTERS);
  const [sortOption, setSortOption] = useState("default");
  const spotlightRef = useRef(null);
  const catalogRef = useRef(null);
  const topRatedSectionRef = useRef(null);
  const newArrivalsSectionRef = useRef(null);
  const budgetPicksSectionRef = useRef(null);

  useEffect(() => {
    axios
      .get("/api/settings")
      .then((res) => {
        const nextCategories = Array.isArray(res.data?.productCategories) && res.data.productCategories.length > 0
          ? res.data.productCategories
          : PRODUCT_CATEGORY_FILTERS;
        setProductCategoryFilters(nextCategories.filter((category) => String(category || "").trim()));
      })
      .catch(() => setProductCategoryFilters(PRODUCT_CATEGORY_FILTERS));

    setIsLoadingProducts(true);
    axios
      .get("/api/products")
      .then((res) => setProducts(Array.isArray(res.data) ? res.data : []))
      .catch(() => setProducts([]))
      .finally(() => setIsLoadingProducts(false));
  }, []);

  const categories = CATEGORY_SELECTOR_OPTIONS;

  const productCategoryOptions = useMemo(() => ["All", ...productCategoryFilters], [productCategoryFilters]);

  const productCategoryCounts = useMemo(() => {
    const counts = { All: products.length };

    productCategoryFilters.forEach((category) => {
      counts[category] = products.filter(
        (product) => String(product?.category || "").trim().toLowerCase() === category.toLowerCase()
      ).length;
    });

    return counts;
  }, [productCategoryFilters, products]);

  const stats = useMemo(() => {
    const inStockCount = products.filter((product) => Number(product?.stock || 0) > 0).length;
    const reviewCount = products.reduce(
      (sum, product) => sum + (Array.isArray(product?.reviews) ? product.reviews.length : 0),
      0
    );

    return {
      totalProducts: products.length,
      inStockCount,
      categoryCount: Math.max(0, categories.length - 1),
      reviewCount
    };
  }, [categories.length, products]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const category = getCategoryLabel(product).toLowerCase();

      const matchesCategory =
        selectedCategory === "All" || category === String(selectedCategory || "").trim().toLowerCase();

      return matchesCategory;
    });
  }, [products, selectedCategory]);

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

  const topRatedProducts = useMemo(() => {
    return [...products]
      .sort((a, b) => getAverageRating(b) - getAverageRating(a))
      .slice(0, 5);
  }, [products]);

  const newArrivals = useMemo(() => {
    return [...products]
      .sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime())
      .slice(0, 4);
  }, [products]);

  const budgetPicks = useMemo(() => {
    return [...products]
      .sort((a, b) => Number(a?.price || 0) - Number(b?.price || 0))
      .slice(0, 4);
  }, [products]);

  const featuredProduct = topRatedProducts[0] || newArrivals[0] || null;
  const catalogProducts = sortedProducts;
  const catalogPreviewProducts = useMemo(
    () => catalogProducts.slice(0, CATALOG_PREVIEW_LIMIT),
    [catalogProducts]
  );

  const handleCategoryPick = (category) => {
    setSelectedCategory(category);
    catalogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollSpotlight = (direction) => {
    spotlightRef.current?.scrollBy({ left: direction * 320, behavior: "smooth" });
  };

  const scrollToCatalog = () => {
    catalogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToSection = (sectionRef) => {
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="home-hero-copy">
          <span className="home-kicker">Digital Sanskrit Guru</span>
          <h1>Traditional knowledge, designed for modern browsing.</h1>
          <p>
            Discover Sanskrit books, study aids, chanting resources, and Vedanta material in a storefront that is
            easier to scan, compare, and continue from where you left off.
          </p>
          <div className="home-hero-signals">
            <span>{stats.totalProducts} curated products</span>
            <span>{stats.categoryCount} browseable paths</span>
            <span>{stats.inStockCount} ready to order</span>
          </div>
          <div className="home-hero-actions">
            <button type="button" className="home-primary-btn" onClick={scrollToCatalog}>
              Start Browsing
            </button>
            <Link className="home-secondary-btn" to={featuredProduct ? `/product/${featuredProduct._id}` : "/"}>
              View Featured Pick
            </Link>
          </div>
        </div>

        <div className="home-hero-grid">
          <article className="hero-panel hero-panel-featured">
            <span className="hero-panel-label">Featured Today</span>
            <strong>{featuredProduct?.name || "Curated Product"}</strong>
            <p>
              {featuredProduct?.description ||
                "Handpicked learning material with strong reviews and solid availability."}
            </p>
            {featuredProduct && (
              <div className="hero-panel-featured-meta">
                <span>{getCategoryLabel(featuredProduct)}</span>
                <span>{formatPrice(featuredProduct.price)}</span>
                <span>{getAverageRating(featuredProduct).toFixed(1)} rating</span>
              </div>
            )}
            {featuredProduct && (
              <Link to={`/product/${featuredProduct._id}`} className="hero-panel-link">
                Open Product
              </Link>
            )}
          </article>

          <article className="hero-panel hero-panel-stat">
            <strong>{stats.totalProducts}</strong>
            <span>Products in catalog</span>
          </article>
          <article className="hero-panel hero-panel-stat">
            <strong>{stats.categoryCount}</strong>
            <span>Active categories</span>
          </article>
          <article className="hero-panel hero-panel-stat">
            <strong>{stats.inStockCount}</strong>
            <span>Available right now</span>
          </article>
          <article className="hero-panel hero-panel-stat">
            <strong>{stats.reviewCount}</strong>
            <span>Total customer reviews</span>
          </article>
        </div>
      </section>

      <section className="home-strip">
        <button
          type="button"
          className="home-strip-card"
          onClick={() => scrollToSection(topRatedSectionRef)}
        >
          <strong>Top Rated</strong>
          <span>Best reviewed items first</span>
        </button>
        <button
          type="button"
          className="home-strip-card"
          onClick={() => scrollToSection(newArrivalsSectionRef)}
        >
          <strong>New Arrivals</strong>
          <span>Fresh additions to the catalog</span>
        </button>
        <button
          type="button"
          className="home-strip-card"
          onClick={() => scrollToSection(budgetPicksSectionRef)}
        >
          <strong>Budget Picks</strong>
          <span>Lower price, faster discovery</span>
        </button>
      </section>

      <section ref={topRatedSectionRef} className="home-section">
        <div className="home-section-head">
          <div>
            <span className="home-section-kicker">Most trusted</span>
            <h2>Top Rated Picks</h2>
            <p>Start with the items other customers already rate highly.</p>
          </div>
          <div className="home-slider-controls">
            <button type="button" onClick={() => scrollSpotlight(-1)}>
              Prev
            </button>
            <button type="button" onClick={() => scrollSpotlight(1)}>
              Next
            </button>
          </div>
        </div>

        <div ref={spotlightRef} className="home-spotlight-row">
          {isLoadingProducts
            ? Array.from({ length: 4 }).map((_, index) => (
                <div key={`spotlight-skeleton-${index}`} className="home-skeleton-card">
                  <span className="home-skeleton home-skeleton-image" />
                  <span className="home-skeleton home-skeleton-line short" />
                  <span className="home-skeleton home-skeleton-line" />
                  <span className="home-skeleton home-skeleton-line medium" />
                </div>
              ))
            : topRatedProducts.map((product) => (
                <div key={product._id} className="home-spotlight-item">
                  <ProductCard product={product} showDescription={false} variant="home" />
                </div>
              ))}
        </div>
      </section>

      <section className="home-highlights">
        <div ref={newArrivalsSectionRef} className="home-highlight-card">
          <div className="home-highlight-head">
            <div>
              <span className="home-section-kicker">Fresh drop</span>
              <h3>New Arrivals</h3>
            </div>
            <span>Latest</span>
          </div>
          <div className="home-mini-grid">
            {isLoadingProducts
              ? Array.from({ length: 4 }).map((_, index) => (
                  <div className="home-mini-skeleton" key={`arrival-skeleton-${index}`}>
                    <span className="home-skeleton home-skeleton-image" />
                    <span className="home-skeleton home-skeleton-line short" />
                  </div>
                ))
              : newArrivals.map((product) => (
                  <Link key={product._id} to={`/product/${product._id}`} className="home-mini-card">
                    <img src={product.image || "https://picsum.photos/220"} alt={product.name} />
                    <div className="home-mini-card-meta">
                      <span>{getCategoryLabel(product)}</span>
                      <span>{formatPrice(product.price)}</span>
                    </div>
                    <strong>{product.name}</strong>
                    <span>{getAverageRating(product).toFixed(1)} rated by readers</span>
                  </Link>
                ))}
          </div>
        </div>

        <div ref={budgetPicksSectionRef} className="home-highlight-card">
          <div className="home-highlight-head">
            <div>
              <span className="home-section-kicker">Best value</span>
              <h3>Budget Picks</h3>
            </div>
            <span>Value</span>
          </div>
          <div className="home-mini-grid">
            {isLoadingProducts
              ? Array.from({ length: 4 }).map((_, index) => (
                  <div className="home-mini-skeleton" key={`budget-skeleton-${index}`}>
                    <span className="home-skeleton home-skeleton-image" />
                    <span className="home-skeleton home-skeleton-line short" />
                  </div>
                ))
              : budgetPicks.map((product) => (
                  <Link key={product._id} to={`/product/${product._id}`} className="home-mini-card">
                    <img src={product.image || "https://picsum.photos/220"} alt={product.name} />
                    <div className="home-mini-card-meta">
                      <span>{getCategoryLabel(product)}</span>
                      <span>{formatPrice(product.price)}</span>
                    </div>
                    <strong>{product.name}</strong>
                    <span>{Number(product?.stock || 0) > 0 ? "In stock now" : "Currently unavailable"}</span>
                  </Link>
                ))}
          </div>
        </div>
      </section>

      <RecentlyViewed className="home-recently-viewed" />

      <section ref={catalogRef} className="home-section">
        <div className="home-section-head home-section-head-catalog">
          <div>
            <span className="home-section-kicker">Catalog</span>
            <h2>Browse the Collection</h2>
            <p>Filter by product category and sort by what matters most. Swipe horizontally to explore.</p>
          </div>

          <div className="home-catalog-tools">
            <div className="home-sort-box">
              <label htmlFor="home-sort">Sort by</label>
              <select id="home-sort" value={sortOption} onChange={(e) => setSortOption(e.target.value)}>
                <option value="default">Default</option>
                <option value="latest">Latest</option>
                <option value="rating">Highest Rated</option>
                <option value="priceLow">Price: Low to High</option>
                <option value="priceHigh">Price: High to Low</option>
              </select>
            </div>
          </div>
        </div>

        <div className="home-filter-row">
          <div className="home-category-row">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                className={selectedCategory === category ? "active" : ""}
                onClick={() => handleCategoryPick(category)}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="home-results-meta">
            <span>
              Showing {catalogPreviewProducts.length} preview products out of {catalogProducts.length}
              {selectedCategory !== "All" ? ` in ${selectedCategory}` : ""}
            </span>
          </div>
        </div>

        <div className="home-catalog-preview-row">
          {isLoadingProducts ? (
            Array.from({ length: 6 }).map((_, index) => (
              <div key={`catalog-skeleton-${index}`} className="home-catalog-preview-item">
                <div className="home-skeleton-card">
                  <span className="home-skeleton home-skeleton-image" />
                  <span className="home-skeleton home-skeleton-line short" />
                  <span className="home-skeleton home-skeleton-line" />
                  <span className="home-skeleton home-skeleton-line medium" />
                </div>
              </div>
            ))
          ) : catalogPreviewProducts.length > 0 ? (
            <>
              {catalogPreviewProducts.map((product) => (
                <div key={product._id} className="home-catalog-preview-item">
                  <ProductCard product={product} showDescription={false} variant="home" />
                </div>
              ))}
              <Link to="/collection" className="home-catalog-see-more-card">
                <span>See more</span>
                <strong>Open full collection</strong>
                <p>View all products on a dedicated page.</p>
              </Link>
            </>
          ) : (
            <div className="home-empty-state">
              <strong>No products found</strong>
              <p>Try another category to see more products.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default Home;

