import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import AdminSidebar from "../components/admin/AdminSidebar";
import { useAuth } from "../hooks/useAuth";
import { formatCurrencyExact, formatOrderDisplayCurrency } from "../utils/currency";
import { formatDateTime } from "../utils/date";
import "./AdminOrderDetails.css";

function AdminOrderDetails() {
  const { id } = useParams();
  const { token } = useAuth();
  const [order, setOrder] = useState(null);
  const [isLoadingOrder, setIsLoadingOrder] = useState(true);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);
  const [isUpdatingRefund, setIsUpdatingRefund] = useState(false);
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

  const updateRefundStatus = async (newRefundStatus, forceManual = false) => {
    if (!order?._id) return;
    setIsUpdatingRefund(true);
    setPageMessage("");
    try {
      const res = await axios.put(
        `/api/orders/${order._id}/refund-status`,
        { refundStatus: newRefundStatus, forceManual },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setOrder(res.data || { ...order, refundStatus: newRefundStatus });
      const rzpId = res.data?.paymentMeta?.razorpayRefundId;
      setPageMessage(
        rzpId
          ? `Razorpay refund initiated successfully! (Refund ID: ${rzpId})`
          : `Refund status updated to "${newRefundStatus}".`
      );
    } catch (err) {
      const errMsg = err?.response?.data?.message || "Unable to update refund status.";
      const canForce = Boolean(err?.response?.data?.canForceManual);
      if (canForce && window.confirm(`${errMsg}\n\nDo you want to mark this order as "Refunded" manually in the store?`)) {
        return updateRefundStatus(newRefundStatus, true);
      }
      setPageMessage(errMsg);
    } finally {
      setIsUpdatingRefund(false);
    }
  };

  const itemCount = useMemo(() => {
    return Array.isArray(order?.items)
      ? order.items.reduce((sum, item) => sum + Math.max(1, Number(item?.quantity || 1)), 0)
      : 0;
  }, [order]);

  const displayPaymentStatus = String(order?.paymentStatus || "").trim() || "Pending";
  const displayOrderStatus = String(order?.status || "").trim() || "Pending";
  const displayRefundStatus = String(order?.refundStatus || "Not Applicable").trim() || "Not Applicable";

  const generateInvoice = async () => {
    if (!order) return;
    setIsGeneratingInvoice(true);
    setPageMessage("");

    try {
      const { generateInvoicePdf } = await import("../utils/invoicePdf");
      generateInvoicePdf(order, {
        customerName: order?.user?.name || order?.shipping?.name || "Customer",
        customerEmail: order?.user?.email || "N/A",
        filePrefix: "invoice"
      });
    } catch {
      setPageMessage("Unable to generate invoice right now.");
    } finally {
      setIsGeneratingInvoice(false);
    }
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
              <button
                type="button"
                className="admin-order-details-btn"
                onClick={() => void generateInvoice()}
                disabled={isGeneratingInvoice}
              >
                {isGeneratingInvoice ? "Generating invoice..." : "Generate invoice"}
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
                {displayOrderStatus === "Delivered" && order.deliveredAt && (
                  <p style={{ marginTop: '4px', fontWeight: '600', color: '#16a34a' }}>
                    Delivered on {formatDateTime(order.deliveredAt)}
                  </p>
                )}
                <p>{itemCount} item{itemCount === 1 ? "" : "s"} in this order</p>
              </article>

              <article className="admin-order-details-card">
                <span className="admin-order-details-label">Payment</span>
                <strong className={`admin-order-chip payment-${displayPaymentStatus.toLowerCase()}`}>
                  {displayPaymentStatus}
                </strong>
                {displayRefundStatus !== "Not Applicable" || displayOrderStatus === "Cancelled" ? (
                  <div className="admin-order-details-refund-control-wrap">
                    <div className="admin-order-details-refund-header">
                      <span>Refund Status:</span>
                      <strong className={`admin-order-chip refund-${displayRefundStatus.toLowerCase().replace(/\s+/g, "-")}`}>
                        {displayRefundStatus}
                      </strong>
                    </div>
                    {displayRefundStatus === "Refunded" ? (
                      <p style={{ margin: "6px 0 0", fontSize: "12.5px", fontWeight: 700, color: "#166534" }}>
                        ✓ Refund Completed & Finalized
                      </p>
                    ) : (
                      <div className="admin-order-details-refund-actions">
                        <select
                          value={displayRefundStatus}
                          onChange={(e) => updateRefundStatus(e.target.value)}
                          disabled={isUpdatingRefund}
                          className="admin-order-details-refund-select"
                          aria-label="Change refund status"
                        >
                          <option value="Pending">Pending</option>
                          <option value="Processing">Processing</option>
                          <option value="Refunded">Refunded</option>
                          <option value="Rejected">Rejected</option>
                          <option value="Not Applicable">Not Applicable</option>
                        </select>
                        {displayRefundStatus === "Pending" && (
                          <button
                            type="button"
                            className="admin-order-details-refund-btn"
                            disabled={isUpdatingRefund}
                            onClick={() => updateRefundStatus("Processing")}
                          >
                            {isUpdatingRefund ? "Updating..." : "Process Refund"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="admin-order-details-refund-btn refund-btn-success"
                          disabled={isUpdatingRefund}
                          onClick={() => updateRefundStatus("Refunded")}
                        >
                          {isUpdatingRefund ? "Updating..." : "Mark Refunded"}
                        </button>
                        {displayRefundStatus !== "Rejected" && (
                          <button
                            type="button"
                            className="admin-order-details-refund-btn refund-btn-danger"
                            disabled={isUpdatingRefund}
                            onClick={() => updateRefundStatus("Rejected")}
                          >
                            {isUpdatingRefund ? "Updating..." : "Reject"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : null}
                {order?.paymentMeta?.razorpayRefundId ? (
                  <p style={{ marginTop: '8px', color: '#4f46e5', fontWeight: 600 }}>
                    ⚡ Razorpay Refund ID: <code style={{ backgroundColor: '#eef2ff', padding: '2px 6px', borderRadius: '4px' }}>{order.paymentMeta.razorpayRefundId}</code>
                  </p>
                ) : null}
                {order?.paymentMeta?.refundedAt ? (
                  <p>Refunded on: {formatDateTime(order.paymentMeta.refundedAt)}</p>
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
                          {item.productType === "bundle" && Array.isArray(item.bundleItems) && item.bundleItems.length > 0 && (
                            <div className="admin-order-item-bundle-details" style={{ marginTop: '6px', paddingLeft: '10px', borderLeft: '2px solid #cbd5e1' }}>
                              <p style={{ margin: '0 0 2px 0', fontSize: '11px', fontWeight: 'bold', color: '#64748b' }}>
                                Pack Includes:
                              </p>
                              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                                {item.bundleItems.map((bi, idx) => (
                                  <li key={idx} style={{ fontSize: '11.5px', color: '#334155', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                                    <span style={{ color: '#94a3b8' }}>•</span>
                                    <span>{bi.name}</span>
                                    <span style={{ color: '#64748b' }}>(Qty: {bi.quantity * (item.quantity || 1)})</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
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
                  {Array.isArray(order?.items) && order.items.length > 0 && order.items.every((item) =>
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
                  ) ? (
                    <div style={{ padding: "8px 12px", borderRadius: "6px", backgroundColor: "rgba(37, 99, 235, 0.08)", color: "#2563eb", fontSize: "12.5px", fontWeight: 700 }}>
                      ⚡ Digital Order: Instant online access granted. No physical shipping required.
                    </div>
                  ) : (
                    <div className="admin-order-address-block">
                      <strong>{order.shipping?.name || "Customer"}</strong>
                      <p>{order.shipping?.address || "-"}</p>
                      <p>{[order.shipping?.city, order.shipping?.state, order.shipping?.pincode].filter(Boolean).join(", ")}</p>
                      <p>{order.shipping?.country || "-"}</p>
                      <p>{order.shipping?.phone || "-"}</p>
                    </div>
                  )}
                </article>

                {order.trackingId ? (
                  <article className="admin-order-details-card">
                    <h2>Tracking Details</h2>
                    <div className="admin-order-reference-list" style={{ marginTop: '8px' }}>
                      <div>
                        <span>Courier Partner</span>
                        <strong>{order.courierPartner || "Delhivery"}</strong>
                      </div>
                      <div>
                        <span>Tracking ID</span>
                        <strong>{order.trackingId}</strong>
                      </div>
                    </div>
                  </article>
                ) : null}

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
