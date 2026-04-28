import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useCart } from "../hooks/useCart";
import { formatCurrencyForUser } from "../utils/currency";
import { getDeliveryPricingDetails } from "../utils/deliveryPricing";
import "./Cart.css";

function getSavedDefaultAddress() {
  try {
    const raw = localStorage.getItem("addresses");
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.find((item) => item?.isDefault) || parsed[0];
  } catch {
    return null;
  }
}

function Cart() {
  const { cartItems, removeFromCart, updateQty } = useCart();
  const [charges, setCharges] = useState({
    gstPercent: 0,
    deliveryCharge: 0,
    warehouseLocation: {},
    distancePricing: {}
  });
  const [defaultAddress] = useState(() => getSavedDefaultAddress());

  const total = cartItems.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1),
    0
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

  const deliveryDetails = useMemo(() => getDeliveryPricingDetails(charges, defaultAddress), [charges, defaultAddress]);

  const totals = useMemo(() => {
    const subtotal = Number(total || 0);
    const gstAmount = (subtotal * Number(charges.gstPercent || 0)) / 100;
    const deliveryCharge = Number(deliveryDetails.deliveryCharge || 0);
    return {
      subtotal,
      gstAmount,
      deliveryCharge,
      grandTotal: subtotal + gstAmount + deliveryCharge
    };
  }, [total, charges.gstPercent, deliveryDetails.deliveryCharge]);

  if (cartItems.length === 0) {
    return (
      <div className="cart-page">
        <div className="cart-empty-card">
          <h2>Your Amazon-style cart is empty</h2>
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
          <div className="cart-items">
          {cartItems.map((item, index) => {
            const qty = item.quantity || 1;

            return (
              <div key={item._id || item.id || index} className="cart-item">
                <img
                  src={item.image || "https://picsum.photos/200"}
                  alt={item.name}
                  className="cart-image"
                />

                <div className="cart-info">
                  <h3>{item.name}</h3>
                  <p className="cart-item-price-mobile">{formatCurrencyForUser(item.price)}</p>

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
                  <strong className="cart-item-price">{formatCurrencyForUser(item.price)}</strong>
                </div>
              </div>
            );
          })}
          </div>
          <p className="cart-subtotal-inline">
            Subtotal ({cartItems.length} items): <strong>{formatCurrencyForUser(totals.subtotal)}</strong>
          </p>
        </div>

        <div className="cart-summary">
          <p className="cart-total">
            Subtotal ({cartItems.length} items): <strong>{formatCurrencyForUser(totals.subtotal)}</strong>
          </p>
          <p>GST ({charges.gstPercent}%): {formatCurrencyForUser(totals.gstAmount)}</p>
          <p>Delivery{defaultAddress ? "" : " (base fee)"}: {formatCurrencyForUser(totals.deliveryCharge)}</p>
          {deliveryDetails.isDistanceBased && deliveryDetails.distanceKm !== null && (
            <p>Estimated warehouse distance: {deliveryDetails.distanceKm.toFixed(1)} km</p>
          )}
          <h3>Order Total: {formatCurrencyForUser(totals.grandTotal)}</h3>

          <Link to="/checkout" className="checkout-link">
            <button className="checkout-btn">Proceed to checkout</button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Cart;

