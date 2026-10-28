import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import AdminSidebar from "../components/admin/AdminSidebar";
import { useAuth } from "../hooks/useAuth";
import { useDialog } from "../hooks/useDialog";
import { formatCurrencyExact, formatOrderDisplayCurrency } from "../utils/currency";
import { formatDateTime } from "../utils/date";
import { isDigitalLikeItem, pendingAccessItems } from "../utils/accessStatus";
import AdminRefundModal from "../components/admin/AdminRefundModal";
import GrantAccessModal from "../components/admin/GrantAccessModal";
import "./AdminOrderDetails.css";

function AdminOrderDetails() {
  const { id } = useParams();
  const { token, user } = useAuth();
  const { confirm, prompt } = useDialog();
  const [order, setOrder] = useState(null);
  const [isLoadingOrder, setIsLoadingOrder] = useState(true);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);
  const [isUpdatingRefund, setIsUpdatingRefund] = useState(false);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [isGrantAccessModalOpen, setIsGrantAccessModalOpen] = useState(false);
  const [pageMessage, setPageMessage] = useState("");

  const isManualRefund = (ord) => {
    if (ord?.paymentMeta?.refundMethod === "manual") return true;
    const refunds = ord?.paymentMeta?.refunds;
    if (Array.isArray(refunds) && refunds.length > 0) {
      return refunds[refunds.length - 1]?.method === "manual";
    }
    return false;
  };

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

  const reloadOrder = () => {
    if (!token || !id) return;
    axios
      .get(`/api/orders/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then((res) => {
        setOrder(res.data || null);
      })
      .catch((err) => {
        setPageMessage(err?.response?.data?.message || "Unable to reload order.");
      });
  };

  const pendingItems = useMemo(() => {
    return pendingAccessItems(order);
  }, [order]);

  const isOrderPaid = String(order?.paymentStatus || "").toLowerCase() === "paid";
  const isOrderCancelled = String(order?.status || "").toLowerCase() === "cancelled";
  const isOrderRefunded = String(order?.refundStatus || "").toLowerCase() === "refunded";
  const showPendingAccessCard = pendingItems.length > 0 && isOrderPaid && !isOrderCancelled && !isOrderRefunded;

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
      let shouldForce = false;
      if (canForce) {
        shouldForce = await confirm({
          title: "Mark as Refunded?",
          message: `${errMsg}\n\nDo you want to mark this order as "Refunded" manually in the store?`,
          tone: "danger",
          confirmText: "Mark Refunded"
        });
      }
      if (shouldForce) {
        return updateRefundStatus(newRefundStatus, true);
      }
      setPageMessage(errMsg);
    } finally {
      setIsUpdatingRefund(false);
    }
  };

  const handleManualMarkPaid = async () => {
    if (!order?._id) return;
    const reason = await prompt({
      title: "Mark Order as Paid",
      message: "Enter mandatory reason for marking this order as Paid (min 10 characters):",
      required: true,
      minLength: 10,
      placeholder: "Reason (min 10 characters)...",
      confirmText: "Continue"
    });
    if (reason === null) return;

    const paymentReference =
      (await prompt({
        title: "Payment Reference",
        message: "Optional payment reference (UPI transaction ID, cheque #, bank ref):",
        required: false,
        placeholder: "e.g. UPI / cheque / bank ref...",
        confirmText: "Submit"
      })) ?? "";

    setIsUpdatingRefund(true);
    setPageMessage("");
    try {
      const res = await axios.put(
        `/api/orders/${order._id}/payment-status`,
        {
          paymentStatus: "Paid",
          reason: reason.trim(),
          paymentReference: paymentReference.trim()
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setOrder(res.data || { ...order, paymentStatus: "Paid" });
      setPageMessage("Order marked as Paid successfully via manual override.");
    } catch (err) {
      const errMsg = err?.response?.data?.message || "Failed to update payment status.";
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
      await generateInvoicePdf(order, {
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
            <h1>
              {order ? `Order #${String(order._id || "").slice(-6).toUpperCase()}` : "Order Details"}
              {order?.invoiceNumber ? (
                <span
                  style={{
                    fontSize: "15px",
                    fontWeight: 500,
                    color: "var(--admin-muted, #64748b)",
                    marginLeft: "12px",
                    verticalAlign: "middle"
                  }}
                >
                  Invoice {order.invoiceNumber}
                </span>
              ) : null}
            </h1>
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
            {order.stockIssue && (
              <div
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: "8px",
                  padding: "12px 16px",
                  marginBottom: "20px",
                  color: "#991b1b"
                }}
              >
                <strong>⚠ Stock Issue:</strong>
                <p style={{ margin: "4px 0 0 0", fontSize: "14px" }}>
                  {order.stockIssueDetails && order.stockIssueDetails.length > 0
                    ? order.stockIssueDetails.join(", ")
                    : "Payment was received, but one or more items could not be reserved due to low inventory."}
                </p>
              </div>
            )}

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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="admin-order-details-label">Payment</span>
                  {Number(user?.adminLevel) === 1 &&
                    displayPaymentStatus !== "Paid" &&
                    displayPaymentStatus !== "Refunded" &&
                    order?.status !== "Cancelled" && (
                    <button
                      type="button"
                      className="admin-order-details-btn"
                      style={{ padding: "4px 8px", fontSize: "11px", backgroundColor: "#16a34a", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
                      disabled={isUpdatingRefund}
                      onClick={handleManualMarkPaid}
                    >
                      {isUpdatingRefund ? "Updating..." : "Mark Paid"}
                    </button>
                  )}
                </div>
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
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "Refunded") {
                              setIsRefundModalOpen(true);
                            } else {
                              updateRefundStatus(val);
                            }
                          }}
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
                            {isUpdatingRefund ? "Updating..." : "Set status: Processing"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="admin-order-details-refund-btn refund-btn-success"
                          disabled={isUpdatingRefund}
                          onClick={() => setIsRefundModalOpen(true)}
                        >
                          Refund…
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
                {isManualRefund(order) ? (
                  <p style={{ marginTop: '8px', color: '#b45309', fontWeight: 600 }}>
                    Manual refund (no money sent via Razorpay)
                  </p>
                ) : order?.paymentMeta?.razorpayRefundId ? (
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

                {order?.paymentMeta?.manualOverride?.reason && (
                  <div style={{ marginTop: "10px", padding: "8px 10px", background: "#fef3c7", borderRadius: "6px", border: "1px solid #fde68a", fontSize: "12px", color: "#92400e" }}>
                    <strong style={{ display: "block", marginBottom: "2px" }}>Manual Payment Override:</strong>
                    <div>Reason: {order.paymentMeta.manualOverride.reason}</div>
                    {order.paymentMeta.manualOverride.paymentReference && (
                      <div>Ref: {order.paymentMeta.manualOverride.paymentReference}</div>
                    )}
                    <div>By: {order.paymentMeta.manualOverride.by} {order.paymentMeta.manualOverride.at ? `on ${formatDateTime(order.paymentMeta.manualOverride.at)}` : ""}</div>
                  </div>
                )}

                {Array.isArray(order?.paymentMeta?.refunds) && order.paymentMeta.refunds.length > 0 && (
                  <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid var(--admin-border, #e2e8f0)" }}>
                    <h3 style={{ margin: "0 0 8px", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b" }}>
                      Refund History
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {order.paymentMeta.refunds.map((rf, idx) => (
                        <div key={rf.refundId || idx} style={{ fontSize: "12px", padding: "8px 10px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                            <span>₹{((Number(rf.amountMinor) || 0) / 100).toFixed(2)}</span>
                            <span style={{ textTransform: "capitalize", color: rf.method === "manual" ? "#b45309" : "#4f46e5" }}>
                              {rf.method === "manual" ? "Manual" : "Razorpay"}
                            </span>
                          </div>
                          <div style={{ color: "#64748b", marginTop: "4px", display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                            <span>{rf.at ? formatDateTime(rf.at) : "—"}</span>
                            <span>{rf.reference ? `Ref: ${rf.reference}` : ""}</span>
                          </div>
                          {rf.reason ? <div style={{ color: "#475569", marginTop: "4px", fontSize: "11.5px", fontStyle: "italic" }}>"{rf.reason}"</div> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            </section>

            {showPendingAccessCard && (
              <div className="admin-order-pending-access-banner">
                <div>
                  <h2>Customer is waiting for access</h2>
                  <p>
                    {pendingItems.length === 1
                      ? "1 digital item requires manual access to be granted on the external website."
                      : `${pendingItems.length} digital items require manual access to be granted on the external website.`}
                  </p>
                </div>
                <button
                  type="button"
                  className="admin-order-details-btn"
                  style={{
                    backgroundColor: "#d97706",
                    color: "#ffffff",
                    borderColor: "#b45309",
                    whiteSpace: "nowrap"
                  }}
                  onClick={() => setIsGrantAccessModalOpen(true)}
                >
                  Grant access
                </button>
              </div>
            )}

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
                                  <li key={idx} style={{ fontSize: '11.5px', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', flexWrap: 'wrap' }}>
                                    <span style={{ color: '#94a3b8' }}>•</span>
                                    <span>{bi.name}</span>
                                    {bi.accessManual === true ? (
                                      <span className="admin-bundle-tag admin-bundle-tag-manual">
                                        team sets up access
                                      </span>
                                    ) : bi.digitalDelivery === "external" ? (
                                      <span className="admin-bundle-tag admin-bundle-tag-external">
                                        on another website
                                      </span>
                                    ) : null}
                                    <span style={{ color: '#64748b' }}>(Qty: {bi.quantity * (item.quantity || 1)})</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {Number(item?.upgradeCredit) > 0 && (
                            <p style={{ margin: '4px 0 0', fontSize: '11.5px', color: '#64748b' }}>
                              Price includes {formatCurrencyExact(Number(item.upgradeCredit), item?.currency || order?.currencyDisplay?.currency || "INR")} taken off for items already owned: {
                                Array.isArray(item.upgradeOwnedDetails) && item.upgradeOwnedDetails.length > 0
                                  ? item.upgradeOwnedDetails
                                      .map((od) => `${od.name} (-${formatCurrencyExact(Number(od.amount || 0), item?.currency || order?.currencyDisplay?.currency || "INR")})`)
                                      .join(", ")
                                  : (Array.isArray(item.upgradeOwnedItems) ? item.upgradeOwnedItems.join(", ") : "")
                              }
                            </p>
                          )}
                          <p>Qty: {Math.max(1, Number(item?.quantity || 1))}</p>
                          {item.accessManual === true && (
                            <div style={{ marginTop: "8px" }}>
                              {!item.accessGrantedAt ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                  <span className="admin-item-access-badge pending">
                                    Access pending
                                  </span>
                                  <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--admin-muted, #64748b)" }}>
                                    Set up this customer&apos;s access on the other website, then click Grant access.
                                  </p>
                                </div>
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                  <span className="admin-item-access-badge granted">
                                    Access granted on {formatDateTime(item.accessGrantedAt)}
                                  </span>
                                  {item.accessNote && (
                                    <div
                                      style={{
                                        margin: "4px 0 0",
                                        fontSize: "12px",
                                        color: "var(--admin-text, #334155)",
                                        whiteSpace: "pre-wrap",
                                        background: "var(--admin-surface-2, #f8fafc)",
                                        padding: "6px 10px",
                                        borderRadius: "6px",
                                        border: "1px solid var(--admin-border, #e2e8f0)"
                                      }}
                                    >
                                      {item.accessNote}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
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
                  {Array.isArray(order?.items) && order.items.length > 0 && order.items.every(isDigitalLikeItem) ? (
                    pendingItems.length > 0 ? (
                      <div className="admin-order-shipping-digital-pending">
                        Digital order: waiting for our team to grant access. No physical shipping required.
                      </div>
                    ) : (
                      <div className="admin-order-shipping-digital-granted">
                        ⚡ Digital Order: Instant online access granted. No physical shipping required.
                      </div>
                    )
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

        <AdminRefundModal
          order={order}
          isOpen={isRefundModalOpen}
          token={token}
          onClose={() => setIsRefundModalOpen(false)}
          onSuccess={(updatedOrder) => {
            setOrder(updatedOrder || { ...order, refundStatus: "Refunded" });
            const rzpId = updatedOrder?.paymentMeta?.razorpayRefundId;
            setPageMessage(
              rzpId
                ? `Razorpay refund initiated successfully! (Refund ID: ${rzpId})`
                : "Refund processed successfully."
            );
          }}
        />

        <GrantAccessModal
          order={order}
          isOpen={isGrantAccessModalOpen}
          token={token}
          onClose={() => setIsGrantAccessModalOpen(false)}
          onSuccess={(updatedOrder) => setOrder(updatedOrder)}
          onReload={reloadOrder}
        />
      </main>
    </div>
  );
}

export default AdminOrderDetails;
