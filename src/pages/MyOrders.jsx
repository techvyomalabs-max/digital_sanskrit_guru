import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
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
  X
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

function MyOrders() {
  const { token } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [retryingOrderId, setRetryingOrderId] = useState("");
  const [requestingReturnOrderId, setRequestingReturnOrderId] = useState("");
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
  const razorpayKey = import.meta.env.VITE_RAZORPAY_KEY_ID || "";
  const deferredSelectedView = useDeferredValue(selectedView);

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${token}` }
  });

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
      const errMsg = err?.response?.data?.message || "Unable to submit the return request right now.";
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
        description: "Continue Order Payment",
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
            showToast("Payment successful. Order is now confirmed.");
          } catch {
            setPageMessage("Unable to finalize payment. Please try again.");
          }
        },
        theme: {
          color: "#1f6feb"
        }
      });

      rzp.on("payment.failed", async (response) => {
        try {
          await updateOrderPaymentStatus(order._id, { paymentStatus: "Failed" });
          await loadOrders();
        } catch {
          // Ignore update errors here; user can retry.
        }
        const failReason =
          response?.error?.description ||
          response?.error?.reason ||
          "Payment failed. You can retry again from My Orders.";
        console.error("Razorpay payment failed:", response?.error);
        setPageMessage(`Payment failed: ${failReason}`);
      });

      rzp.open();
    } catch (err) {
      setPageMessage(err?.response?.data?.message || err?.message || "Unable to continue payment right now.");
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
      setPageMessage("Unable to generate invoice right now.");
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

      {deferredSelectedView !== selectedView ? (
        <p className="my-orders-updating">Updating orders view...</p>
      ) : null}

      {pageMessage ? <p className="my-orders-banner">{pageMessage}</p> : null}

      {isLoading ? (
        <LoadingSpinner text="Loading your orders..." minHeight="240px" />
      ) : visibleOrders.length === 0 ? (
        <p className="my-orders-empty">No orders in this view.</p>
      ) : (
        visibleOrders.map((order) => {
        const status = String(order.status || "Pending");
        const paymentStatus = getEffectivePaymentStatus(order);
        const isPaid = paymentStatus === "Paid";
        const orderStatusLabel = status === "Cancelled" ? "Cancelled" : isPaid ? status : "On Hold";
        const refundStatus = String(order?.refundStatus || "Not Applicable");
        const paymentStatusLabel = paymentStatus;
        const items = Array.isArray(order.items) ? order.items : [];
        const isDigitalOnly = items.length > 0 && items.every((item) =>
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
        const canDownloadInvoice = isPaid && (
          status === "Shipped" ||
          status === "Delivered" ||
          status === "Completed" ||
          isDigitalOnly
        );
        const orderStatusClass = `my-order-status status-${orderStatusLabel.toLowerCase().replace(/\s+/g, "-")}`;
        const paymentStatusClass = `my-order-status status-payment-${paymentStatusLabel.toLowerCase().replace(/\s+/g, "-")}`;
        const canContinuePayment = !isPaid && status !== "Delivered" && status !== "Cancelled";
        const canCancelOrder = status === "Pending";
        const shouldShowRefundStatus = refundStatus !== "Not Applicable";
        const deliveryCharge = Number(order?.deliveryCharge || 0);

        return (
          <div key={order._id} className="my-order-card">
            <div className="my-order-card-head">
              <div>
                <span>ORDER PLACED</span>
                <strong>{formatDate(order.createdAt)}</strong>
              </div>
              <div>
                <span>TOTAL</span>
                <strong>{formatOrderDisplayCurrency(order, "total", Number(order.total || 0))}</strong>
                <small className="my-order-total-note">Includes delivery {formatOrderDisplayCurrency(order, "deliveryCharge", deliveryCharge)}</small>
              </div>
              <div>
                <span>ORDER STATUS</span>
                <strong className={orderStatusClass}>{orderStatusLabel}</strong>
                {orderStatusLabel === "Delivered" && order.deliveredAt && (
                  <small style={{ display: 'block', fontSize: '11px', color: 'var(--site-text-soft)', marginTop: '2px' }}>
                    Delivered: {formatDate(order.deliveredAt)}
                  </small>
                )}
              </div>
              <div>
                <span>PAYMENT</span>
                <strong className={paymentStatusClass}>{paymentStatusLabel}</strong>
              </div>
              <div className="my-order-id-wrap">
                <span>ORDER #</span>
                <strong>{order._id}</strong>
              </div>
            </div>

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
                          {item.productType === "bundle" && Array.isArray(item.bundleItems) && item.bundleItems.length > 0 && (
                            <div className="my-order-item-bundle-details" style={{ marginTop: '8px', paddingLeft: '12px', borderLeft: '2px solid var(--site-border)' }}>
                              <p style={{ margin: '0 0 4px 0', fontSize: '12px', fontWeight: 'bold', color: 'var(--site-text-soft)' }}>
                                Pack Includes:
                              </p>
                              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                                {item.bundleItems.map((bi, idx) => (
                                  <li key={idx} style={{ fontSize: '12.5px', color: 'var(--site-text)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                    <span style={{ color: 'var(--site-text-soft)' }}>•</span>
                                    <span>{bi.name}</span>
                                    <span style={{ color: 'var(--site-text-soft)' }}>(Qty: {bi.quantity * (item.quantity || 1)})</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {status === "Delivered" ? (
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
                                        ? `Return available for ${returnWindow.daysLeft} more day${returnWindow.daysLeft === 1 ? "" : "s"}.`
                                        : "7-day return window has closed."}
                            </p>
                          ) : null}

                          {isPaid && (item.isDigital || String(item.name || "").toLowerCase().includes("kindle") || String(item.name || "").toLowerCase().includes("web version") || item.webReaderLink || item.kindleLink) && (order.isRedeemedGift || !(order.isGift || item.giftCode)) && (
                            <div style={{ marginTop: "12px", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(59, 130, 246, 0.3)", backgroundColor: "rgba(59, 130, 246, 0.05)" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 700, color: "#2563eb", marginBottom: "8px" }}>
                                ⚡ Digital Reader Access Granted
                              </div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                                {(item.webReaderLink || String(item.name || "").toLowerCase().includes("web") || String(item.name || "").toLowerCase().includes("flipbook") || item.isDigital) && (
                                  <button
                                    onClick={() => {
                                      const readerLink = item.webReaderLink || item.product?.webReaderLink;
                                      navigate("/my-library", { state: { autoOpenUrl: readerLink, search: item.name } });
                                    }}
                                    style={{ padding: "6px 12px", borderRadius: "6px", backgroundColor: "#2563eb", color: "#fff", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
                                  >
                                    {String(item.name || "").toLowerCase().includes("flipbook") || String(item.digitalType || item.product?.digitalType || "").toLowerCase().includes("flipbook") ? "📖 Read Flipbook" : "📖 Read Web Version"}
                                  </button>
                                )}
                                {(item.kindleLink || String(item.name || "").toLowerCase().includes("kindle")) && (
                                  <a
                                    href={item.kindleLink || "https://www.amazon.in/s?k=kindle+digital+sanskrit+guru"}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ padding: "6px 12px", borderRadius: "6px", backgroundColor: "#ff9900", color: "#111", border: "none", fontSize: "12px", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px", textDecoration: "none" }}
                                  >
                                    📱 View Kindle Edition on Amazon ↗
                                  </a>
                                )}
                                <button
                                  onClick={() => setActiveKindleGuideItem(item)}
                                  style={{ padding: "6px 12px", borderRadius: "6px", backgroundColor: "transparent", border: "1px solid var(--site-border)", color: "var(--site-text)", fontSize: "12px", cursor: "pointer" }}
                                >
                                  💡 How to Access
                                </button>
                              </div>
                              {item.digitalInstructions && (
                                <p style={{ margin: "8px 0 0", fontSize: "11px", color: "var(--site-text-soft)", lineHeight: 1.4 }}>
                                  {item.digitalInstructions}
                                </p>
                              )}
                            </div>
                          )}

                          {isPaid && (order.isGift || item.giftCode) && (
                            <div style={{ marginTop: "10px", padding: "10px 14px", borderRadius: "8px", border: "1px dashed #d97706", backgroundColor: "rgba(217, 119, 6, 0.06)" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                                <div>
                                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#d97706", display: "block" }}>🎟️ 1-Time Gift Pass Code</span>
                                  <code style={{ fontSize: "15px", fontWeight: 700, color: "var(--site-text)", letterSpacing: "1px" }}>
                                    {item.giftCode || (Array.isArray(order.giftPasses) && order.giftPasses[i]?.code) || "GIFT-PASS-GENERATED"}
                                  </code>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const code = item.giftCode || (Array.isArray(order.giftPasses) && order.giftPasses[i]?.code);
                                    if (code) {
                                      navigator.clipboard.writeText(code);
                                      showToast("Gift Pass Code copied to clipboard!");
                                    }
                                  }}
                                  style={{ padding: "6px 12px", borderRadius: "6px", backgroundColor: "#d97706", color: "#fff", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                                >
                                  📋 Copy Code
                                </button>
                              </div>
                              <p style={{ margin: "6px 0 0", fontSize: "11.5px", color: "var(--site-text-soft)", lineHeight: 1.4 }}>
                                Share this code with your recipient. They can redeem it anytime under <strong>🎟️ Redeem Gift Pass</strong> in the top header!
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="my-order-item-side">
                          <span>{formatCurrencyExact(Number(item?.price || 0), item?.currency || order?.currencyDisplay?.currency || "INR")}</span>
                          <span>Qty: {item.quantity || 1}</span>
                          {canRequestReturn ? (
                            <button
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
                          ) : null}
                          {isPaid && status !== "Cancelled" ? (
                            <a
                              href="https://review.digitalsanskritguru.com/"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="my-order-review-link"
                            >
                              Write Review
                            </a>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="my-order-actions">
                <button
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

                {order.trackingId ? (
                  <button
                    className="my-order-track-btn"
                    onClick={() => void toggleTracking(order._id)}
                  >
                    {activeTracking[order._id] ? "Hide Tracking" : "Track Package"}
                  </button>
                ) : null}

                <p className="my-order-invoice-note">
                  {status === "Cancelled"
                    ? "Invoice is not available for cancelled orders."
                    : canDownloadInvoice
                      ? "Your invoice is ready to download."
                      : isDigitalOnly
                        ? "Invoice will be available once this order is paid."
                        : "Invoice will be available once this order is paid and shipped."}
                </p>

                {shouldShowRefundStatus ? (
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
                ) : null}

                {canContinuePayment ? (
                  <button
                    className="my-order-continue-btn"
                    onClick={() => handleContinuePayment(order)}
                    disabled={retryingOrderId === order._id}
                  >
                    {retryingOrderId === order._id ? "Opening payment..." : "Continue Payment"}
                  </button>
                ) : null}

                {canCancelOrder ? (
                  <button
                    className="my-order-cancel-btn"
                    onClick={() => setOrderToCancel(order)}
                  >
                    Cancel order
                  </button>
                ) : null}
              </div>

              {activeTracking[order._id] !== undefined && activeTracking[order._id] !== false && (
                <div className="my-order-tracking-panel">
                  {activeTracking[order._id] === null ? (
                    <p style={{ fontSize: '13px', color: 'var(--site-text-soft)', padding: '12px' }}>
                      Fetching live tracking details...
                    </p>
                  ) : activeTracking[order._id].error ? (
                    <p style={{ fontSize: '13px', color: '#ef4444', padding: '12px' }}>
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
                        <div style={{ display: "flex", justifyContent: "flex-start", padding: "0 12px 14px 12px", marginTop: "10px" }}>
                          <a
                            href={getCourierTrackingUrl(activeTracking[order._id].courier || "Delhivery", activeTracking[order._id].trackingId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="my-order-track-website-link"
                            onClick={() => {
                              if (navigator.clipboard && activeTracking[order._id].trackingId) {
                                void navigator.clipboard.writeText(activeTracking[order._id].trackingId);
                                showToast("Tracking ID copied to clipboard! Paste it on the tracking page.", "success");
                              }
                            }}
                            style={{
                              fontSize: "12.5px",
                              fontWeight: "600",
                              color: "var(--site-accent, #e94560)",
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "5px",
                              borderBottom: "1px dashed var(--site-accent, #e94560)",
                              cursor: "pointer"
                            }}
                          >
                            🔗 Track on {activeTracking[order._id].courier || "Delhivery"} Website
                          </a>
                        </div>
                      )}

                      <div className="my-order-tracking-stepper">
                        {activeTracking[order._id].checkpoints && activeTracking[order._id].checkpoints.length > 0 ? (
                          activeTracking[order._id].checkpoints.map((cp, idx, arr) => {
                            const isLatest = idx === arr.length - 1;
                            const stepClass = `my-order-tracking-step active ${isLatest ? 'latest' : ''}`;
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
                          <p style={{ fontSize: '12.5px', color: 'var(--site-text-soft)' }}>
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
      }))}

      {!isLoading && hasMoreOrders ? (
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
      ) : null}
      {showReviewModal && (
        <div className="review-redirect-modal-backdrop" onClick={() => setShowReviewModal(false)}>
          <div className="review-redirect-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Thank you for your purchase!</h2>
            <p>Your order has been placed successfully. You can track your order status and access your items below.</p>
            <div className="review-redirect-modal-actions">
              <button
                type="button"
                className="review-redirect-btn-primary"
                onClick={() => setShowReviewModal(false)}
              >
                Go to My Orders
              </button>
            </div>
          </div>
        </div>
      )}
      {activeKindleGuideItem && (
        <div className="review-redirect-modal-backdrop" onClick={() => setActiveKindleGuideItem(null)}>
          <div className="review-redirect-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "540px", textAlign: "left" }}>
            <h3 style={{ margin: "0 0 6px", color: "var(--site-text)" }}>📱 Access Your Digital & Kindle Content</h3>
            <p style={{ margin: "0 0 16px", fontSize: "13px", color: "var(--site-text-soft)" }}>
              Instructions for reading <strong>{activeKindleGuideItem.name}</strong> on Web, Kindle app, or Kindle E-Reader device.
            </p>

            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--site-border)", backgroundColor: "var(--site-bg-soft)" }}>
                <h4 style={{ margin: "0 0 4px", fontSize: "14px" }}>📖 Option 1: Instant Web Reader</h4>
                <p style={{ margin: 0, fontSize: "12.5px", color: "var(--site-text-soft)", lineHeight: 1.4 }}>
                  Click <strong>"Read Web Version"</strong> above to open the interactive online reader in your web browser on mobile or desktop instantly.
                </p>
              </div>

              <div style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--site-border)", backgroundColor: "var(--site-bg-soft)" }}>
                <h4 style={{ margin: "0 0 4px", fontSize: "14px" }}>📱 Option 2: Send to Kindle / Amazon Kindle App</h4>
                <ol style={{ margin: "4px 0 0", paddingLeft: "20px", fontSize: "12.5px", color: "var(--site-text-soft)", lineHeight: 1.5 }}>
                  <li>Open your Amazon Kindle app or Kindle E-Reader device.</li>
                  <li>Use your Amazon account's <strong>Send to Kindle email address</strong> or click <strong>"Open on Kindle"</strong> to claim your copy.</li>
                  {activeKindleGuideItem.kindleAsin && (
                    <li>Kindle ASIN / Code: <code>{activeKindleGuideItem.kindleAsin}</code></li>
                  )}
                </ol>
              </div>
            </div>

            <div style={{ marginTop: "20px", textAlign: "right" }}>
              <button
                type="button"
                className="review-redirect-btn-primary"
                onClick={() => setActiveKindleGuideItem(null)}
              >
                Close Guide
              </button>
            </div>
          </div>
        </div>
      )}
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
              maxWidth: "1100px",
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

      {/* Premium Order Cancellation Modal */}
      {orderToCancel && (
        <div
          className="order-cancel-modal-backdrop"
          onClick={() => {
            if (!isCancellingOrder) setOrderToCancel(null);
          }}
        >
          <div
            className="order-cancel-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="order-cancel-modal-header">
              <div className="order-cancel-modal-header-info">
                <div className="order-cancel-modal-icon-badge">
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <h3 className="order-cancel-modal-title">Cancel Order</h3>
                  <p className="order-cancel-modal-id">
                    ID: #{orderToCancel._id.slice(-8).toUpperCase()}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="order-modal-close-btn"
                onClick={() => {
                  if (!isCancellingOrder) setOrderToCancel(null);
                }}
                disabled={isCancellingOrder}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmCancelOrder} className="order-cancel-form">
              {/* Product Preview Cards */}
              <div className="order-cancel-items-scroll">
                {(orderToCancel.items || []).map((item, idx) => (
                  <div key={idx} className="order-cancel-item-row">
                    <img
                      src={item.image || "/no-image.webp"}
                      alt={item.name}
                      className="order-cancel-item-thumb"
                      onError={(e) => {
                        e.currentTarget.src = "/no-image.webp";
                      }}
                    />
                    <div className="order-cancel-item-details">
                      <p className="order-cancel-item-name">{item.name}</p>
                      <div className="order-cancel-item-sub">
                        <span>Qty: {item.quantity || 1}</span>
                        <span>•</span>
                        <span>
                          {formatCurrencyExact(
                            Number(item.price || 0),
                            item.currency || orderToCancel.currencyDisplay?.currency || "INR"
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total & Refund Info Banner */}
              <div className="order-cancel-summary-box">
                <div className="order-cancel-summary-row">
                  <span>Order Total:</span>
                  <strong>
                    {formatCurrencyExact(
                      Number(orderToCancel.total || 0),
                      orderToCancel.currencyDisplay?.currency || "INR"
                    )}
                  </strong>
                </div>

                {getEffectivePaymentStatus(orderToCancel) === "Paid" ? (
                  <div className="order-cancel-refund-alert">
                    <ShieldCheck size={16} className="text-emerald" />
                    <div>
                      <strong>100% Refund Guarantee</strong>
                      <p>
                        Your payment will be automatically refunded back to your original source within 3–5 business days.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="order-cancel-unpaid-alert">
                    <CheckCircle2 size={16} className="text-sky" />
                    <span>No payment was captured. The order will be cancelled with zero fee.</span>
                  </div>
                )}
              </div>

              {/* Cancellation Reason Dropdown */}
              <div className="order-cancel-field-group">
                <label className="order-cancel-field-label">
                  Reason for Cancellation <strong className="required-star">*</strong>
                </label>
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
                    placeholder="Please specify why you want to cancel..."
                    className="order-cancel-textarea"
                    rows={2}
                    required
                  />
                )}

                {cancelReason === "Need to change shipping address or contact info" && (
                  <div className="order-cancel-tip-box">
                    <span>💡 <strong>Tip:</strong> Need to update your delivery address? Reach out on our WhatsApp support with your Order ID to update it without cancelling!</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="order-cancel-modal-actions">
                <button
                  type="button"
                  className="order-cancel-btn-keep"
                  onClick={() => setOrderToCancel(null)}
                  disabled={isCancellingOrder}
                >
                  Don't Cancel
                </button>
                <button
                  type="submit"
                  className="order-cancel-btn-confirm"
                  disabled={isCancellingOrder}
                >
                  {isCancellingOrder ? "Cancelling..." : "Confirm Cancellation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Premium Return Request Modal */}
      {returnTarget && (
        <div
          className="order-cancel-modal-backdrop"
          onClick={() => {
            if (!isSubmittingReturn) setReturnTarget(null);
          }}
        >
          <div
            className="order-cancel-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="order-cancel-modal-header">
              <div className="order-cancel-modal-header-info">
                <div className="order-cancel-modal-icon-badge return-badge">
                  <RotateCcw size={22} />
                </div>
                <div>
                  <h3 className="order-cancel-modal-title">Return Product</h3>
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
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmReturnRequest} className="order-cancel-form">
              <div className="order-cancel-field-group">
                <label className="order-cancel-field-label">
                  Reason for Return <strong className="required-star">*</strong>
                </label>
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

                <label className="order-cancel-field-label" style={{ marginTop: "12px" }}>
                  Additional Details / Feedback
                </label>
                <textarea
                  value={customReturnReason}
                  onChange={(e) => setCustomReturnReason(e.target.value)}
                  placeholder="Provide any additional comments (optional)..."
                  className="order-cancel-textarea"
                  rows={3}
                />
              </div>

              <div className="order-cancel-summary-box">
                <div className="order-cancel-refund-alert">
                  <ShieldCheck size={16} className="text-emerald" />
                  <div>
                    <strong>Easy Return Policy</strong>
                    <p>
                      Our support team will review your request and arrange return shipping / refund within 24 hours.
                    </p>
                  </div>
                </div>
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
                  {isSubmittingReturn ? "Submitting..." : "Submit Return Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default MyOrders;
