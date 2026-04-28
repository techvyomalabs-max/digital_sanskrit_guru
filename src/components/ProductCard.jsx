import { Link } from "react-router-dom";
import { useWishlist } from "../hooks/useWishlist";
import { formatCurrencyForUser } from "../utils/currency";
import "./ProductCard.css";

function ProductCard({ product, showDescription = true, variant = "default" }) {
  const { wishlist, addToWishlist, removeFromWishlist } = useWishlist();

  const reviews = Array.isArray(product?.reviews) ? product.reviews : [];
  const reviewCount = reviews.length;
  const averageFromReviews =
    reviewCount > 0
      ? reviews.reduce((sum, r) => sum + Number(r?.rating || 0), 0) / reviewCount
      : 0;
  const displayRating = Number(product?.rating || averageFromReviews || 0);
  const roundedStars = Math.max(0, Math.min(5, Math.round(displayRating)));

  const isWishlisted = wishlist.some((p) => p._id === product._id);

  const handleWishlistToggle = () => {
    if (isWishlisted) {
      removeFromWishlist(product._id);
    } else {
      addToWishlist(product);
    }
  };

  const cardClassName = `product-card${variant === "home" ? " product-card-home" : ""}${
    variant === "search" ? " product-card-search" : ""
  }`;

  return (
    <div className={cardClassName}>
      {reviewCount > 5 && <span className="product-badge">Best Seller</span>}
      <button
        type="button"
        className={`wishlist-heart-btn ${isWishlisted ? "active" : ""}`}
        onClick={handleWishlistToggle}
        aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
      >
        {isWishlisted ? "\u2665" : "\u2661"}
      </button>

      <Link to={`/product/${product._id}`} className="product-image-wrap">
        <img src={product.image || "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNiIgZmlsbD0iIzk5OTk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg=="} alt={product.name} loading="lazy" />
      </Link>

      <div className="product-info">
        <p className="product-category">{product.category || "General"}</p>

        <Link to={`/product/${product._id}`} className="product-title-link">
          <h3 className="product-title">{product.name}</h3>
        </Link>

        {showDescription && (
          <p className="product-description">
            {product.description || "Authentic learning material from Digital Sanskrit Guru."}
          </p>
        )}

        <div className="price-box">
          <span className="discount-price">{formatCurrencyForUser(product.price)}</span>
          <span className="original-price">{formatCurrencyForUser(Number(product.price || 0) + 500)}</span>
        </div>

        <p className="product-rating">
          {"\u2605".repeat(roundedStars)}
          {"\u2606".repeat(5 - roundedStars)}
          <span className="product-rating-meta">
            {" "}
            ({displayRating.toFixed(1)}){" "}
            {reviewCount > 0
              ? `| ${reviewCount} review${reviewCount > 1 ? "s" : ""}`
              : "| No reviews"}
          </span>
        </p>

        <div className="product-actions">
          <Link to={`/product/${product._id}`}>
            <button className="product-cta">View Product</button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ProductCard;
