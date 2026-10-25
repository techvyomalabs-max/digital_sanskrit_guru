import { useEffect, useState, useMemo, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { isExternalDelivery } from "../utils/digitalDelivery";
import { isAccessPending } from "../utils/accessStatus";
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
  const [searchQuery, setSearchQuery] = useState(
    () => location.state?.search || ""
  );

  useEffect(() => {
    if (location.state?.search) {
      setSearchQuery(location.state.search);
    }
  }, [location.state?.search]);
  
  // Secure Reader State
  const [activeReaderItem, setActiveReaderItem] = useState(null);
  const [activeBlobUrl, setActiveBlobUrl] = useState("");
  const [mediaType, setMediaType] = useState("frame"); // "video" | "audio" | "pdf" | "frame"
  const [isOpeningReader, setIsOpeningReader] = useState(false);
  const [readerError, setReaderError] = useState("");
  const [activeGuideItem, setActiveGuideItem] = useState(null);

  const closeSecureReader = useCallback(() => {
    if (activeBlobUrl && activeBlobUrl.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(activeBlobUrl);
      } catch {
        // ignore
      }
    }
    setActiveBlobUrl("");
    setActiveReaderItem(null);
    setReaderError("");
    setIsOpeningReader(false);
    setMediaType("frame");
  }, [activeBlobUrl]);

  const openSecureReader = useCallback(async (book) => {
    if (!book || book.legacyAccess || book.isWpArchive) {
      return;
    }
    const rawUrl = String(book.webReaderLink || book.product?.webReaderLink || "").trim();
    if (!rawUrl && !book.orderId) {
      showToast("Digital Reader link is being configured. Please contact support.");
      return;
    }

    setActiveReaderItem(book);
    setIsOpeningReader(true);
    setReaderError("");
    setActiveBlobUrl("");

    // Detect external embed viewer sites (e.g. Heyzine, FlipHTML5, Canva, Drive, Vimeo)
    const isExternalViewer = /^(https?:\/\/)?(online\.fliphtml5\.com|heyzine\.com|canva\.com|drive\.google\.com|youtube\.com|vimeo\.com|player\.vimeo\.com)/i.test(rawUrl);

    if (isExternalViewer) {
      setMediaType("frame");
      setActiveBlobUrl(rawUrl);
      setIsOpeningReader(false);
      return;
    }

    try {
      const orderId = book.orderId || book.orderNumber;
      const itemId = book._id || book.product || book.id;

      let streamUrl = "";
      if (orderId && itemId) {
        streamUrl = `/api/orders/digital-stream/${orderId}/${itemId}`;
      } else {
        streamUrl = rawUrl;
      }

      const response = await fetch(streamUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      if (contentType.includes("video") || /\.(mp4|webm|mkv|mov|avi)(\?.*)?$/i.test(rawUrl)) {
        setMediaType("video");
      } else if (contentType.includes("audio") || /\.(mp3|wav|ogg|m4a)(\?.*)?$/i.test(rawUrl)) {
        setMediaType("audio");
      } else if (contentType.includes("pdf") || /\.(pdf)(\?.*)?$/i.test(rawUrl)) {
        setMediaType("pdf");
      } else {
        setMediaType("frame");
      }

      setActiveBlobUrl(objectUrl);
    } catch (err) {
      console.error("[Secure Reader] Stream error:", err);
      // Fallback if direct URL is usable
      if (rawUrl) {
        setActiveBlobUrl(rawUrl);
        setMediaType("frame");
      } else {
        setReaderError("Unable to establish secure stream for this digital item. Please try again.");
      }
    } finally {
      setIsOpeningReader(false);
    }
  }, [token, showToast]);

  useEffect(() => {
    return () => {
      if (activeBlobUrl && activeBlobUrl.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(activeBlobUrl);
        } catch {
          // ignore
        }
      }
    };
  }, [activeBlobUrl]);

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

  // Prevent background page scrolling when digital reader or guide modal is open
  useEffect(() => {
    const isAnyModalOpen = Boolean(activeReaderItem || activeGuideItem);
    if (!isAnyModalOpen) return;

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        closeSecureReader();
        setActiveGuideItem(null);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [activeReaderItem, activeGuideItem, closeSecureReader]);

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
      const isOrderLegacy = Boolean(order.isWpArchive || order.legacyAccess || String(order._id || "").startsWith("wp_"));

      order.items.forEach((item) => {
        const isExternal = isExternalDelivery(item);
        if (isExternal) {
          const isGiftItem = Boolean(order.isGift || item.giftCode);
          if (isGiftItem && !order.isRedeemedGift) {
            return;
          }

          const isCancelledOrRefunded =
            order.status === "Cancelled" ||
            order.refundStatus === "Refunded" ||
            item.returnRequest?.status === "Refunded";

          if (isCancelledOrRefunded) {
            return;
          }

          const isItemPending = isAccessPending(item);
          const externalLink = item.externalAccessLink || "";
          const externalLabel = item.externalAccessLabel || "";
          const accessNote = item.accessNote || "";
          const accessGrantedAt = item.accessGrantedAt || null;

          const key = String((item.product || item._id || item.name) + (isOrderLegacy ? "_legacy" : "")).trim();
          if (seenMap.has(key)) {
            const existing = seenMap.get(key);
            existing.copies += Number(item.quantity || 1);

            if (existing.accessPending && !isItemPending) {
              existing.accessPending = false;
              existing.externalAccessLink = externalLink;
              existing.externalAccessLabel = externalLabel;
              existing.accessNote = accessNote;
              existing.accessGrantedAt = accessGrantedAt;
            } else if (!existing.accessPending && !isItemPending) {
              if (!existing.externalAccessLink && externalLink) {
                existing.externalAccessLink = externalLink;
              }
              if (!existing.externalAccessLabel && externalLabel) {
                existing.externalAccessLabel = externalLabel;
              }
              if (!existing.accessNote && accessNote) {
                existing.accessNote = accessNote;
              }
              if (!existing.accessGrantedAt && accessGrantedAt) {
                existing.accessGrantedAt = accessGrantedAt;
              }
            }
          } else {
            const entry = {
              ...item,
              _id: item.product || item._id,
              orderId: order._id,
              orderDate: order.createdAt,
              orderNumber: order._id,
              copies: Number(item.quantity || 1),
              isExternal: true,
              digitalDelivery: "external",
              externalAccessLink: externalLink,
              externalAccessLabel: externalLabel,
              accessPending: isItemPending,
              accessNote: accessNote,
              accessGrantedAt: accessGrantedAt,
              legacyAccess: isOrderLegacy,
              isWpArchive: isOrderLegacy
            };
            seenMap.set(key, entry);
            list.push(entry);
          }
          return;
        }

        const isBundle = String(item.productType || "").toLowerCase() === "bundle" || (Array.isArray(item.bundleItems) && item.bundleItems.length > 0);

        if (isBundle && Array.isArray(item.bundleItems)) {
          // Iterate over individual bundle items
          item.bundleItems.forEach((subItem) => {
            const subNameLower = String(subItem.name || "").toLowerCase();
            const isSubLegacy = Boolean(isOrderLegacy || item.legacyAccess || subItem.legacyAccess);
            const isSubDigital = Boolean(
              subItem.isDigital ||
              subItem.legacyAccess ||
              subItem.webReaderLink ||
              subItem.kindleLink ||
              subNameLower.includes("web") ||
              subNameLower.includes("flipbook") ||
              subNameLower.includes("kindle") ||
              subNameLower.includes("e-book")
            );

            if (isSubDigital) {
              const subKey = String((subItem.product || subItem._id || subItem.name) + (isSubLegacy ? "_legacy" : "")).trim();
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
                  bundleName: item.name,
                  copies: subQty,
                  webReaderLink: isSubLegacy ? "" : (subItem.webReaderLink || ""),
                  kindleLink: isSubLegacy ? "" : (subItem.kindleLink || ""),
                  digitalInstructions: isSubLegacy ? "" : (subItem.digitalInstructions || ""),
                  legacyAccess: isSubLegacy,
                  isWpArchive: isOrderLegacy
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
          const isItemLegacy = Boolean(isOrderLegacy || item.legacyAccess);
          const isDigital = Boolean(
            item.isDigital ||
            item.legacyAccess ||
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

            const key = String((item.product || item._id || item.name) + (isItemLegacy ? "_legacy" : "")).trim();
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
                webReaderLink: isItemLegacy ? "" : (item.webReaderLink || item.product?.webReaderLink || ""),
                kindleLink: isItemLegacy ? "" : (item.kindleLink || item.product?.kindleLink || ""),
                legacyAccess: isItemLegacy,
                isWpArchive: isOrderLegacy
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
      String(book.format || "").toLowerCase().includes(query) ||
      String(book.bundleName || "").toLowerCase().includes(query)
    );
  }, [digitalBooks, searchQuery]);

  const nativeBooks = useMemo(
    () => filteredBooks.filter((book) => !book.legacyAccess && !book.isWpArchive),
    [filteredBooks]
  );
  const legacyBooks = useMemo(
    () => filteredBooks.filter((book) => Boolean(book.legacyAccess || book.isWpArchive)),
    [filteredBooks]
  );

  // Auto-open reader if navigated from MyOrders with autoOpenUrl
  useEffect(() => {
    if (location.state?.autoOpenUrl && digitalBooks.length > 0 && !activeReaderItem) {
      const targetUrl = location.state.autoOpenUrl;
      const targetSearch = location.state.search;
      const match = digitalBooks.find(
        (b) =>
          !b.legacyAccess &&
          !b.isWpArchive &&
          ((b.webReaderLink && b.webReaderLink === targetUrl) ||
            (b.name && targetSearch && b.name.toLowerCase().includes(String(targetSearch).toLowerCase())))
      );
      if (match) {
        openSecureReader(match);
      } else if (targetUrl) {
        openSecureReader({
          name: targetSearch || "Digital Content",
          webReaderLink: targetUrl
        });
      }
    }
  }, [location.state, digitalBooks, activeReaderItem, openSecureReader]);

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

          {nativeBooks.length > 0 && (
            <div className="my-library-grid">
              {nativeBooks.map((book, idx) => {
                const isExternal = Boolean(book.isExternal || isExternalDelivery(book));
                const isKindle = !isExternal && (String(book.name || "").toLowerCase().includes("kindle") || Boolean(book.kindleLink));
                const isFlipbook = !isExternal && Boolean(
                  String(book.digitalType || book.product?.digitalType || "").toLowerCase().includes("flipbook") ||
                  String(book.format || book.product?.format || "").toLowerCase().includes("flipbook") ||
                  String(book.category || book.product?.category || "").toLowerCase().includes("flipbook") ||
                  String(book.name || "").toLowerCase().includes("flipbook")
                );

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
                      <span className={`my-library-format-badge ${isExternal && book.accessPending ? "pending" : ""}`}>
                        {isExternal
                          ? (book.accessPending ? "⏳ Access being set up" : "🌐 External Access")
                          : isKindle ? "📱 Kindle Edition" : isFlipbook ? "📖 Flipbook" : "⚡ Web Version"}
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

                      {isExternal && !book.accessPending && Boolean(book.accessNote) && (
                        <div className="my-library-access-note-box">
                          <strong className="my-library-access-note-title">Note from our team</strong>
                          <div className="my-library-access-note-content">{book.accessNote}</div>
                        </div>
                      )}

                      <div className="my-library-card-actions">
                        {isExternal ? (
                          book.accessPending ? (
                            <span
                              className="my-library-pending-note"
                              style={{
                                fontSize: "12.5px",
                                color: "var(--site-text-soft, #64748b)",
                                fontStyle: "italic",
                                padding: "8px 0",
                                display: "inline-block",
                                lineHeight: 1.4
                              }}
                            >
                              Our team is setting up your access. We'll email you when it's ready.
                            </span>
                          ) : book.externalAccessLink ? (
                            <a
                              href={book.externalAccessLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="my-library-btn-primary"
                              style={{
                                textDecoration: "none",
                                textAlign: "center",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center"
                              }}
                            >
                              {book.externalAccessLabel?.trim()
                                ? (book.externalAccessLabel.includes("↗")
                                    ? book.externalAccessLabel.trim()
                                    : `${book.externalAccessLabel.trim()} ↗`)
                                : "View ↗"}
                            </a>
                          ) : (
                            <span
                              style={{
                                fontSize: "12.5px",
                                color: "var(--site-text-soft, #64748b)",
                                fontStyle: "italic",
                                padding: "8px 0",
                                display: "inline-block"
                              }}
                            >
                              Access link not available yet
                            </span>
                          )
                        ) : !isKindle ? (
                          <button
                            type="button"
                            className="my-library-btn-primary"
                            onClick={() => openSecureReader(book)}
                          >
                            {isFlipbook ? "📖 Read Flipbook" : "📖 Read Web Version"}
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

                        {!isExternal && (
                          <button
                            type="button"
                            className="my-library-btn-outline"
                            onClick={() => setActiveGuideItem(book)}
                          >
                            💡 Guide
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {legacyBooks.length > 0 && (
            <div className="my-library-legacy-section" style={{ marginTop: nativeBooks.length > 0 ? "40px" : "10px" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: "700", marginBottom: "6px", color: "var(--site-text, #1f2937)" }}>
                Purchased on our previous website
              </h2>
              <p style={{ fontSize: "0.95rem", color: "var(--site-text-soft, #4b5563)", marginBottom: "20px" }}>
                These were purchased on our previous website. Please access them there using the same email address.
              </p>

              <div className="my-library-grid">
                {legacyBooks.map((book, idx) => {
                  const isKindle = String(book.name || "").toLowerCase().includes("kindle");
                  const isFlipbook = Boolean(
                    String(book.digitalType || book.product?.digitalType || "").toLowerCase().includes("flipbook") ||
                    String(book.format || book.product?.format || "").toLowerCase().includes("flipbook") ||
                    String(book.category || book.product?.category || "").toLowerCase().includes("flipbook") ||
                    String(book.name || "").toLowerCase().includes("flipbook")
                  );

                  return (
                    <div key={`legacy-${book.name}-${idx}`} className="my-library-card">
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
                          {isKindle ? "📱 Kindle Edition" : isFlipbook ? "📖 Flipbook" : "⚡ Web Version"}
                        </span>
                      </div>

                      <div className="my-library-card-body">
                        <h3 className="my-library-card-title">{book.name}</h3>

                        <div className="my-library-card-meta">
                          <span>Purchased: {formatDate(book.orderDate)}</span>
                          {book.copies > 1 && <span className="my-library-copies-badge">{book.copies} Copies</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Embedded Full-Screen Web Reader Modal (Secure In-Memory Blob Stream) */}
      {(activeReaderItem || isOpeningReader) && (
        <div
          className="review-redirect-modal-backdrop"
          onClick={closeSecureReader}
          style={{ backgroundColor: "rgba(0,0,0,0.88)", zIndex: 9999, padding: "12px" }}
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
              boxShadow: "0 12px 48px rgba(0,0,0,0.6)",
              border: "1px solid rgba(255,255,255,0.08)"
            }}
          >
            <div
              style={{
                padding: "12px 18px",
                backgroundColor: "#16213e",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid #0f3460"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#fff", fontWeight: 600, fontSize: "14px" }}>
                <span style={{ fontSize: "16px" }}>🔒</span>
                <span>
                  {activeReaderItem?.name || "Digital Sanskrit Reader"} • <span style={{ color: "#4ade80", fontSize: "12px", fontWeight: 500 }}>Encrypted Protected Session</span>
                </span>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={closeSecureReader}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    backgroundColor: "#e94560",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "12px"
                  }}
                >
                  Close Reader
                </button>
              </div>
            </div>

            {isOpeningReader ? (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "16px",
                  color: "#e2e8f0"
                }}
              >
                <div className="my-library-spinner" />
                <p style={{ margin: 0, fontSize: "14px", fontWeight: 500 }}>
                  🔒 Initializing secure session & streaming content...
                </p>
              </div>
            ) : readerError ? (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "14px",
                  padding: "24px",
                  textAlign: "center"
                }}
              >
                <div style={{ fontSize: "40px" }}>⚠️</div>
                <h3 style={{ color: "#ff6b6b", margin: 0 }}>Unable to Load Digital Media</h3>
                <p style={{ color: "#94a3b8", maxWidth: "450px", margin: 0, fontSize: "13.5px" }}>{readerError}</p>
                <button
                  type="button"
                  onClick={() => activeReaderItem && openSecureReader(activeReaderItem)}
                  className="review-redirect-btn-primary"
                  style={{ marginTop: "10px", padding: "8px 20px" }}
                >
                  Retry Loading 🔄
                </button>
              </div>
            ) : activeBlobUrl ? (
              mediaType === "video" ? (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#000",
                    overflow: "hidden"
                  }}
                >
                  <video
                    src={activeBlobUrl}
                    controls
                    autoPlay
                    controlsList="nodownload"
                    onContextMenu={(e) => e.preventDefault()}
                    style={{ width: "100%", maxHeight: "100%", objectFit: "contain" }}
                  />
                </div>
              ) : mediaType === "audio" ? (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#0d1117",
                    padding: "40px",
                    gap: "20px"
                  }}
                >
                  <div style={{ fontSize: "56px" }}>🎧</div>
                  <h3 style={{ color: "#fff", margin: 0 }}>{activeReaderItem?.name}</h3>
                  <audio
                    src={activeBlobUrl}
                    controls
                    autoPlay
                    controlsList="nodownload"
                    onContextMenu={(e) => e.preventDefault()}
                    style={{ width: "100%", maxWidth: "500px" }}
                  />
                </div>
              ) : (
                <iframe
                  src={activeBlobUrl}
                  title="Digital Sanskrit Reader"
                  onContextMenu={(e) => e.preventDefault()}
                  style={{
                    width: "100%",
                    height: "100%",
                    border: "none",
                    backgroundColor: "#ffffff",
                    userSelect: "none"
                  }}
                  allow="fullscreen"
                />
              )
            ) : null}
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
