import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useCart } from "../hooks/useCart";
import { useDeliveryLocation } from "../hooks/useDeliveryLocation";
import { formatCurrencyForUser } from "../utils/currency";
import { getDeliveryPricingDetails } from "../utils/deliveryPricing";
import { getProductPriceDetails } from "../utils/productPricing";
import "./Cart.css";

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
      .get("/api/settings")
      .then((res) => {
        if (!active) return;
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
    () => getDeliveryPricingDetails(charges, selectedAddress),
    [charges, selectedAddress]
  );

  const totals = useMemo(() => {
    const gstAmount = roundMoney((subtotal * Number(charges.gstPercent || 0)) / 100);
    const deliveryCharge = roundMoney(Number(deliveryDetails.deliveryCharge || 0));
    return {
      subtotal,
      gstAmount,
      deliveryCharge,
      grandTotal: roundMoney(subtotal + gstAmount + deliveryCharge)
    };
  }, [subtotal, charges.gstPercent, deliveryDetails.deliveryCharge]);

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
                      <p className="cart-item-price-mobile">{formatCurrencyForUser(lineTotal)}</p>

                      <div className="qty-box">
                        <button onClick={() => updateQty(item._id || item.id, qty > 1 ? qty - 1 : 1)}>
                          -
                        </button>
                        <span>{qty}</span>
                        <button onClick={() => updateQty(item._id || item.id, qty + 1)}>+</button>
                      </div>
                    </div>

                    <div className="cart-item-actions">
                      <button className="remove-btn" onClick={() => removeFromCart(item._id || item.id)}>
                        Delete
                      </button>
                      <button className="save-later-btn" onClick={() => saveForLater(item)}>
                        Save for later
                      </button>
                      <strong className="cart-item-price">{formatCurrencyForUser(lineTotal)}</strong>
                    </div>
                  </div>
                );
              })}
              </div>
              <p className="cart-subtotal-inline">
                Subtotal ({itemCount} items): <strong>{formatCurrencyForUser(totals.subtotal)}</strong>
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
                      <span>{formatCurrencyForUser(getItemUnitPrice(item))}</span>
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
            Subtotal ({itemCount} items): <strong>{formatCurrencyForUser(totals.subtotal)}</strong>
          </p>
          <p>GST ({charges.gstPercent}%): {formatCurrencyForUser(totals.gstAmount)}</p>
          {deliveryDetails.isDistanceBased && deliveryDetails.distanceKm !== null && (
            <p>Estimated warehouse distance: {deliveryDetails.distanceKm.toFixed(1)} km</p>
          )}
          {deliveryDetails.pricingMode === "international" && deliveryDetails.matchedCountry && (
            <p>International delivery applied for {deliveryDetails.matchedCountry}.</p>
          )}
          <h3>Order Total: {formatCurrencyForUser(totals.grandTotal)}</h3>

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
