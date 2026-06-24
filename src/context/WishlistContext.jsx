import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { WishlistContext } from "./WishlistStore";
import { useToast } from "../hooks/useToast";
import { useAuth } from "../hooks/useAuth";

export function WishlistProvider({ children }) {
  const { showToast } = useToast();
  const { token } = useAuth();
  const syncedRef = useRef(false);

  const [wishlist, setWishlist] = useState(() => {
    try {
      const saved = localStorage.getItem("wishlist");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Persist to localStorage whenever wishlist changes
  useEffect(() => {
    localStorage.setItem("wishlist", JSON.stringify(wishlist));
  }, [wishlist]);

  // On login: sync local wishlist → server (merge)
  useEffect(() => {
    if (!token) {
      syncedRef.current = false;
      return;
    }
    if (syncedRef.current) return;
    syncedRef.current = true;

    const localIds = wishlist.map((p) => p._id).filter(Boolean);
    if (localIds.length === 0) return;

    axios
      .post("/api/wishlist/sync", { productIds: localIds }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .catch(() => {
        // Sync failure is non-critical — local data is still intact
      });
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const addToWishlist = (product) => {
    let added = false;

    setWishlist((prev) => {
      const exists = prev.find((p) => p._id === product._id);
      if (exists) return prev;
      added = true;
      return [...prev, product];
    });

    if (added) {
      showToast("Added to wishlist");

      // Sync add to server (fire-and-forget)
      if (token) {
        axios
          .post("/api/wishlist/add", { productId: product._id }, {
            headers: { Authorization: `Bearer ${token}` }
          })
          .catch(() => {});
      }
    }
  };

  const removeFromWishlist = (id) => {
    setWishlist((prev) => prev.filter((p) => p._id !== id));

    // Sync removal to server (fire-and-forget)
    if (token && id) {
      axios
        .delete(`/api/wishlist/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        .catch(() => {});
    }
  };

  return (
    <WishlistContext.Provider
      value={{ wishlist, addToWishlist, removeFromWishlist }}
    >
      {children}
    </WishlistContext.Provider>
  );
}
