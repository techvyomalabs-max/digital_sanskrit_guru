import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useAuth } from "../hooks/useAuth";
import { useDialog } from "../hooks/useDialog";
import AdminSidebar from "../components/admin/AdminSidebar";
import { formatDate, formatTime } from "../utils/date";
import "./AdminShared.css";
import "./AdminDashboard.css";

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

  const fetchTrash = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/trash", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTrashItems(res.data?.trash || []);
      setSummary(res.data?.summary || { total: 0, products: 0, coupons: 0, users: 0 });
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load Recycle Bin items.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrash();
  }, [token]);

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
    if (trashItems.length === 0) return;
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
    if (trashItems.length === 0) return;
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

  const filteredTrash = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return trashItems.filter((item) => {
      if (typeFilter !== "all" && item.entityType !== typeFilter) return false;
      if (!query) return true;
      const name = (item.name || "").toLowerCase();
      const cat = (item.category || "").toLowerCase();
      const by = (item.deletedBy || "").toLowerCase();
      return name.includes(query) || cat.includes(query) || by.includes(query);
    });
  }, [trashItems, searchQuery, typeFilter]);

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-main">
        <div className="admin-header">
          <div>
            <h1>🗑️ Admin Recycle Bin</h1>
            <p className="admin-header-subtitle">
              Soft-deleted products, coupons, and users can be restored or permanently purged from here
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              onClick={handleRestoreAll}
              disabled={loading || trashItems.length === 0}
              className="action-btn"
              style={{ padding: "8px 16px", borderRadius: "6px", backgroundColor: "#059669", color: "#fff" }}
            >
              🔄 Restore All
            </button>
            <button
              onClick={handleEmptyTrash}
              disabled={loading || trashItems.length === 0}
              className="action-btn"
              style={{ padding: "8px 16px", borderRadius: "6px", backgroundColor: "#dc2626", color: "#fff" }}
            >
              ❌ Empty Trash
            </button>
          </div>
        </div>

        {/* Status Messages */}
        {message && (
          <div style={{ margin: "0 0 16px", padding: "12px 16px", borderRadius: "8px", backgroundColor: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0", fontWeight: 500 }}>
            ✓ {message}
          </div>
        )}
        {error && (
          <div style={{ margin: "0 0 16px", padding: "12px 16px", borderRadius: "8px", backgroundColor: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", fontWeight: 500 }}>
            ⚠️ {error}
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
              onClick={fetchTrash}
              className="action-btn"
              style={{ padding: "10px 16px", borderRadius: "8px" }}
            >
              🔄 Refresh
            </button>
          </div>

          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
              Loading Recycle Bin items...
            </div>
          ) : filteredTrash.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
              {trashItems.length === 0 ? "🎉 Recycle Bin is clean! No deleted items found." : "No matching items found."}
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
                  {filteredTrash.map((item) => (
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
                            🔄 Restore
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
                            ❌ Purge
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default AdminTrash;
