import { useEffect, useState } from "react";
import axios from "axios";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { generateInvoicePdf } from "../utils/invoicePdf";
import { formatCurrencyExact, formatOrderDisplayCurrency } from "../utils/currency";
import { formatDate } from "../utils/date";
import "./MyOrders.css";

const RETURN_WINDOW_DAYS = 7;

function getEffectivePaymentStatus(order) {
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

function MyOrders() {
  const { token } = useAuth();
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [retryingOrderId, setRetryingOrderId] = useState("");
  const [requestingReturnOrderId, setRequestingReturnOrderId] = useState("");
  const [pageMessage, setPageMessage] = useState("");
  const [selectedView, setSelectedView] = useState("All");
  const razorpayKey = import.meta.env.VITE_RAZORPAY_KEY_ID || "";
  const isDummyPaymentEnabled =
    String(import.meta.env.VITE_ENABLE_DUMMY_PAYMENT || "").toLowerCase() === "true";

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${token}` }
  });

  const loadOrders = async () => {
    if (!token) return;
    try {
      const res = await axios.get("/api/orders/my", getAuthHeaders());
      setOrders(Array.isArray(res.data) ? res.data : []);
    } catch {
      setOrders([]);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [token]);

  useEffect(() => {
    const incomingMessage = String(location.state?.message || "").trim();
    if (incomingMessage) {
      setPageMessage(incomingMessage);
    }
  }, [location.state]);

  const updateOrderPaymentStatus = async (orderId, payload) => {
    await axios.put(`/api/orders/${orderId}/payment-status`, payload, getAuthHeaders());
  };

  const cancelOrder = async (orderId) => {
    const shouldCancel = window.confirm("Cancel this order before shipping?");
    if (!shouldCancel) return;

    try {
      await axios.put(`/api/orders/${orderId}/cancel`, {}, getAuthHeaders());
      await loadOrders();
      setPageMessage("Order cancelled successfully.");
    } catch (err) {
      setPageMessage(err?.response?.data?.message || "Unable to cancel this order right now.");
    }
  };

  const requestReturn = async (orderId, itemId) => {
    const reason = window.prompt("Why are you returning this product?", "Requested by customer");
    if (reason === null) return;

    const requestKey = `${orderId}:${itemId}`;
    setRequestingReturnOrderId(requestKey);
    try {
      await axios.put(
        `/api/orders/${orderId}/items/${itemId}/return-request`,
        { reason },
        getAuthHeaders()
      );
      await loadOrders();
      setPageMessage("Return request submitted successfully.");
    } catch (err) {
      setPageMessage(err?.response?.data?.message || "Unable to submit the return request right now.");
    } finally {
      setRequestingReturnOrderId("");
    }
  };

  const handleContinuePayment = async (order) => {
    if (!order?._id) return;
    if (!isDummyPaymentEnabled && !razorpayKey) {
      setPageMessage("Payment gateway key is missing. Please contact support.");
      return;
    }
    if (!isDummyPaymentEnabled && !window.Razorpay) {
      setPageMessage("Payment gateway failed to load. Please refresh and try again.");
      return;
    }

    setRetryingOrderId(order._id);
    setPageMessage("");

    try {
      const { data } = await axios.post("/api/payment/create-order", {
        amount: Number(order.total || 0)
      });

      if (isDummyPaymentEnabled) {
        const wantsToProceed = window.confirm("Dummy payment mode: click OK to mark this order as paid.");
        if (!wantsToProceed) {
          await updateOrderPaymentStatus(order._id, { paymentStatus: "Failed" });
          await loadOrders();
          setPageMessage("Payment was cancelled. You can retry anytime.");
          return;
        }

        const response = {
          razorpay_order_id: data.id || `dummy_order_${Date.now()}`,
          razorpay_payment_id: `dummy_pay_${Date.now()}`,
          razorpay_signature: "dummy_signature",
          dummy: true
        };

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
          razorpayPaymentId: response.razorpay_payment_id
        });
        await loadOrders();
        setPageMessage("Payment successful. Order is now confirmed.");
        return;
      }

      const rzp = new window.Razorpay({
        key: razorpayKey,
        amount: data.amount,
        currency: data.currency,
        name: "Digital Sanskrit Guru",
        description: "Continue Order Payment",
        order_id: data.id,
        prefill: {
          name: order?.shipping?.name || "",
          contact: order?.shipping?.phone || ""
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
              razorpayPaymentId: response.razorpay_payment_id
            });
            await loadOrders();
            setPageMessage("Payment successful. Order is now confirmed.");
          } catch {
            setPageMessage("Unable to finalize payment. Please try again.");
          }
        },
        theme: {
          color: "#1f6feb"
        }
      });

      rzp.on("payment.failed", async () => {
        try {
          await updateOrderPaymentStatus(order._id, { paymentStatus: "Failed" });
          await loadOrders();
        } catch {
          // Ignore update errors here; user can retry.
        }
        setPageMessage("Payment failed. You can retry again from My Orders.");
      });

      rzp.open();
    } catch (err) {
      setPageMessage(err?.response?.data?.message || "Unable to continue payment right now.");
    } finally {
      setRetryingOrderId("");
    }
  };

  const generateInvoice = (order) => {
    generateInvoicePdf(order, {
      customerName: order?.shipping?.name || "Customer",
      customerEmail: "N/A",
      filePrefix: "invoice"
    });
  };

  const viewCounts = orders.reduce(
    (acc, order) => {
      const paymentStatus = getEffectivePaymentStatus(order);
      acc.All += 1;
      if (paymentStatus !== "Paid") {
        acc.ActionRequired += 1;
      } else {
        acc.Completed += 1;
      }
      return acc;
    },
    { All: 0, ActionRequired: 0, Completed: 0 }
  );

  const visibleOrders = orders.filter((order) => {
    if (selectedView === "All") return true;
    const paymentStatus = getEffectivePaymentStatus(order);
    if (selectedView === "ActionRequired") return paymentStatus !== "Paid";
    return paymentStatus === "Paid";
  });

  return (
    <div className="my-orders-page">
      <div className="my-orders-head">
        <h1>Your Orders</h1>
      </div>
      <div className="my-orders-filters">
        <button
          type="button"
          className={selectedView === "All" ? "my-orders-filter active" : "my-orders-filter"}
          onClick={() => setSelectedView("All")}
        >
          All ({viewCounts.All})
        </button>
        <button
          type="button"
          className={selectedView === "ActionRequired" ? "my-orders-filter active" : "my-orders-filter"}
          onClick={() => setSelectedView("ActionRequired")}
        >
          Action Required ({viewCounts.ActionRequired})
        </button>
        <button
          type="button"
          className={selectedView === "Completed" ? "my-orders-filter active" : "my-orders-filter"}
          onClick={() => setSelectedView("Completed")}
        >
          Completed ({viewCounts.Completed})
        </button>
      </div>

      {pageMessage ? <p className="my-orders-banner">{pageMessage}</p> : null}

      {visibleOrders.length === 0 && <p className="my-orders-empty">No orders in this view.</p>}

      {visibleOrders.map((order) => {
        const status = String(order.status || "Pending");
        const paymentStatus = getEffectivePaymentStatus(order);
        const isPaid = paymentStatus === "Paid";
        const orderStatusLabel = status === "Cancelled" ? "Cancelled" : isPaid ? status : "On Hold";
        const refundStatus = String(order?.refundStatus || "Not Applicable");
        const paymentStatusLabel = paymentStatus;
        const canDownloadInvoice = isPaid && (status === "Shipped" || status === "Delivered");
        const items = Array.isArray(order.items) ? order.items : [];
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
                        <div className="my-order-item-content">
                          {itemId ? (
                            <Link to={`/product/${itemId}`} className="my-order-item-link">
                              <strong>{item.name}</strong>
                            </Link>
                          ) : (
                            <strong>{item.name}</strong>
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
                        </div>
                        <div className="my-order-item-side">
                          <span>{formatCurrencyExact(Number(item?.price || 0), item?.currency || order?.currencyDisplay?.currency || "INR")}</span>
                          <span>Qty: {item.quantity || 1}</span>
                          {canRequestReturn ? (
                            <button
                              className="my-order-return-btn"
                              onClick={() => requestReturn(order._id, itemId)}
                              disabled={requestingReturnOrderId === `${order._id}:${itemId}`}
                            >
                              {requestingReturnOrderId === `${order._id}:${itemId}` ? "Submitting..." : "Return product"}
                            </button>
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
                  disabled={!canDownloadInvoice}
                  onClick={() => {
                    if (!canDownloadInvoice) return;
                    generateInvoice(order);
                  }}
                >
                  {canDownloadInvoice ? "Download invoice" : "Invoice after shipping"}
                </button>

                <p className="my-order-invoice-note">
                  {status === "Cancelled"
                    ? "Invoice is not available for cancelled orders."
                    : canDownloadInvoice
                      ? "Your invoice is ready to download."
                      : "Invoice will be available once this order is paid and shipped."}
                </p>

                {shouldShowRefundStatus ? (
                  <p className="my-order-refund-note">Refund status: {refundStatus}</p>
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
                    onClick={() => cancelOrder(order._id)}
                  >
                    Cancel order
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default MyOrders;
