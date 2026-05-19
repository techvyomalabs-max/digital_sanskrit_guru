import { createContext, useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useToast } from "../hooks/useToast";
import { useAuth } from "../hooks/useAuth";

const CartContext = createContext();
const GUEST_CART_STORAGE_KEY = "guestCartItems";
const SAVED_FOR_LATER_STORAGE_KEY = "savedForLaterItems";

const normalizeGuestCartItems = (items) =>
  (Array.isArray(items) ? items : [])
    .map((item) => {
      const id = String(item?.id || item?._id || "").trim();
      if (!id) return null;
      return {
        id,
        _id: id,
        name: String(item?.name || "").trim(),
        price: Number(item?.price || 0),
        internationalPrice:
          item?.internationalPrice === null || item?.internationalPrice === undefined || item?.internationalPrice === ""
            ? null
            : Number(item?.internationalPrice || 0),
        internationalCountryPrices: Array.isArray(item?.internationalCountryPrices)
          ? item.internationalCountryPrices
              .map((entry) => ({
                country: String(entry?.country || "").trim(),
                price: Number(entry?.price || 0)
              }))
              .filter((entry) => entry.country && !Number.isNaN(entry.price))
          : [],
        image: String(item?.image || "").trim(),
        description: String(item?.description || "").trim(),
        category: String(item?.category || "General").trim() || "General",
        stock: Number(item?.stock || 0),
        quantity: Math.max(1, Number(item?.quantity || 1))
      };
    })
    .filter(Boolean);

const readGuestCart = () => {
  if (typeof window === "undefined") return [];
  try {
    return normalizeGuestCartItems(JSON.parse(window.localStorage.getItem(GUEST_CART_STORAGE_KEY) || "[]"));
  } catch {
    return [];
  }
};

const writeGuestCart = (items) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify(normalizeGuestCartItems(items)));
};

const readSavedForLater = () => {
  if (typeof window === "undefined") return [];
  try {
    return normalizeGuestCartItems(JSON.parse(window.localStorage.getItem(SAVED_FOR_LATER_STORAGE_KEY) || "[]"));
  } catch {
    return [];
  }
};

const writeSavedForLater = (items) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    SAVED_FOR_LATER_STORAGE_KEY,
    JSON.stringify(normalizeGuestCartItems(items))
  );
};

const upsertSavedItem = (items, nextItem) => {
  const nextId = String(nextItem?.id || nextItem?._id || "").trim();
  if (!nextId) return items;
  const existingIndex = items.findIndex((item) => String(item?.id || item?._id || "").trim() === nextId);
  if (existingIndex >= 0) {
    return items.map((item, index) =>
      index === existingIndex
        ? { ...item, quantity: Math.max(1, Number(nextItem?.quantity || item.quantity || 1)) }
        : item
    );
  }
  return [...items, { ...nextItem, id: nextId, _id: nextId }];
};

export function CartProvider({ children }) {
  const { showToast } = useToast();
  const { token } = useAuth();
  const [cartItems, setCartItems] = useState(() => readGuestCart());
  const [savedForLaterItems, setSavedForLaterItems] = useState(() => readSavedForLater());

  const getCartHeaders = () => ({
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const loadCart = useCallback(async () => {
    if (!token) {
      setCartItems(readGuestCart());
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

  useEffect(() => {
    if (token) return;
    writeGuestCart(cartItems);
  }, [cartItems, token]);

  useEffect(() => {
    writeSavedForLater(savedForLaterItems);
  }, [savedForLaterItems]);

  useEffect(() => {
    if (!token) return;

    let active = true;

    const syncGuestCartToServer = async () => {
      const guestItems = readGuestCart();
      if (guestItems.length === 0) {
        await loadCart();
        return;
      }

      try {
        for (const item of guestItems) {
          if (!item?.id) continue;
          await axios.post(
            "/api/cart",
            { productId: item.id, qty: Math.max(1, Number(item.quantity || 1)) },
            getCartHeaders()
          );
        }

        if (!active) return;
        writeGuestCart([]);
        await loadCart();
        showToast("Your saved cart items were restored after login.");
      } catch (err) {
        if (!active) return;
        const message = err?.response?.data?.message || "Could not sync saved cart items after login.";
        showToast(message, "error");
      }
    };

    syncGuestCartToServer();

    return () => {
      active = false;
    };
  }, [token, loadCart, showToast]);

  const addToCart = async (product, qty = 1) => {
    const productId = String(product?.id || product?._id || "");
    const nextQty = Math.max(1, Number(qty) || 1);
    if (!productId) return;

    if (!token) {
      setCartItems((current) => {
        const existingIndex = current.findIndex((item) => String(item?.id || item?._id || "") === productId);
        if (existingIndex >= 0) {
          return current.map((item, index) =>
            index === existingIndex
              ? { ...item, quantity: Number(item.quantity || 1) + nextQty }
              : item
          );
        }

        return [
          ...current,
          {
            id: productId,
            _id: productId,
            name: String(product?.name || "").trim(),
            price: Number(product?.price || 0),
            internationalPrice:
              product?.internationalPrice === null || product?.internationalPrice === undefined
                ? null
                : Number(product?.internationalPrice || 0),
            internationalCountryPrices: Array.isArray(product?.internationalCountryPrices)
              ? product.internationalCountryPrices
                  .map((entry) => ({
                    country: String(entry?.country || "").trim(),
                    price: Number(entry?.price || 0)
                  }))
                  .filter((entry) => entry.country && !Number.isNaN(entry.price))
              : [],
            image: String(product?.image || "").trim(),
            description: String(product?.description || "").trim(),
            category: String(product?.category || "General").trim() || "General",
            stock: Number(product?.stock || 0),
            quantity: nextQty
          }
        ];
      });
      showToast("Added to cart");
      return true;
    }

    try {
      const res = await axios.post(
        "/api/cart",
        { productId, qty: nextQty },
        getCartHeaders()
      );

      setCartItems(Array.isArray(res.data?.items) ? res.data.items : []);
      showToast("Added to cart");
      return true;
    } catch (err) {
      const status = Number(err?.response?.status || 0);
      const message =
        err?.response?.data?.message ||
        (status === 401 ? "Session expired. Please login again." : "Could not add to cart.");
      showToast(message, "error");
      return false;
    }
  };

  const removeFromCart = async (id) => {
    if (!token) {
      const targetId = String(id || "");
      setCartItems((current) => current.filter((item) => String(item?.id || item?._id || "") !== targetId));
      return true;
    }

    try {
      const targetId = String(id || "");
      if (!targetId) return;
      const res = await axios.delete(`/api/cart/${targetId}`, getCartHeaders());
      setCartItems(Array.isArray(res.data?.items) ? res.data.items : []);
      return true;
    } catch (err) {
      const status = Number(err?.response?.status || 0);
      const message =
        err?.response?.data?.message ||
        (status === 401 ? "Session expired. Please login again." : "Could not remove item.");
      showToast(message, "error");
      return false;
    }
  };

  const updateQty = async (id, qty) => {
    if (!token) {
      const targetId = String(id || "");
      const nextQty = Math.max(1, Number(qty) || 1);
      setCartItems((current) =>
        current.map((item) =>
          String(item?.id || item?._id || "") === targetId ? { ...item, quantity: nextQty } : item
        )
      );
      return true;
    }

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
      return true;
    } catch (err) {
      const status = Number(err?.response?.status || 0);
      const message =
        err?.response?.data?.message ||
        (status === 401 ? "Session expired. Please login again." : "Could not update quantity.");
      showToast(message, "error");
      return false;
    }
  };

  const clearCart = async () => {
    if (!token) {
      setCartItems([]);
      writeGuestCart([]);
      return true;
    }

    try {
      await axios.delete("/api/cart", getCartHeaders());
      setCartItems([]);
      return true;
    } catch (err) {
      const status = Number(err?.response?.status || 0);
      const message =
        err?.response?.data?.message ||
        (status === 401 ? "Session expired. Please login again." : "Could not clear cart.");
      showToast(message, "error");
      return false;
    }
  };

  const saveForLater = async (item) => {
    const targetId = String(item?.id || item?._id || "").trim();
    if (!targetId) return false;

    const removed = await removeFromCart(targetId);
    if (!removed) return false;

    setSavedForLaterItems((current) => upsertSavedItem(current, item));
    showToast("Saved for later");
    return true;
  };

  const moveToCartFromSaved = async (item) => {
    const targetId = String(item?.id || item?._id || "").trim();
    if (!targetId) return false;

    const added = await addToCart(item, Math.max(1, Number(item?.quantity || 1)));
    if (!added) return false;

    setSavedForLaterItems((current) =>
      current.filter((savedItem) => String(savedItem?.id || savedItem?._id || "").trim() !== targetId)
    );
    showToast("Moved to cart");
    return true;
  };

  const removeSavedForLater = (id) => {
    const targetId = String(id || "").trim();
    if (!targetId) return;
    setSavedForLaterItems((current) =>
      current.filter((item) => String(item?.id || item?._id || "").trim() !== targetId)
    );
    showToast("Removed from saved items");
  };

  const totalPrice = cartItems.reduce(
    (total, item) => total + Number(item.price || 0) * Number(item.quantity || 1),
    0
  );

  return (
    <CartContext.Provider
      value={{
        cartItems,
        savedForLaterItems,
        addToCart,
        removeFromCart,
        updateQty,
        clearCart,
        saveForLater,
        moveToCartFromSaved,
        removeSavedForLater,
        totalPrice,
        loadCart
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export { CartContext };

