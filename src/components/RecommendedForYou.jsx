import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles, Lightbulb } from "lucide-react";
import axios from "axios";
import ProductCard from "./ProductCard";
import { getAIRecommendations, getRecentSearchQueries } from "../utils/recommendationEngine";
import { useWishlist } from "../hooks/useWishlist";
import { useCart } from "../hooks/useCart";
import "./RecentlyViewed.css";
import "./RecommendedForYou.css";

function RecommendedForYou({ className = "", initialProducts = [] }) {
  const [catalog, setCatalog] = useState(initialProducts);
  const [viewedHistory, setViewedHistory] = useState([]);
  const { wishlist } = useWishlist();
  const { cartItems } = useCart();
  const sliderRef = useRef(null);

  // Load user's browsing history from localStorage
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("recentProducts")) || [];
      setViewedHistory(stored);
    } catch {
      setViewedHistory([]);
    }
  }, []);

  // Fetch catalog products if not provided
  useEffect(() => {
    if (initialProducts.length > 0) {
      setCatalog(initialProducts);
      return;
    }

    let active = true;
    axios
      .get("/api/products")
      .then((res) => {
        if (active && Array.isArray(res.data)) {
          setCatalog(res.data);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [initialProducts]);

  // Compute AI recommendations based on user history, searches, wishlist, and cart
  const recommendations = useMemo(() => {
    if (catalog.length === 0) return [];

    const searchQueries = getRecentSearchQueries();
    return getAIRecommendations(
      catalog,
      {
        viewedProducts: viewedHistory,
        searchQueries,
        cartItems,
        wishlist
      },
      { limit: 8 }
    );
  }, [catalog, viewedHistory, wishlist, cartItems]);

  const scrollRow = (direction) => {
    if (!sliderRef.current) return;
    const distance = sliderRef.current.clientWidth * 0.75;
    sliderRef.current.scrollBy({
      left: distance * direction,
      behavior: "smooth"
    });
  };

  if (recommendations.length === 0) return null;

  return (
    <section className={`home-section recommended-ai-section ${className}`.trim()}>
      <div className="home-section-head">
        <div>
          <span className="recommended-ai-badge">
            <Sparkles size={13} aria-hidden="true" />
            AI Personalized Picks
          </span>
          <h2>Recommended For You</h2>
          <p className="home-section-subtitle">
            {viewedHistory.length > 0
              ? "Tailored based on your recent Sanskrit browsing & learning history"
              : "Top trending study recommendations for Sanskrit enthusiasts"}
          </p>
        </div>
      </div>

      <div className="home-slider-wrapper">
        {recommendations.length > 3 ? (
          <button
            type="button"
            className="home-slider-arrow left"
            onClick={() => scrollRow(-1)}
            aria-label="Previous recommended products"
          >
            <ChevronLeft size={52} strokeWidth={3.5} />
          </button>
        ) : null}

        <div ref={sliderRef} className="home-spotlight-row recent-grid">
          {recommendations.map((p) => (
            <div key={p._id || p.id} className="home-spotlight-item recommended-ai-item">
              {p._recommendationReason && (
                <div className="recommended-ai-reason" title={p._recommendationReason}>
                  <span className="recommended-ai-reason-icon" aria-hidden="true"><Lightbulb size={15} /></span>
                  <span>{p._recommendationReason}</span>
                </div>
              )}
              <ProductCard product={p} showDescription={false} variant="home" />
            </div>
          ))}
        </div>

        {recommendations.length > 3 ? (
          <button
            type="button"
            className="home-slider-arrow right"
            onClick={() => scrollRow(1)}
            aria-label="Next recommended products"
          >
            <ChevronRight size={52} strokeWidth={3.5} />
          </button>
        ) : null}
      </div>
    </section>
  );
}

export default RecommendedForYou;
