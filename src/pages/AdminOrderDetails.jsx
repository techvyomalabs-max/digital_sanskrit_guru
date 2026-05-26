import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import AdminSidebar from "../components/admin/AdminSidebar";
import { useAuth } from "../hooks/useAuth";
import { generateInvoicePdf } from "../utils/invoicePdf";
import { formatCurrencyExact, formatOrderDisplayCurrency } from "../utils/currency";
import { formatDateTime } from "../utils/date";
import "./AdminOrderDetails.css";

function AdminOrderDetails() {
  const { id } = useParams();
  const { token } = useAuth();
  const [order, setOrder] = useState(null);
  const [isLoadingOrder, setIsLoadingOrder] = useState(true);
  const [pageMessage, setPageMessage] = useState("");

  useEffect(() => {
    if (!token || !id) return;

    let active = true;
    setIsLoadingOrder(true);

    axios
      .get(`/api/orders/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then((res) => {
        if (!active) return;
        setOrder(res.data || null);
        setPageMessage("");
      })
      .catch((err) => {
        if (!active) return;
        setOrder(null);
        setPageMessage(err?.response?.data?.message || "Unable to load order details.");
      })
      .finally(() => {
        if (!active) return;
        setIsLoadingOrder(false);
      });

    return () => {
      active = false;
    };
  }, [id, token]);

  const itemCount = useMemo(() => {
    return Array.isArray(order?.items)
      ? order.items.reduce((sum, item) => sum + Math.max(1, Number(item?.quantity || 1)), 0)
      : 0;
  }, [order]);

  const displayPaymentStatus = String(order?.paymentStatus || "").trim() || "Pending";
  const displayOrderStatus = String(order?.status || "").trim() || "Pending";
  const displayRefundStatus = String(order?.refundStatus || "Not Applicable").trim() || "Not Applicable";

  const generateInvoice = () => {
    if (!order) return;
    generateInvoicePdf(order, {
      customerName: order?.user?.name || order?.shipping?.name || "Customer",
      customerEmail: order?.user?.email || "N/A",
      filePrefix: "invoice"
    });
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />

      <main className="admin-main admin-order-details-page">
        <div className="admin-order-details-head">
          <div>
            <p className="admin-order-details-kicker">Order details</p>
            <h1>{order ? `Order #${String(order._id || "").slice(-6).toUpperCase()}` : "Order Details"}</h1>
            <p className="admin-order-details-subtitle">
              Review customer, payment, shipping, and item-level information in one place.
            </p>
          </div>
          <div className="admin-order-details-actions">
            <Link to="/admin/orders" className="admin-order-details-link">
              Back to orders
            </Link>
            {order ? (
              <button type="button" className="admin-order-details-btn" onClick={generateInvoice}>
                Generate invoice
              </button>
            ) : null}
          </div>
        </div>

        {pageMessage ? <p className="admin-order-details-feedback">{pageMessage}</p> : null}

        {isLoadingOrder ? (
          <section className="admin-order-details-card">
            <p>Loading order details...</p>
          </section>
        ) : order ? (
          <>
            <section className="admin-order-details-grid">
              <article className="admin-order-details-card">
                <span className="admin-order-details-label">Customer</span>
                <strong>{order.user?.name || order.shipping?.name || "Unknown"}</strong>
                <p>{order.user?.email || "No email available"}</p>
                <p>{order.shipping?.phone || "No phone available"}</p>
              </article>

              <article className="admin-order-details-card">
                <span className="admin-order-details-label">Order status</span>
                <strong className={`admin-order-chip status-${displayOrderStatus.toLowerCase()}`}>
                  {displayOrderStatus}
                </strong>
                <p>Placed on {formatDateTime(order.createdAt)}</p>
                <p>{itemCount} item{itemCount === 1 ? "" : "s"} in this order</p>
              </article>

              <article className="admin-order-details-card">
                <span className="admin-order-details-label">Payment</span>
                <strong className={`admin-order-chip payment-${displayPaymentStatus.toLowerCase()}`}>
                  {displayPaymentStatus}
                </strong>
                {displayRefundStatus !== "Not Applicable" ? (
                  <p>
                    Refund:{" "}
                    <strong className={`admin-order-chip refund-${displayRefundStatus.toLowerCase().replace(/\s+/g, "-")}`}>
                      {displayRefundStatus}
                    </strong>
                  </p>
                ) : null}
                <p>Method: {order.paymentMethod || "Razorpay"}</p>
                <p>
                  {order?.paymentMeta?.paidAt
                    ? `Paid on ${formatDateTime(order.paymentMeta.paidAt)}`
                    : "Payment not completed yet"}
                </p>
              </article>
            </section>

            <section className="admin-order-details-layout">
              <article className="admin-order-details-card">
                <h2>Items</h2>
                <div className="admin-order-item-list">
                  {Array.isArray(order.items) && order.items.length > 0 ? (
                    order.items.map((item, index) => (
                      <div key={`${item?.name || "item"}-${index}`} className="admin-order-item-row">
                        <div>
                          <strong>{item?.name || "Product"}</strong>
                          <p>Qty: {Math.max(1, Number(item?.quantity || 1))}</p>
                        </div>
                        <span>{formatCurrencyExact(Number(item?.price || 0), item?.currency || order?.currencyDisplay?.currency || "INR")}</span>
                      </div>
                    ))
                  ) : (
                    <p>No items found for this order.</p>
                  )}
                </div>
              </article>

              <aside className="admin-order-side-stack">
                <article className="admin-order-details-card">
                  <h2>Shipping</h2>
                  <div className="admin-order-address-block">
                    <strong>{order.shipping?.name || "Customer"}</strong>
                    <p>{order.shipping?.address || "-"}</p>
                    <p>{[order.shipping?.city, order.shipping?.state, order.shipping?.pincode].filter(Boolean).join(", ")}</p>
                    <p>{order.shipping?.country || "-"}</p>
                    <p>{order.shipping?.phone || "-"}</p>
                  </div>
                </article>

                <article className="admin-order-details-card">
                  <h2>Payment summary</h2>
                  <div className="admin-order-summary-row">
                    <span>Subtotal</span>
                    <strong>{formatOrderDisplayCurrency(order, "subtotal", Number(order.subtotal || 0))}</strong>
                  </div>
                  <div className="admin-order-summary-row">
                    <span>GST ({Number(order.gstPercent || 0)}%)</span>
                    <strong>{formatOrderDisplayCurrency(order, "gstAmount", Number(order.gstAmount || 0))}</strong>
                  </div>
                  <div className="admin-order-summary-row">
                    <span>Delivery</span>
                    <strong>{formatOrderDisplayCurrency(order, "deliveryCharge", Number(order.deliveryCharge || 0))}</strong>
                  </div>
                  {Number(order.discount || 0) > 0 ? (
                    <div className="admin-order-summary-row">
                      <span>Discount {order.couponCode ? `(${order.couponCode})` : ""}</span>
                      <strong>-{formatOrderDisplayCurrency(order, "discount", Number(order.discount || 0))}</strong>
                    </div>
                  ) : null}
                  <div className="admin-order-summary-row total">
                    <span>Total</span>
                    <strong>{formatOrderDisplayCurrency(order, "total", Number(order.total || 0))}</strong>
                  </div>
                </article>

                <article className="admin-order-details-card">
                  <h2>References</h2>
                  <div className="admin-order-reference-list">
                    <div>
                      <span>Full Order ID</span>
                      <strong>{order._id}</strong>
                    </div>
                    <div>
                      <span>Razorpay Order ID</span>
                      <strong>{order?.paymentMeta?.razorpayOrderId || "-"}</strong>
                    </div>
                    <div>
                      <span>Razorpay Payment ID</span>
                      <strong>{order?.paymentMeta?.razorpayPaymentId || "-"}</strong>
                    </div>
                  </div>
                </article>
              </aside>
            </section>
          </>
        ) : (
          <section className="admin-order-details-card">
            <p>Order not found.</p>
          </section>
        )}
      </main>
    </div>
  );
}

export default AdminOrderDetails;
