import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useAuth } from "../hooks/useAuth";
import { useCart } from "../hooks/useCart";
import { useWishlist } from "../hooks/useWishlist";
import { useDeliveryLocation } from "../hooks/useDeliveryLocation";
import { useDigitalOwnership } from "../hooks/useDigitalOwnership";
import { useDeliveryEstimate } from "../hooks/useDeliveryEstimate";
import { convertCurrencyAmount, formatCurrencyExact, formatResolvedPrice } from "../utils/currency";
import { getDeliveryPricingDetails, isDigitalItem } from "../utils/deliveryPricing";
import { isExternalDelivery, hasExternalDelivery } from "../utils/digitalDelivery";
import { isKindleProduct } from "../utils/kindle";
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

function getMergedUpgradeOwnedDetails(upgradeCreditItems) {
  if (!Array.isArray(upgradeCreditItems)) return [];
  const map = new Map();
  for (const item of upgradeCreditItems) {
    if (Array.isArray(item?.ownedDetails) && item.ownedDetails.length > 0) {
      for (const od of item.ownedDetails) {
        const name = String(od?.name || "").trim();
        if (!name) continue;
        const prev = map.get(name) || 0;
        map.set(name, Math.round((prev + (Number(od?.amount) || 0)) * 100) / 100);
      }
    } else if (Array.isArray(item?.ownedItems)) {
      for (const nameStr of item.ownedItems) {
        const name = String(nameStr || "").trim();
        if (!name || map.has(name)) continue;
        map.set(name, null);
      }
    }
  }
  return Array.from(map.entries()).map(([name, amount]) => ({ name, amount }));
}

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
            <option key={num} value={num} disabled={item.isDigital !== true && item.stock > 0 && num > item.stock}>
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
        updateQty(item._id || item.id, Math.min(item.isDigital === true ? 5 : (item.stock || 100), num));
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
        max={item.isDigital === true ? 5 : (item.stock || 100)}
        onChange={handleChange}
        onBlur={handleBlur}
        aria-label="Item quantity"
      />
      <button
        type="button"
        className="cart-qty-btn plus"
        disabled={item.isDigital === true ? Number(localVal) >= 5 : (item.stock ? Number(localVal) >= item.stock : false)}
        onClick={() => {
          const maxStock = item.isDigital === true ? 5 : (item.stock || 100);
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

function SkeletonShimmer({ width = "70px", height = "18px", borderRadius = "6px", className = "" }) {
  return (
    <span
      className={`checkout-skeleton-shimmer ${className}`}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
        borderRadius
      }}
      aria-hidden="true"
    />
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
  const { token, user } = useAuth();
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
  const digitalOwnership = useDigitalOwnership(cartItems, false, selectedAddress?.country);
  const estimateItems = useMemo(
    () =>
      cartItems.map((item) => ({
        product: item.productId || item.product?._id || item._id || item.id,
        quantity: Math.max(1, Number(item.quantity || 1)),
        isDigital: isDigitalItem(item)
      })),
    [cartItems]
  );
  const { deliveryCharge: serverDeliveryCharge } = useDeliveryEstimate(estimateItems, selectedAddress);
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

  const [serverTotals, setServerTotals] = useState({
    subtotal: 0,
    gstPercent: 0,
    gstAmount: 0,
    deliveryCharge: 0,
    discount: 0,
    total: 0,
    currency: "INR",
    upgradeCredit: 0,
    upgradeCreditItems: []
  });
  const [isCalculatingTotals, setIsCalculatingTotals] = useState(false);
  const [totalsError, setTotalsError] = useState("");

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

  const localDeliveryDetails = useMemo(
    () => getDeliveryPricingDetails(charges, selectedAddress, cartItems),
    [charges, selectedAddress, cartItems]
  );

  const deliveryDetails = useMemo(() => {
    if (typeof serverDeliveryCharge === "number" && localDeliveryDetails.pricingMode === "indiapost") {
      return {
        ...localDeliveryDetails,
        deliveryCharge: serverDeliveryCharge
      };
    }
    return localDeliveryDetails;
  }, [localDeliveryDetails, serverDeliveryCharge]);

  useEffect(() => {
    if (!token || cartItems.length === 0) {
      return;
    }

    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        setIsCalculatingTotals(true);
        setTotalsError("");
      }
    });

    const headers = { headers: { Authorization: `Bearer ${token}` } };
    axios
      .post(
        "/api/orders/calculate-totals",
        {
          items: cartItems,
          shipping: selectedAddress || {},
          couponCode: "",
          currencyDisplay: { currency: displayCurrency }
        },
        headers
      )
      .then((res) => {
        if (!active) return;
        setServerTotals(res.data);
        setTotalsError("");
      })
      .catch((err) => {
        if (!active) return;
        console.error("Failed to calculate totals:", err);
        setTotalsError(err?.response?.data?.message || "Couldn't calculate totals. Please refresh.");
      })
      .finally(() => {
        if (!active) return;
        setIsCalculatingTotals(false);
      });

    return () => {
      active = false;
    };
  }, [cartItems, selectedAddress, displayCurrency, token]);

  const totals = useMemo(() => {
    const isInternational = isInternationalCountry(selectedAddress?.country);

    if (token && !totalsError && cartItems.length > 0) {
      const total = Number(serverTotals.total || 0);
      const deliveryCharge = Number(serverTotals.deliveryCharge || 0);
      const upgradeCredit = Number(serverTotals.upgradeCredit || 0);
      const discount = Number(serverTotals.discount || 0);
      const itemsInclGst = roundMoney(total - deliveryCharge + upgradeCredit + discount);

      return {
        subtotal: serverTotals.subtotal,
        gstAmount: Number(serverTotals.gstAmount || 0),
        deliveryCharge,
        upgradeCredit,
        upgradeCreditItems: serverTotals.upgradeCreditItems || [],
        discount,
        couponCode: serverTotals.couponCode || "",
        total,
        grandTotal: total,
        isInternational,
        itemsInclGst
      };
    }

    // Guest estimate (no token or totalsError set)
    const defaultGstPercent = isInternational ? 0 : Number(charges.gstPercent || 0);
    let totalItemBase = 0;
    let totalItemGst = 0;

    cartItems.forEach((item) => {
      const qty = Math.max(1, Number(item.quantity || 1));
      const price = Number(getProductPriceDetails(item, selectedAddress?.country).price || 0);
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
    const deliveryCharge =
      cartItems.length === 0
        ? 0
        : roundMoney(
          convertCurrencyAmount(Number(deliveryDetails.deliveryCharge || 0), {
            sourceCurrency: "INR",
            currency: displayCurrency
          })
        );
    const total = cartItems.length === 0 ? 0 : roundMoney(cartSubtotal + gstAmount + deliveryCharge);
    const upgradeCredit = 0;
    const discount = 0;
    const itemsInclGst = roundMoney(total - deliveryCharge + upgradeCredit + discount);

    return {
      subtotal: cartSubtotal,
      gstAmount,
      deliveryCharge,
      upgradeCredit,
      upgradeCreditItems: [],
      discount,
      couponCode: "",
      total,
      grandTotal: total,
      isInternational,
      itemsInclGst
    };
  }, [
    token,
    totalsError,
    serverTotals,
    cartItems,
    charges.gstPercent,
    deliveryDetails.deliveryCharge,
    displayCurrency,
    selectedAddress?.country
  ]);

  const isPriceLoading =
    Boolean(token) &&
    !totalsError &&
    cartItems.length > 0 &&
    (isCalculatingTotals ||
      (Number(serverTotals.total || 0) === 0 &&
        Number(serverTotals.subtotal || 0) === 0));

  const cartItemsGrossTotal = useMemo(() => {
    return roundMoney(
      cartItems.reduce((sum, item) => {
        const qty = Math.max(1, Number(item.quantity || 1));
        const price = Number(getProductPriceDetails(item, selectedAddress?.country).price || 0);
        return sum + roundMoney(price * qty);
      }, 0)
    );
  }, [cartItems, selectedAddress?.country]);

  const hasPhysicalItems = useMemo(
    () => cartItems.some((item) => !isDigitalItem(item)),
    [cartItems]
  );

  const isIntlPhysicalRestricted = useMemo(() => {
    const isInternational = isInternationalCountry(selectedAddress?.country);
    const intlDeliveryEnabled = charges?.internationalDelivery?.enabled === true;
    return isInternational && !intlDeliveryEnabled && hasPhysicalItems;
  }, [selectedAddress?.country, charges?.internationalDelivery?.enabled, hasPhysicalItems]);

  const hasKindleItems = useMemo(
    () => cartItems.some((item) => isKindleProduct(item)),
    [cartItems]
  );

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
          <Link to="/collection" className="cart-continue-link">
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
                            <span className={`cart-stock-status ${isDigital ? "digital" : (Number(item?.stock || 0) > 0 ? "in-stock" : "out-of-stock")}`}>
                              <CheckCircle2 size={12} />
                              {isDigital
                                ? item.externalAccessManual === true
                                  ? "Access within 24–48 hours"
                                  : isKindleProduct(item)
                                    ? "Sold on Amazon Kindle"
                                    : isExternalDelivery(item)
                                      ? "Digital item, link in My Library"
                                      : "Instant Digital Access"
                                : Number(item?.stock || 0) > 0
                                  ? "In Stock"
                                  : "Out of Stock"}
                            </span>
                          </div>

                          <Link to={`/product/${productId}`} className="cart-item-title-link">
                            <h3 className="cart-item-title">{item.name}</h3>
                          </Link>

                          {isKindleProduct(item) && (
                            <div className="cart-item-kindle-notice">
                              <span>Kindle editions are sold on Amazon.</span>
                              <a
                                href={item.kindleLink || "https://www.amazon.in/s?k=kindle+digital+sanskrit+guru"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="cart-item-kindle-link"
                              >
                                Buy on Amazon ↗
                              </a>
                            </div>
                          )}

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
                <span className="cart-subtotal-label">
                  Subtotal ({itemCount} {itemCount === 1 ? "item" : "items"}, incl. GST):
                </span>
                <strong className="cart-subtotal-value">
                  {formatCurrencyExact(cartItemsGrossTotal, displayCurrency)}
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

          {totalsError && (
            <div
              className="cart-summary-error-notice"
              style={{
                margin: "0 0 16px",
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid var(--site-border, #fecaca)",
                backgroundColor: "var(--site-surface-muted, #fef2f2)",
                color: "#b91c1c",
                fontSize: "13px",
                lineHeight: "1.4",
                display: "flex",
                alignItems: "flex-start",
                gap: "8px"
              }}
            >
              <span style={{ fontSize: "14px", flexShrink: 0 }}>⚠️</span>
              <span>{totalsError}</span>
            </div>
          )}

          <div className="cart-summary-breakdown">
            <div className="cart-summary-row">
              <span className="summary-row-label">Items (incl. GST)</span>
              {isPriceLoading ? (
                <SkeletonShimmer width={72} height={18} />
              ) : (
                <span className="summary-row-val">
                  {formatCurrencyExact(totals.itemsInclGst, displayCurrency)}
                </span>
              )}
            </div>

            {totals.upgradeCredit > 0 && (
              <div className="cart-summary-row discount-row" style={{ color: "#16a34a" }}>
                <div style={{ flex: 1, paddingRight: "12px" }}>
                  <span className="summary-row-label" style={{ color: "#16a34a" }}>
                    Taken off for items you already own
                  </span>
                  {(() => {
                    const mergedDetails = getMergedUpgradeOwnedDetails(totals.upgradeCreditItems);
                    if (!mergedDetails.length) return null;
                    return (
                      <div style={{ fontSize: "11px", color: "var(--site-text-soft, #64748b)", marginTop: "4px", display: "flex", flexDirection: "column", gap: "2px" }}>
                        {mergedDetails.map((od) => (
                          <div key={od.name} style={{ display: "flex", justifyContent: "space-between" }}>
                            <span>{od.name}</span>
                            <span>{od.amount !== null ? `-${formatCurrencyExact(od.amount, displayCurrency)}` : ""}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                {isPriceLoading ? (
                  <SkeletonShimmer width={60} height={18} />
                ) : (
                  <span className="summary-row-val" style={{ color: "#16a34a", fontWeight: "600" }}>
                    -{formatCurrencyExact(totals.upgradeCredit, displayCurrency)}
                  </span>
                )}
              </div>
            )}

            {totals.discount > 0 && (
              <div className="cart-summary-row discount-row" style={{ color: "#16a34a" }}>
                <span className="summary-row-label" style={{ color: "#16a34a" }}>
                  Coupon discount {totals.couponCode ? `(${totals.couponCode})` : ""}
                </span>
                {isPriceLoading ? (
                  <SkeletonShimmer width={60} height={18} />
                ) : (
                  <span className="summary-row-val" style={{ color: "#16a34a", fontWeight: "600" }}>
                    -{formatCurrencyExact(totals.discount, displayCurrency)}
                  </span>
                )}
              </div>
            )}

            <div className="cart-summary-row">
              <span className="summary-row-label">Delivery</span>
              <span className="summary-row-val">
                {isPriceLoading ? (
                  <SkeletonShimmer width={56} height={18} />
                ) : cartItems.length === 0 ? (
                  <span style={{ color: "var(--site-text-soft, #64748b)" }}>—</span>
                ) : deliveryDetails.pricingMode === "digital" || deliveryDetails.isDigitalOnly ? (
                  <span className="delivery-free-badge">
                    {hasExternalDelivery(cartItems) ? "FREE (Digital delivery)" : "FREE (Instant Access)"}
                  </span>
                ) : totals.deliveryCharge === 0 ? (
                  <span className="delivery-free-badge">FREE</span>
                ) : (
                  formatCurrencyExact(totals.deliveryCharge, displayCurrency)
                )}
              </span>
            </div>

            {cartItems.length > 0 && deliveryDetails.isDistanceBased && deliveryDetails.distanceKm !== null && (
              <div className="cart-summary-note">
                Estimated warehouse distance: {deliveryDetails.distanceKm.toFixed(1)} km
              </div>
            )}

            {cartItems.length > 0 && deliveryDetails.pricingMode === "international" && deliveryDetails.matchedCountry && (
              <div className="cart-summary-note">
                International delivery applied for {deliveryDetails.matchedCountry}.
              </div>
            )}
          </div>

          <div className="cart-summary-grand-total">
            <div className="grand-total-left">
              <span className="grand-total-label">Order total (inclusive of all taxes)</span>
              <span className="grand-total-tax-note">
                {isPriceLoading ? (
                  <SkeletonShimmer width={110} height={13} />
                ) : totals.isInternational ? (
                  "No GST (export)"
                ) : totals.gstAmount === 0 ? (
                  "No GST on these items"
                ) : (
                  `Includes GST of ${formatCurrencyExact(totals.gstAmount, displayCurrency)}`
                )}
              </span>
            </div>
            {isPriceLoading ? (
              <SkeletonShimmer width={95} height={26} borderRadius={8} />
            ) : (
              <span className="grand-total-val">
                {formatCurrencyExact(totals.total, displayCurrency)}
              </span>
            )}
          </div>

          {digitalOwnership.notice && (
            <div
              className="cart-ownership-notice"
              style={{
                margin: "12px 0",
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid #93c5fd",
                backgroundColor: "#eff6ff",
                color: "#1e40af",
                fontSize: "13px",
                lineHeight: "1.4"
              }}
            >
              <div>
                <span>ℹ️</span> {digitalOwnership.message}
              </div>
              {digitalOwnership.upgradeCredit > 0 && (
                <div style={{ marginTop: "6px", color: "#1e3a8a", fontSize: "12.5px", fontWeight: "500" }}>
                  You already own these, so {formatCurrencyExact(digitalOwnership.upgradeCredit, digitalOwnership.currency)} has been taken off the price.
                </div>
              )}
            </div>
          )}

          {digitalOwnership.blocked && digitalOwnership.giftAllowed && (
            <div
              className="cart-ownership-warning"
              style={{
                margin: "12px 0",
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid #f59e0b",
                backgroundColor: "#fffbeb",
                color: "#b45309",
                fontSize: "13px",
                lineHeight: "1.4"
              }}
            >
              <span>⚠️</span> You already own {digitalOwnership.ownedItems?.length > 0 ? digitalOwnership.ownedItems.join(", ") : "digital items in your cart"}. At checkout this can only be bought as a gift for someone else.
            </div>
          )}

          {digitalOwnership.blocked && !digitalOwnership.giftAllowed && (
            <div
              className="cart-ownership-warning"
              style={{
                margin: "12px 0",
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid #ef4444",
                backgroundColor: "#fef2f2",
                color: "#b91c1c",
                fontSize: "13px",
                lineHeight: "1.4"
              }}
            >
              <span>⚠️</span> {digitalOwnership.message || "You already own items in this purchase."}
            </div>
          )}

          {isIntlPhysicalRestricted && (
            <div className="cart-intl-warning">
              <strong>⚠️ International Shipping Notice:</strong> Physical product delivery to{" "}
              {selectedAddress?.country || "international addresses"} is currently disabled. Only digital products
              (E-books, Flipbooks & Web versions) can be ordered internationally. Please remove physical items to proceed.
            </div>
          )}

          {cartItems.length > 0 ? (
            hasKindleItems ? (
              <div className="checkout-btn-wrap">
                <button
                  className="checkout-btn disabled"
                  disabled
                  title="Remove Kindle editions to continue."
                >
                  <Lock size={16} />
                  <span>Proceed to Checkout</span>
                  <ArrowRight size={16} />
                </button>
                <p className="cart-checkout-hint">
                  Remove Kindle editions to continue.
                </p>
              </div>
            ) : isIntlPhysicalRestricted ? (
              <button
                className="checkout-btn disabled"
                disabled
                title="Remove physical items or change delivery location to proceed"
              >
                Physical Items Restricted Internationally
              </button>
            ) : digitalOwnership.blocked && !digitalOwnership.giftAllowed ? (
              <button
                className="checkout-btn disabled"
                disabled
                title={digitalOwnership.message || "Checkout is disabled because already owned items cannot be purchased."}
              >
                Checkout Disabled - Already Owned
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
