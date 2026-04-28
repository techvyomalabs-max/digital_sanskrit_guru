import { createContext, useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useToast } from "../hooks/useToast";
import { useAuth } from "../hooks/useAuth";

const CartContext = createContext();

export function CartProvider({ children }) {
  const { showToast } = useToast();
  const { token } = useAuth();
  const [cartItems, setCartItems] = useState([]);

  const getCartHeaders = () => ({
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const loadCart = useCallback(async () => {
    if (!token) {
      setCartItems([]);
      return;
    }

    try {
      const res = await axios.get("/api/cart", getCartHeaders());
      setCartItems(Array.isArray(res.data?.items) ? res.data.items : []);
    } catch (err) {
      const status = Number(err?.response?.status || 0);
      if (status === 401) {
        showToast("Session expired. Please login again.", "error");
      }
      setCartItems([]);
    }
  }, [token, showToast]);

  useEffect(() => {
    loadCart();
  }, [loadCart]);

  const addToCart = async (product, qty = 1) => {
    if (!token) {
      showToast("Please login to add items to cart.", "error");
      return;
    }

    try {
      const productId = String(product?.id || product?._id || "");
      const nextQty = Math.max(1, Number(qty) || 1);
      if (!productId) return;

      const res = await axios.post(
        "/api/cart",
        { productId, qty: nextQty },
        getCartHeaders()
      );

      setCartItems(Array.isArray(res.data?.items) ? res.data.items : []);
      showToast("Added to cart");
    } catch (err) {
      const status = Number(err?.response?.status || 0);
      const message =
        err?.response?.data?.message ||
        (status === 401 ? "Session expired. Please login again." : "Could not add to cart.");
      showToast(message, "error");
    }
  };

  const removeFromCart = async (id) => {
    if (!token) return;

    try {
      const targetId = String(id || "");
      if (!targetId) return;
      const res = await axios.delete(`/api/cart/${targetId}`, getCartHeaders());
      setCartItems(Array.isArray(res.data?.items) ? res.data.items : []);
    } catch (err) {
      const status = Number(err?.response?.status || 0);
      const message =
        err?.response?.data?.message ||
        (status === 401 ? "Session expired. Please login again." : "Could not remove item.");
      showToast(message, "error");
    }
  };

  const updateQty = async (id, qty) => {
    if (!token) return;

    try {
      const targetId = String(id || "");
      const nextQty = Math.max(1, Number(qty) || 1);
      if (!targetId) return;
      const res = await axios.put(
        `/api/cart/${targetId}`,
        { qty: nextQty },
        getCartHeaders()
      );
      setCartItems(Array.isArray(res.data?.items) ? res.data.items : []);
    } catch (err) {
      const status = Number(err?.response?.status || 0);
      const message =
        err?.response?.data?.message ||
        (status === 401 ? "Session expired. Please login again." : "Could not update quantity.");
      showToast(message, "error");
    }
  };

  const clearCart = async () => {
    if (!token) {
      setCartItems([]);
      return;
    }

    try {
      await axios.delete("/api/cart", getCartHeaders());
      setCartItems([]);
    } catch (err) {
      const status = Number(err?.response?.status || 0);
      const message =
        err?.response?.data?.message ||
        (status === 401 ? "Session expired. Please login again." : "Could not clear cart.");
      showToast(message, "error");
    }
  };

  const totalPrice = cartItems.reduce(
    (total, item) => total + Number(item.price || 0) * Number(item.quantity || 1),
    0
  );

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        removeFromCart,
        updateQty,
        clearCart,
        totalPrice,
        loadCart
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export { CartContext };

