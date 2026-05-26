import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatResolvedPrice } from "../utils/currency";
import { getProductPriceDetails } from "../utils/productPricing";
import "./RecentlyViewed.css";

function RecentlyViewed({ className = "" }) {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("recentProducts")) || [];
    setProducts(stored);
  }, []);

  const clearRecentlyViewed = () => {
    localStorage.removeItem("recentProducts");
    setProducts([]);
  };

  if (products.length === 0) return null;

  return (
    <section className={`recent-section ${className}`.trim()}>
      <div className="recent-header">
        <div>
          <h2>Recently Viewed</h2>
          <p>Jump back into products you explored recently.</p>
        </div>
        <button className="recent-clear-btn" onClick={clearRecentlyViewed}>
          Clear
        </button>
      </div>
      <div className="recent-grid">
        {products.map((p) => (
          <div key={p._id} className="recent-card">
            <img src={p.image || "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNiIgZmlsbD0iIzk5OTk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg=="} alt={p.name} loading="lazy" />
            <h4>{p.name}</h4>
            <span className="recent-caption">Viewed recently</span>
            <p>{formatResolvedPrice(getProductPriceDetails(p))}</p>
            <Link to={`/product/${p._id}`}>
              <button className="view-btn">View</button>
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

export default RecentlyViewed;
