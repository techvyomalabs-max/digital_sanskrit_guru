import React, { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CartContext } from "../../context/CartContext";
import { useDeliveryLocation } from "../../hooks/useDeliveryLocation";
import { formatCurrencyExact, formatResolvedPrice } from "../../utils/currency";
import { getProductPriceDetails } from "../../utils/productPricing";
import "./CartPopup.css";

const CartPopup = () => {
  const { isPopupOpen, addedItem, addedItems, popupSuggestions, addManyToCart, cartItems, setIsPopupOpen } =
    useContext(CartContext);
  const { selectedAddress } = useDeliveryLocation();
  // "Also get": the other formats ticked here, added with one button
  const [pickedIds, setPickedIds] = useState([]);
  const [isAddingMore, setIsAddingMore] = useState(false);

  useEffect(() => {
    if (!isPopupOpen) setPickedIds([]);
  }, [isPopupOpen]);

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

  const shownItems = Array.isArray(addedItems) && addedItems.length > 0 ? addedItems : [addedItem];
  const suggestions = Array.isArray(popupSuggestions) ? popupSuggestions : [];
  const togglePicked = (id) =>
    setPickedIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  const addPicked = async () => {
    const items = suggestions
      .filter((s) => pickedIds.includes(String(s?.product?._id || "")))
      .map((s) => ({ product: s.product, qty: 1, formatLabel: s.label }));
    if (items.length === 0 || isAddingMore) return;
    setIsAddingMore(true);
    try {
      await addManyToCart(items, { appendToPopup: true });
      setPickedIds([]);
    } finally {
      setIsAddingMore(false);
    }
  };

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
          <h3>{shownItems.length > 1 ? `${shownItems.length} formats added to cart` : "Added to Cart Successfully!"}</h3>
        </div>

        <div className="cart-popup-body">
          <div className={`cart-popup-product-list${shownItems.length > 1 ? " is-multi" : ""}`}>
            {shownItems.map((item) => {
              const itemPricing = getProductPriceDetails(item, country);
              return (
                <div className="cart-popup-product-card" key={String(item._id || item.id)}>
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="cart-popup-product-img" />
                  ) : (
                    <div className="cart-popup-product-img-placeholder">No Image</div>
                  )}
                  <div className="cart-popup-product-info">
                    <h4 className="cart-popup-product-name">{item.name}</h4>
                    {item.formatLabel ? <p className="cart-popup-product-format">{item.formatLabel}</p> : null}
                    <p className="cart-popup-product-qty">Qty: {item.quantity}</p>
                    <p className="cart-popup-product-price">{formatResolvedPrice(itemPricing)}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {suggestions.length > 0 ? (
            <div className="cart-popup-also">
              <p className="cart-popup-also-title">Also get this title as</p>
              <div className="cart-popup-also-options">
                {suggestions.map((sug) => {
                  const id = String(sug?.product?._id || "");
                  const picked = pickedIds.includes(id);
                  return (
                    <label key={id} className={`cart-popup-also-option${picked ? " is-picked" : ""}`}>
                      <input type="checkbox" checked={picked} onChange={() => togglePicked(id)} />
                      {sug.product?.image ? (
                        <img src={sug.product.image} alt="" className="cart-popup-also-img" loading="lazy" />
                      ) : (
                        <span className="cart-popup-also-img cart-popup-also-img--empty" aria-hidden="true" />
                      )}
                      <span className="cart-popup-also-text">
                        <span className="cart-popup-also-name">{sug.product?.name || sug.label}</span>
                        {sug.label ? <span className="cart-popup-also-label">{sug.label}</span> : null}
                      </span>
                      <span className="cart-popup-also-price">
                        {formatResolvedPrice(getProductPriceDetails(sug.product, country))}
                      </span>
                    </label>
                  );
                })}
              </div>
              <button
                type="button"
                className="cart-popup-btn btn-secondary cart-popup-also-add"
                disabled={pickedIds.length === 0 || isAddingMore}
                onClick={addPicked}
              >
                {isAddingMore
                  ? "Adding..."
                  : pickedIds.length > 1
                    ? `Add ${pickedIds.length} selected to cart`
                    : "Add selected to cart"}
              </button>
            </div>
          ) : null}

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
