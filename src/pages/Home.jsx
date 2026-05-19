import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import ProductCard from "../components/ProductCard";
import RecentlyViewed from "../components/RecentlyViewed";
import { formatCurrencyForUser } from "../utils/currency";
import { getProductPriceDetails } from "../utils/productPricing";
import "./Home.css";

const CATALOG_PREVIEW_LIMIT = 4;

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
  return formatCurrencyForUser(value, {
    maximumFractionDigits: 0
  });
}

function getDisplayPrice(product) {
  return Number(getProductPriceDetails(product).price || 0);
}

function Home() {
  const [products, setProducts] = useState([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [heroBanners, setHeroBanners] = useState([]);
  const [showFestiveOffersSection, setShowFestiveOffersSection] = useState(true);
  const [activeHeroBannerIndex, setActiveHeroBannerIndex] = useState(0);
  const spotlightRef = useRef(null);
  const catalogRef = useRef(null);
  const topRatedSectionRef = useRef(null);
  const newArrivalsSectionRef = useRef(null);
  const budgetPicksSectionRef = useRef(null);

  useEffect(() => {
    axios
      .get("/api/settings")
      .then((res) => {
        const nextHeroBanners =
          Array.isArray(res.data?.heroBanners) && res.data.heroBanners.length > 0
            ? res.data.heroBanners
            : String(res.data?.heroBannerImage || "").trim()
              ? [{ image: String(res.data?.heroBannerImage || "").trim(), productId: String(res.data?.heroBannerProductId || "").trim() }]
              : [];
        setHeroBanners(nextHeroBanners);
        setShowFestiveOffersSection(res.data?.homeSectionVisibility?.festiveOffers !== false);
        setActiveHeroBannerIndex(0);
      })
      .catch(() => {
        setHeroBanners([]);
        setShowFestiveOffersSection(true);
        setActiveHeroBannerIndex(0);
      });

    setIsLoadingProducts(true);
    axios
      .get("/api/products")
      .then((res) => setProducts(Array.isArray(res.data) ? res.data : []))
      .catch(() => setProducts([]))
      .finally(() => setIsLoadingProducts(false));
  }, []);

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
      .sort((a, b) => getDisplayPrice(a) - getDisplayPrice(b))
      .slice(0, 4);
  }, [products]);

  const bundleProducts = useMemo(() => {
    return products
      .filter((product) => {
        const isMarkedBundle = String(product?.productType || "single") === "bundle";
        const hasBundleItems = Array.isArray(product?.bundleItems) && product.bundleItems.length > 0;
        return isMarkedBundle || hasBundleItems;
      })
      .slice(0, 8);
  }, [products]);

  const festiveOfferProducts = useMemo(() => {
    return products.filter((product) => product?.festiveOffer === true).slice(0, 8);
  }, [products]);

  const featuredProduct = topRatedProducts[0] || newArrivals[0] || budgetPicks[0] || null;

  const catalogProducts = products;
  const catalogPreviewProducts = useMemo(
    () => catalogProducts.slice(0, CATALOG_PREVIEW_LIMIT),
    [catalogProducts]
  );

  const scrollSpotlight = (direction) => {
    spotlightRef.current?.scrollBy({ left: direction * 320, behavior: "smooth" });
  };

  const scrollToSection = (sectionRef) => {
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (heroBanners.length <= 1) return undefined;

    const intervalId = window.setInterval(() => {
      setActiveHeroBannerIndex((current) => (current + 1) % heroBanners.length);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [heroBanners]);

  const activeHeroBanner = heroBanners[activeHeroBannerIndex] || null;

  const showPreviousHeroBanner = () => {
    setActiveHeroBannerIndex((current) => (current - 1 + heroBanners.length) % heroBanners.length);
  };

  const showNextHeroBanner = () => {
    setActiveHeroBannerIndex((current) => (current + 1) % heroBanners.length);
  };

  return (
    <div className="home-page">
      {activeHeroBanner ? (
        activeHeroBanner.productId ? (
          <Link to={`/product/${activeHeroBanner.productId}`} className="home-banner home-banner-has-media">
            <img src={activeHeroBanner.image} alt="Homepage banner" className="home-banner-image" />
            {heroBanners.length > 1 ? (
              <>
                <button type="button" className="home-banner-nav prev" onClick={(e) => { e.preventDefault(); showPreviousHeroBanner(); }}>
                  <span aria-hidden="true">‹</span>
                  <span className="sr-only">Previous banner</span>
                </button>
                <button type="button" className="home-banner-nav next" onClick={(e) => { e.preventDefault(); showNextHeroBanner(); }}>
                  <span aria-hidden="true">›</span>
                  <span className="sr-only">Next banner</span>
                </button>
                <div className="home-banner-dots">
                  {heroBanners.map((banner, index) => (
                    <span key={`${banner.image}-${index}`} className={index === activeHeroBannerIndex ? "active" : ""} />
                  ))}
                </div>
              </>
            ) : null}
          </Link>
        ) : (
          <section className="home-banner home-banner-has-media">
            <img src={activeHeroBanner.image} alt="Homepage banner" className="home-banner-image" />
            {heroBanners.length > 1 ? (
              <>
                <button type="button" className="home-banner-nav prev" onClick={showPreviousHeroBanner}>
                  <span aria-hidden="true">‹</span>
                  <span className="sr-only">Previous banner</span>
                </button>
                <button type="button" className="home-banner-nav next" onClick={showNextHeroBanner}>
                  <span aria-hidden="true">›</span>
                  <span className="sr-only">Next banner</span>
                </button>
                <div className="home-banner-dots">
                  {heroBanners.map((banner, index) => (
                    <span key={`${banner.image}-${index}`} className={index === activeHeroBannerIndex ? "active" : ""} />
                  ))}
                </div>
              </>
            ) : null}
          </section>
        )
      ) : null}

      <section className="home-feature-shell">
        <div className="home-strip">
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
        </div>
      </section>

      <section ref={topRatedSectionRef} className="home-section">
        <div className="home-section-head">
          <div>
            <span className="home-section-kicker">Most trusted</span>
            <h2>Top Rated Picks</h2>
            <p>Start with the items other customers already rate highly.</p>
          </div>
          <div className="home-slider-controls">
            <button type="button" onClick={() => scrollSpotlight(-1)} aria-label="Scroll top rated left">
              <span aria-hidden="true">‹</span>
            </button>
            <button type="button" onClick={() => scrollSpotlight(1)} aria-label="Scroll top rated right">
              <span aria-hidden="true">›</span>
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
            <Link to="/collection" className="home-inline-link">See more</Link>
          </div>
          <div className="home-mini-grid home-desktop-only">
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
                      <span>{formatPrice(getDisplayPrice(product))}</span>
                    </div>
                    <strong>{product.name}</strong>
                    <span>{getAverageRating(product).toFixed(1)} rated by readers</span>
                  </Link>
                ))}
          </div>

          <div className="home-mobile-image-strip">
            {isLoadingProducts
              ? Array.from({ length: 4 }).map((_, index) => (
                  <div className="home-mobile-image-card" key={`arrival-mobile-skeleton-${index}`}>
                    <span className="home-skeleton home-skeleton-image" />
                  </div>
                ))
              : newArrivals.map((product) => (
                  <Link key={product._id} to={`/product/${product._id}`} className="home-mobile-image-card">
                    <img src={product.image || "https://picsum.photos/220"} alt={product.name} />
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
            <Link to="/collection" className="home-inline-link">See more</Link>
          </div>
          <div className="home-mini-grid home-desktop-only">
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
                      <span>{formatPrice(getDisplayPrice(product))}</span>
                    </div>
                    <strong>{product.name}</strong>
                    <span>{Number(product?.stock || 0) > 0 ? "In stock now" : "Currently unavailable"}</span>
                  </Link>
                ))}
          </div>

          <div className="home-mobile-image-strip">
            {isLoadingProducts
              ? Array.from({ length: 4 }).map((_, index) => (
                  <div className="home-mobile-image-card" key={`budget-mobile-skeleton-${index}`}>
                    <span className="home-skeleton home-skeleton-image" />
                  </div>
                ))
              : budgetPicks.map((product) => (
                  <Link key={product._id} to={`/product/${product._id}`} className="home-mobile-image-card">
                    <img src={product.image || "https://picsum.photos/220"} alt={product.name} />
                  </Link>
                ))}
          </div>
        </div>
      </section>

      {showFestiveOffersSection ? (
        <section className="home-section">
          <div className="home-section-head home-section-head-catalog">
            <div>
              <span className="home-section-kicker">Seasonal picks</span>
              <h2>Festive Offers</h2>
              <p>Shop festive offer products highlighted by admin.</p>
            </div>
            <Link to="/collection" className="home-inline-link">View all</Link>
          </div>

          <div className="home-catalog-preview-row">
            {isLoadingProducts ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={`festive-skeleton-${index}`} className="home-catalog-preview-item">
                  <div className="home-skeleton-card">
                    <span className="home-skeleton home-skeleton-image" />
                    <span className="home-skeleton home-skeleton-line short" />
                    <span className="home-skeleton home-skeleton-line" />
                    <span className="home-skeleton home-skeleton-line medium" />
                  </div>
                </div>
              ))
            ) : festiveOfferProducts.length > 0 ? (
              festiveOfferProducts.map((product) => (
                <div key={product._id} className="home-catalog-preview-item">
                  <ProductCard product={product} showDescription={false} variant="home" />
                </div>
              ))
            ) : (
              <div className="home-empty-state">
                <strong>No festive offers yet</strong>
                <p>Products marked as festive offers by admin will appear here automatically.</p>
              </div>
            )}
          </div>
        </section>
      ) : null}

      <section className="home-section">
        <div className="home-section-head home-section-head-catalog">
          <div>
            <span className="home-section-kicker">Bundle deals</span>
            <h2>Bundle Products</h2>
            <p>Explore curated bundles created by admin from existing products.</p>
          </div>
          <Link to="/collection" className="home-inline-link">View all</Link>
        </div>

        <div className="home-catalog-preview-row">
          {isLoadingProducts ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div key={`bundle-skeleton-${index}`} className="home-catalog-preview-item">
                <div className="home-skeleton-card">
                  <span className="home-skeleton home-skeleton-image" />
                  <span className="home-skeleton home-skeleton-line short" />
                  <span className="home-skeleton home-skeleton-line" />
                  <span className="home-skeleton home-skeleton-line medium" />
                </div>
              </div>
            ))
          ) : bundleProducts.length > 0 ? (
            bundleProducts.map((product) => (
              <div key={product._id} className="home-catalog-preview-item">
                <ProductCard product={product} showDescription={false} variant="home" />
              </div>
            ))
          ) : (
            <div className="home-empty-state">
              <strong>No bundle products yet</strong>
              <p>Bundle products created by admin will appear here automatically.</p>
            </div>
          )}
        </div>
      </section>

      <RecentlyViewed className="home-recently-viewed" />

      <section ref={catalogRef} className="home-section">
        <div className="home-section-head home-section-head-catalog">
          <div>
            <span className="home-section-kicker">Catalog</span>
            <h2>Browse the Collection</h2>
            <p>Swipe horizontally to explore products across the full collection.</p>
          </div>
          <Link to="/collection" className="home-inline-link">see all products</Link>
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
