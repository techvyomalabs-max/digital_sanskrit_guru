import { Link } from "react-router-dom";
import { Trash2, ShoppingCart, ArrowLeft } from "lucide-react";
import { useWishlist } from "../hooks/useWishlist";
import { useCart } from "../hooks/useCart";
import { useToast } from "../hooks/useToast";
import { formatCurrencyExact, formatResolvedPrice } from "../utils/currency";
import { getProductPriceDetails } from "../utils/productPricing";
import LoadingSpinner from "../components/common/LoadingSpinner";
import "./Wishlist.css";

function Wishlist() {
  const { wishlist, isLoadingWishlist, removeFromWishlist } = useWishlist();
  const { addToCart } = useCart();
  const { showToast } = useToast();

  const handleRemove = (productId) => {
    removeFromWishlist(productId);
    showToast("Removed from wishlist");
  };

  const handleAddToCart = async (product) => {
    try {
      await addToCart(product, 1);
      // useCart already displays the toast notification
    } catch (err) {
      showToast(err?.message || "Failed to add to cart", "error");
    }
  };

  return (
    <div className="wishlist-page">
      <section className="wishlist-shell">
        <div className="wishlist-header-row">
          <div className="wishlist-title-area">
            <h1>My Wishlist</h1>
            <p>
              {isLoadingWishlist
                ? "Loading your wishlist..."
                : `You have ${wishlist.length} item${wishlist.length !== 1 ? "s" : ""} saved in your wishlist.`}
            </p>
          </div>
          <Link to="/collection" className="wishlist-back-link">
            <ArrowLeft size={16} /> Continue Shopping
          </Link>
        </div>

        {isLoadingWishlist ? (
          <LoadingSpinner text="Loading saved items..." minHeight="260px" />
        ) : wishlist.length > 0 ? (
          <div className="wishlist-list-container">
            {/* Header row (Desktop only) */}
            <div className="wishlist-list-header">
              <div className="col-product">Product</div>
              <div className="col-price">Price</div>
              <div className="col-stock">Stock Status</div>
              <div className="col-actions"></div>
            </div>

            {/* List items */}
            <div className="wishlist-list-items">
              {wishlist.map((product) => {
                const pricing = getProductPriceDetails(product);
                const displayPrice = Number(pricing.price || 0);
                const displayCurrency = pricing.currency || "INR";
                const isBundle =
                  String(product?.productType || "single") === "bundle" ||
                  (Array.isArray(product?.bundleItems) && product.bundleItems.length > 0);
                const isOutOfStock = product?.stock !== undefined && Number(product.stock) <= 0;

                // Original/list price calculation matching ProductCard
                const festiveDiscountPercent = Math.min(95, Math.max(0, Number(product?.festiveDiscountPercent || 0)));
                const hasActiveMarketSale = pricing.priceType === "international-market-sale" && Number(pricing.marketRegularPrice || 0) > displayPrice;
                const festiveOriginalPrice = product?.festiveOffer === true && festiveDiscountPercent > 0
                  ? Math.round(displayPrice / (1 - festiveDiscountPercent / 100))
                  : displayPrice;
                const fallbackOriginalPrice = Math.round(displayPrice * 1.1 * 100) / 100;
                
                const listPrice = hasActiveMarketSale
                  ? Number(pricing.marketRegularPrice)
                  : festiveOriginalPrice > displayPrice
                    ? festiveOriginalPrice
                    : fallbackOriginalPrice;

                return (
                  <div key={product._id} className="wishlist-item-row">
                    {/* Column 1: Image & Details */}
                    <div className="wishlist-item-cell col-product">
                      <div className="wishlist-item-product-info">
                        <Link to={`/product/${product._id}`} className="wishlist-item-image-wrap">
                          <img
                            src={product.image || "https://picsum.photos/120"}
                            alt={product.name}
                            loading="lazy"
                            decoding="async"
                          />
                        </Link>
                        <div className="wishlist-item-details">
                          <span className="wishlist-item-category">
                            {product?.category || "Sanskrit Item"}
                          </span>
                          <Link to={`/product/${product._id}`} className="wishlist-item-title">
                            {product.name}
                          </Link>
                          {isBundle && <span className="wishlist-bundle-badge">Bundle</span>}
                        </div>
                      </div>
                    </div>

                    {/* Column 2: Price */}
                    <div className="wishlist-item-cell col-price" data-label="Price">
                      <div className="wishlist-price-wrap">
                        <span className="wishlist-current-price">
                          {formatResolvedPrice(pricing)}
                        </span>
                        {listPrice > displayPrice && (
                          <span className="wishlist-original-price">
                            {formatCurrencyExact(listPrice, displayCurrency)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Column 3: Stock Status */}
                    <div className="wishlist-item-cell col-stock" data-label="Stock">
                      <span className={`wishlist-stock-badge ${isOutOfStock ? "out-of-stock" : "in-stock"}`}>
                        {isOutOfStock ? "Out of Stock" : "In Stock"}
                      </span>
                    </div>

                    {/* Column 4: Action Buttons */}
                    <div className="wishlist-item-cell col-actions" data-label="">
                      <div className="wishlist-action-buttons">
                        <button
                          type="button"
                          className="wishlist-add-to-cart-btn"
                          disabled={isOutOfStock}
                          onClick={() => handleAddToCart(product)}
                          aria-label="Add to cart"
                        >
                          <ShoppingCart size={16} /> Add to Cart
                        </button>
                        <button
                          type="button"
                          className="wishlist-remove-btn"
                          onClick={() => handleRemove(product._id)}
                          aria-label="Remove from wishlist"
                          title="Remove item"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="wishlist-empty-state">
            <div className="wishlist-empty-icon">❤️</div>
            <h2>Your wishlist is empty</h2>
            <p>Save products from the catalog to compare and buy them later.</p>
            <Link to="/collection" className="wishlist-shop-btn">
              Explore Store
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

export default Wishlist;
