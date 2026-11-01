import { useCallback, useEffect, useState } from "react";
import { Trash2, RotateCcw, XCircle, Check, AlertTriangle, RefreshCw, PartyPopper } from "lucide-react";
import axios from "axios";
import { useAuth } from "../hooks/useAuth";
import { useDialog } from "../hooks/useDialog";
import AdminSidebar from "../components/admin/AdminSidebar";
import { formatDate, formatTime } from "../utils/date";
import "./AdminShared.css";
import "./AdminDashboard.css";

const PAGE_SIZE = 25;

function AdminTrash() {
  const { token } = useAuth();
  const { confirm } = useDialog();
  const [trashItems, setTrashItems] = useState([]);
  const [summary, setSummary] = useState({ total: 0, products: 0, coupons: 0, users: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [processingId, setProcessingId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [matching, setMatching] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // The server sends one page (newest first); search and the type filter run on the server.
  const fetchTrash = useCallback(
    async (targetPage = 1) => {
      const append = targetPage > 1;
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const res = await axios.get("/api/trash", {
          params: { page: targetPage, limit: PAGE_SIZE, type: typeFilter, search },
          headers: { Authorization: `Bearer ${token}` }
        });
        const next = Array.isArray(res.data?.trash) ? res.data.trash : [];
        setTrashItems((prev) => (append ? [...prev, ...next] : next));
        setSummary(res.data?.summary || { total: 0, products: 0, coupons: 0, users: 0 });
        setPage(res.data?.page || targetPage);
        setHasMore(Boolean(res.data?.hasMore));
        setMatching(Number(res.data?.matching ?? next.length));
        setError("");
      } catch (err) {
        setError(err.response?.data?.message || "Failed to load Recycle Bin items.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [token, typeFilter, search]
  );

  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchQuery.trim()), 350);
    return () => window.clearTimeout(id);
  }, [searchQuery]);

  useEffect(() => {
    fetchTrash(1);
  }, [fetchTrash]);

  const handleRestoreItem = async (item) => {
    setProcessingId(item._id);
    setMessage("");
    try {
      const endpoint = item.entityType === "coupon"
        ? `/api/coupons/${item._id}/restore`
        : item.entityType === "user"
        ? `/api/auth/admin/users/${item._id}/restore`
        : `/api/products/${item._id}/restore`;

      await axios.post(endpoint, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setMessage(`Restored "${item.name}" successfully.`);
      await fetchTrash();
    } catch (err) {
      setError(err.response?.data?.message || `Could not restore ${item.name}.`);
    } finally {
      setProcessingId("");
    }
  };

  const handlePurgeItem = async (item) => {
    const confirmed = await confirm({
      title: "Permanently Delete?",
      message: `Are you sure you want to permanently delete "${item.name}"?\n\nThis action CANNOT be undone.`,
      tone: "danger",
      confirmText: "Permanently Delete"
    });
    if (!confirmed) return;

    setProcessingId(item._id);
    setMessage("");
    try {
      const endpoint = item.entityType === "coupon"
        ? `/api/coupons/${item._id}/purge`
        : item.entityType === "user"
        ? `/api/auth/admin/users/${item._id}/purge`
        : `/api/products/${item._id}/purge`;

      await axios.delete(endpoint, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setMessage(`Permanently deleted "${item.name}".`);
      await fetchTrash();
    } catch (err) {
      setError(err.response?.data?.message || `Could not permanently delete ${item.name}.`);
    } finally {
      setProcessingId("");
    }
  };

  const handleRestoreAll = async () => {
    if (summary.total === 0) return;
    const confirmed = await confirm({
      title: "Restore All Items?",
      message: "Restore all items from the Recycle Bin back to active inventory?",
      confirmText: "Restore All"
    });
    if (!confirmed) return;

    setLoading(true);
    try {
      const res = await axios.post("/api/trash/restore-all", {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessage(res.data?.message || "All items restored.");
      await fetchTrash();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to restore all items.");
      setLoading(false);
    }
  };

  const handleEmptyTrash = async () => {
    if (summary.total === 0) return;
    const confirmed = await confirm({
      title: "Empty Recycle Bin?",
      message: "EMPTY RECYCLE BIN?\n\nThis will PERMANENTLY ERASE all soft-deleted items from MongoDB.\nThis action CANNOT be undone!",
      tone: "danger",
      confirmText: "Empty Bin"
    });
    if (!confirmed) return;

    setLoading(true);
    try {
      const res = await axios.delete("/api/trash/empty", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessage(res.data?.message || "Recycle bin emptied.");
      await fetchTrash();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to empty recycle bin.");
      setLoading(false);
    }
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-main">
        <div className="admin-header">
          <div>
            <h1><Trash2 size={24} className="ui-inline-icon" aria-hidden="true" />Admin Recycle Bin</h1>
            <p className="admin-header-subtitle">
              Soft-deleted products, coupons, and users can be restored or permanently purged from here
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              onClick={handleRestoreAll}
              disabled={loading || summary.total === 0}
              className="action-btn"
              style={{ padding: "8px 16px", borderRadius: "6px", backgroundColor: "#059669", color: "#fff" }}
            >
              <RotateCcw size={15} className="ui-inline-icon" aria-hidden="true" />Restore All
            </button>
            <button
              onClick={handleEmptyTrash}
              disabled={loading || summary.total === 0}
              className="action-btn"
              style={{ padding: "8px 16px", borderRadius: "6px", backgroundColor: "#dc2626", color: "#fff" }}
            >
              <XCircle size={15} className="ui-inline-icon" aria-hidden="true" />Empty Trash
            </button>
          </div>
        </div>

        {/* Status Messages */}
        {message && (
          <div style={{ margin: "0 0 16px", padding: "12px 16px", borderRadius: "8px", backgroundColor: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0", fontWeight: 500 }}>
            <Check size={15} className="ui-inline-icon" aria-hidden="true" />{message}
          </div>
        )}
        {error && (
          <div style={{ margin: "0 0 16px", padding: "12px 16px", borderRadius: "8px", backgroundColor: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", fontWeight: 500 }}>
            <AlertTriangle size={15} className="ui-inline-icon" aria-hidden="true" />{error}
          </div>
        )}

        {/* Stats Grid */}
        <div className="revenue-kpi-grid" style={{ marginBottom: "24px" }}>
          <div className="card revenue-kpi-card" style={{ borderLeft: "4px solid #6366f1" }}>
            <h4>Total Items in Trash</h4>
            <p>{summary.total}</p>
          </div>
          <div className="card revenue-kpi-card" style={{ borderLeft: "4px solid #3b82f6" }}>
            <h4>Deleted Products</h4>
            <p style={{ color: "#3b82f6" }}>{summary.products}</p>
          </div>
          <div className="card revenue-kpi-card" style={{ borderLeft: "4px solid #f59e0b" }}>
            <h4>Deleted Coupons</h4>
            <p style={{ color: "#f59e0b" }}>{summary.coupons}</p>
          </div>
          <div className="card revenue-kpi-card" style={{ borderLeft: "4px solid #8b5cf6" }}>
            <h4>Deleted Users</h4>
            <p style={{ color: "#8b5cf6" }}>{summary.users || 0}</p>
          </div>
        </div>

        {/* Table Controls */}
        <section className="card">
          <div className="table-controls" style={{ padding: "16px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="Search by item name, category, or admin who deleted..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                minWidth: "240px",
                padding: "10px 14px",
                border: "1px solid var(--border-color, #cbd5e1)",
                borderRadius: "8px",
                backgroundColor: "transparent",
                color: "inherit",
                fontSize: "14px"
              }}
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{
                padding: "10px 14px",
                border: "1px solid var(--border-color, #cbd5e1)",
                borderRadius: "8px",
                backgroundColor: "transparent",
                color: "inherit",
                fontSize: "14px",
                fontWeight: 600
              }}
            >
              <option value="all">All Types</option>
              <option value="product">Products Only</option>
              <option value="coupon">Coupons Only</option>
              <option value="user">Users Only</option>
            </select>
            <button
              onClick={() => fetchTrash(1)}
              className="action-btn"
              style={{ padding: "10px 16px", borderRadius: "8px" }}
            >
              <RefreshCw size={15} className="ui-inline-icon" aria-hidden="true" />Refresh
            </button>
          </div>

          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
              Loading Recycle Bin items...
            </div>
          ) : trashItems.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
              {summary.total === 0 ? "Recycle Bin is clean! No deleted items found." : "No matching items found."}
            </div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Item Name</th>
                    <th>Type</th>
                    <th>Deleted By</th>
                    <th>Deleted Date</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {trashItems.map((item) => (
                    <tr key={item._id}>
                      <td>
                        <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{item.name}</div>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>{item.details}</div>
                      </td>
                      <td>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            backgroundColor:
                              item.entityType === "product"
                                ? "rgba(59, 130, 246, 0.12)"
                                : item.entityType === "coupon"
                                ? "rgba(245, 158, 11, 0.12)"
                                : "rgba(139, 92, 246, 0.12)",
                            color:
                              item.entityType === "product"
                                ? "#2563eb"
                                : item.entityType === "coupon"
                                ? "#d97706"
                                : "#7c3aed"
                          }}
                        >
                          {item.entityType}
                        </span>
                      </td>
                      <td style={{ fontSize: "13px" }}>{item.deletedBy}</td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: "13px" }}>{formatDate(item.deletedAt)}</div>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{formatTime(item.deletedAt)}</div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "8px" }}>
                          <button
                            type="button"
                            disabled={processingId === item._id}
                            onClick={() => handleRestoreItem(item)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "6px",
                              border: "1px solid #10b981",
                              backgroundColor: "rgba(16, 185, 129, 0.1)",
                              color: "#059669",
                              fontWeight: 600,
                              fontSize: "12.5px",
                              cursor: "pointer"
                            }}
                          >
                            <RotateCcw size={14} className="ui-inline-icon" aria-hidden="true" />Restore
                          </button>
                          <button
                            type="button"
                            disabled={processingId === item._id}
                            onClick={() => handlePurgeItem(item)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "6px",
                              border: "1px solid #ef4444",
                              backgroundColor: "rgba(239, 68, 68, 0.1)",
                              color: "#dc2626",
                              fontWeight: 600,
                              fontSize: "12.5px",
                              cursor: "pointer"
                            }}
                          >
                            <XCircle size={14} className="ui-inline-icon" aria-hidden="true" />Purge
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", padding: "14px 16px", borderTop: "1px solid var(--admin-border, #e2e8f0)" }}>
                <span style={{ fontSize: "13px", color: "var(--admin-muted, #64748b)" }}>
                  Showing {trashItems.length.toLocaleString("en-IN")} of {matching.toLocaleString("en-IN")}
                </span>
                {hasMore ? (
                  <button
                    type="button"
                    className="action-btn"
                    onClick={() => fetchTrash(page + 1)}
                    disabled={loadingMore}
                    style={{ padding: "8px 16px", borderRadius: "6px" }}
                  >
                    {loadingMore ? "Loading…" : `Load ${PAGE_SIZE} more`}
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default AdminTrash;
