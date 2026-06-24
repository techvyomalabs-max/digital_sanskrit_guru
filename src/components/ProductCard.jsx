import { useState } from "react";
import { Link } from "react-router-dom";
import { useWishlist } from "../hooks/useWishlist";
import { formatCurrencyExact, formatResolvedPrice } from "../utils/currency";
import { getProductPriceDetails } from "../utils/productPricing";
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
  const pricing = getProductPriceDetails(product);
  const displayPrice = Number(pricing.price || 0);
  const displayCurrency = pricing.currency || "INR";
  const isFestiveOffer = product?.festiveOffer === true;
  const festiveDiscountPercent = Math.min(95, Math.max(0, Number(product?.festiveDiscountPercent || 0)));
  const isBundle =
    String(product?.productType || "single") === "bundle" ||
    (Array.isArray(product?.bundleItems) && product.bundleItems.length > 0);
  const bundleItems = Array.isArray(product?.bundleItems) ? product.bundleItems : [];
  const bundleOriginalTotal = bundleItems.reduce((sum, item) => {
    const bundledProduct = item?.product;
    return sum + Number(getProductPriceDetails(bundledProduct).price || 0) * Math.max(1, Number(item?.quantity || 1));
  }, 0);
  const bundleSavings = Math.max(0, bundleOriginalTotal - displayPrice);
  const marketRegularPrice = Number(pricing.marketRegularPrice || 0);
  const hasActiveMarketSale =
    pricing.priceType === "international-market-sale" &&
    marketRegularPrice > displayPrice;
  const festiveOriginalPrice =
    isFestiveOffer && festiveDiscountPercent > 0
      ? Math.round(displayPrice / (1 - festiveDiscountPercent / 100))
      : 0;
  const festiveSavings = Math.max(0, festiveOriginalPrice - displayPrice);
  const fallbackOriginalPrice = Math.round(displayPrice * 1.1 * 100) / 100;
  const listPrice = hasActiveMarketSale
    ? marketRegularPrice
    : isBundle && bundleOriginalTotal > displayPrice
      ? bundleOriginalTotal
      : festiveOriginalPrice > displayPrice
        ? festiveOriginalPrice
        : fallbackOriginalPrice;

  const [copied, setCopied] = useState(false);

  const handleWishlistToggle = () => {
    if (isWishlisted) {
      removeFromWishlist(product._id);
    } else {
      addToWishlist(product);
    }
  };

  const handleShare = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const shareUrl = `${window.location.origin}/#/product/${product._id}`;
    if (navigator.share) {
      navigator.share({
        title: product.name,
        text: product.description || `Check out ${product.name} on Digital Sanskrit Guru!`,
        url: shareUrl
      }).catch((err) => console.log("Sharing failed", err));
    } else {
      navigator.clipboard.writeText(shareUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch((err) => console.error("Failed to copy link", err));
    }
  };

  const cardClassName = `product-card${variant === "home" ? " product-card-home" : ""}${
    variant === "search" ? " product-card-search" : ""
  }`;

  return (
    <div className={cardClassName}>
      {isFestiveOffer ? (
        <span className="product-badge festive">
          {festiveDiscountPercent > 0 ? `${festiveDiscountPercent}% OFF` : "Festive Offer"}
        </span>
      ) : null}
      {!isFestiveOffer && isBundle ? <span className="product-badge bundle">Bundle</span> : null}
      {reviewCount > 5 && <span className="product-badge">Best Seller</span>}
      <button
        type="button"
        className="share-product-btn"
        onClick={handleShare}
        aria-label="Share product"
        title="Share Product"
      >
        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
      </button>
      <button
        type="button"
        className={`wishlist-heart-btn ${isWishlisted ? "active" : ""}`}
        onClick={handleWishlistToggle}
        aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2.5" fill={isWishlisted ? "currentColor" : "none"} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>
      {copied && <span className="share-tooltip">Link copied!</span>}

      <Link to={`/product/${product._id}`} className="product-image-wrap">
        <img
          src={product.image || "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNiIgZmlsbD0iIzk5OTk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg=="}
          alt={product.name}
          width="300"
          height="200"
          loading="lazy"
          decoding="async"
        />
      </Link>

      <div className="product-info">
        <p className="product-category">{product.category || "General"}</p>

        <Link to={`/product/${product._id}`} className="product-title-link" title={product.name}>
          <h3 className="product-title">{product.name}</h3>
        </Link>

        {showDescription && (
          <p className="product-description">
            {product.description || "Authentic learning material from Digital Sanskrit Guru."}
          </p>
        )}

        <div className="price-box">
          <span className="discount-price">{formatResolvedPrice(pricing)}</span>
          <span className="original-price">
            {formatCurrencyExact(listPrice, displayCurrency)}
          </span>
        </div>

        {isFestiveOffer && festiveSavings > 0 ? (
          <div className="product-festive-savings">
            <span>Festive deal</span>
            <strong>Save {formatCurrencyExact(festiveSavings, displayCurrency)}</strong>
          </div>
        ) : null}

        {isBundle && bundleOriginalTotal > displayPrice ? (
          <div className="product-bundle-savings">
            <span>Individual total {formatCurrencyExact(bundleOriginalTotal, displayCurrency)}</span>
            <strong>Save {formatCurrencyExact(bundleSavings, displayCurrency)}</strong>
          </div>
        ) : null}

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
