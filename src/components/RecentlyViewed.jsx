import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ProductCard from "./ProductCard";
import "./RecentlyViewed.css";

function RecentlyViewed({ className = "" }) {
  const [products, setProducts] = useState([]);
  const sliderRef = useRef(null);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("recentProducts")) || [];
    setProducts(stored);
  }, []);

  const clearRecentlyViewed = () => {
    localStorage.removeItem("recentProducts");
    setProducts([]);
  };

  const scrollRow = (direction) => {
    if (!sliderRef.current) return;
    const distance = sliderRef.current.clientWidth * 0.75;
    sliderRef.current.scrollBy({
      left: distance * direction,
      behavior: "smooth"
    });
  };

  if (products.length === 0) return null;

  return (
    <section className={`home-section recent-section ${className}`.trim()}>
      <div className="home-section-head">
        <div>
          <span className="home-section-kicker">Jump back in</span>
          <h2>Recently Viewed</h2>
        </div>
        <button
          type="button"
          className="home-inline-link recent-clear-inline-btn"
          onClick={clearRecentlyViewed}
        >
          Clear all
        </button>
      </div>

      <div className="home-slider-wrapper">
        {products.length > 3 ? (
          <button
            type="button"
            className="home-slider-arrow left"
            onClick={() => scrollRow(-1)}
            aria-label="Previous recently viewed products"
          >
            <ChevronLeft size={52} strokeWidth={3.5} />
          </button>
        ) : null}

        <div ref={sliderRef} className="home-spotlight-row recent-grid">
          {products.map((p) => (
            <div key={p._id} className="home-spotlight-item">
              <ProductCard product={p} showDescription={false} variant="home" />
            </div>
          ))}
        </div>

        {products.length > 3 ? (
          <button
            type="button"
            className="home-slider-arrow right"
            onClick={() => scrollRow(1)}
            aria-label="Next recently viewed products"
          >
            <ChevronRight size={52} strokeWidth={3.5} />
          </button>
        ) : null}
      </div>
    </section>
  );
}

export default RecentlyViewed;
