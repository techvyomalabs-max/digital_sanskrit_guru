import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useCart } from "../hooks/useCart";
import { useDeliveryLocation } from "../hooks/useDeliveryLocation";
import { convertCurrencyAmount, formatCurrencyExact, formatResolvedPrice } from "../utils/currency";
import { getDeliveryPricingDetails } from "../utils/deliveryPricing";
import { getProductPriceDetails, storePricingConfig } from "../utils/productPricing";
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
    <div className="qty-box" style={{ display: "flex", alignItems: "center" }}>
      <button type="button" onClick={() => {
        const nextQty = Math.max(1, Number(localVal || 1) - 1);
        setLocalVal(nextQty);
        updateQty(item._id || item.id, nextQty);
      }}>-</button>
      <input
        type="number"
        value={localVal}
        min="1"
        max={item.stock || 100}
        onChange={handleChange}
        onBlur={handleBlur}
        style={{
          width: "50px",
          textAlign: "center",
          border: "1px solid var(--border-color, #cbd5e1)",
          borderRadius: "4px",
          height: "26px",
          fontSize: "13.5px",
          fontWeight: "bold",
          margin: "0 6px",
          backgroundColor: "transparent",
          color: "inherit"
        }}
      />
      <button type="button" onClick={() => {
        const nextQty = Number(localVal || 1) + 1;
        setLocalVal(nextQty);
        updateQty(item._id || item.id, nextQty);
      }}>+</button>
    </div>
  );
}

function Cart() {
  const {
    cartItems,
    savedForLaterItems,
    removeFromCart,
    updateQty,
    saveForLater,
    moveToCartFromSaved,
    removeSavedForLater
  } = useCart();
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

  const subtotal = roundMoney(
    cartItems.reduce(
      (sum, item) => sum + getItemUnitPrice(item) * Math.max(1, Number(item.quantity || 1)),
      0
    )
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
          distancePricing: res.data?.distancePricing || {}
        });
      })
      .catch(() => {
        if (!active) return;
        setCharges({ gstPercent: 0, deliveryCharge: 0, warehouseLocation: {}, distancePricing: {} });
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
    const defaultGstPercent = Number(charges.gstPercent || 0);
    let totalItemGst = 0;
    cartItems.forEach((item) => {
      const qty = Math.max(1, Number(item.quantity || 1));
      const price = getItemUnitPrice(item);
      const lineTotal = qty * price;
      const hsnSac = getItemHsnSac(item);
      const gstRate = hsnSac === "4901" ? 0 : defaultGstPercent;
      const itemGst = Math.round(((lineTotal * gstRate) / 100) * 100) / 100;
      totalItemGst += itemGst;
    });

    const gstAmount = roundMoney(totalItemGst);
    const deliveryCharge = roundMoney(
      convertCurrencyAmount(Number(deliveryDetails.deliveryCharge || 0), {
        sourceCurrency: "INR",
        currency: displayCurrency
      })
    );
    return {
      subtotal,
      gstAmount,
      deliveryCharge,
      grandTotal: roundMoney(subtotal + gstAmount + deliveryCharge)
    };
  }, [cartItems, subtotal, charges.gstPercent, deliveryDetails.deliveryCharge, displayCurrency, selectedAddress?.country]);

  if (cartItems.length === 0 && savedForLaterItems.length === 0) {
    return (
      <div className="cart-page">
        <div className="cart-empty-card">
          <h2>Your cart is empty</h2>
          <Link to="/">Go Shopping</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="cart-page">
      <div className="cart-heading-row">
        <h1>Shopping Cart</h1>
        <p>Price</p>
      </div>

      <div className="cart-container">
        <div className="cart-items-panel">
          {cartItems.length > 0 ? (
            <>
              <div className="cart-items">
              {cartItems.map((item, index) => {
                const qty = Math.max(1, Number(item.quantity || 1));
                const lineTotal = roundMoney(getItemUnitPrice(item) * qty);

                return (
                  <div key={item._id || item.id || index} className="cart-item">
                    <img
                      src={item.image || "https://picsum.photos/200"}
                      alt={item.name}
                      className="cart-image"
                    />

                    <div className="cart-info">
                      <h3>{item.name}</h3>
                      <p className="cart-item-price-mobile">{formatCurrencyExact(lineTotal, displayCurrency)}</p>

                      <CartQtyInput item={item} currentQty={qty} updateQty={updateQty} />
                    </div>

                    <div className="cart-item-actions">
                      <button className="remove-btn" onClick={() => removeFromCart(item._id || item.id)}>
                        Delete
                      </button>
                      <button className="save-later-btn" onClick={() => saveForLater(item)}>
                        Save for later
                      </button>
                      <strong className="cart-item-price">{formatCurrencyExact(lineTotal, displayCurrency)}</strong>
                    </div>
                  </div>
                );
              })}
              </div>
              <p className="cart-subtotal-inline">
                Subtotal ({itemCount} items): <strong>{formatCurrencyExact(totals.subtotal, displayCurrency)}</strong>
              </p>
            </>
          ) : (
            <div className="cart-empty-card">
              <h2>Your cart is empty</h2>
              <Link to="/">Go Shopping</Link>
            </div>
          )}
          {savedForLaterItems.length > 0 && (
            <div className="saved-later-section">
              <h3>Saved for later ({savedForLaterItems.length})</h3>
              <div className="saved-later-list">
                {savedForLaterItems.map((item, index) => (
                  <div key={item._id || item.id || `saved-${index}`} className="saved-later-item">
                    <img
                      src={item.image || "https://picsum.photos/200"}
                      alt={item.name}
                      className="saved-later-image"
                    />
                    <div className="saved-later-info">
                      <strong>{item.name}</strong>
                      <span>{formatResolvedPrice(getProductPriceDetails(item, selectedAddress?.country))}</span>
                    </div>
                    <div className="saved-later-actions">
                      <button onClick={() => moveToCartFromSaved(item)}>Move to cart</button>
                      <button onClick={() => removeSavedForLater(item._id || item.id)}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="cart-summary">
          <p className="cart-total">
            Subtotal ({itemCount} items): <strong>{formatCurrencyExact(totals.subtotal, displayCurrency)}</strong>
          </p>
          <p>GST ({charges.gstPercent}%): {formatCurrencyExact(totals.gstAmount, displayCurrency)}</p>
          {deliveryDetails.pricingMode === "digital" || deliveryDetails.isDigitalOnly ? (
            <p className="cart-delivery-charge-info">
              Delivery: <strong style={{ color: "#2e7d32" }}>FREE (Instant Digital Access)</strong>
            </p>
          ) : (
            <p className="cart-delivery-charge-info">
              Delivery Charge: {totals.deliveryCharge === 0 ? (
                <strong style={{ color: "#2e7d32" }}>FREE</strong>
              ) : (
                formatCurrencyExact(totals.deliveryCharge, displayCurrency)
              )}
            </p>
          )}
          {deliveryDetails.isDistanceBased && deliveryDetails.distanceKm !== null && (
            <p>Estimated warehouse distance: {deliveryDetails.distanceKm.toFixed(1)} km</p>
          )}
          {deliveryDetails.pricingMode === "international" && deliveryDetails.matchedCountry && (
            <p>International delivery applied for {deliveryDetails.matchedCountry}.</p>
          )}
          <h3>Order Total: {formatCurrencyExact(totals.grandTotal, displayCurrency)}</h3>

          {cartItems.length > 0 ? (
            <Link to="/checkout" className="checkout-link">
              <button className="checkout-btn">Proceed to checkout</button>
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default Cart;
