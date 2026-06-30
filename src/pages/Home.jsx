import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import axios from "axios";
import ProductCard from "../components/ProductCard";
import RecentlyViewed from "../components/RecentlyViewed";
import { formatResolvedPrice } from "../utils/currency";
import { getProductPriceDetails, storePricingConfig } from "../utils/productPricing";
import "./Home.css";

const HOME_REQUEST_RETRY_DELAYS = [800, 1800];

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function DeferredHomeSection({ isReady, children, skeletonCount = 4, label = "Loading section" }) {
  if (isReady) {
    return children;
  }

  return (
    <section className="home-section home-deferred-placeholder" aria-label={label}>
      <div className="home-section-head home-section-head-catalog">
        <div>
          <span className="home-section-kicker">Loading</span>
          <h2>Preparing more products</h2>
          <p>More recommendations will appear in a moment.</p>
        </div>
      </div>

      <div className="home-catalog-preview-row">
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <div key={`deferred-skeleton-${label}-${index}`} className="home-catalog-preview-item">
            <div className="home-skeleton-card">
              <span className="home-skeleton home-skeleton-image" />
              <span className="home-skeleton home-skeleton-line short" />
              <span className="home-skeleton home-skeleton-line" />
              <span className="home-skeleton home-skeleton-line medium" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
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

function formatPrice(pricing) {
  return formatResolvedPrice(pricing, { maximumFractionDigits: 0 });
}

function getDisplayPrice(product) {
  return getProductPriceDetails(product);
}

const SPONSORS = [
  {
    id: "sanskrit-academy",
    name: "Sanskrit Academy",
    description: "Preserving Ancient Wisdom",
    icon: (
      <svg viewBox="0 0 64 64" className="home-sponsor-svg" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M32 12C28 24 16 36 16 48c0 8.8 7.2 12 16 12s16-3.2 16-12c0-12-12-24-16-36z" />
        <path d="M32 20c-3 9-10 18-10 28 0 5 3 8 10 8s10-3 10-8c0-10-7-19-10-28z" />
        <path d="M32 30c-2 6-6 12-6 18 0 3 2 4 6 4s6-1 6-4c0-6-4-12-6-18z" />
        <circle cx="32" cy="52" r="2" fill="currentColor" />
      </svg>
    )
  },
  {
    id: "vyoma-labs",
    name: "Vyoma Linguistic Labs",
    description: "Language Tech Research",
    icon: (
      <svg viewBox="0 0 64 64" className="home-sponsor-svg" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M32 8A24 24 0 1 0 56 32h-8A16 16 0 1 1 32 16V8z" />
        <circle cx="32" cy="12" r="4" fill="currentColor" />
        <circle cx="52" cy="32" r="4" fill="currentColor" />
        <circle cx="32" cy="52" r="4" fill="currentColor" />
        <circle cx="12" cy="32" r="4" fill="currentColor" />
        <path d="M32 20v24M20 32h24" strokeWidth="2" strokeDasharray="3 3" />
      </svg>
    )
  },
  {
    id: "veda-foundation",
    name: "Veda Foundation",
    description: "Vedic Heritage Safeguarding",
    icon: (
      <svg viewBox="0 0 64 64" className="home-sponsor-svg" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 48h40L44 60H20z" fill="currentColor" opacity="0.1" />
        <path d="M12 48h40M16 54h32M20 60h24" />
        <path d="M32 8c0 0 12 12 12 24a12 12 0 0 1-24 0C20 20 32 8 32 8z" />
        <path d="M32 20c0 0 6 6 6 12a6 6 0 0 1-12 0C26 26 32 20 32 20z" />
      </svg>
    )
  },
  {
    id: "indic-heritage",
    name: "Indic Heritage Trust",
    description: "Cultural Legacy Preservation",
    icon: (
      <svg viewBox="0 0 64 64" className="home-sponsor-svg" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 56h48M12 50h40M16 26h32" />
        <path d="M18 26v24M28 26v24M36 26v24M46 26v24" />
        <path d="M32 8L10 22h44z" fill="currentColor" opacity="0.1" />
        <path d="M32 8L10 22v4h44v-4z" />
      </svg>
    )
  },
  {
    id: "devavani-press",
    name: "Devavani Press",
    description: "Scholarly Publishing Partner",
    icon: (
      <svg viewBox="0 0 64 64" className="home-sponsor-svg" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M32 50c-4-4-12-6-24-6v-30c12 0 20 2 24 6 4-4 12-6 24-6v30c-12 0-20 2-24 6z" />
        <path d="M32 16v34" />
        <path d="M44 14l8-8m-4 12l4-4" strokeWidth="2" />
      </svg>
    )
  }
];

function Home() {
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isRetryingHomeData, setIsRetryingHomeData] = useState(false);
  const [homeLoadFailed, setHomeLoadFailed] = useState(false);
  const [topRatedProducts, setTopRatedProducts] = useState([]);
  const [newArrivals, setNewArrivals] = useState([]);
  const [budgetPicks, setBudgetPicks] = useState([]);
  const [bundleProducts, setBundleProducts] = useState([]);
  const [festiveOfferProducts, setFestiveOfferProducts] = useState([]);
  const [catalogPreviewProducts, setCatalogPreviewProducts] = useState([]);
  const [heroBanners, setHeroBanners] = useState([]);
  const [isLoadingHeroBanners, setIsLoadingHeroBanners] = useState(true);
  const [showFestiveOffersSection, setShowFestiveOffersSection] = useState(true);
  const [activeHeroBannerIndex, setActiveHeroBannerIndex] = useState(0);
  const [showSecondarySections, setShowSecondarySections] = useState(false);
  const [sponsorsList, setSponsorsList] = useState([]);
  const spotlightRef = useRef(null);
  const catalogRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    let active = true;

    setIsLoadingProducts(true);
    setIsLoadingHeroBanners(true);
    setIsRetryingHomeData(false);
    setHomeLoadFailed(false);

    const loadHomeData = async () => {
      try {
        let response = null;

        for (let attempt = 0; attempt <= HOME_REQUEST_RETRY_DELAYS.length; attempt += 1) {
          try {
            response = await axios.get("/api/products/home");
            break;
          } catch (error) {
            if (attempt === HOME_REQUEST_RETRY_DELAYS.length) {
              throw error;
            }

            if (!active) return;
            setIsRetryingHomeData(true);
            await wait(HOME_REQUEST_RETRY_DELAYS[attempt]);
          }
        }

        if (!active || !response) return;

        storePricingConfig({
          pricingMarkets: response.data?.pricingConfig?.pricingMarkets || [],
          internationalPricingDefaults: response.data?.pricingConfig?.internationalPricingDefaults || {},
          currencyConversionRates: response.data?.pricingConfig?.currencyConversionRates || {}
        });
        const nextHeroBanners = Array.isArray(response.data?.heroBanners) ? response.data.heroBanners : [];
        setHeroBanners(nextHeroBanners);
        setShowFestiveOffersSection(response.data?.showFestiveOffersSection !== false);
        setActiveHeroBannerIndex(0);
        setTopRatedProducts(Array.isArray(response.data?.topRatedProducts) ? response.data.topRatedProducts : []);
        setNewArrivals(Array.isArray(response.data?.newArrivals) ? response.data.newArrivals : []);
        setBudgetPicks(Array.isArray(response.data?.budgetPicks) ? response.data.budgetPicks : []);
        setBundleProducts(Array.isArray(response.data?.bundleProducts) ? response.data.bundleProducts : []);
        setFestiveOfferProducts(Array.isArray(response.data?.festiveOfferProducts) ? response.data.festiveOfferProducts : []);
        setCatalogPreviewProducts(
          Array.isArray(response.data?.catalogPreviewProducts) ? response.data.catalogPreviewProducts : []
        );
        setSponsorsList(Array.isArray(response.data?.sponsors) ? response.data.sponsors : []);
      } catch {
        if (!active) return;
        setHomeLoadFailed(true);
        setHeroBanners([]);
        setShowFestiveOffersSection(true);
        setActiveHeroBannerIndex(0);
        setTopRatedProducts([]);
        setNewArrivals([]);
        setBudgetPicks([]);
        setBundleProducts([]);
        setFestiveOfferProducts([]);
        setCatalogPreviewProducts([]);
        setSponsorsList([]);
      } finally {
        if (!active) return;
        setIsRetryingHomeData(false);
        setIsLoadingHeroBanners(false);
        setIsLoadingProducts(false);
      }
    };

    void loadHomeData();

    return () => {
      active = false;
    };
  }, []);

  const scrollSpotlight = (direction) => {
    spotlightRef.current?.scrollBy({ left: direction * 320, behavior: "smooth" });
  };

  // Handle scrollTo query param from navbar quick-nav buttons
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const scrollTarget = params.get("scrollTo");
    if (scrollTarget && !isLoadingProducts) {
      const targetId = `home-section-${scrollTarget}`;
      const element = document.getElementById(targetId);
      if (element) {
        window.setTimeout(() => {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      }
    }
  }, [location.search, isLoadingProducts]);

  useEffect(() => {
    if (heroBanners.length <= 1) return undefined;

    const intervalId = window.setInterval(() => {
      setActiveHeroBannerIndex((current) => (current + 1) % heroBanners.length);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [heroBanners]);

  useEffect(() => {
    if (isLoadingProducts) {
      setShowSecondarySections(false);
      return undefined;
    }

    let cancelled = false;
    const revealSections = () => {
      if (!cancelled) {
        setShowSecondarySections(true);
      }
    };

    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(revealSections, { timeout: 900 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }

    const timeoutId = window.setTimeout(revealSections, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [isLoadingProducts]);

  const activeHeroBanner = heroBanners[activeHeroBannerIndex] || null;

  useEffect(() => {
    const heroImage = String(heroBanners[0]?.image || "").trim();
    if (!heroImage || typeof document === "undefined") return undefined;

    const preloadLink = document.createElement("link");
    preloadLink.rel = "preload";
    preloadLink.as = "image";
    preloadLink.href = heroImage;
    document.head.appendChild(preloadLink);

    return () => {
      preloadLink.remove();
    };
  }, [heroBanners]);

  const showPreviousHeroBanner = () => {
    setActiveHeroBannerIndex((current) => (current - 1 + heroBanners.length) % heroBanners.length);
  };

  const showNextHeroBanner = () => {
    setActiveHeroBannerIndex((current) => (current + 1) % heroBanners.length);
  };

  return (
    <div className="home-page">
      {isLoadingHeroBanners ? (
        <section className="home-banner home-banner-loading" aria-label="Loading homepage banner">
          <span className="home-skeleton home-banner-skeleton" />
        </section>
      ) : activeHeroBanner ? (
        activeHeroBanner.productId ? (
          <Link to={`/product/${activeHeroBanner.productId}`} className="home-banner home-banner-has-media">
            <img
              src={activeHeroBanner.image}
              alt="Homepage banner"
              className="home-banner-image"
              width="1600"
              height="520"
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
            {heroBanners.length > 1 ? (
              <>
                <button type="button" className="home-banner-nav prev" onClick={(e) => { e.preventDefault(); showPreviousHeroBanner(); }}>
                  <span aria-hidden="true">{"\u2039"}</span>
                  <span className="sr-only">Previous banner</span>
                </button>
                <button type="button" className="home-banner-nav next" onClick={(e) => { e.preventDefault(); showNextHeroBanner(); }}>
                  <span aria-hidden="true">{"\u203A"}</span>
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
            <img
              src={activeHeroBanner.image}
              alt="Homepage banner"
              className="home-banner-image"
              width="1600"
              height="520"
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
            {heroBanners.length > 1 ? (
              <>
                <button type="button" className="home-banner-nav prev" onClick={showPreviousHeroBanner}>
                  <span aria-hidden="true">{"\u2039"}</span>
                  <span className="sr-only">Previous banner</span>
                </button>
                <button type="button" className="home-banner-nav next" onClick={showNextHeroBanner}>
                  <span aria-hidden="true">{"\u203A"}</span>
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
        {isRetryingHomeData ? (
          <p className="home-status-banner">Refreshing homepage content...</p>
        ) : null}
        {homeLoadFailed ? (
          <p className="home-status-banner home-status-banner-warning">
            Homepage content took too long to load. Refresh once if products are missing.
          </p>
        ) : null}
      </section>

      <section id="home-section-top-rated" className="home-section">
        <div className="home-section-head">
          <div>
            <span className="home-section-kicker">Most trusted</span>
            <h2>Top Rated Picks</h2>
            <p>Start with the items other customers already rate highly.</p>
          </div>
          <div className="home-slider-controls">
            <button type="button" onClick={() => scrollSpotlight(-1)} aria-label="Scroll top rated left">
              <span aria-hidden="true">{"\u2039"}</span>
            </button>
            <button type="button" onClick={() => scrollSpotlight(1)} aria-label="Scroll top rated right">
              <span aria-hidden="true">{"\u203A"}</span>
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
        <div id="home-section-new-arrivals" className="home-highlight-card">
          <div className="home-highlight-head">
            <div>
              <span className="home-section-kicker">Fresh drop</span>
              <h3>New Arrivals</h3>
            </div>
            <Link to="/collection" className="home-inline-link">See more</Link>
          </div>
          <div className="home-spotlight-row">
            {isLoadingProducts
              ? Array.from({ length: 4 }).map((_, index) => (
                  <div key={`arrival-skeleton-${index}`} className="home-skeleton-card home-spotlight-item">
                    <span className="home-skeleton home-skeleton-image" />
                    <span className="home-skeleton home-skeleton-line short" />
                    <span className="home-skeleton home-skeleton-line" />
                    <span className="home-skeleton home-skeleton-line medium" />
                  </div>
                ))
              : newArrivals.map((product) => (
                  <div key={product._id} className="home-spotlight-item">
                    <ProductCard product={product} showDescription={false} variant="home" />
                  </div>
                ))}
          </div>
        </div>

        <div id="home-section-budget-picks" className="home-highlight-card">
          <div className="home-highlight-head">
            <div>
              <span className="home-section-kicker">Best value</span>
              <h3>Budget Picks</h3>
            </div>
            <Link to="/collection" className="home-inline-link">See more</Link>
          </div>
          <div className="home-spotlight-row">
            {isLoadingProducts
              ? Array.from({ length: 4 }).map((_, index) => (
                  <div key={`budget-skeleton-${index}`} className="home-skeleton-card home-spotlight-item">
                    <span className="home-skeleton home-skeleton-image" />
                    <span className="home-skeleton home-skeleton-line short" />
                    <span className="home-skeleton home-skeleton-line" />
                    <span className="home-skeleton home-skeleton-line medium" />
                  </div>
                ))
              : budgetPicks.map((product) => (
                  <div key={product._id} className="home-spotlight-item">
                    <ProductCard product={product} showDescription={false} variant="home" />
                  </div>
                ))}
          </div>
        </div>
      </section>

      {showFestiveOffersSection ? (
        <DeferredHomeSection isReady={showSecondarySections} label="Loading festive offers">
        <section className="home-section home-deferred-section">
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
        </DeferredHomeSection>
      ) : null}

      <DeferredHomeSection isReady={showSecondarySections} label="Loading bundle products">
      <section className="home-section home-deferred-section">
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
      </DeferredHomeSection>

      <DeferredHomeSection isReady={showSecondarySections} skeletonCount={3} label="Loading recently viewed">
        <RecentlyViewed className="home-recently-viewed home-deferred-section" />
      </DeferredHomeSection>

      <DeferredHomeSection isReady={showSecondarySections} skeletonCount={5} label="Loading catalog preview">
      <section ref={catalogRef} className="home-section home-deferred-section">
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
      </DeferredHomeSection>

      <DeferredHomeSection isReady={showSecondarySections} skeletonCount={5} label="Loading sponsors">
        <section className="home-section home-deferred-section home-sponsors-section">
          <div className="home-section-head">
            <div>
              <span className="home-section-kicker">Sponsors & Partners</span>
              <h2>Supported By</h2>
              <p>Our work is powered by the trust and sponsorship of these esteemed institutions.</p>
            </div>
          </div>

          <div className="home-sponsors-grid">
            {(sponsorsList.length > 0 ? sponsorsList : SPONSORS).map((sponsor, idx) => {
              const hasLogoImage = sponsor.logoUrl && sponsor.logoUrl.trim() !== "";
              
              const sponsorNameLower = String(sponsor.name || "").toLowerCase();
              const matchedPreset = SPONSORS.find(
                (preset) =>
                  preset.id === sponsor.id ||
                  sponsorNameLower.includes(preset.name.toLowerCase()) ||
                  preset.name.toLowerCase().includes(sponsorNameLower)
              );

              const fallbackIcon = (
                <svg viewBox="0 0 64 64" className="home-sponsor-svg" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="10" y="14" width="44" height="36" rx="8" />
                  <path d="M22 24h20M22 32h14" />
                  <circle cx="42" cy="32" r="3" fill="currentColor" />
                </svg>
              );

              const logoElement = hasLogoImage ? (
                <img
                  src={sponsor.logoUrl}
                  alt={sponsor.name}
                  className="home-sponsor-logo-img"
                  width="64"
                  height="64"
                  loading="lazy"
                />
              ) : (
                <div className="home-sponsor-icon-wrapper">
                  {matchedPreset ? matchedPreset.icon : fallbackIcon}
                </div>
              );

              const props = {
                key: sponsor.id || sponsor._id || idx,
                className: "home-sponsor-card"
              };

              const innerContent = (
                <>
                  {logoElement}
                  <strong className="home-sponsor-name">{sponsor.name}</strong>
                  <span className="home-sponsor-desc">{sponsor.description}</span>
                </>
              );

              if (sponsor.websiteUrl) {
                return (
                  <a href={sponsor.websiteUrl} target="_blank" rel="noreferrer" {...props}>
                    {innerContent}
                  </a>
                );
              }

              return (
                <div {...props}>
                  {innerContent}
                </div>
              );
            })}
          </div>
        </section>
      </DeferredHomeSection>
    </div>
  );
}

export default Home;
