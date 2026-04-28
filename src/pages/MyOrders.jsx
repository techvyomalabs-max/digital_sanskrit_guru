import { useEffect, useState } from "react";
import axios from "axios";
import { useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { generateInvoicePdf } from "../utils/invoicePdf";
import { formatCurrencyForUser } from "../utils/currency";
import { formatDate } from "../utils/date";
import "./MyOrders.css";

const progressSteps = ["Placed", "Paid", "Processing", "Print", "Dispatch", "Delivered"];

function getEffectivePaymentStatus(order) {
  const raw = String(order?.paymentStatus || "").trim();
  if (raw) return raw;

  const shippingStatus = String(order?.status || "Pending");
  if (shippingStatus === "Shipped" || shippingStatus === "Delivered") {
    return "Paid";
  }
  return "Pending";
}

function getProgressIndex(order) {
  const paymentStatus = getEffectivePaymentStatus(order);
  const status = String(order?.status || "Pending");

  if (paymentStatus !== "Paid") return 0;
  if (status === "Delivered") return 5;
  if (status === "Shipped") return 4;
  return 1;
}

function MyOrders() {
  const { token } = useAuth();
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [retryingOrderId, setRetryingOrderId] = useState("");
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
        const orderStatusLabel = isPaid ? status : "On Hold";
        const paymentStatusLabel = paymentStatus;
        const canDownloadInvoice = isPaid && (status === "Shipped" || status === "Delivered");
        const items = Array.isArray(order.items) ? order.items : [];
        const orderStatusClass = `my-order-status status-${orderStatusLabel.toLowerCase().replace(/\s+/g, "-")}`;
        const paymentStatusClass = `my-payment-status payment-${paymentStatusLabel.toLowerCase().replace(/\s+/g, "-")}`;
        const progressIndex = getProgressIndex(order);
        const canContinuePayment = !isPaid && status !== "Delivered";

        return (
          <div key={order._id} className="my-order-card">
            <div className="my-order-card-head">
              <div>
                <span>ORDER PLACED</span>
                <strong>{formatDate(order.createdAt)}</strong>
              </div>
              <div>
                <span>TOTAL</span>
                <strong>{formatCurrencyForUser(order.total)}</strong>
              </div>
              <div>
                <span>STATUS</span>
                <strong className={orderStatusClass}>{orderStatusLabel}</strong>
                {/* {isPaid && order?.paymentMeta?.paidAt ? (
                  <small className="my-order-paid-at">
                    Paid on {formatDate(order.paymentMeta.paidAt)}
                  </small>
                ) : null} */}
              </div>
              <div>
                <span>PAYMENT</span>
                <strong className={paymentStatusClass}>{paymentStatusLabel}</strong>
                {isPaid && order?.paymentMeta?.paidAt ? (
                  <small className="my-order-paid-at">
                    Paid on {formatDate(order.paymentMeta.paidAt)}
                  </small>
                ) : null}
              </div>
              <div className="my-order-id-wrap">
                <span>ORDER #</span>
                <strong>{order._id}</strong>
              </div>
            </div>

            <div className="my-order-progress-wrap">
              <h3>Order Progress</h3>
              <div className="my-order-progress">
                {progressSteps.map((step, index) => {
                  const isActive = index <= progressIndex;
                  const isCurrent = index === progressIndex;
                  const dotClassName = isCurrent
                    ? "my-order-progress-dot current"
                    : isActive
                      ? "my-order-progress-dot active"
                      : "my-order-progress-dot";
                  return (
                    <div key={`${order._id}-${step}`} className="my-order-progress-step">
                      <span className={dotClassName} />
                      <small className={isActive ? "active" : ""}>{step}</small>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="my-order-card-body">
              <div className="my-order-items">
                <h3>{status === "Delivered" ? "Delivered items" : "Order items"}</h3>
                {items.length === 0 ? (
                  <p className="my-order-items-empty">No items found for this order.</p>
                ) : (
                  items.map((item, i) => (
                    <div key={i} className="my-order-item">
                      <strong>{item.name}</strong>
                      <span>Qty: {item.quantity || 1}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="my-order-actions">
                {canContinuePayment ? (
                  <button
                    className="my-order-pay-btn"
                    onClick={() => handleContinuePayment(order)}
                    disabled={retryingOrderId === order._id}
                  >
                    {retryingOrderId === order._id ? "Opening payment..." : "Continue Payment"}
                  </button>
                ) : null}

                <button
                  className="my-order-invoice-btn"
                  disabled={!canDownloadInvoice}
                  onClick={() => {
                    if (!canDownloadInvoice) return;
                    generateInvoice(order);
                  }}
                >
                  {canDownloadInvoice ? "Download invoice" : "Invoice after payment + shipping"}
                </button>

                {!canDownloadInvoice ? (
                  <p className="my-order-invoice-note">
                    Invoice is available after payment and shipping.
                  </p>
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
