import { useEffect, useMemo, useState, useCallback } from "react";
import axios from "axios";
import { useAuth } from "../hooks/useAuth";
import { useDialog } from "../hooks/useDialog";
import AdminSidebar from "../components/admin/AdminSidebar";
import { formatDate, formatTime } from "../utils/date";
import "./AdminShared.css";
import "./AdminUsers.css";

function formatTimeSpent(totalSec) {
  const sec = Math.max(0, Math.floor(Number(totalSec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function AdminUsers() {
  const { token, user } = useAuth();
  const { confirm, alert } = useDialog();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [metrics, setMetrics] = useState({
    totalUsers: 0,
    activeUsers: 0,
    totalTimeSpentSec: 0,
    users: []
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });

  const fetchMetrics = useCallback(async (targetPage = page) => {
    try {
      const params = new URLSearchParams({
        page: targetPage,
        limit: 25,
        search: search.trim(),
        status: statusFilter
      });

      const res = await axios.get(`/api/auth/admin/users-metrics?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setMetrics({
        totalUsers: Number(res?.data?.totalUsers || 0),
        activeUsers: Number(res?.data?.activeUsers || 0),
        totalTimeSpentSec: Number(res?.data?.totalTimeSpentSec || 0),
        users: Array.isArray(res?.data?.users) ? res.data.users : []
      });

      if (res?.data?.pagination) {
        setPagination(res.data.pagination);
      }
      setError("");
    } catch {
      setError("Failed to load user activity metrics.");
    } finally {
      setIsLoading(false);
    }
  }, [token, page, search, statusFilter]);

  const handleDeleteUser = async (userItem) => {
    if (userItem._id === user?._id) {
      await alert({
        title: "Action Not Allowed",
        message: "You cannot delete your own account.",
        tone: "danger"
      });
      return;
    }
    const confirmed = await confirm({
      title: "Delete User?",
      message: `Move user "${userItem.email}" to Recycle Bin?\n\nThey will no longer be able to log in, but can be restored anytime.`,
      tone: "danger",
      confirmText: "Delete User"
    });
    if (!confirmed) return;

    try {
      await axios.delete(`/api/auth/admin/users/${userItem._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchMetrics(page);
    } catch (err) {
      await alert({
        title: "Error",
        message: err.response?.data?.message || "Failed to soft delete user.",
        tone: "danger"
      });
    }
  };

  useEffect(() => {
    fetchMetrics(page);
    const interval = setInterval(() => fetchMetrics(page), 15000);
    return () => clearInterval(interval);
  }, [fetchMetrics, page]);

  const avgTimePerUser = useMemo(() => {
    if (metrics.totalUsers <= 0) return 0;
    return metrics.totalTimeSpentSec / metrics.totalUsers;
  }, [metrics.totalTimeSpentSec, metrics.totalUsers]);

  return (
    <div className="admin-layout">
      <AdminSidebar />

      <main className="admin-main">
        <div className="admin-header">
          <h1>👥 User Activity & Insights</h1>
          <p style={{ margin: "6px 0 0", fontSize: "13px", color: "var(--admin-muted)" }}>
            Live customer engagement, active online users, and time spent on site (updated every 15s).
          </p>
        </div>

        {error && <p className="pricing-message error">{error}</p>}

        <section className="users-metrics-grid">
          <div className="users-metric-card">
            <span>Total Registered Users</span>
            <strong>{metrics.totalUsers.toLocaleString("en-IN")}</strong>
          </div>
          <div className="users-metric-card">
            <span>Active Users (Last 5 min)</span>
            <strong>{metrics.activeUsers.toLocaleString("en-IN")}</strong>
          </div>
          <div className="users-metric-card">
            <span>Total Time Spent</span>
            <strong>{formatTimeSpent(metrics.totalTimeSpentSec)}</strong>
          </div>
          <div className="users-metric-card">
            <span>Average Time / User</span>
            <strong>{formatTimeSpent(avgTimePerUser)}</strong>
          </div>
        </section>

        <section className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
            <h3 style={{ margin: 0 }}>Customer User Activity</h3>
            <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text"
                placeholder="🔍 Search user by name or email..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, #cbd5e1)",
                  fontSize: "13.5px",
                  minWidth: "260px",
                  backgroundColor: "transparent",
                  color: "inherit"
                }}
              />
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, #cbd5e1)",
                  fontSize: "13.5px",
                  backgroundColor: "transparent",
                  color: "inherit"
                }}
              >
                <option value="All">All Statuses & Roles</option>
                <option value="Online">Online Now</option>
                <option value="Offline">Offline</option>
                <option value="Admin">Admin Accounts</option>
                <option value="Customer">Customer Accounts</option>
              </select>
            </div>
          </div>

          {isLoading ? (
            <p>Loading user activity...</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Customer Name</th>
                    <th>Email Address</th>
                    <th>Status</th>
                    <th>Total Time Spent</th>
                    <th>Last Active Timestamp</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.users.map((item) => (
                    <tr key={item._id}>
                      <td>
                        <strong>{item.name || "Customer"}</strong>
                        {item.isAdmin && (
                          <span
                            style={{
                              marginLeft: "8px",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontSize: "10px",
                              backgroundColor: "rgba(233, 69, 96, 0.15)",
                              color: "#e94560",
                              fontWeight: 600
                            }}
                          >
                            Admin Account
                          </span>
                        )}
                      </td>
                      <td>{item.email || "-"}</td>
                      <td>
                        <span className={item.isActive ? "users-status active" : "users-status idle"}>
                          {item.isActive ? "Online Now" : "Offline"}
                        </span>
                      </td>
                      <td>{formatTimeSpent(item.totalTimeSpentSec)}</td>
                      <td>
                        {item.lastActiveAt
                          ? `${formatDate(item.lastActiveAt)} ${formatTime(item.lastActiveAt)}`
                          : "Never active"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(item)}
                          disabled={item._id === user?._id}
                          style={{
                            padding: "4px 10px",
                            borderRadius: "6px",
                            border: "1px solid #ef4444",
                            backgroundColor: "rgba(239, 68, 68, 0.1)",
                            color: "#dc2626",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: item._id === user?._id ? "not-allowed" : "pointer"
                          }}
                        >
                          🗑️ Soft Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {metrics.users.length === 0 && <p style={{ margin: "16px 0", color: "#64748b" }}>No users match your search criteria.</p>}

              {/* Pagination Controls */}
              {pagination.total > pagination.limit && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", padding: "12px 0", borderTop: "1px solid var(--border-color, #cbd5e1)" }}>
                  <span style={{ fontSize: "13px", color: "var(--admin-muted)" }}>
                    Showing {(pagination.page - 1) * pagination.limit + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total.toLocaleString("en-IN")} users
                  </span>

                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      disabled={pagination.page <= 1}
                      onClick={() => setPage(pagination.page - 1)}
                      style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--border-color, #cbd5e1)", backgroundColor: "transparent", color: "inherit", cursor: pagination.page <= 1 ? "not-allowed" : "pointer" }}
                    >
                      Previous
                    </button>

                    <span style={{ padding: "6px 12px", fontWeight: "600", fontSize: "13.5px" }}>
                      Page {pagination.page} of {pagination.totalPages || 1}
                    </span>

                    <button
                      type="button"
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => setPage(pagination.page + 1)}
                      style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--border-color, #cbd5e1)", backgroundColor: "transparent", color: "inherit", cursor: pagination.page >= pagination.totalPages ? "not-allowed" : "pointer" }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default AdminUsers;
