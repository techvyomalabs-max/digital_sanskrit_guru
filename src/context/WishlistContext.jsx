import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { WishlistContext } from "./WishlistStore";
import { useToast } from "../hooks/useToast";
import { useAuth } from "../hooks/useAuth";

export function WishlistProvider({ children }) {
  const { showToast } = useToast();
  const { token, user } = useAuth();
  const prevTokenRef = useRef(token);
  const syncedTokenRef = useRef(null);
  const requestSeqRef = useRef(0);
  const [isLoadingWishlist, setIsLoadingWishlist] = useState(() => Boolean(token));

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
    try {
      localStorage.setItem("wishlist", JSON.stringify(wishlist));
    } catch {
      /* ignore storage error */
    }
  }, [wishlist]);

  // Fix 1: When token changes from a value to empty (logout or session expiry), clear wishlist and set owner to guest
  useEffect(() => {
    if (prevTokenRef.current && !token) {
      queueMicrotask(() => {
        setWishlist([]);
      });
      try {
        localStorage.setItem("wishlistOwner", "guest");
      } catch {
        /* ignore storage error */
      }
    }
    prevTokenRef.current = token;
  }, [token]);

  // Fix 3: Pre-update guest lists on mount if logged out and wishlistOwner is missing
  useEffect(() => {
    if (!token) {
      try {
        if (localStorage.getItem("wishlistOwner") === null) {
          localStorage.setItem("wishlistOwner", "guest");
        }
      } catch {
        /* ignore storage error */
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fix 3: Fresh fetch on login & guest-only merge logic
  useEffect(() => {
    if (!token) {
      syncedTokenRef.current = null;
      return;
    }

    if (syncedTokenRef.current === token) return;
    syncedTokenRef.current = token;
    queueMicrotask(() => {
      setIsLoadingWishlist(true);
    });

    const seq = ++requestSeqRef.current;

    // Fetch user's wishlist from the database (fresh data)
    axios
      .get("/api/wishlist", {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then((res) => {
        const serverProducts = Array.isArray(res.data?.products) ? res.data.products : [];

        let owner = "user";
        try {
          const storedOwner = localStorage.getItem("wishlistOwner");
          owner = storedOwner === null ? "user" : storedOwner;
        } catch {
          /* ignore storage error */
        }

        let localList = [];
        try {
          const raw = localStorage.getItem("wishlist");
          if (raw) localList = JSON.parse(raw);
        } catch {
          /* ignore storage error */
        }
        if (!Array.isArray(localList)) localList = [];

        const guestItemsNotInServer = owner === "guest"
          ? localList.filter((lp) => lp && lp._id && !serverProducts.some((sp) => sp && sp._id === lp._id))
          : [];

        if (owner === "guest" && guestItemsNotInServer.length > 0) {
          const unionIds = [
            ...serverProducts.map((p) => p && p._id).filter(Boolean),
            ...guestItemsNotInServer.map((p) => p && p._id).filter(Boolean)
          ];
          const uniqueIds = [...new Set(unionIds)];

          return axios
            .post(
              "/api/wishlist/sync",
              { productIds: uniqueIds },
              { headers: { Authorization: `Bearer ${token}` } }
            )
            .then((syncRes) => {
              if (seq === requestSeqRef.current) {
                const freshProducts = Array.isArray(syncRes.data?.products) ? syncRes.data.products : [];
                setWishlist(freshProducts);
              } else {
                axios
                  .get("/api/wishlist", {
                    headers: { Authorization: `Bearer ${token}` }
                  })
                  .then((freshRes) => {
                    const freshServer = Array.isArray(freshRes.data?.products) ? freshRes.data.products : [];
                    setWishlist(freshServer);
                  })
                  .catch(() => {});
              }

              if (user && user._id) {
                try {
                  localStorage.setItem("wishlistOwner", String(user._id));
                } catch {
                  /* ignore storage error */
                }
              }
            });
        } else {
          if (seq === requestSeqRef.current) {
            setWishlist(serverProducts);
          } else {
            axios
              .get("/api/wishlist", {
                headers: { Authorization: `Bearer ${token}` }
              })
              .then((freshRes) => {
                const freshServer = Array.isArray(freshRes.data?.products) ? freshRes.data.products : [];
                setWishlist(freshServer);
              })
              .catch(() => {});
          }

          if (user && user._id) {
            try {
              localStorage.setItem("wishlistOwner", String(user._id));
            } catch {
              /* ignore storage error */
            }
          }
        }
      })
      .catch(() => {
        // On GET failure: keep current local list, and do NOT change wishlistOwner
      })
      .finally(() => {
        setIsLoadingWishlist(false);
      });
  }, [token, user]);

  const addToWishlist = (product) => {
    if (!product || !product._id) return;

    const exists = wishlist.some((p) => p._id === product._id);
    if (exists) return;

    setWishlist((prev) => (prev.some((p) => p._id === product._id) ? prev : [...prev, product]));

    if (!token) {
      try {
        localStorage.setItem("wishlistOwner", "guest");
      } catch {
        /* ignore storage error */
      }
    }

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

    // Sync add to server
    if (token) {
      const seq = ++requestSeqRef.current;
      axios
        .post(
          "/api/wishlist/add",
          { productId: product._id },
          { headers: { Authorization: `Bearer ${token}` } }
        )
        .then((res) => {
          if (seq !== requestSeqRef.current) return;
          const returnedProducts = res.data?.products;
          if (Array.isArray(returnedProducts) && returnedProducts.length > 0) {
            setWishlist(returnedProducts);
          }
        })
        .catch(() => {});
    }
  };

  const removeFromWishlist = (id) => {
    if (!id) return;

    setWishlist((prev) => prev.filter((p) => p._id !== id));

    // Sync removal to server
    if (token) {
      const seq = ++requestSeqRef.current;
      axios
        .delete(`/api/wishlist/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        .then((res) => {
          if (seq !== requestSeqRef.current) return;
          const returnedProducts = res.data?.products;
          if (Array.isArray(returnedProducts)) {
            setWishlist(returnedProducts);
          }
        })
        .catch(() => {});
    }
  };

  return (
    <WishlistContext.Provider
      value={{ wishlist, isLoadingWishlist, addToWishlist, removeFromWishlist }}
    >
      {children}
    </WishlistContext.Provider>
  );
}
