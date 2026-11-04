import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import axios from "axios";
import { ArrowRight, BookOpen, Building2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, HandCoins, HandHeart, HeartHandshake, ShieldCheck, Truck, Zap } from "lucide-react";
import ProductCard from "../components/ProductCard";
import RecentlyViewed from "../components/RecentlyViewed";
import RecommendedForYou from "../components/RecommendedForYou";
import { formatResolvedPrice } from "../utils/currency";
import { getProductPriceDetails, storePricingConfig } from "../utils/productPricing";
import { isKindleProduct } from "../utils/kindle";
import { useDeliveryLocation } from "../hooks/useDeliveryLocation";
import "./Home.css";
import { useDocumentMetadata, HOME_TITLE, DEFAULT_DESCRIPTION } from "../hooks/useDocumentMetadata";
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

function getDisplayPrice(product, country) {
  return getProductPriceDetails(product, country);
}

// Shown in the Sponsors & Partners section; each opens the Support us form with that option chosen
const SUPPORT_WAYS = [
  { type: "sponsor", icon: BookOpen, title: "Sponsor", text: "Fund a book, course or learning tool" },
  { type: "institution", icon: Building2, title: "Partner", text: "Schools, universities and organisations" },
  { type: "donate", icon: HandCoins, title: "Donate", text: "Keep Sanskrit learning accessible" },
  { type: "volunteer", icon: HeartHandshake, title: "Volunteer", text: "Teach, review, translate or build" }
];

function Home() {
  useDocumentMetadata(HOME_TITLE, DEFAULT_DESCRIPTION, { absolute: true });
  const { selectedAddress } = useDeliveryLocation();

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
            // Never retry when the server says "too many requests": retrying only keeps the block going.
            if (attempt === HOME_REQUEST_RETRY_DELAYS.length || error?.response?.status === 429) {
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

  useEffect(() => {
    if (heroBanners.length <= 1) return undefined;
    const timer = setInterval(() => {
      setActiveHeroBannerIndex((current) => (current + 1) % heroBanners.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [heroBanners.length]);

  return (
    <div className="home-page">
      <h1 className="sr-only">Digital Sanskrit Guru - Premium Sanskrit Learning Store</h1>
      {isLoadingHeroBanners ? (
        <section className="home-banner home-banner-loading" aria-label="Loading homepage banner">
          <LoadingSpinner text="Loading banner..." minHeight="220px" />
        </section>
      ) : activeHeroBanner ? (
        <div className="home-banner-container">
          {activeHeroBanner.title?.trim() ? (
            /* ── Cinematic Spotlight Hero Banner Mode ────────────────────────── */
            <div className={`home-hero-spotlight-card pos-${activeHeroBanner.textPosition || "middle-left"} align-${activeHeroBanner.textAlign || (activeHeroBanner.textPosition?.includes("center") ? "center" : activeHeroBanner.textPosition?.includes("right") ? "right" : "left")} style-${activeHeroBanner.textStyle || "modern"} overlay-${activeHeroBanner.overlayType || "feathered"}`}>
              {/* Full-bleed background image */}
              <picture className="home-spotlight-backdrop-picture">
                <source media="(max-width: 768px)" srcSet={activeHeroBanner.mobileImage || activeHeroBanner.image} />
                <img
                  src={activeHeroBanner.image}
                  alt={activeHeroBanner.title || "Featured banner"}
                  className="home-spotlight-bg-img"
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                />
              </picture>

              {/* Seamless feathered cinematic overlay */}
              <div className={`home-spotlight-overlay pos-${activeHeroBanner.textPosition || "middle-left"} overlay-${activeHeroBanner.overlayType || "feathered"}`} aria-hidden="true" />

              {/* Content Layer */}
              <div className={`home-spotlight-content-layer pos-${activeHeroBanner.textPosition || "middle-left"} align-${activeHeroBanner.textAlign || (activeHeroBanner.textPosition?.includes("center") ? "center" : activeHeroBanner.textPosition?.includes("right") ? "right" : "left")}`}>
                <div className={`home-spotlight-content align-${activeHeroBanner.textAlign || (activeHeroBanner.textPosition?.includes("center") ? "center" : activeHeroBanner.textPosition?.includes("right") ? "right" : "left")} style-${activeHeroBanner.textStyle || "modern"} overlay-${activeHeroBanner.overlayType || "feathered"}`}>
                  {activeHeroBanner.badgeText?.trim() ? (
                    <div className="home-spotlight-badge-wrap">
                      <span className="home-spotlight-badge">
                        <span className="home-spotlight-badge-dot" />
                        {activeHeroBanner.badgeText}
                      </span>
                    </div>
                  ) : null}

                  <h2 className={`home-spotlight-title style-${activeHeroBanner.textStyle || "modern"}`}>{activeHeroBanner.title}</h2>

                  {activeHeroBanner.subtitle?.trim() ? (
                    <p className="home-spotlight-subtitle">{activeHeroBanner.subtitle}</p>
                  ) : null}

                  <div className="home-spotlight-actions">
                    {activeHeroBanner.productId ? (
                      <Link
                        to={
                          activeHeroBanner.productId.startsWith("/")
                            ? activeHeroBanner.productId
                            : `/product/${activeHeroBanner.productId}`
                        }
                        className="home-spotlight-btn home-spotlight-btn-primary"
                      >
                        <span>{activeHeroBanner.buttonText || "Shop now"}</span>
                        <ChevronRight size={18} strokeWidth={2.5} />
                      </Link>
                    ) : (
                      <button type="button" className="home-spotlight-btn home-spotlight-btn-primary">
                        <span>{activeHeroBanner.buttonText || "Shop now"}</span>
                        <ChevronRight size={18} strokeWidth={2.5} />
                      </button>
                    )}

                    {activeHeroBanner.secondaryButtonText?.trim() && activeHeroBanner.secondaryButtonLink?.trim() ? (
                      <Link
                        to={activeHeroBanner.secondaryButtonLink}
                        className="home-spotlight-btn home-spotlight-btn-secondary"
                      >
                        <span>{activeHeroBanner.secondaryButtonText}</span>
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Slider Navigation Arrows */}
              {heroBanners.length > 1 ? (
                <>
                  <button
                    type="button"
                    className="home-banner-nav prev"
                    onClick={(e) => { e.preventDefault(); showPreviousHeroBanner(); }}
                    aria-label="Previous banner"
                  >
                    <ChevronLeft size={44} strokeWidth={3} />
                  </button>
                  <button
                    type="button"
                    className="home-banner-nav next"
                    onClick={(e) => { e.preventDefault(); showNextHeroBanner(); }}
                    aria-label="Next banner"
                  >
                    <ChevronRight size={44} strokeWidth={3} />
                  </button>
                </>
              ) : null}
            </div>
          ) : activeHeroBanner.productId ? (
            /* ── Full-Bleed Image Mode (Linked) ──────────────────────────────── */
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
            /* ── Full-Bleed Image Mode (Static) ──────────────────────────────── */
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

      {(isRetryingHomeData || homeLoadFailed) && (
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
      )}

      <section id="home-section-top-rated" className="home-section">
        <div className="home-section-head">
          <div>
            <span className="home-section-kicker">Most trusted</span>
            <h2>Top Rated Picks</h2>
          </div>
          <Link to="/collection" className="home-inline-link">See more</Link>
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
              <h2>New Arrivals</h2>
            </div>
            <Link to="/collection" className="home-inline-link">See more</Link>
          </div>
          <div className="home-mini-grid home-desktop-only">
            {isLoadingProducts ? (
              <LoadingSpinner text="Loading new arrivals..." minHeight="160px" />
            ) : (
              newArrivals.map((product) => (
                <Link key={product._id} to={`/product/${product._id}`} className="home-mini-card">
                  <div className="home-mini-card-image-wrap">
                    {product.image && (
                      <div
                        className="home-mini-card-ambient-bg"
                        style={{ backgroundImage: `url(${product.image})` }}
                        aria-hidden="true"
                      />
                    )}
                    <img
                      src={product.image || "https://picsum.photos/220"}
                      alt={product.name}
                      className="home-mini-card-main-img"
                      width="220"
                      height="130"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <div className="home-mini-card-meta">
                    <span>{getCategoryLabel(product)}</span>
                    <span>{formatPrice(getDisplayPrice(product, selectedAddress?.country))}</span>
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
              <h2>Budget Picks</h2>
            </div>
            <Link to="/collection" className="home-inline-link">See more</Link>
          </div>
          <div className="home-mini-grid home-desktop-only">
            {isLoadingProducts ? (
              <LoadingSpinner text="Loading budget picks..." minHeight="160px" />
            ) : (
              budgetPicks.map((product) => (
                <Link key={product._id} to={`/product/${product._id}`} className="home-mini-card">
                  <div className="home-mini-card-image-wrap">
                    {product.image && (
                      <div
                        className="home-mini-card-ambient-bg"
                        style={{ backgroundImage: `url(${product.image})` }}
                        aria-hidden="true"
                      />
                    )}
                    <img
                      src={product.image || "https://picsum.photos/220"}
                      alt={product.name}
                      className="home-mini-card-main-img"
                      width="220"
                      height="130"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <div className="home-mini-card-meta">
                    <span>{getCategoryLabel(product)}</span>
                    <span>{formatPrice(getDisplayPrice(product, selectedAddress?.country))}</span>
                  </div>
                  <strong>{product.name}</strong>
                  <span>
                    {product?.isDigital === true
                      ? (product.externalAccessManual === true
                          ? "Access within 24–48 hours"
                          : isKindleProduct(product)
                          ? "Sold on Amazon Kindle"
                          : "Instant digital access")
                      : Number(product?.stock || 0) > 0
                      ? "In stock now"
                      : "Currently unavailable"}
                  </span>
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
              <Link to="/collection" className="home-inline-link">See more</Link>
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

              <div ref={festiveRef} className="home-spotlight-row">
                {isLoadingProducts ? (
                  <LoadingSpinner text="Loading festive offers..." minHeight="180px" />
                ) : festiveOfferProducts.length > 0 ? (
                  festiveOfferProducts.map((product) => (
                    <div key={product._id} className="home-spotlight-item">
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
            <Link to="/collection" className="home-inline-link">See more</Link>
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

            <div ref={bundleRef} className="home-spotlight-row">
              {isLoadingProducts ? (
                <LoadingSpinner text="Loading bundle deals..." minHeight="180px" />
              ) : bundleProducts.length > 0 ? (
                bundleProducts.map((product) => (
                  <div key={product._id} className="home-spotlight-item">
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

      <DeferredHomeSection isReady={showSecondarySections} skeletonCount={4} label="Loading AI recommendations">
        <RecommendedForYou className="home-deferred-section" />
      </DeferredHomeSection>

      <DeferredHomeSection isReady={showSecondarySections} skeletonCount={5} label="Loading catalog preview">
        <section ref={catalogRef} className="home-section home-deferred-section">
          <div className="home-section-head home-section-head-catalog">
            <div>
              <span className="home-section-kicker">Catalog</span>
              <h2>Browse the Collection</h2>
            </div>
            <Link to="/collection" className="home-inline-link">See more</Link>
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

            <div ref={catalogPreviewRef} className="home-spotlight-row">
              {isLoadingProducts ? (
                <LoadingSpinner text="Loading collection..." minHeight="180px" />
              ) : catalogPreviewProducts.length > 0 ? (
                catalogPreviewProducts.map((product) => (
                  <div key={product._id} className="home-spotlight-item">
                    <ProductCard product={product} showDescription={false} variant="home" />
                  </div>
                ))
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

      <DeferredHomeSection isReady={showSecondarySections} skeletonCount={2} label="Loading support section">
        <section className="home-section home-deferred-section home-support-section" aria-labelledby="home-support-title">
          <div className="home-support-copy">
            <span className="home-section-kicker">Sponsors & Partners</span>
            <h2 id="home-support-title">
              <HandHeart size={28} aria-hidden="true" className="home-support-title-icon" />
              Support Digital Sanskrit Guru
            </h2>
            <p>
              We are looking for sponsors, institutions and volunteers who share our love for Sanskrit.
              If you would like to help, we would love to hear from you.
            </p>
            <Link to="/support-us" className="home-support-cta-btn">
              Support us
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>

          <ul className="home-support-ways" aria-label="Ways to support">
            {SUPPORT_WAYS.map((way) => {
              const Icon = way.icon;
              return (
                <li key={way.type}>
                  <Link to={`/support-us?type=${way.type}`} className="home-support-way">
                    <span className="home-support-way-icon" aria-hidden="true"><Icon size={22} /></span>
                    <span className="home-support-way-text">
                      <strong>{way.title}</strong>
                      <span>{way.text}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </DeferredHomeSection>
    </div>
  );
}

export default Home;
