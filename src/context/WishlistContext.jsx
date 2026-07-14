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

  // On login: sync local wishlist ↔ server (bidirectional merge)
  useEffect(() => {
    if (!token) {
      syncedRef.current = false;
      return;
    }
    if (syncedRef.current) return;
    syncedRef.current = true;

    // Fetch user's wishlist from the database
    axios
      .get("/api/wishlist", {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then((res) => {
        const serverProducts = Array.isArray(res.data?.products) ? res.data.products : [];
        
        setWishlist((prevLocal) => {
          // Merge local and server items, prioritizing local items
          const merged = [...prevLocal];
          
          serverProducts.forEach((sp) => {
            if (sp && sp._id) {
              const exists = merged.some((lp) => lp._id === sp._id);
              if (!exists) {
                merged.push(sp);
              }
            }
          });

          // If the merged list is larger than the server's list, sync the updates back to the database
          const mergedIds = merged.map((p) => p._id).filter(Boolean);
          if (mergedIds.length > serverProducts.length) {
            axios
              .post("/api/wishlist/sync", { productIds: mergedIds }, {
                headers: { Authorization: `Bearer ${token}` }
              })
              .catch(() => {});
          }

          return merged;
        });
      })
      .catch(() => {
        // Sync failure is non-critical — local data remains intact
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

      // Signal GTM and Meta Pixel of addition to wishlist
      if (window.fbq && window.fbqInitialized) {
        window.fbq("track", "AddToWishlist", {
          content_name: product.name,
          content_ids: [product._id],
          content_type: "product",
          value: Number(product.price || 0),
          currency: "INR"
        });
      }
      if (window.dataLayer) {
        window.dataLayer.push({
          event: "add_to_wishlist",
          ecommerce: {
            items: [{
              item_name: product.name,
              item_id: product._id,
              price: Number(product.price || 0),
              quantity: 1
            }]
          }
        });
      }

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
