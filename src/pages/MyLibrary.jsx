import { useEffect, useState, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import "./MyLibrary.css";

const formatDate = (dateString) => {
  if (!dateString) return "N/A";
  try {
    return new Date(dateString).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  } catch {
    return "N/A";
  }
};

function MyLibrary() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeWebReaderUrl, setActiveWebReaderUrl] = useState("");
  const [activeGuideItem, setActiveGuideItem] = useState(null);

  useEffect(() => {
    if (location.state?.autoOpenUrl) {
      setActiveWebReaderUrl(location.state.autoOpenUrl);
    }
  }, [location.state]);

  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState("");

  const fetchOrders = async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const response = await axios.get("/api/orders/my", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOrders(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error("Failed to fetch digital library:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [token]);

  const handleRedeemGift = async (e) => {
    e.preventDefault();
    const cleanCode = redeemCode.trim().toUpperCase();
    if (!cleanCode) return;

    setIsRedeeming(true);
    setRedeemError("");

    try {
      const response = await axios.post(
        "/api/gifts/redeem",
        { code: cleanCode },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data?.success) {
        showToast(response.data.message || "Gift Pass redeemed successfully!");
        setShowRedeemModal(false);
        setRedeemCode("");
        fetchOrders();
      }
    } catch (err) {
      setRedeemError(err?.response?.data?.message || "Failed to redeem Gift Pass. Please check the code.");
    } finally {
      setIsRedeeming(false);
    }
  };

  // Filter paid digital items across all user orders
  const digitalBooks = useMemo(() => {
    const list = [];
    const seenMap = new Map();

    orders.forEach((order) => {
      const isPaid = String(order.paymentStatus || "").toLowerCase() === "paid";
      if (!isPaid || !Array.isArray(order.items)) return;

      order.items.forEach((item) => {
        const isBundle = String(item.productType || "").toLowerCase() === "bundle" || (Array.isArray(item.bundleItems) && item.bundleItems.length > 0);

        if (isBundle && Array.isArray(item.bundleItems)) {
          // Iterate over individual bundle items
          item.bundleItems.forEach((subItem) => {
            const subNameLower = String(subItem.name || "").toLowerCase();
            const isSubDigital = Boolean(
              subItem.isDigital ||
              subItem.webReaderLink ||
              subItem.kindleLink ||
              subNameLower.includes("web") ||
              subNameLower.includes("flipbook") ||
              subNameLower.includes("kindle") ||
              subNameLower.includes("e-book")
            );

            if (isSubDigital) {
              const subKey = String(subItem.product || subItem._id || subItem.name).trim();
              const subQty = Number(subItem.quantity || 1) * Number(item.quantity || 1);

              if (seenMap.has(subKey)) {
                const existing = seenMap.get(subKey);
                existing.copies += subQty;
              } else {
                const entry = {
                  ...subItem,
                  _id: subItem.product || subItem._id,
                  orderId: order._id,
                  orderDate: order.createdAt,
                  orderNumber: order._id,
                  copies: subQty,
                  webReaderLink: subItem.webReaderLink || "",
                  kindleLink: subItem.kindleLink || "",
                  digitalInstructions: subItem.digitalInstructions || ""
                };
                seenMap.set(subKey, entry);
                list.push(entry);
              }
            }
          });
        } else {
          // Handle standard single product
          const nameLower = String(item.name || "").toLowerCase();
          const formatLower = String(item.format || "").toLowerCase();
          const isDigital = Boolean(
            item.isDigital ||
            item.webReaderLink ||
            item.kindleLink ||
            nameLower.includes("web") ||
            nameLower.includes("flipbook") ||
            nameLower.includes("kindle") ||
            nameLower.includes("e-book") ||
            formatLower.includes("web") ||
            formatLower.includes("flipbook")
          );

          if (isDigital) {
            const isGiftItem = Boolean(order.isGift || item.giftCode);
            if (isGiftItem && !order.isRedeemedGift) {
              return;
            }

            const key = String(item.product || item._id || item.name).trim();
            if (seenMap.has(key)) {
              const existing = seenMap.get(key);
              existing.copies += Number(item.quantity || 1);
            } else {
              const entry = {
                ...item,
                orderId: order._id,
                orderDate: order.createdAt,
                orderNumber: order._id,
                copies: Number(item.quantity || 1),
                webReaderLink: item.webReaderLink || item.product?.webReaderLink || "",
                kindleLink: item.kindleLink || item.product?.kindleLink || ""
              };
              seenMap.set(key, entry);
              list.push(entry);
            }
          }
        }
      });
    });

    return list;
  }, [orders]);

  // Apply search query filter
  const filteredBooks = useMemo(() => {
    if (!searchQuery.trim()) return digitalBooks;
    const query = searchQuery.toLowerCase().trim();
    return digitalBooks.filter((book) =>
      String(book.name || "").toLowerCase().includes(query) ||
      String(book.format || "").toLowerCase().includes(query)
    );
  }, [digitalBooks, searchQuery]);

  return (
    <div className="my-library-container">
      <div className="my-library-header">
        <div className="my-library-title-area">
          <h1>📚 My Digital Library</h1>
          <p>Access all your purchased Web Versions, Flipbooks, and E-Books in one place.</p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          {digitalBooks.length > 0 && (
            <div className="my-library-search-box">
              <input
                type="text"
                placeholder="Search your digital books..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="my-library-search-input"
              />
            </div>
          )}
          <button
            type="button"
            className="my-library-redeem-btn"
            onClick={() => setShowRedeemModal(true)}
          >
            🎟️ Redeem Gift Pass
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="my-library-loading">
          <div className="my-library-spinner" />
          <p>Loading your digital library...</p>
        </div>
      ) : digitalBooks.length === 0 ? (
        <div className="my-library-empty-card">
          <div className="my-library-empty-icon">📖</div>
          <h2>Your Digital Library is Empty</h2>
          <p>You haven't purchased any Web Versions or Flipbooks yet. Explore our Sanskrit collection to start reading instantly!</p>
          <Link to="/collection" className="my-library-explore-btn">
            Explore Collection 🛍️
          </Link>
        </div>
      ) : (
        <>
          <div className="my-library-stats-bar">
            <span>Showing <strong>{filteredBooks.length}</strong> of <strong>{digitalBooks.length}</strong> digital items</span>
          </div>

          <div className="my-library-grid">
            {filteredBooks.map((book, idx) => {
              const readerUrl = book.webReaderLink || book.product?.webReaderLink;
              const isKindle = String(book.name || "").toLowerCase().includes("kindle") || Boolean(book.kindleLink);

              return (
                <div key={`${book.name}-${idx}`} className="my-library-card">
                  <div className="my-library-card-cover-container">
                    <img
                      src={book.image || "https://placehold.co/300x400?text=Digital+Book"}
                      alt={book.name}
                      className="my-library-card-cover"
                      onError={(e) => {
                        e.target.src = "https://placehold.co/300x400?text=Sanskrit+Book";
                      }}
                    />
                    <span className="my-library-format-badge">
                      {isKindle ? "📱 Kindle Edition" : "⚡ Web Version"}
                    </span>
                  </div>

                  <div className="my-library-card-body">
                    <h3 className="my-library-card-title">{book.name}</h3>

                    <div className="my-library-card-meta">
                      <span>Purchased: {formatDate(book.orderDate)}</span>
                      {book.copies > 1 && <span className="my-library-copies-badge">{book.copies} Copies</span>}
                    </div>

                    {book.digitalInstructions && (
                      <p className="my-library-instructions-snippet">{book.digitalInstructions}</p>
                    )}

                    <div className="my-library-card-actions">
                      {!isKindle ? (
                        <button
                          type="button"
                          className="my-library-btn-primary"
                          onClick={() => {
                            if (readerUrl) {
                              setActiveWebReaderUrl(readerUrl);
                            } else {
                              showToast("Web Reader link is being configured. Please contact support.");
                            }
                          }}
                        >
                          📖 Read Web Version
                        </button>
                      ) : (
                        <a
                          href={book.kindleLink || "https://www.amazon.in/s?k=kindle+digital+sanskrit+guru"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="my-library-btn-kindle"
                        >
                          📱 View on Amazon ↗
                        </a>
                      )}

                      <button
                        type="button"
                        className="my-library-btn-outline"
                        onClick={() => setActiveGuideItem(book)}
                      >
                        💡 Guide
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Embedded Full-Screen Web Reader Modal */}
      {activeWebReaderUrl && (
        <div
          className="review-redirect-modal-backdrop"
          onClick={() => setActiveWebReaderUrl("")}
          style={{ backgroundColor: "rgba(0,0,0,0.85)", zIndex: 9999, padding: "12px" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "1150px",
              height: "90vh",
              backgroundColor: "#1a1a2e",
              borderRadius: "12px",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 10px 40px rgba(0,0,0,0.5)"
            }}
          >
            <div style={{ padding: "12px 16px", backgroundColor: "#16213e", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #0f3460" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#fff", fontWeight: 600, fontSize: "14px" }}>
                <span>📖 Digital Sanskrit Reader • Protected Access</span>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => setActiveWebReaderUrl("")}
                  style={{ padding: "6px 14px", borderRadius: "6px", backgroundColor: "#e94560", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "12px" }}
                >
                  Close Reader
                </button>
              </div>
            </div>
            <iframe
              src={activeWebReaderUrl}
              title="Digital Web Reader"
              onContextMenu={(e) => e.preventDefault()}
              style={{ width: "100%", height: "100%", border: "none", backgroundColor: "#ffffff", userSelect: "none" }}
              allow="fullscreen"
            />
          </div>
        </div>
      )}

      {/* Guide Modal */}
      {activeGuideItem && (
        <div
          className="review-redirect-modal-backdrop"
          onClick={() => setActiveGuideItem(null)}
        >
          <div
            className="review-redirect-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "520px", textAlign: "left" }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "8px", color: "var(--site-text)" }}>
              📖 Access Instructions for {activeGuideItem.name}
            </h3>

            <div style={{ fontSize: "13.5px", color: "var(--site-text)", lineHeight: 1.6, display: "flex", flexDirection: "column", gap: "10px" }}>
              {activeGuideItem.digitalInstructions ? (
                <div style={{ padding: "10px", borderRadius: "6px", backgroundColor: "var(--site-bg-soft)", border: "1px solid var(--site-border)" }}>
                  <strong>Note:</strong> {activeGuideItem.digitalInstructions}
                </div>
              ) : null}

              <div>
                <strong>⚡ Web Version / Bunny CDN Reader:</strong>
                <p style={{ margin: "4px 0 0" }}>Click "Read Web Version" to open the interactive full-screen reader directly inside your browser. No extra app required.</p>
              </div>

              <div>
                <strong>📱 Kindle Version:</strong>
                <p style={{ margin: "4px 0 0" }}>Kindle titles open directly on Amazon India / US. You can send the e-book to your Kindle device or read on the Kindle App.</p>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "20px" }}>
              <button
                type="button"
                className="review-redirect-btn-primary"
                onClick={() => setActiveGuideItem(null)}
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Redeem Gift Pass Modal */}
      {showRedeemModal && (
        <div
          className="review-redirect-modal-backdrop"
          onClick={() => {
            setShowRedeemModal(false);
            setRedeemError("");
          }}
        >
          <div
            className="review-redirect-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "460px", textAlign: "left" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <h3 style={{ margin: 0, color: "var(--site-text)", display: "flex", alignItems: "center", gap: "6px" }}>
                🎟️ Redeem Gift Pass
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowRedeemModal(false);
                  setRedeemError("");
                }}
                style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "var(--site-text-soft)" }}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: "0 0 16px", fontSize: "13px", color: "var(--site-text-soft)", lineHeight: 1.4 }}>
              Enter the 1-Time Gift Code (e.g. <code>GIFT-DSG-849201</code>) you received to unlock the book directly in your library.
            </p>

            {redeemError && (
              <div style={{ padding: "10px 12px", borderRadius: "6px", backgroundColor: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#dc2626", fontSize: "12.5px", marginBottom: "14px" }}>
                {redeemError}
              </div>
            )}

            <form onSubmit={handleRedeemGift} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <input
                type="text"
                placeholder="e.g. GIFT-DSG-849201"
                value={redeemCode}
                onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "2px dashed var(--site-border)", fontSize: "15px", fontWeight: 700, textAlign: "center", letterSpacing: "1px", textTransform: "uppercase" }}
                maxLength={20}
                required
              />

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowRedeemModal(false);
                    setRedeemError("");
                  }}
                  style={{ padding: "9px 16px", borderRadius: "8px", border: "1px solid var(--site-border)", backgroundColor: "transparent", cursor: "pointer", fontSize: "13px" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="review-redirect-btn-primary"
                  disabled={isRedeeming || !redeemCode.trim()}
                  style={{ padding: "9px 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 700 }}
                >
                  {isRedeeming ? "Redeeming..." : "Unlock Gift 📖"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default MyLibrary;
