import React, { useContext, useEffect } from "react";
import { Link } from "react-router-dom";
import { CartContext } from "../../context/CartContext";
import { useDeliveryLocation } from "../../hooks/useDeliveryLocation";
import { formatCurrencyExact, formatResolvedPrice } from "../../utils/currency";
import { getProductPriceDetails } from "../../utils/productPricing";
import "./CartPopup.css";

const CartPopup = () => {
  const { isPopupOpen, addedItem, cartItems, setIsPopupOpen } = useContext(CartContext);
  const { selectedAddress } = useDeliveryLocation();

  useEffect(() => {
    if (!isPopupOpen) return undefined;
    const handleEscape = (event) => {
      if (event.key === "Escape") setIsPopupOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isPopupOpen, setIsPopupOpen]);

  if (!isPopupOpen || !addedItem) return null;

  const country = selectedAddress?.country;
  const addedItemPricing = getProductPriceDetails(addedItem, country);

  const getItemUnitPrice = (item) => Number(getProductPriceDetails(item, country).price || 0);
  const displayCurrency =
    cartItems.length > 0
      ? String(getProductPriceDetails(cartItems[0], country).currency || "INR")
      : String(addedItemPricing.currency || "INR");

  const totalItemsCount = cartItems.reduce((acc, item) => acc + Math.max(1, Number(item.quantity || 1)), 0);

  const subtotal = cartItems.reduce(
    (sum, item) => sum + getItemUnitPrice(item) * Math.max(1, Number(item.quantity || 1)),
    0
  );

  return (
    <div className="cart-popup-overlay" onClick={() => setIsPopupOpen(false)}>
      <div className="cart-popup-modal" onClick={(e) => e.stopPropagation()}>
        <button className="cart-popup-close-btn" onClick={() => setIsPopupOpen(false)} aria-label="Close popup">
          &times;
        </button>

        <div className="cart-popup-header">
          <div className="cart-popup-success-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h3>Added to Cart Successfully!</h3>
        </div>

        <div className="cart-popup-body">
          <div className="cart-popup-product-card">
            {addedItem.image ? (
              <img src={addedItem.image} alt={addedItem.name} className="cart-popup-product-img" />
            ) : (
              <div className="cart-popup-product-img-placeholder">No Image</div>
            )}
            <div className="cart-popup-product-info">
              <h4 className="cart-popup-product-name">{addedItem.name}</h4>
              <p className="cart-popup-product-qty">Qty: {addedItem.quantity}</p>
              <p className="cart-popup-product-price">
                {formatResolvedPrice(addedItemPricing)}
              </p>
            </div>
          </div>

          <div className="cart-popup-summary">
            <div className="cart-popup-summary-row">
              <span>Cart Subtotal ({totalItemsCount} {totalItemsCount === 1 ? "item" : "items"}):</span>
              <strong>{formatCurrencyExact(subtotal, displayCurrency)}</strong>
            </div>
          </div>
        </div>

        <div className="cart-popup-footer">
          <button className="cart-popup-btn btn-secondary" onClick={() => setIsPopupOpen(false)}>
            Continue Shopping
          </button>
          <Link to="/cart" className="cart-popup-btn btn-primary" onClick={() => setIsPopupOpen(false)}>
            View Cart & Checkout
          </Link>
        </div>
      </div>
    </div>
  );
};

export default CartPopup;
