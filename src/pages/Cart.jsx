import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useAuth } from "../hooks/useAuth";
import { useCart } from "../hooks/useCart";
import { useWishlist } from "../hooks/useWishlist";
import { useDeliveryLocation } from "../hooks/useDeliveryLocation";
import { convertCurrencyAmount, formatCurrencyExact, formatResolvedPrice } from "../utils/currency";
import { getDeliveryPricingDetails, isDigitalItem } from "../utils/deliveryPricing";
import { getProductPriceDetails, isInternationalCountry, storePricingConfig } from "../utils/productPricing";
import LoadingSpinner from "../components/common/LoadingSpinner";
import {
  ShoppingBag,
  ArrowRight,
  ArrowLeft,
  LogIn,
  Heart,
  Package,
  BookOpen,
  Sparkles,
  ShieldCheck,
  Truck,
  Zap,
  Star,
  Compass,
  Grid,
  Trash2,
  Lock,
  CreditCard,
  CheckCircle2,
  Minus,
  Plus
} from "lucide-react";
import "./Cart.css";

const getItemHsnSac = (item) => {
  if (item?.hsnSac) return String(item.hsnSac).trim();
  const name = String(item?.name || item?.product?.name || "").trim().toLowerCase();
  const category = String(item?.category || item?.product?.category || "").trim().toLowerCase();
  
  // E-books, Kindle books, Web versions, and Digital formats are taxed at 18% GST
  const isDigital = 
    category.includes("ebook") ||
    category.includes("e-book") ||
    category.includes("kindle") ||
    category.includes("web version") ||
    category.includes("web-version") ||
    category.includes("flipbook") ||
    name.includes("ebook") ||
    name.includes("e-book") ||
    name.includes("kindle") ||
    name.includes("web version") ||
    name.includes("web-version") ||
    name.includes("flipbook") ||
    name.includes("epub") ||
    name.includes("pdf");
    
  if (isDigital) {
    return "9973"; // Digital products/services (18% GST)
  }

  // Exempt printed books: category or name based check (HSN Chapter 49)
  const isPrintedBook = 
    category.includes("book") ||
    category.includes("sanskrit") ||
    category.includes("gita") ||
    category.includes("scriptures") ||
    category.includes("grammar") ||
    category.includes("dharma") ||
    category.includes("paperback") ||
    name.includes("book") ||
    name.includes("volume") ||
    name.includes("vol.") ||
    name.includes("hardcover") ||
    name.includes("paperback");
    
  return isPrintedBook ? "4901" : "8523";
};

function CartQtyInput({ item, currentQty, updateQty }) {
  const [localVal, setLocalVal] = useState(currentQty);

  useEffect(() => {
    setLocalVal(currentQty);
  }, [currentQty]);

  const isBulk = String(item.productType || item.product?.productType || "").toLowerCase() === "bulk";
  const isDigital = isDigitalItem(item);

  if (isDigital) {
    return (
      <div className="cart-digital-pill">
        <Zap size={12} />
        <span>Qty: 1 (Digital License)</span>
      </div>
    );
  }

  if (isBulk) {
    return (
      <div className="cart-bulk-select-wrap">
        <select
          value={currentQty}
          onChange={(e) => updateQty(item._id || item.id, Number(e.target.value))}
          className="cart-bulk-select"
          aria-label="Bulk quantity selection"
        >
          {[10, 20, 30, 40, 50, 100].map((num) => (
            <option key={num} value={num} disabled={item.stock > 0 && num > item.stock}>
              {num} copies
            </option>
          ))}
        </select>
      </div>
    );
  }

  const handleChange = (e) => {
    const val = e.target.value;
    setLocalVal(val);
    if (val !== "") {
      const num = parseInt(val, 10);
      if (!isNaN(num) && num >= 1) {
        updateQty(item._id || item.id, Math.min(item.stock || 100, num));
      }
    }
  };

  const handleBlur = () => {
    const num = parseInt(localVal, 10);
    if (localVal === "" || isNaN(num) || num < 1) {
      setLocalVal(1);
      updateQty(item._id || item.id, 1);
    }
  };

  return (
    <div className="cart-qty-stepper">
      <button
        type="button"
        className="cart-qty-btn minus"
        disabled={Number(localVal) <= 1}
        onClick={() => {
          const nextQty = Math.max(1, Number(localVal || 1) - 1);
          setLocalVal(nextQty);
          updateQty(item._id || item.id, nextQty);
        }}
        aria-label="Decrease quantity"
      >
        <Minus size={13} />
      </button>
      <input
        type="number"
        className="cart-qty-input-field"
        value={localVal}
        min="1"
        max={item.stock || 100}
        onChange={handleChange}
        onBlur={handleBlur}
        aria-label="Item quantity"
      />
      <button
        type="button"
        className="cart-qty-btn plus"
        disabled={item.stock ? Number(localVal) >= item.stock : false}
        onClick={() => {
          const maxStock = item.stock || 100;
          const nextQty = Math.min(maxStock, Number(localVal || 1) + 1);
          setLocalVal(nextQty);
          updateQty(item._id || item.id, nextQty);
        }}
        aria-label="Increase quantity"
      >
        <Plus size={13} />
      </button>
    </div>
  );
}

function EmptyCartView({ user, wishlist = [] }) {
  const isGuest = !user;

  const quickCategories = [
    { label: "Paperback Books", category: "Book - Paperback", icon: BookOpen },
    { label: "Web Versions", category: "Web Version", icon: Compass },
    { label: "Flipbooks & E-Books", category: "Flipbook", icon: Grid },
    { label: "Bundles & Combos", category: "Bundle", icon: Package },
    { label: "Top Rated Picks", route: "/?scrollTo=top-rated", icon: Star }
  ];

  const perks = [
    {
      icon: Zap,
      title: "Instant Digital Access",
      desc: "Get immediate access to web versions and digital flipbooks on any device."
    },
    {
      icon: Truck,
      title: "Worldwide Tracked Shipping",
      desc: "Fast and reliable door delivery for all physical books and Sanskrit study kits."
    },
    {
      icon: ShieldCheck,
      title: "100% Authentic Literature",
      desc: "Original Sanskrit texts, verified commentaries, and expert learning material."
    }
  ];

  return (
    <div className="cart-empty-container">
      <div className="cart-empty-hero-card">
        <div className="cart-empty-icon-ring">
          <div className="cart-empty-icon-circle">
            <ShoppingBag size={38} className="cart-empty-icon" />
          </div>
          <span className="cart-empty-icon-sparkle">
            <Sparkles size={16} />
          </span>
        </div>

        <div className="cart-empty-badge">
          <Sparkles size={13} />
          <span>
            {isGuest
              ? "New to Digital Sanskrit Guru?"
              : `Welcome back, ${user?.name || "Member"}!`}
          </span>
        </div>

        <h2 className="cart-empty-title">
          {isGuest
            ? "Your shopping cart is empty"
            : "Your cart is waiting for your next read"}
        </h2>

        <p className="cart-empty-desc">
          {isGuest
            ? "Explore our curated collection of authentic Sanskrit books, interactive web versions, flipbooks, and comprehensive study bundles."
            : "You don't have any items in your cart right now. Pick up where you left off from your wishlist or discover our latest arrivals."}
        </p>

        <div className="cart-empty-actions">
          <Link to="/collection" className="cart-empty-primary-btn">
            <ShoppingBag size={18} />
            <span>{isGuest ? "Browse All Products" : "Explore Collection"}</span>
            <ArrowRight size={16} />
          </Link>

          {isGuest ? (
            <Link to="/login?redirect=/cart" className="cart-empty-secondary-btn">
              <LogIn size={17} />
              <span>Sign in to see saved cart</span>
            </Link>
          ) : (
            <>
              {wishlist.length > 0 && (
                <Link to="/wishlist" className="cart-empty-secondary-btn">
                  <Heart size={17} style={{ color: "#e11d48" }} />
                  <span>View Wishlist ({wishlist.length})</span>
                </Link>
              )}
              <Link to="/my-orders" className="cart-empty-secondary-btn">
                <Package size={17} />
                <span>Your Orders</span>
              </Link>
            </>
          )}
        </div>

        {/* Quick Categories Bar */}
        <div className="cart-empty-categories-wrap">
          <span className="cart-empty-categories-label">Explore by category</span>
          <div className="cart-empty-categories-pills">
            {quickCategories.map((item) => {
              const IconComp = item.icon;
              const targetUrl = item.route || `/collection?category=${encodeURIComponent(item.category)}`;
              return (
                <Link key={item.label} to={targetUrl} className="cart-empty-category-pill">
                  <IconComp size={14} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Trust & Value Perks */}
      <div className="cart-empty-perks-grid">
        {perks.map((perk) => {
          const PerkIcon = perk.icon;
          return (
            <div key={perk.title} className="cart-empty-perk-card">
              <div className="cart-empty-perk-icon-wrap">
                <PerkIcon size={20} />
              </div>
              <div className="cart-empty-perk-copy">
                <h4>{perk.title}</h4>
                <p>{perk.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Cart() {
  const { user } = useAuth();
  const { wishlist } = useWishlist();
  const {
    cartItems,
    savedForLaterItems,
    isLoadingCart,
    removeFromCart,
    updateQty,
    saveForLater,
    moveToCartFromSaved,
    removeSavedForLater
  } = useCart();
  const [removingId, setRemovingId] = useState(null);
  const { selectedAddress } = useDeliveryLocation();
  const getItemUnitPrice = (item) => Number(getProductPriceDetails(item, selectedAddress?.country).price || 0);
  const displayCurrency =
    cartItems.length > 0
      ? String(getProductPriceDetails(cartItems[0], selectedAddress?.country).currency || "INR")
      : "INR";
  const [charges, setCharges] = useState({
    gstPercent: 0,
    deliveryCharge: 0,
    warehouseLocation: {},
    distancePricing: {}
  });

  const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

  const itemCount = cartItems.reduce(
    (sum, item) => sum + Math.max(1, Number(item.quantity || 1)),
    0
  );

  useEffect(() => {
    let active = true;
    axios
      .get("/api/settings/public")
      .then((res) => {
        if (!active) return;
        storePricingConfig({
          pricingMarkets: res.data?.pricingMarkets || [],
          internationalPricingDefaults: res.data?.internationalPricingDefaults || {},
          currencyConversionRates: res.data?.currencyConversionRates || {}
        });
        setCharges({
          gstPercent: Number(res.data?.gstPercent || 0),
          deliveryCharge: Number(res.data?.deliveryCharge || 0),
          warehouseLocation: res.data?.warehouseLocation || {},
          distancePricing: res.data?.distancePricing || {},
          internationalDelivery: res.data?.internationalDelivery || {}
        });
      })
      .catch(() => {
        if (!active) return;
        setCharges({ gstPercent: 0, deliveryCharge: 0, warehouseLocation: {}, distancePricing: {}, internationalDelivery: {} });
      });
    return () => {
      active = false;
    };
  }, []);

  const deliveryDetails = useMemo(
    () => getDeliveryPricingDetails(charges, selectedAddress, cartItems),
    [charges, selectedAddress, cartItems]
  );

  const totals = useMemo(() => {
    const isInternational = isInternationalCountry(selectedAddress?.country);
    const defaultGstPercent = isInternational ? 0 : Number(charges.gstPercent || 0);
    let totalItemBase = 0;
    let totalItemGst = 0;

    cartItems.forEach((item) => {
      const qty = Math.max(1, Number(item.quantity || 1));
      const price = getItemUnitPrice(item);
      const lineTotal = qty * price;

      if (isInternational) {
        totalItemBase += lineTotal;
        return;
      }

      const hsnSac = getItemHsnSac(item);
      const gstRate = hsnSac === "4901" ? 0 : defaultGstPercent;
      const lineBase = Math.round((lineTotal / (1 + gstRate / 100)) * 100) / 100;
      const itemGst = Math.round((lineTotal - lineBase) * 100) / 100;

      totalItemBase += lineBase;
      totalItemGst += itemGst;
    });

    const cartSubtotal = roundMoney(totalItemBase);
    const gstAmount = roundMoney(totalItemGst);
    const deliveryCharge = roundMoney(
      convertCurrencyAmount(Number(deliveryDetails.deliveryCharge || 0), {
        sourceCurrency: "INR",
        currency: displayCurrency
      })
    );

    return {
      subtotal: cartSubtotal,
      gstAmount,
      deliveryCharge,
      grandTotal: roundMoney(cartSubtotal + gstAmount + deliveryCharge),
      isInternational
    };
  }, [cartItems, charges.gstPercent, deliveryDetails.deliveryCharge, displayCurrency, selectedAddress?.country]);

  const hasPhysicalItems = useMemo(
    () => cartItems.some((item) => !isDigitalItem(item)),
    [cartItems]
  );

  const isIntlPhysicalRestricted = useMemo(() => {
    const isInternational = isInternationalCountry(selectedAddress?.country);
    const intlDeliveryEnabled = charges?.internationalDelivery?.enabled === true;
    return isInternational && !intlDeliveryEnabled && hasPhysicalItems;
  }, [selectedAddress?.country, charges?.internationalDelivery?.enabled, hasPhysicalItems]);

  if (isLoadingCart) {
    return (
      <div className="cart-page">
        <LoadingSpinner text="Loading your shopping cart..." minHeight="320px" />
      </div>
    );
  }

  if (cartItems.length === 0 && savedForLaterItems.length === 0) {
    return (
      <div className="cart-page">
        <EmptyCartView user={user} wishlist={wishlist} />
      </div>
    );
  }

  return (
    <div className="cart-page">
      <div className="cart-heading-row">
        <div className="cart-heading-left">
          <div className="cart-heading-title-wrap">
            <ShoppingBag size={24} className="cart-heading-icon" />
            <h1>Shopping Cart</h1>
          </div>
          <span className="cart-heading-count">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
        </div>
        <div className="cart-heading-right">
          <Link to="/shop" className="cart-continue-link">
            <ArrowLeft size={15} />
            <span>Continue Shopping</span>
          </Link>
        </div>
      </div>

      <div className="cart-container">
        <div className="cart-items-panel">
          {cartItems.length > 0 ? (
            <>
              <div className="cart-items">
                {cartItems.map((item, index) => {
                  const qty = Math.max(1, Number(item.quantity || 1));
                  const unitPrice = getItemUnitPrice(item);
                  const lineTotal = roundMoney(unitPrice * qty);
                  const isDigital = isDigitalItem(item);
                  const categoryName = item.category || item.product?.category || "General";
                  const productId = item.productId || item.product?._id || item._id || item.id;

                  return (
                    <div key={item._id || item.id || index} className="cart-item">
                      <div className="cart-item-top-row">
                        <Link to={`/product/${productId}`} className="cart-image-wrap">
                          <img
                            src={item.image || "https://picsum.photos/200"}
                            alt={item.name}
                            className="cart-image"
                          />
                        </Link>

                        <div className="cart-info">
                          <div className="cart-item-meta-top">
                            <span className="cart-item-category-pill">
                              {isDigital ? <Zap size={11} /> : <BookOpen size={11} />}
                              {categoryName}
                            </span>
                            <span className={`cart-stock-status ${isDigital ? "digital" : "in-stock"}`}>
                              <CheckCircle2 size={12} />
                              {isDigital ? "Instant Digital Access" : "In Stock"}
                            </span>
                          </div>

                          <Link to={`/product/${productId}`} className="cart-item-title-link">
                            <h3 className="cart-item-title">{item.name}</h3>
                          </Link>

                          <div className="cart-item-price-mobile">
                            <strong className="cart-item-total-price">
                              {formatCurrencyExact(lineTotal, displayCurrency)}
                            </strong>
                            {qty > 1 && (
                              <span className="cart-item-unit-price">
                                ({formatCurrencyExact(unitPrice, displayCurrency)} each)
                              </span>
                            )}
                            {item.festiveOffer && Number(item.festiveDiscountPercent) > 0 && (
                              <span className="cart-item-festive-badge">
                                {Number(item.festiveDiscountPercent)}% Festive OFF
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="cart-item-price-col">
                          <strong className="cart-item-total-price">
                            {formatCurrencyExact(lineTotal, displayCurrency)}
                          </strong>
                          {qty > 1 && (
                            <span className="cart-item-unit-price">
                              {formatCurrencyExact(unitPrice, displayCurrency)} each
                            </span>
                          )}
                          {item.festiveOffer && Number(item.festiveDiscountPercent) > 0 && (
                            <span className="cart-item-festive-badge">
                              {Number(item.festiveDiscountPercent)}% Festive OFF
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="cart-item-actions-row">
                        <CartQtyInput item={item} currentQty={qty} updateQty={updateQty} />

                        <div className="cart-item-quick-actions">
                          <button
                            type="button"
                            className="cart-action-btn cart-remove-btn"
                            disabled={removingId === (item._id || item.id)}
                            onClick={async () => {
                              const id = item._id || item.id;
                              setRemovingId(id);
                              await removeFromCart(id);
                              setRemovingId(null);
                            }}
                            title="Remove item"
                          >
                            <Trash2 size={13} />
                            <span>{removingId === (item._id || item.id) ? "Removing..." : "Delete"}</span>
                          </button>

                          <button
                            type="button"
                            className="cart-action-btn cart-save-btn"
                            onClick={() => saveForLater(item)}
                            title="Save for later"
                          >
                            <Heart size={13} />
                            <span>Save for later</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="cart-subtotal-inline-bar">
                <span className="cart-subtotal-label">Subtotal ({itemCount} items):</span>
                <strong className="cart-subtotal-value">
                  {formatCurrencyExact(totals.subtotal, displayCurrency)}
                </strong>
              </div>
            </>
          ) : (
            <EmptyCartView user={user} wishlist={wishlist} />
          )}

          {savedForLaterItems.length > 0 && (
            <div className="saved-later-section">
              <div className="saved-later-head">
                <Heart size={18} className="saved-later-head-icon" />
                <h3>Saved for later ({savedForLaterItems.length})</h3>
              </div>
              <div className="saved-later-list">
                {savedForLaterItems.map((item, index) => {
                  const savedId = item.productId || item.product?._id || item._id || item.id;
                  return (
                    <div key={item._id || item.id || `saved-${index}`} className="saved-later-item">
                      <Link to={`/product/${savedId}`} className="saved-later-image-link">
                        <img
                          src={item.image || "https://picsum.photos/200"}
                          alt={item.name}
                          className="saved-later-image"
                        />
                      </Link>
                      <div className="saved-later-info">
                        <span className="cart-item-category-pill">
                          {item.category || item.product?.category || "Product"}
                        </span>
                        <Link to={`/product/${savedId}`} className="saved-later-title-link">
                          <strong>{item.name}</strong>
                        </Link>
                        <span className="saved-later-price">
                          {formatResolvedPrice(getProductPriceDetails(item, selectedAddress?.country))}
                        </span>
                      </div>
                      <div className="saved-later-actions">
                        <button
                          type="button"
                          className="saved-move-btn"
                          onClick={() => moveToCartFromSaved(item)}
                        >
                          <ShoppingBag size={13} />
                          <span>Move to Cart</span>
                        </button>
                        <button
                          type="button"
                          className="saved-remove-btn"
                          onClick={() => removeSavedForLater(item._id || item.id)}
                        >
                          <Trash2 size={13} />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="cart-summary">
          <div className="cart-summary-head">
            <ShieldCheck size={20} className="summary-shield-icon" />
            <h3>Order Summary</h3>
          </div>

          <div className="cart-summary-breakdown">
            <div className="cart-summary-row">
              <span className="summary-row-label">Subtotal ({itemCount} items)</span>
              <span className="summary-row-val">{formatCurrencyExact(totals.subtotal, displayCurrency)}</span>
            </div>

            <div className="cart-summary-row">
              <span className="summary-row-label">
                {totals.isInternational
                  ? "GST (Export 0%)"
                  : `GST (${charges.gstPercent}% Included)`}
              </span>
              <span className="summary-row-val">
                {totals.isInternational
                  ? formatCurrencyExact(0, displayCurrency)
                  : formatCurrencyExact(totals.gstAmount, displayCurrency)}
              </span>
            </div>

            <div className="cart-summary-row">
              <span className="summary-row-label">Delivery</span>
              <span className="summary-row-val">
                {deliveryDetails.pricingMode === "digital" || deliveryDetails.isDigitalOnly ? (
                  <span className="delivery-free-badge">FREE (Instant Access)</span>
                ) : totals.deliveryCharge === 0 ? (
                  <span className="delivery-free-badge">FREE</span>
                ) : (
                  formatCurrencyExact(totals.deliveryCharge, displayCurrency)
                )}
              </span>
            </div>

            {deliveryDetails.isDistanceBased && deliveryDetails.distanceKm !== null && (
              <div className="cart-summary-note">
                Estimated warehouse distance: {deliveryDetails.distanceKm.toFixed(1)} km
              </div>
            )}

            {deliveryDetails.pricingMode === "international" && deliveryDetails.matchedCountry && (
              <div className="cart-summary-note">
                International delivery applied for {deliveryDetails.matchedCountry}.
              </div>
            )}
          </div>

          <div className="cart-summary-grand-total">
            <div className="grand-total-left">
              <span className="grand-total-label">Order Total</span>
              <span className="grand-total-tax-note">(Inclusive of all taxes)</span>
            </div>
            <span className="grand-total-val">{formatCurrencyExact(totals.grandTotal, displayCurrency)}</span>
          </div>

          {isIntlPhysicalRestricted && (
            <div className="cart-intl-warning">
              <strong>⚠️ International Shipping Notice:</strong> Physical product delivery to{" "}
              {selectedAddress?.country || "international addresses"} is currently disabled. Only digital products
              (E-books, Flipbooks & Web versions) can be ordered internationally. Please remove physical items to proceed.
            </div>
          )}

          {cartItems.length > 0 ? (
            isIntlPhysicalRestricted ? (
              <button
                className="checkout-btn disabled"
                disabled
                title="Remove physical items or change delivery location to proceed"
              >
                Physical Items Restricted Internationally
              </button>
            ) : (
              <Link to="/checkout" className="checkout-link">
                <button className="checkout-btn">
                  <Lock size={16} />
                  <span>Proceed to Checkout</span>
                  <ArrowRight size={16} />
                </button>
              </Link>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default Cart;
