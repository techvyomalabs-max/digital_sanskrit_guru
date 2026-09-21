import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import axios from "axios";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import ProductCard from "../components/ProductCard";
import RecentlyViewed from "../components/RecentlyViewed";
import { formatResolvedPrice } from "../utils/currency";
import { getProductPriceDetails, storePricingConfig } from "../utils/productPricing";
import "./Home.css";
import { useDocumentMetadata } from "../hooks/useDocumentMetadata";
import LoadingSpinner from "../components/common/LoadingSpinner";

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
      <LoadingSpinner text="Preparing recommendations..." minHeight="160px" />
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
  useDocumentMetadata("Home", "Explore premium Sanskrit scriptures, linguistic studies, grammar learning books, and traditional educational kits.");

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
  const festiveRef = useRef(null);
  const bundleRef = useRef(null);
  const catalogPreviewRef = useRef(null);
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

  const scrollRow = (targetRef, direction) => {
    targetRef?.current?.scrollBy({ left: direction * 340, behavior: "smooth" });
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
          const header = document.querySelector(".navbar-container") || document.querySelector("header");
          const navbarHeight = header ? header.getBoundingClientRect().height : 120;
          const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
          const offsetPosition = Math.max(0, elementPosition - navbarHeight - 16);

          window.scrollTo({
            top: offsetPosition,
            behavior: "smooth"
          });

          document.querySelectorAll(".home-section-highlighted").forEach((el) => {
            el.classList.remove("home-section-highlighted");
          });
          element.classList.add("home-section-highlighted");
        }, 120);
      }
    }
  }, [location.search, isLoadingProducts]);

  // Clear persistent section highlight when user clicks any button/link/interactive element
  useEffect(() => {
    const handleGlobalClick = (e) => {
      if (e.target.closest(".navbar-quick-nav-btn")) return;

      const highlightedElems = document.querySelectorAll(".home-section-highlighted");
      if (highlightedElems.length > 0) {
        highlightedElems.forEach((el) => el.classList.remove("home-section-highlighted"));
      }
    };

    window.addEventListener("click", handleGlobalClick, true);
    return () => window.removeEventListener("click", handleGlobalClick, true);
  }, []);

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

  useEffect(() => {
    const orgSchema = {
      "@context": "https://schema.org",
      "@type": "OnlineStore",
      "name": "Digital Sanskrit Guru",
      "url": window.location.origin,
      "logo": `${window.location.origin}/logo.png`,
      "description": "Premium Sanskrit scriptures, learning guides, grammatical studies, and traditional educational kits."
    };

    const scriptId = "store-jsonld-schema";
    let scriptTag = document.getElementById(scriptId);
    if (!scriptTag) {
      scriptTag = document.createElement("script");
      scriptTag.id = scriptId;
      scriptTag.type = "application/ld+json";
      document.head.appendChild(scriptTag);
    }
    scriptTag.text = JSON.stringify(orgSchema);

    return () => {
      const tag = document.getElementById(scriptId);
      if (tag) tag.remove();
    };
  }, []);

  const activeHeroBanner = heroBanners[activeHeroBannerIndex] || null;

  useEffect(() => {
    const heroImage = String(heroBanners[0]?.image || "").trim();
    const heroMobileImage = String(heroBanners[0]?.mobileImage || "").trim();
    if (!heroImage || typeof document === "undefined") return undefined;

    const preloadLink = document.createElement("link");
    preloadLink.rel = "preload";
    preloadLink.as = "image";
    if (heroMobileImage && window.innerWidth <= 768) {
      preloadLink.href = heroMobileImage;
    } else {
      preloadLink.href = heroImage;
    }
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
      <h1 className="sr-only">Digital Sanskrit Guru - Premium Sanskrit Learning Store</h1>
      {isLoadingHeroBanners ? (
        <section className="home-banner home-banner-loading" aria-label="Loading homepage banner">
          <LoadingSpinner text="Loading banner..." minHeight="220px" />
        </section>
      ) : activeHeroBanner ? (
        <div className="home-banner-container">
          {activeHeroBanner.productId ? (
            <Link
              to={
                activeHeroBanner.productId.startsWith("/")
                  ? activeHeroBanner.productId
                  : `/product/${activeHeroBanner.productId}`
              }
              className="home-banner home-banner-has-media"
            >
              <picture style={{ display: "block", width: "100%" }}>
                <source media="(max-width: 768px)" srcSet={activeHeroBanner.mobileImage || activeHeroBanner.image} />
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
              </picture>
              {heroBanners.length > 1 ? (
                <>
                  <button type="button" className="home-banner-nav prev" onClick={(e) => { e.preventDefault(); showPreviousHeroBanner(); }} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <ChevronLeft size={52} strokeWidth={3.5} />
                    <span className="sr-only">Previous banner</span>
                  </button>
                  <button type="button" className="home-banner-nav next" onClick={(e) => { e.preventDefault(); showNextHeroBanner(); }} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <ChevronRight size={52} strokeWidth={3.5} />
                    <span className="sr-only">Next banner</span>
                  </button>
                </>
              ) : null}
            </Link>
          ) : (
            <section className="home-banner home-banner-has-media">
              <picture style={{ display: "block", width: "100%" }}>
                <source media="(max-width: 768px)" srcSet={activeHeroBanner.mobileImage || activeHeroBanner.image} />
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
              </picture>
              {heroBanners.length > 1 ? (
                <>
                  <button type="button" className="home-banner-nav prev" onClick={showPreviousHeroBanner} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <ChevronLeft size={52} strokeWidth={3.5} />
                    <span className="sr-only">Previous banner</span>
                  </button>
                  <button type="button" className="home-banner-nav next" onClick={showNextHeroBanner} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <ChevronRight size={52} strokeWidth={3.5} />
                    <span className="sr-only">Next banner</span>
                  </button>
                </>
              ) : null}
            </section>
          )}

          {heroBanners.length > 1 ? (
            <div className="home-banner-dots" role="tablist" aria-label="Banner indicators">
              {heroBanners.map((banner, index) => (
                <button
                  key={`${banner.image}-${index}`}
                  type="button"
                  className={`home-banner-dot ${index === activeHeroBannerIndex ? "active" : ""}`}
                  onClick={() => setActiveHeroBannerIndex(index)}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
          ) : null}
        </div>
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
          </div>
        </div>

        <div className="home-slider-wrapper">
          <button
            type="button"
            className="home-slider-arrow left"
            onClick={() => scrollRow(spotlightRef, -1)}
            aria-label="Previous items"
          >
            <ChevronLeft size={52} strokeWidth={3.5} />
          </button>

          <div ref={spotlightRef} className="home-spotlight-row">
            {isLoadingProducts ? (
              <LoadingSpinner text="Loading top rated picks..." minHeight="200px" />
            ) : (
              topRatedProducts.map((product) => (
                <div key={product._id} className="home-spotlight-item">
                  <ProductCard product={product} showDescription={false} variant="home" />
                </div>
              ))
            )}
          </div>

          <button
            type="button"
            className="home-slider-arrow right"
            onClick={() => scrollRow(spotlightRef, 1)}
            aria-label="Next items"
          >
            <ChevronRight size={52} strokeWidth={3.5} />
          </button>
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
          <div className="home-mini-grid home-desktop-only">
            {isLoadingProducts ? (
              <LoadingSpinner text="Loading new arrivals..." minHeight="160px" />
            ) : (
              newArrivals.map((product) => (
                <Link key={product._id} to={`/product/${product._id}`} className="home-mini-card">
                  <img
                    src={product.image || "https://picsum.photos/220"}
                    alt={product.name}
                    width="220"
                    height="130"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="home-mini-card-meta">
                    <span>{getCategoryLabel(product)}</span>
                    <span>{formatPrice(getDisplayPrice(product))}</span>
                  </div>
                  <strong>{product.name}</strong>
                  <span>{getAverageRating(product).toFixed(1)} rated by readers</span>
                </Link>
              ))
            )}
          </div>

          <div className="home-mobile-image-strip">
            {isLoadingProducts ? (
              <LoadingSpinner text="Loading new arrivals..." minHeight="160px" />
            ) : (
              newArrivals.map((product) => (
                <div key={product._id} className="home-spotlight-item">
                  <ProductCard product={product} showDescription={false} variant="home" />
                </div>
              ))
            )}
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
          <div className="home-mini-grid home-desktop-only">
            {isLoadingProducts ? (
              <LoadingSpinner text="Loading budget picks..." minHeight="160px" />
            ) : (
              budgetPicks.map((product) => (
                <Link key={product._id} to={`/product/${product._id}`} className="home-mini-card">
                  <img
                    src={product.image || "https://picsum.photos/220"}
                    alt={product.name}
                    width="220"
                    height="130"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="home-mini-card-meta">
                    <span>{getCategoryLabel(product)}</span>
                    <span>{formatPrice(getDisplayPrice(product))}</span>
                  </div>
                  <strong>{product.name}</strong>
                  <span>{Number(product?.stock || 0) > 0 ? "In stock now" : "Currently unavailable"}</span>
                </Link>
              ))
            )}
          </div>

          <div className="home-mobile-image-strip">
            {isLoadingProducts ? (
              <LoadingSpinner text="Loading budget picks..." minHeight="160px" />
            ) : (
              budgetPicks.map((product) => (
                <div key={product._id} className="home-spotlight-item">
                  <ProductCard product={product} showDescription={false} variant="home" />
                </div>
              ))
            )}
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
              </div>
              <Link to="/collection" className="home-inline-link">View all</Link>
            </div>

            <div className="home-slider-wrapper">
              {festiveOfferProducts.length > 0 ? (
                <button
                  type="button"
                  className="home-slider-arrow left"
                  onClick={() => scrollRow(festiveRef, -1)}
                  aria-label="Previous festive offers"
                >
                  <ChevronLeft size={52} strokeWidth={3.5} />
                </button>
              ) : null}

              <div ref={festiveRef} className="home-catalog-preview-row">
                {isLoadingProducts ? (
                  <LoadingSpinner text="Loading festive offers..." minHeight="180px" />
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

              {festiveOfferProducts.length > 0 ? (
                <button
                  type="button"
                  className="home-slider-arrow right"
                  onClick={() => scrollRow(festiveRef, 1)}
                  aria-label="Next festive offers"
                >
                  <ChevronRight size={52} strokeWidth={3.5} />
                </button>
              ) : null}
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
            </div>
            <Link to="/collection" className="home-inline-link">View all</Link>
          </div>

          <div className="home-slider-wrapper">
            {bundleProducts.length > 0 ? (
              <button
                type="button"
                className="home-slider-arrow left"
                onClick={() => scrollRow(bundleRef, -1)}
                aria-label="Previous bundle products"
              >
                <ChevronLeft size={52} strokeWidth={3.5} />
              </button>
            ) : null}

            <div ref={bundleRef} className="home-catalog-preview-row">
              {isLoadingProducts ? (
                <LoadingSpinner text="Loading bundle deals..." minHeight="180px" />
              ) : bundleProducts.length > 0 ? (
                bundleProducts.map((product) => (
                  <div key={product._id} className="home-catalog-preview-item">
                    <ProductCard product={product} showDescription={false} variant="home" />
                  </div>
                ))
              ) : (
                <div className="home-empty-state">
                  <strong>No bundle products yet</strong>
                </div>
              )}
            </div>

            {bundleProducts.length > 0 ? (
              <button
                type="button"
                className="home-slider-arrow right"
                onClick={() => scrollRow(bundleRef, 1)}
                aria-label="Next bundle products"
              >
                <ChevronRight size={52} strokeWidth={3.5} />
              </button>
            ) : null}
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
            </div>
            <Link to="/collection" className="home-inline-link">see all products</Link>
          </div>

          <div className="home-slider-wrapper">
            {catalogPreviewProducts.length > 0 ? (
              <button
                type="button"
                className="home-slider-arrow left"
                onClick={() => scrollRow(catalogPreviewRef, -1)}
                aria-label="Previous catalog items"
              >
                <ChevronLeft size={52} strokeWidth={3.5} />
              </button>
            ) : null}

            <div ref={catalogPreviewRef} className="home-catalog-preview-row">
              {isLoadingProducts ? (
                <LoadingSpinner text="Loading collection..." minHeight="180px" />
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
                  </Link>
                </>
              ) : (
                <div className="home-empty-state">
                  <strong>No products found</strong>
                  <p>Try another category to see more products.</p>
                </div>
              )}
            </div>

            {catalogPreviewProducts.length > 0 ? (
              <button
                type="button"
                className="home-slider-arrow right"
                onClick={() => scrollRow(catalogPreviewRef, 1)}
                aria-label="Next catalog items"
              >
                <ChevronRight size={52} strokeWidth={3.5} />
              </button>
            ) : null}
          </div>
        </section>
      </DeferredHomeSection>

      <DeferredHomeSection isReady={showSecondarySections} skeletonCount={3} label="Loading stats">
        <section className="home-section home-stats-section">
          <div className="home-section-head">
            <div>
              <span className="home-section-kicker">Vyoma's Journey & Impact</span>
              <h2>Scale & Experience</h2>
              <p>Empowering learners globally with structured Sanskrit knowledge and premium interactive digital products.</p>
            </div>
          </div>

          <div className="home-stats-grid">
            <div className="home-stat-card">
              <div className="home-stat-icon-wrapper">
                <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <strong className="home-stat-number">5 Lakhs+</strong>
              <span className="home-stat-title">Learners Served</span>
              <span className="home-stat-desc">Sanskrit enthusiasts and students worldwide studying courses and using digital tools.</span>
            </div>

            <div className="home-stat-card">
              <div className="home-stat-icon-wrapper">
                <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <strong className="home-stat-number">500+</strong>
              <span className="home-stat-title">Products Available</span>
              <span className="home-stat-desc">Interactive e-books, multimedia resources, and premium web/kindle learning editions.</span>
            </div>

            <div className="home-stat-card">
              <div className="home-stat-icon-wrapper">
                <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <strong className="home-stat-number">15+ Years</strong>
              <span className="home-stat-title">Operating History</span>
              <span className="home-stat-desc">Promoting and preserving Sanskrit through modern digital education technologies since 2011.</span>
            </div>
          </div>
        </section>
      </DeferredHomeSection>

      {sponsorsList.length > 0 && (
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
              {sponsorsList.map((sponsor, idx) => {
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

                const keyVal = sponsor.id || sponsor._id || idx;
                const cardProps = {
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
                    <a key={keyVal} href={sponsor.websiteUrl} target="_blank" rel="noreferrer" {...cardProps}>
                      {innerContent}
                    </a>
                  );
                }

                return (
                  <div key={keyVal} {...cardProps}>
                    {innerContent}
                  </div>
                );
              })}
            </div>
          </section>
        </DeferredHomeSection>
      )}
    </div>
  );
}

export default Home;
