import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { CreditCard, RotateCcw, CheckCircle, AlertTriangle, RefreshCw, Check, Hourglass } from "lucide-react";
import AdminSidebar from "../components/admin/AdminSidebar";
import { useAuth } from "../hooks/useAuth";
import { useDialog } from "../hooks/useDialog";
import { formatDateTime } from "../utils/date";
import "./AdminShared.css";

export default function AdminUnmatchedPayments() {
  const { token, user } = useAuth();
  const { confirm, prompt } = useDialog();
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [pageMessage, setPageMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState("");

  const isSuperAdmin = Number(user?.adminLevel) === 1;

  const fetchOrphans = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setActionError("");
    try {
      const url = statusFilter === "all"
        ? "/api/admin/payments/orphans"
        : `/api/admin/payments/orphans?status=${statusFilter}`;

      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setItems(Array.isArray(res.data?.items) ? res.data.items : []);
    } catch (err) {
      setPageMessage(err?.response?.data?.message || "Failed to load unmatched payments.");
    } finally {
      setIsLoading(false);
    }
  }, [token, statusFilter]);

  useEffect(() => {
    void fetchOrphans();
  }, [fetchOrphans]);

  const handleRefund = async (item) => {
    if (!item?._id) return;
    const amountStr = `₹${((Number(item.amountMinor) || 0) / 100).toFixed(2)}`;
    const confirmed = await confirm({
      title: "Confirm Refund?",
      message: `Confirm Refund:\n\nAre you sure you want to refund ${amountStr} for Razorpay Payment ID "${item.razorpayPaymentId}"?\n\nThis will trigger an immediate Razorpay gateway refund.`,
      tone: "danger",
      confirmText: "Refund Payment"
    });
    if (!confirmed) return;

    setBusyId(item._id);
    setActionError("");
    try {
      const res = await axios.post(
        `/api/admin/payments/orphans/${item._id}/refund`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPageMessage(res.data?.message || `Refund processed successfully! (ID: ${res.data?.refundId || "N/A"})`);
      await fetchOrphans();
    } catch (err) {
      const msg = err?.response?.data?.message || "Refund failed via Razorpay.";
      setActionError(msg);
    } finally {
      setBusyId("");
    }
  };

  const handleResolve = async (item) => {
    if (!item?._id) return;
    const note = await prompt({
      title: "Resolve Payment",
      message: "Enter resolution note (at least 10 characters):",
      required: true,
      minLength: 10,
      placeholder: "Reason for resolution...",
      multiline: true,
      confirmText: "Resolve"
    });
    if (note === null) return;

    setBusyId(item._id);
    setActionError("");
    try {
      const res = await axios.post(
        `/api/admin/payments/orphans/${item._id}/resolve`,
        { note: note.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPageMessage(res.data?.message || "Payment marked as resolved.");
      await fetchOrphans();
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to mark as resolved.";
      setActionError(msg);
    } finally {
      setBusyId("");
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "orphan":
        return <span className="admin-order-status status-refund-pending"><AlertTriangle size={13} className="ui-inline-icon" aria-hidden="true" />Orphan</span>;
      case "refunded":
        return <span className="admin-order-status status-refund-refunded"><Check size={13} className="ui-inline-icon" aria-hidden="true" />Refunded</span>;
      case "resolved":
        return <span className="admin-order-status status-completed"><Check size={13} className="ui-inline-icon" aria-hidden="true" />Resolved</span>;
      case "refunding":
        return <span className="admin-order-status status-refund-processing"><Hourglass size={13} className="ui-inline-icon" aria-hidden="true" />Refunding...</span>;
      case "linked":
        return <span className="admin-order-status status-delivered">Linked</span>;
      default:
        return <span className="admin-order-status status-pending">{status}</span>;
    }
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />

      <main className="admin-main">
        <header className="admin-page-header" style={{ marginBottom: "20px" }}>
          <div>
            <h1 style={{ display: "flex", alignItems: "center", gap: "10px", margin: 0, fontSize: "24px" }}>
              <CreditCard size={24} color="#d97706" /> Unmatched Payments
            </h1>
            <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: "14px" }}>
              Review payments captured in Razorpay with no completed store order (orphans). Initiate gateway refunds or resolve unmatched records.
            </p>
          </div>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={fetchOrphans}
            disabled={isLoading}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <RefreshCw size={15} className={isLoading ? "spin" : ""} /> Refresh
          </button>
        </header>

        {pageMessage && (
          <div style={{ marginBottom: "16px", padding: "12px 16px", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", borderRadius: "8px", fontSize: "14px" }}>
            {pageMessage}
          </div>
        )}

        {actionError && (
          <div style={{ marginBottom: "16px", padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: "8px", fontSize: "14px" }}>
            <AlertTriangle size={16} style={{ display: "inline", verticalAlign: "text-bottom", marginRight: "6px" }} />
            {actionError}
          </div>
        )}

        {/* Filter bar */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "18px", alignItems: "center" }}>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#475569" }}>Status Filter:</span>
          {["all", "orphan", "refunding", "refunded", "resolved"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className="admin-btn"
              style={{
                textTransform: "capitalize",
                padding: "6px 12px",
                fontSize: "13px",
                backgroundColor: statusFilter === st ? "#1e293b" : "#f1f5f9",
                color: statusFilter === st ? "#ffffff" : "#334155",
                border: "1px solid #cbd5e1"
              }}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Main Table */}
        <div className="admin-table-container" style={{ background: "#ffffff", borderRadius: "8px", border: "1px solid #e2e8f0", overflowX: "auto" }}>
          {isLoading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
              <RefreshCw size={24} className="spin" style={{ marginBottom: "8px" }} />
              <div>Loading payment records...</div>
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: "48px 24px", textAlign: "center", color: "#64748b" }}>
              <CheckCircle size={32} color="#16a34a" style={{ marginBottom: "8px" }} />
              <div style={{ fontSize: "16px", fontWeight: 600 }}>No unmatched payments found.</div>
              <p style={{ margin: "4px 0 0", fontSize: "13px" }}>All captured payments match an order in the store.</p>
            </div>
          ) : (
            <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc", textAlign: "left", fontSize: "12px", color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "12px 16px" }}>Date</th>
                  <th style={{ padding: "12px 16px" }}>Razorpay Payment ID</th>
                  <th style={{ padding: "12px 16px" }}>Amount</th>
                  <th style={{ padding: "12px 16px" }}>Customer</th>
                  <th style={{ padding: "12px 16px" }}>Status</th>
                  <th style={{ padding: "12px 16px" }}>Resolution Details</th>
                  <th style={{ padding: "12px 16px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const isBusy = busyId === item._id;
                  const formattedAmount = `₹${((Number(item.amountMinor) || 0) / 100).toFixed(2)}`;

                  return (
                    <tr key={item._id} style={{ borderBottom: "1px solid #f1f5f9", fontSize: "13px" }}>
                      <td style={{ padding: "12px 16px", whiteSpace: "nowrap", color: "#64748b" }}>
                        {formatDateTime(item.capturedAt || item.createdAt)}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px", fontSize: "12px", fontWeight: 600 }}>
                          {item.razorpayPaymentId || "—"}
                        </code>
                        <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
                          Order ID: {item.razorpayOrderId}
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px", fontWeight: 700, color: "#0f172a" }}>
                        {formattedAmount}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        {item.user ? (
                          <div>
                            <div style={{ fontWeight: 600 }}>{item.user.name || "Customer"}</div>
                            <div style={{ fontSize: "11px", color: "#64748b" }}>{item.user.email}</div>
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Guest / Unlinked</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        {getStatusBadge(item.status)}
                      </td>
                      <td style={{ padding: "12px 16px", maxWidth: "240px", fontSize: "12px" }}>
                        {item.status === "refunded" ? (
                          <div style={{ color: "#15803d" }}>
                            <div><strong>Refund ID:</strong> {item.refundId || "Completed"}</div>
                            <div style={{ fontSize: "11px", color: "#64748b" }}>By: {item.resolvedBy || "Super Admin"}</div>
                          </div>
                        ) : item.status === "resolved" ? (
                          <div>
                            <div style={{ color: "#334155", fontStyle: "italic" }}>"{item.resolutionNote}"</div>
                            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>By: {item.resolvedBy || "Admin"}</div>
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                        {item.status === "refunding" ? (
                          <span style={{ fontSize: "12px", color: "#d97706", fontStyle: "italic" }}>
                            Refund in progress — check Razorpay dashboard
                          </span>
                        ) : item.status === "orphan" ? (
                          <div style={{ display: "inline-flex", gap: "6px" }}>
                            {isSuperAdmin && (
                              <button
                                type="button"
                                className="admin-btn"
                                style={{ padding: "4px 8px", fontSize: "11px", backgroundColor: "#dc2626", color: "#ffffff", border: "none", borderRadius: "4px" }}
                                disabled={isBusy}
                                onClick={() => handleRefund(item)}
                                title="Process Razorpay refund"
                              >
                                <RotateCcw size={12} style={{ display: "inline", marginRight: "3px" }} />
                                {isBusy ? "Processing..." : "Refund"}
                              </button>
                            )}
                            <button
                              type="button"
                              className="admin-btn"
                              style={{ padding: "4px 8px", fontSize: "11px", backgroundColor: "#0284c7", color: "#ffffff", border: "none", borderRadius: "4px" }}
                              disabled={isBusy}
                              onClick={() => handleResolve(item)}
                              title="Mark resolved with a note"
                            >
                              <CheckCircle size={12} style={{ display: "inline", marginRight: "3px" }} />
                              {isBusy ? "Saving..." : "Resolve"}
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: "11px", color: "#94a3b8" }}>Completed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
