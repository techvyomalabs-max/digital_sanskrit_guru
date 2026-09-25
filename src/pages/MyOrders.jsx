import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useCart } from "../hooks/useCart";
import { useWishlist } from "../hooks/useWishlist";
import { formatCurrencyExact, formatOrderDisplayCurrency } from "../utils/currency";
import { formatDate } from "../utils/date";
import { useToast } from "../hooks/useToast";
import { loadRazorpayCheckout } from "../utils/loadRazorpay";
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Package,
  RotateCcw,
  ShieldCheck,
  X,
  Search,
  Copy,
  Check,
  Truck,
  ExternalLink,
  Download,
  BookOpen,
  Zap,
  Star,
  ShoppingBag,
  Clock,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  CreditCard,
  Gift,
  ArrowRight,
  Compass,
  Grid,
  Heart,
  Sparkles
} from "lucide-react";
import LoadingSpinner from "../components/common/LoadingSpinner";
import "./MyOrders.css";

const CANCELLATION_REASONS = [
  "Ordered by mistake",
  "Found a better price elsewhere",
  "Need to change shipping address or contact info",
  "Delivery time is too long",
  "Changed my mind / No longer needed",
  "Other reason"
];

const RETURN_REASONS = [
  "Damaged or defective product received",
  "Wrong item delivered",
  "Item does not match description",
  "Missing parts or accessories",
  "Quality not as expected",
  "Other reason"
];

const RETURN_WINDOW_DAYS = 7;
const INITIAL_VISIBLE_ORDERS = 8;

function getEffectivePaymentStatus(order) {
  if (String(order?.refundStatus || "").trim() === "Refunded") return "Refunded";
  const raw = String(order?.paymentStatus || "").trim();
  if (raw) return raw;

  const shippingStatus = String(order?.status || "Pending");
  if (shippingStatus === "Shipped" || shippingStatus === "Delivered") {
    return "Paid";
  }
  return "Pending";
}

function getReturnReferenceDate(order, item) {
  const candidates = [item?.deliveredAt, order?.deliveredAt, order?.updatedAt, order?.createdAt];
  for (const candidate of candidates) {
    const date = candidate ? new Date(candidate) : null;
    if (date && !Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return null;
}

function getReturnWindowInfo(order, item) {
  const referenceDate = getReturnReferenceDate(order, item);
  if (!referenceDate) {
    return { eligible: false, daysLeft: 0 };
  }

  const msLeft = referenceDate.getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000 - Date.now();
  const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));

  return {
    eligible: msLeft >= 0,
    daysLeft
  };
}

function getCourierTrackingUrl(courierName, trackingId) {
  if (!trackingId) return "";
  const name = String(courierName || "").trim().toLowerCase();
  const trId = String(trackingId).trim();
  if (name.includes("delhivery")) {
    return `https://www.delhivery.com/track/package/${trId}`;
  } else if (name.includes("india post") || name.includes("speed post") || name.includes("post")) {
    return "https://www.indiapost.gov.in/";
  } else if (name.includes("dtdc")) {
    return `https://www.dtdc.in/tracking/tracking_results.asp?pinno=${trId}`;
  } else if (name.includes("professional") || name.includes("tpc")) {
    return "https://www.tpcindia.com/";
  } else if (name.includes("shiprocket")) {
    return `https://www.shiprocket.in/shipment-tracking/${trId}`;
  }
  return `https://www.google.com/search?q=track+${encodeURIComponent(courierName + " " + trId)}`;
}

function EmptyOrdersView({
  user,
  wishlist = [],
  cartCount = 0,
  isFiltered = false,
  selectedView = "All",
  onResetFilter
}) {
  const quickCategories = [
    { label: "Paperback Books", category: "Book - Paperback", icon: BookOpen },
    { label: "Web Versions", category: "Web Version", icon: Compass },
    { label: "Flipbooks & E-Books", category: "Flipbook", icon: Grid },
    { label: "Bundles & Combos", category: "Bundle", icon: Package },
    { label: "Top Rated Picks", route: "/?scrollTo=top-rated", icon: Star }
  ];

  const perks = [
    {
      icon: Zap,
      title: "Instant Digital Access",
      desc: "Get immediate access to web versions and digital flipbooks on any device."
    },
    {
      icon: Truck,
      title: "Worldwide Tracked Shipping",
      desc: "Fast and reliable door delivery for all physical books and Sanskrit study kits."
    },
    {
      icon: ShieldCheck,
      title: "100% Authentic Literature",
      desc: "Original Sanskrit texts, verified commentaries, and expert learning material."
    }
  ];

  return (
    <div className="orders-empty-container">
      <div className="orders-empty-hero-card">
        <div className="orders-empty-icon-ring">
          <div className="orders-empty-icon-circle">
            <Package size={40} className="orders-empty-icon" />
          </div>
          <span className="orders-empty-icon-sparkle">
            <Sparkles size={16} />
          </span>
        </div>

        <div className="orders-empty-badge">
          <Sparkles size={13} />
          <span>
            {isFiltered
              ? `Filtered View: ${selectedView}`
              : user?.name
              ? `Welcome back, ${user.name}!`
              : "Welcome to Digital Sanskrit Guru"}
          </span>
        </div>

        <h2 className="orders-empty-title">
          {isFiltered
            ? `No ${selectedView.toLowerCase()} orders found`
            : "You haven't placed any orders yet"}
        </h2>

        <p className="orders-empty-desc">
          {isFiltered
            ? `You don't have any orders under the "${selectedView}" filter. Switch to all orders or explore new titles.`
            : "Explore our curated collection of authentic Sanskrit books, interactive web versions, flipbooks, and comprehensive study bundles. Your order history and digital reader access will show up right here."}
        </p>

        <div className="orders-empty-actions">
          <Link to="/collection" className="orders-empty-primary-btn">
            <ShoppingBag size={18} />
            <span>Explore Collection</span>
            <ArrowRight size={16} />
          </Link>

          {isFiltered && (
            <button
              type="button"
              onClick={onResetFilter}
              className="orders-empty-secondary-btn"
            >
              <Package size={17} />
              <span>View All Orders</span>
            </button>
          )}

          {wishlist.length > 0 && (
            <Link to="/wishlist" className="orders-empty-secondary-btn">
              <Heart size={17} style={{ color: "#e11d48" }} />
              <span>View Wishlist ({wishlist.length})</span>
            </Link>
          )}

          {cartCount > 0 && (
            <Link to="/cart" className="orders-empty-secondary-btn">
              <ShoppingBag size={17} />
              <span>View Cart ({cartCount})</span>
            </Link>
          )}
        </div>

        {/* Quick Categories Bar */}
        <div className="orders-empty-categories-wrap">
          <span className="orders-empty-categories-label">Explore by category</span>
          <div className="orders-empty-categories-pills">
            {quickCategories.map((item) => {
              const IconComp = item.icon;
              const targetUrl = item.route || `/collection?category=${encodeURIComponent(item.category)}`;
              return (
                <Link key={item.label} to={targetUrl} className="orders-empty-category-pill">
                  <IconComp size={14} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Trust & Value Perks */}
      <div className="orders-empty-perks-grid">
        {perks.map((perk) => {
          const PerkIcon = perk.icon;
          return (
            <div key={perk.title} className="orders-empty-perk-card">
              <div className="orders-empty-perk-icon-wrap">
                <PerkIcon size={20} />
              </div>
              <div className="orders-empty-perk-copy">
                <h4>{perk.title}</h4>
                <p>{perk.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MyOrders() {
  const { token, user } = useAuth();
  const { addToCart, cartItems = [] } = useCart();
  const { wishlist = [] } = useWishlist();
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [retryingOrderId, setRetryingOrderId] = useState("");
  const [generatingInvoiceOrderId, setGeneratingInvoiceOrderId] = useState("");
  const [pageMessage, setPageMessage] = useState("");
  const [selectedView, setSelectedView] = useState("All");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_ORDERS);
  const [activeTracking, setActiveTracking] = useState({});
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [activeWebReaderUrl, setActiveWebReaderUrl] = useState("");
  const [activeKindleGuideItem, setActiveKindleGuideItem] = useState(null);
  const [orderToCancel, setOrderToCancel] = useState(null);
  const [cancelReason, setCancelReason] = useState("Ordered by mistake");
  const [customCancelReason, setCustomCancelReason] = useState("");
  const [isCancellingOrder, setIsCancellingOrder] = useState(false);
  const [returnTarget, setReturnTarget] = useState(null);
  const [returnReason, setReturnReason] = useState("Damaged or defective product received");
  const [customReturnReason, setCustomReturnReason] = useState("");
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
  const [copiedOrderId, setCopiedOrderId] = useState(null);
  const [buyingAgainItemId, setBuyingAgainItemId] = useState(null);

  const razorpayKey = import.meta.env.VITE_RAZORPAY_KEY_ID || "";
  const deferredSelectedView = useDeferredValue(selectedView);

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${token}` }
  });

  const handleCopyOrderId = (id) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(id);
      setCopiedOrderId(id);
      showToast("Order ID copied!", "success");
      setTimeout(() => setCopiedOrderId(null), 2000);
    }
  };

  const handleBuyAgain = async (item) => {
    const itemId = String(item?._id || item?.id || item?.product || "").trim();
    if (!itemId) return;
    setBuyingAgainItemId(itemId);
    try {
      await addToCart(
        {
          _id: itemId,
          name: item.name,
          price: item.price,
          image: item.image || item.product?.image,
          category: item.category || item.product?.category,
          productType: item.productType,
          isDigital: item.isDigital,
          format: item.format
        },
        1
      );
      showToast(`Added "${item.name}" to cart!`, "success");
    } catch {
      showToast("Unable to add item to cart.", "error");
    } finally {
      setBuyingAgainItemId(null);
    }
  };

  const toggleTracking = async (orderId) => {
    if (activeTracking[orderId] !== undefined && activeTracking[orderId] !== false) {
      setActiveTracking((prev) => ({ ...prev, [orderId]: false }));
      return;
    }
    setActiveTracking((prev) => ({ ...prev, [orderId]: null }));
    try {
      const res = await axios.get(`/api/orders/${orderId}/tracking`, getAuthHeaders());
      setActiveTracking((prev) => ({ ...prev, [orderId]: res.data }));
    } catch {
      setActiveTracking((prev) => ({ ...prev, [orderId]: { error: true } }));
    }
  };

  const loadOrders = async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await axios.get("/api/orders/my", getAuthHeaders());
      setOrders(Array.isArray(res.data) ? res.data : []);
    } catch {
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [token]);

  useEffect(() => {
    const incomingMessage = String(location.state?.message || "").trim();
    const shouldShowReview = !!location.state?.showReviewPrompt;
    if (shouldShowReview) {
      setShowReviewModal(true);
    }
    if (incomingMessage || shouldShowReview) {
      if (incomingMessage) {
        showToast(incomingMessage, incomingMessage.toLowerCase().includes("success") ? "success" : "info");
      }
      navigate(
        {
          pathname: location.pathname,
          search: location.search
        },
        {
          replace: true,
          state: {}
        }
      );
    }
  }, [location.pathname, location.search, location.state, navigate, showToast]);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_ORDERS);
  }, [selectedView, orders.length]);

  const updateOrderPaymentStatus = async (orderId, payload) => {
    await axios.put(`/api/orders/${orderId}/payment-status`, payload, getAuthHeaders());
  };

  const handleConfirmCancelOrder = async (e) => {
    if (e) e.preventDefault();
    if (!orderToCancel) return;
    const finalReason =
      cancelReason === "Other reason" && customCancelReason.trim()
        ? customCancelReason.trim()
        : cancelReason;

    setIsCancellingOrder(true);
    try {
      await axios.put(`/api/orders/${orderToCancel._id}/cancel`, { reason: finalReason }, getAuthHeaders());
      await loadOrders();
      setPageMessage("Order cancelled successfully.");
      showToast("Order cancelled successfully.", "success");
      setOrderToCancel(null);
      setCancelReason("Ordered by mistake");
      setCustomCancelReason("");
    } catch (err) {
      const errMsg = err?.response?.data?.message || "Unable to cancel this order right now.";
      setPageMessage(errMsg);
      showToast(errMsg, "error");
    } finally {
      setIsCancellingOrder(false);
    }
  };

  const handleConfirmReturnRequest = async (e) => {
    if (e) e.preventDefault();
    if (!returnTarget) return;
    const finalReason =
      returnReason === "Other reason" && customReturnReason.trim()
        ? customReturnReason.trim()
        : returnReason;

    setIsSubmittingReturn(true);
    try {
      await axios.put(
        `/api/orders/${returnTarget.orderId}/items/${returnTarget.itemId}/return-request`,
        { reason: finalReason },
        getAuthHeaders()
      );
      await loadOrders();
      setPageMessage("Return request submitted successfully.");
      showToast("Return request submitted successfully.", "success");
      setReturnTarget(null);
      setReturnReason("Damaged or defective product received");
      setCustomReturnReason("");
    } catch (err) {
      const errMsg = err?.response?.data?.message || "Unable to submit return request.";
      setPageMessage(errMsg);
      showToast(errMsg, "error");
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  const handleContinuePayment = async (order) => {
    if (!order?._id) return;
    if (!razorpayKey) {
      setPageMessage("Payment gateway key is missing. Please contact support.");
      return;
    }
    setRetryingOrderId(order._id);
    setPageMessage("");

    try {
      const RazorpayConstructor = await loadRazorpayCheckout();

      const { data } = await axios.post("/api/payment/create-order", {
        amount: Number(order.total || 0)
      });

      const cleanPhone = String(order?.shipping?.phone || "").replace(/\D/g, "").replace(/^0+/, "");
      const cleanEmail = String(order?.user?.email || order?.shipping?.email || "").trim();

      const rzp = new RazorpayConstructor({
        key: razorpayKey,
        amount: data.amount,
        currency: data.currency,
        name: "Digital Sanskrit Guru",
        description: "Complete Order Payment",
        order_id: data.id,
        prefill: {
          name: order?.shipping?.name || "",
          email: cleanEmail,
          contact: cleanPhone
        },
        notes: {
          orderId: String(order._id)
        },
        handler: async (response) => {
          try {
            const verify = await axios.post("/api/payment/verify", response);
            if (!verify.data?.success) {
              await updateOrderPaymentStatus(order._id, { paymentStatus: "Failed" });
              await loadOrders();
              setPageMessage("Payment verification failed. Please try again.");
              return;
            }
            await updateOrderPaymentStatus(order._id, {
              paymentStatus: "Paid",
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature
            });
            await loadOrders();
            showToast("Payment successful! Order is confirmed.", "success");
          } catch {
            setPageMessage("Unable to finalize payment.");
          }
        },
        theme: {
          color: "#b45309"
        }
      });

      rzp.on("payment.failed", async (response) => {
        try {
          await updateOrderPaymentStatus(order._id, { paymentStatus: "Failed" });
          await loadOrders();
        } catch {
          // Ignore
        }
        const failReason =
          response?.error?.description ||
          response?.error?.reason ||
          "Payment failed. You can retry from My Orders.";
        setPageMessage(`Payment failed: ${failReason}`);
      });

      rzp.open();
    } catch (err) {
      setPageMessage(err?.response?.data?.message || err?.message || "Unable to continue payment.");
    } finally {
      setRetryingOrderId("");
    }
  };

  const generateInvoice = async (order) => {
    setGeneratingInvoiceOrderId(String(order?._id || ""));
    setPageMessage("");

    try {
      const { generateInvoicePdf } = await import("../utils/invoicePdf");
      generateInvoicePdf(order, {
        customerName: order?.shipping?.name || "Customer",
        customerEmail: "N/A",
        filePrefix: "invoice"
      });
    } catch {
      setPageMessage("Unable to generate invoice.");
    } finally {
      setGeneratingInvoiceOrderId("");
    }
  };

  const orderBuckets = useMemo(() => {
    const buckets = {
      All: [],
      ActionRequired: [],
      Completed: []
    };

    for (const order of orders) {
      const paymentStatus = getEffectivePaymentStatus(order);
      buckets.All.push(order);
      if (paymentStatus !== "Paid") {
        buckets.ActionRequired.push(order);
      } else {
        buckets.Completed.push(order);
      }
    }

    return buckets;
  }, [orders]);

  const viewCounts = useMemo(
    () => ({
      All: orderBuckets.All.length,
      ActionRequired: orderBuckets.ActionRequired.length,
      Completed: orderBuckets.Completed.length
    }),
    [orderBuckets]
  );

  const filteredOrders = orderBuckets[deferredSelectedView] || orderBuckets.All;
  const visibleOrders = useMemo(
    () => filteredOrders.slice(0, visibleCount),
    [filteredOrders, visibleCount]
  );
  const hasMoreOrders = filteredOrders.length > visibleOrders.length;

  const selectView = (nextView) => {
    if (nextView === selectedView) return;
    startTransition(() => {
      setSelectedView(nextView);
    });
  };

  return (
    <div className="my-orders-page">
      <div className="my-orders-head">
        <h1>Your Orders</h1>
      </div>

      {!isLoading && orders.length > 0 && (
        <div className="my-orders-filters">
          <button
            type="button"
            className={selectedView === "All" ? "my-orders-filter active" : "my-orders-filter"}
            onClick={() => selectView("All")}
          >
            All ({isLoading ? "..." : viewCounts.All})
          </button>
          <button
            type="button"
            className={selectedView === "ActionRequired" ? "my-orders-filter active" : "my-orders-filter"}
            onClick={() => selectView("ActionRequired")}
          >
            Action Required ({isLoading ? "..." : viewCounts.ActionRequired})
          </button>
          <button
            type="button"
            className={selectedView === "Completed" ? "my-orders-filter active" : "my-orders-filter"}
            onClick={() => selectView("Completed")}
          >
            Completed ({isLoading ? "..." : viewCounts.Completed})
          </button>
        </div>
      )}

      {deferredSelectedView !== selectedView && (
        <p className="my-orders-updating">Updating orders view...</p>
      )}

      {pageMessage && <p className="my-orders-banner">{pageMessage}</p>}

      {isLoading ? (
        <LoadingSpinner text="Loading your orders..." minHeight="240px" />
      ) : orders.length === 0 ? (
        <EmptyOrdersView
          user={user}
          wishlist={wishlist}
          cartCount={cartItems.reduce((acc, i) => acc + Math.max(1, Number(i.quantity || 1)), 0)}
          isFiltered={false}
        />
      ) : visibleOrders.length === 0 ? (
        <EmptyOrdersView
          user={user}
          wishlist={wishlist}
          cartCount={cartItems.reduce((acc, i) => acc + Math.max(1, Number(i.quantity || 1)), 0)}
          isFiltered={true}
          selectedView={selectedView === "ActionRequired" ? "Action Required" : selectedView}
          onResetFilter={() => selectView("All")}
        />
      ) : (
        visibleOrders.map((order) => {
          const status = String(order.status || "Pending");
          const paymentStatus = getEffectivePaymentStatus(order);
          const isPaid = paymentStatus === "Paid";
          const orderStatusLabel = status === "Cancelled" ? "Cancelled" : isPaid ? status : "On Hold";
          const refundStatus = String(order?.refundStatus || "Not Applicable");
          const paymentStatusLabel = paymentStatus;
          const items = Array.isArray(order.items) ? order.items : [];

          const isDigitalOnly =
            items.length > 0 &&
            items.every((item) =>
              Boolean(
                item.isDigital ||
                  item.webReaderLink ||
                  item.kindleLink ||
                  String(item.name || "").toLowerCase().includes("web") ||
                  String(item.name || "").toLowerCase().includes("kindle") ||
                  String(item.name || "").toLowerCase().includes("flipbook") ||
                  String(item.format || "").toLowerCase().includes("web") ||
                  String(item.format || "").toLowerCase().includes("flipbook")
              )
            );

          const canDownloadInvoice =
            isPaid &&
            (status === "Shipped" || status === "Delivered" || status === "Completed" || isDigitalOnly);

          const orderStatusClass = `my-order-status status-${orderStatusLabel.toLowerCase().replace(/\s+/g, "-")}`;
          const paymentStatusClass = `my-order-status status-payment-${paymentStatusLabel.toLowerCase().replace(/\s+/g, "-")}`;
          const canContinuePayment = !isPaid && status !== "Delivered" && status !== "Cancelled";
          const canCancelOrder = status === "Pending";
          const shouldShowRefundStatus = refundStatus !== "Not Applicable";
          const deliveryCharge = Number(order?.deliveryCharge || 0);

          return (
            <div key={order._id} className="my-order-card">
              {/* ── 5-Column Header Bar (Desktop & Mobile Optimized) ── */}
              <div className="my-order-card-head">
                <div className="order-head-cell">
                  <span>ORDER PLACED</span>
                  <strong>{formatDate(order.createdAt)}</strong>
                </div>

                <div className="order-head-cell">
                  <span>TOTAL</span>
                  <strong>{formatOrderDisplayCurrency(order, "total", Number(order.total || 0))}</strong>
                  <small className="my-order-total-note">
                    Includes delivery {formatOrderDisplayCurrency(order, "deliveryCharge", deliveryCharge)}
                  </small>
                </div>

                <div className="order-head-cell">
                  <span>ORDER STATUS</span>
                  <strong className={orderStatusClass}>{orderStatusLabel}</strong>
                  {orderStatusLabel === "Delivered" && order.deliveredAt && (
                    <small style={{ display: "block", fontSize: "11px", color: "var(--site-text-soft)", marginTop: "2px" }}>
                      Delivered: {formatDate(order.deliveredAt)}
                    </small>
                  )}
                </div>

                <div className="order-head-cell">
                  <span>PAYMENT</span>
                  <strong className={paymentStatusClass}>{paymentStatusLabel}</strong>
                </div>

                <div className="order-head-cell my-order-id-wrap">
                  <span>ORDER #</span>
                  <div className="order-id-inner-row">
                    <strong>{order._id}</strong>
                    <button
                      type="button"
                      className="order-head-copy-btn"
                      onClick={() => handleCopyOrderId(order._id)}
                      title="Copy Order ID"
                      aria-label="Copy Order ID"
                    >
                      {copiedOrderId === order._id ? (
                        <Check size={12} className="text-emerald" />
                      ) : (
                        <Copy size={12} />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Order Body (Items on Left, Sidebar Box on Right) ── */}
              <div className="my-order-card-body">
                <div className="my-order-items">
                  <h3>{status === "Delivered" ? "Delivered items" : "Order items"}</h3>
                  {items.length === 0 ? (
                    <p className="my-order-items-empty">No items found for this order.</p>
                  ) : (
                    items.map((item, i) => {
                      const itemId = String(item?._id || item?.id || item?.product || "").trim();
                      const returnRequestStatus = String(item?.returnRequest?.status || "Not Requested").trim();
                      const returnWindow = getReturnWindowInfo(order, item);
                      const canRequestReturn =
                        status === "Delivered" &&
                        isPaid &&
                        Boolean(itemId) &&
                        returnRequestStatus === "Not Requested" &&
                        returnWindow.eligible;

                      const isItemDigital = Boolean(
                        item.isDigital ||
                          item.webReaderLink ||
                          item.kindleLink ||
                          String(item.name || "").toLowerCase().includes("web") ||
                          String(item.name || "").toLowerCase().includes("kindle") ||
                          String(item.name || "").toLowerCase().includes("flipbook")
                      );

                      return (
                        <div key={i} className="my-order-item">
                          <div className="my-order-item-main">
                            {itemId ? (
                              <Link to={`/product/${itemId}`} className="my-order-item-image-link" tabIndex={-1}>
                                <img
                                  src={item.image || item.product?.image || "/no-image.webp"}
                                  alt={item.name}
                                  className="my-order-item-thumb"
                                  onError={(e) => {
                                    e.currentTarget.src = "/no-image.webp";
                                  }}
                                />
                              </Link>
                            ) : (
                              <img
                                src={item.image || item.product?.image || "/no-image.webp"}
                                alt={item.name}
                                className="my-order-item-thumb"
                                onError={(e) => {
                                  e.currentTarget.src = "/no-image.webp";
                                }}
                              />
                            )}

                            <div className="my-order-item-content">
                              {itemId ? (
                                <Link to={`/product/${itemId}`} className="my-order-item-link">
                                  <strong>{item.name}</strong>
                                </Link>
                              ) : (
                                <strong>{item.name}</strong>
                              )}

                              {item.productType === "bundle" &&
                                Array.isArray(item.bundleItems) &&
                                item.bundleItems.length > 0 && (
                                  <div className="my-order-item-bundle-details">
                                    <p style={{ margin: "0 0 4px 0", fontSize: "12px", fontWeight: "bold", color: "var(--site-text-soft)" }}>
                                      Pack Includes:
                                    </p>
                                    <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                                      {item.bundleItems.map((bi, idx) => (
                                        <li
                                          key={idx}
                                          style={{
                                            fontSize: "12.5px",
                                            color: "var(--site-text)",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "6px",
                                            marginBottom: "2px"
                                          }}
                                        >
                                          <span style={{ color: "var(--site-text-soft)" }}>•</span>
                                          <span>{bi.name}</span>
                                          <span style={{ color: "var(--site-text-soft)" }}>(Qty: {bi.quantity * (item.quantity || 1)})</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                              {status === "Delivered" && (
                                <p className="my-order-item-return-note">
                                  {returnRequestStatus === "Requested"
                                    ? "Return requested. Our team will review it."
                                    : returnRequestStatus === "Approved"
                                    ? "Return approved. Refund is being processed."
                                    : returnRequestStatus === "Rejected"
                                    ? "Return request was rejected."
                                    : returnRequestStatus === "Refunded"
                                    ? "Returned and refunded."
                                    : returnWindow.eligible
                                    ? `Return available for ${returnWindow.daysLeft} more day${
                                        returnWindow.daysLeft === 1 ? "" : "s"
                                      }.`
                                    : "7-day return window has closed."}
                                </p>
                              )}

                              {/* Digital Reader Access Box */}
                              {isPaid &&
                                (item.isDigital ||
                                  String(item.name || "").toLowerCase().includes("kindle") ||
                                  String(item.name || "").toLowerCase().includes("web version") ||
                                  item.webReaderLink ||
                                  item.kindleLink) &&
                                (order.isRedeemedGift || !(order.isGift || item.giftCode)) && (
                                  <div className="my-order-digital-box">
                                    <div className="my-order-digital-head">
                                      ⚡ Digital Reader Access Granted
                                    </div>
                                    <div className="my-order-digital-btns">
                                      {(item.webReaderLink ||
                                        String(item.name || "").toLowerCase().includes("web") ||
                                        String(item.name || "").toLowerCase().includes("flipbook") ||
                                        item.isDigital) && (
                                        <button
                                          type="button"
                                          className="my-order-digital-btn-read"
                                          onClick={() => {
                                            const readerLink = item.webReaderLink || item.product?.webReaderLink;
                                            navigate("/my-library", {
                                              state: { autoOpenUrl: readerLink, search: item.name }
                                            });
                                          }}
                                        >
                                          {String(item.name || "").toLowerCase().includes("flipbook") ||
                                          String(item.digitalType || item.product?.digitalType || "")
                                            .toLowerCase()
                                            .includes("flipbook")
                                            ? "📖 Read Flipbook"
                                            : "📖 Read Web Version"}
                                        </button>
                                      )}
                                      {(item.kindleLink || String(item.name || "").toLowerCase().includes("kindle")) && (
                                        <a
                                          href={item.kindleLink || "https://www.amazon.in/s?k=kindle+digital+sanskrit+guru"}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="my-order-digital-btn-kindle"
                                        >
                                          📱 View Kindle Edition ↗
                                        </a>
                                      )}
                                      <button
                                        type="button"
                                        className="my-order-digital-btn-guide"
                                        onClick={() => setActiveKindleGuideItem(item)}
                                      >
                                        💡 How to Access
                                      </button>
                                    </div>
                                  </div>
                                )}

                              {/* 1-Time Gift Passcode */}
                              {isPaid && (order.isGift || item.giftCode) && (
                                <div className="my-order-gift-box">
                                  <div className="my-order-gift-inner">
                                    <div>
                                      <span className="my-order-gift-title">🎟️ 1-Time Gift Pass Code</span>
                                      <code className="my-order-gift-code">
                                        {item.giftCode ||
                                          (Array.isArray(order.giftPasses) && order.giftPasses[i]?.code) ||
                                          "GIFT-PASS-GENERATED"}
                                      </code>
                                    </div>
                                    <button
                                      type="button"
                                      className="my-order-gift-copy-btn"
                                      onClick={() => {
                                        const code =
                                          item.giftCode ||
                                          (Array.isArray(order.giftPasses) && order.giftPasses[i]?.code);
                                        if (code) {
                                          navigator.clipboard.writeText(code);
                                          showToast("Gift Pass Code copied to clipboard!", "success");
                                        }
                                      }}
                                    >
                                      📋 Copy Code
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="my-order-item-side">
                            <span className="my-order-item-price">
                              {formatCurrencyExact(
                                Number(item?.price || 0),
                                item?.currency || order?.currencyDisplay?.currency || "INR"
                              )}
                            </span>
                            <span className="my-order-item-qty">Qty: {item.quantity || 1}</span>

                            <div className="my-order-item-btn-stack">
                              <button
                                type="button"
                                className="my-order-reorder-btn"
                                disabled={buyingAgainItemId === itemId}
                                onClick={() => handleBuyAgain(item)}
                              >
                                {buyingAgainItemId === itemId ? "Adding..." : "Buy Again"}
                              </button>

                              {isPaid && status !== "Cancelled" && (
                                itemId ? (
                                  <Link
                                    to={`/product/${itemId}#write-review`}
                                    className="my-order-review-link"
                                  >
                                    Write Review
                                  </Link>
                                ) : (
                                  <Link
                                    to="/collection"
                                    className="my-order-review-link"
                                  >
                                    Write Review
                                  </Link>
                                )
                              )}

                              {canRequestReturn && (
                                <button
                                  type="button"
                                  className="my-order-return-btn"
                                  onClick={() =>
                                    setReturnTarget({
                                      orderId: order._id,
                                      itemId,
                                      itemName: item?.name || "Product"
                                    })
                                  }
                                >
                                  Return product
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* ── Right Actions Sidebar Card ── */}
                <div className="my-order-actions">
                  <button
                    type="button"
                    className="my-order-invoice-btn"
                    disabled={!canDownloadInvoice || generatingInvoiceOrderId === order._id}
                    onClick={() => {
                      if (!canDownloadInvoice) return;
                      void generateInvoice(order);
                    }}
                  >
                    {generatingInvoiceOrderId === order._id
                      ? "Generating invoice..."
                      : canDownloadInvoice
                      ? "Download invoice"
                      : isDigitalOnly
                      ? "Invoice after payment"
                      : "Invoice after shipping"}
                  </button>

                  {order.trackingId && (
                    <button
                      type="button"
                      className="my-order-track-btn"
                      onClick={() => void toggleTracking(order._id)}
                    >
                      {activeTracking[order._id] ? "Hide Tracking" : "Track Package"}
                    </button>
                  )}

                  <p className="my-order-invoice-note">
                    {status === "Cancelled"
                      ? "Invoice is not available for cancelled orders."
                      : canDownloadInvoice
                      ? "Your invoice is ready to download."
                      : isDigitalOnly
                      ? "Invoice will be available once this order is paid."
                      : "Invoice will be available once this order is paid and shipped."}
                  </p>

                  {shouldShowRefundStatus && (
                    <div className="my-order-refund-block">
                      <p className="my-order-refund-note">
                        <span>Refund:</span>{" "}
                        <span className={`my-order-status status-refund-${refundStatus.toLowerCase()}`}>
                          {refundStatus}
                        </span>
                      </p>
                      <p className="my-order-refund-subnote">
                        {refundStatus === "Pending"
                          ? "Refund initiated. Processing in 3–5 business days."
                          : refundStatus === "Processing"
                          ? "Refund is currently being processed with the bank."
                          : refundStatus === "Refunded"
                          ? "Refund has been sent to your original payment source."
                          : refundStatus === "Rejected"
                          ? "Refund request could not be processed."
                          : ""}
                      </p>
                    </div>
                  )}

                  {canContinuePayment && (
                    <button
                      type="button"
                      className="my-order-continue-btn"
                      onClick={() => handleContinuePayment(order)}
                      disabled={retryingOrderId === order._id}
                    >
                      {retryingOrderId === order._id ? "Opening payment..." : "Continue Payment"}
                    </button>
                  )}

                  {canCancelOrder && (
                    <button
                      type="button"
                      className="my-order-cancel-btn"
                      onClick={() => setOrderToCancel(order)}
                    >
                      Cancel order
                    </button>
                  )}
                </div>

                {/* ── Tracking Details Drawer (if open) ── */}
                {activeTracking[order._id] !== undefined && activeTracking[order._id] !== false && (
                  <div className="my-order-tracking-panel">
                    {activeTracking[order._id] === null ? (
                      <p style={{ fontSize: "13px", color: "var(--site-text-soft)", padding: "12px" }}>
                        Fetching live tracking details...
                      </p>
                    ) : activeTracking[order._id].error ? (
                      <p style={{ fontSize: "13px", color: "#ef4444", padding: "12px" }}>
                        Unable to load tracking details at the moment.
                      </p>
                    ) : (
                      <>
                        <div className="my-order-tracking-info-grid">
                          <div className="my-order-tracking-info-item">
                            <span>Courier Partner</span>
                            <strong>{activeTracking[order._id].courier || "Delhivery"}</strong>
                          </div>
                          <div className="my-order-tracking-info-item">
                            <span>Tracking ID</span>
                            <strong>{activeTracking[order._id].trackingId}</strong>
                          </div>
                          <div className="my-order-tracking-info-item">
                            <span>Status</span>
                            <strong>{activeTracking[order._id].status}</strong>
                          </div>
                        </div>

                        {activeTracking[order._id].trackingId && (
                          <div style={{ display: "flex", justifyContent: "flex-start", padding: "0 12px 14px 12px", marginTop: "6px" }}>
                            <a
                              href={getCourierTrackingUrl(
                                activeTracking[order._id].courier || "Delhivery",
                                activeTracking[order._id].trackingId
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="my-order-track-website-link"
                            >
                              🔗 Track on {activeTracking[order._id].courier || "Delhivery"} Website ↗
                            </a>
                          </div>
                        )}

                        <div className="my-order-tracking-stepper">
                          {activeTracking[order._id].checkpoints &&
                          activeTracking[order._id].checkpoints.length > 0 ? (
                            activeTracking[order._id].checkpoints.map((cp, idx, arr) => {
                              const isLatest = idx === arr.length - 1;
                              const stepClass = `my-order-tracking-step active ${isLatest ? "latest" : ""}`;
                              return (
                                <div key={idx} className={stepClass}>
                                  <div className="my-order-tracking-bullet" />
                                  <div className="my-order-tracking-content">
                                    <span className="my-order-tracking-status">{cp.status}</span>
                                    <p className="my-order-tracking-desc">{cp.description}</p>
                                    <div className="my-order-tracking-meta">
                                      <span className="my-order-tracking-location">{cp.location}</span>
                                      <span>•</span>
                                      <span>{new Date(cp.time).toLocaleString()}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <p style={{ fontSize: "12.5px", color: "var(--site-text-soft)" }}>
                              No tracking checkpoints logged yet.
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}

      {/* ── Pagination / Load More ── */}
      {!isLoading && hasMoreOrders && (
        <div className="my-orders-load-more-wrap">
          <p className="my-orders-load-more-note">
            Showing {visibleOrders.length} of {filteredOrders.length} orders
          </p>
          <button
            type="button"
            className="my-orders-load-more-btn"
            onClick={() => setVisibleCount((current) => current + INITIAL_VISIBLE_ORDERS)}
          >
            Show more orders
          </button>
        </div>
      )}

      {/* ── Modal: Order Cancellation ── */}
      {orderToCancel && (
        <div
          className="order-cancel-modal-backdrop"
          onClick={() => {
            if (!isCancellingOrder) setOrderToCancel(null);
          }}
        >
          <div className="order-cancel-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="order-cancel-modal-header">
              <div className="order-cancel-modal-header-info">
                <div className="order-cancel-modal-icon-badge">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="order-cancel-modal-title">Cancel Order</h3>
                  <p className="order-cancel-modal-id">#{orderToCancel._id.slice(-8).toUpperCase()}</p>
                </div>
              </div>
              <button
                type="button"
                className="order-modal-close-btn"
                onClick={() => {
                  if (!isCancellingOrder) setOrderToCancel(null);
                }}
                disabled={isCancellingOrder}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleConfirmCancelOrder} className="order-cancel-form">
              <div className="order-cancel-field-group">
                <label className="order-cancel-field-label">Reason for cancellation</label>
                <select
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="order-cancel-select"
                  required
                >
                  {CANCELLATION_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>

                {cancelReason === "Other reason" && (
                  <textarea
                    value={customCancelReason}
                    onChange={(e) => setCustomCancelReason(e.target.value)}
                    placeholder="Provide specific reason..."
                    className="order-cancel-textarea"
                    rows={2}
                    required
                  />
                )}
              </div>

              <div className="order-cancel-modal-actions">
                <button
                  type="button"
                  className="order-cancel-btn-keep"
                  onClick={() => setOrderToCancel(null)}
                  disabled={isCancellingOrder}
                >
                  Keep Order
                </button>
                <button type="submit" className="order-cancel-btn-confirm" disabled={isCancellingOrder}>
                  {isCancellingOrder ? "Cancelling..." : "Confirm Cancellation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Return Request ── */}
      {returnTarget && (
        <div
          className="order-cancel-modal-backdrop"
          onClick={() => {
            if (!isSubmittingReturn) setReturnTarget(null);
          }}
        >
          <div className="order-cancel-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="order-cancel-modal-header">
              <div className="order-cancel-modal-header-info">
                <div className="order-cancel-modal-icon-badge return-badge">
                  <RotateCcw size={20} />
                </div>
                <div>
                  <h3 className="order-cancel-modal-title">Return Item</h3>
                  <p className="order-cancel-modal-id">{returnTarget.itemName}</p>
                </div>
              </div>
              <button
                type="button"
                className="order-modal-close-btn"
                onClick={() => {
                  if (!isSubmittingReturn) setReturnTarget(null);
                }}
                disabled={isSubmittingReturn}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleConfirmReturnRequest} className="order-cancel-form">
              <div className="order-cancel-field-group">
                <label className="order-cancel-field-label">Reason for return</label>
                <select
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="order-cancel-select"
                  required
                >
                  {RETURN_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>

                <label className="order-cancel-field-label" style={{ marginTop: "10px" }}>
                  Additional Details
                </label>
                <textarea
                  value={customReturnReason}
                  onChange={(e) => setCustomReturnReason(e.target.value)}
                  placeholder="Additional feedback (optional)..."
                  className="order-cancel-textarea"
                  rows={2}
                />
              </div>

              <div className="order-cancel-modal-actions">
                <button
                  type="button"
                  className="order-cancel-btn-keep"
                  onClick={() => setReturnTarget(null)}
                  disabled={isSubmittingReturn}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="order-cancel-btn-confirm return-submit"
                  disabled={isSubmittingReturn}
                >
                  {isSubmittingReturn ? "Submitting..." : "Submit Return"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Kindle Setup Guide ── */}
      {activeKindleGuideItem && (
        <div className="review-redirect-modal-backdrop" onClick={() => setActiveKindleGuideItem(null)}>
          <div
            className="review-redirect-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "500px", textAlign: "left" }}
          >
            <h3 style={{ margin: "0 0 6px", color: "var(--site-text)" }}>📱 Access Digital Content</h3>
            <p style={{ margin: "0 0 14px", fontSize: "13px", color: "var(--site-text-soft)" }}>
              Instructions for reading <strong>{activeKindleGuideItem.name}</strong>.
            </p>

            <div style={{ display: "grid", gap: "10px" }}>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--site-border)",
                  backgroundColor: "var(--site-surface-muted)"
                }}
              >
                <h4 style={{ margin: "0 0 4px", fontSize: "13.5px" }}>📖 Web Reader</h4>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--site-text-soft)", lineHeight: 1.4 }}>
                  Click <strong>"Read Web Version"</strong> on the order item to read directly in your browser.
                </p>
              </div>

              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--site-border)",
                  backgroundColor: "var(--site-surface-muted)"
                }}
              >
                <h4 style={{ margin: "0 0 4px", fontSize: "13.5px" }}>📱 Kindle / Amazon</h4>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--site-text-soft)", lineHeight: 1.4 }}>
                  Open your Kindle app and use your Send-to-Kindle email to read.
                </p>
              </div>
            </div>

            <div style={{ marginTop: "16px", textAlign: "right" }}>
              <button
                type="button"
                className="review-redirect-btn-primary"
                onClick={() => setActiveKindleGuideItem(null)}
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MyOrders;
