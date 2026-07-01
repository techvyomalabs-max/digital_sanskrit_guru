import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useAuth } from "../hooks/useAuth";
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
  const { token } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [metrics, setMetrics] = useState({
    totalUsers: 0,
    activeUsers: 0,
    totalTimeSpentSec: 0,
    users: [],
    admins: [],
    recentAdminActions: []
  });

  const [auditLogs, setAuditLogs] = useState([]);
  const [auditPage, setAuditPage] = useState(1);
  const [hasMoreAudit, setHasMoreAudit] = useState(false);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  useEffect(() => {
    let active = true;

    const loadMetrics = async () => {
      if (active) setIsLoading(true);
      try {
        const res = await axios.get("/api/auth/admin/users-metrics", {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!active) return;
        setMetrics({
          totalUsers: Number(res?.data?.totalUsers || 0),
          activeUsers: Number(res?.data?.activeUsers || 0),
          totalTimeSpentSec: Number(res?.data?.totalTimeSpentSec || 0),
          users: Array.isArray(res?.data?.users) ? res.data.users : [],
          admins: Array.isArray(res?.data?.admins) ? res.data.admins : [],
          recentAdminActions: Array.isArray(res?.data?.recentAdminActions) ? res.data.recentAdminActions : []
        });
        setError("");
      } catch {
        if (!active) return;
        setMetrics({
          totalUsers: 0,
          activeUsers: 0,
          totalTimeSpentSec: 0,
          users: [],
          admins: [],
          recentAdminActions: []
        });
        setError("Could not load user metrics.");
      } finally {
        if (active) setIsLoading(false);
      }
    };

    loadMetrics();
    const pollId = setInterval(loadMetrics, 15000);

    return () => {
      active = false;
      clearInterval(pollId);
    };
  }, [token]);

  useEffect(() => {
    let active = true;
    const fetchAuditLogs = async () => {
      setIsLoadingAudit(true);
      try {
        const res = await axios.get(`/api/auth/admin/audit-logs?page=${auditPage}&limit=10`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!active) return;
        
        const newLogs = Array.isArray(res.data?.recentAdminActions) ? res.data.recentAdminActions : [];
        if (auditPage === 1) {
          setAuditLogs(newLogs);
        } else {
          setAuditLogs((prev) => {
            const existingIds = new Set(prev.map(item => item._id));
            const filteredNew = newLogs.filter(item => !existingIds.has(item._id));
            return [...prev, ...filteredNew];
          });
        }
        setHasMoreAudit(Boolean(res.data?.hasMore));
      } catch (err) {
        console.error("Failed to load audit logs", err);
      } finally {
        if (active) setIsLoadingAudit(false);
      }
    };

    fetchAuditLogs();
    return () => {
      active = false;
    };
  }, [auditPage, token]);

  const avgTimePerUser = useMemo(() => {
    if (metrics.totalUsers <= 0) return 0;
    return metrics.totalTimeSpentSec / metrics.totalUsers;
  }, [metrics.totalTimeSpentSec, metrics.totalUsers]);

  const activeAdmins = useMemo(
    () => metrics.admins.filter((adminUser) => adminUser.isActive).length,
    [metrics.admins]
  );

  return (
    <div className="admin-layout">
      <AdminSidebar />

      <main className="admin-main">
        <div className="admin-header">
          <h1>User And Admin Insights</h1>
          <p style={{ margin: "6px 0 0", fontSize: "13px", color: "var(--admin-muted)" }}>
            Live user activity and admin change tracking updated every 15s.
          </p>
        </div>

        {error && <p>{error}</p>}

        <section className="users-metrics-grid">
          <div className="users-metric-card">
            <span>Total Users</span>
            <strong>{metrics.totalUsers}</strong>
          </div>
          <div className="users-metric-card">
            <span>Active Users (Last 5 min)</span>
            <strong>{metrics.activeUsers}</strong>
          </div>
          <div className="users-metric-card">
            <span>Total Time Spent</span>
            <strong>{formatTimeSpent(metrics.totalTimeSpentSec)}</strong>
          </div>
          <div className="users-metric-card">
            <span>Average Time/User</span>
            <strong>{formatTimeSpent(avgTimePerUser)}</strong>
          </div>
          <div className="users-metric-card">
            <span>Admins With Access</span>
            <strong>{metrics.admins.length}</strong>
          </div>
          <div className="users-metric-card">
            <span>Active Admins</span>
            <strong>{activeAdmins}</strong>
          </div>
        </section>

        <section className="card">
          <h3>Current Admin Access</h3>
          {isLoading ? (
            <p>Loading admins...</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Admin</th>
                    <th>Status</th>
                    <th>Granted</th>
                    <th>Granted By</th>
                    <th>Last Change</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.admins.map((adminUser) => (
                    <tr key={adminUser._id}>
                      <td>
                        <strong>{adminUser.name || "Admin"}</strong>
                        <div style={{ color: "var(--admin-muted)", fontSize: "12px", marginTop: "4px" }}>
                          {adminUser.email || "-"}
                        </div>
                      </td>
                      <td>
                        <span className={adminUser.isActive ? "users-status active" : "users-status idle"}>
                          {adminUser.isActive ? "Active" : "Idle"}
                        </span>
                      </td>
                      <td>
                        {adminUser.adminGrantedAt
                          ? `${formatDate(adminUser.adminGrantedAt)} ${formatTime(adminUser.adminGrantedAt)}`
                          : "-"}
                      </td>
                      <td>
                        {adminUser.adminGrantedByEmail || adminUser.adminGrantedByName
                          ? `${adminUser.adminGrantedByName || "Admin"}${adminUser.adminGrantedByEmail ? ` (${adminUser.adminGrantedByEmail})` : ""}`
                          : "-"}
                      </td>
                      <td>
                        {adminUser.latestActionAt ? (
                          <>
                            <div>{adminUser.latestActionSummary || "Change recorded"}</div>
                            <div style={{ color: "var(--admin-muted)", fontSize: "12px", marginTop: "4px" }}>
                              {formatDate(adminUser.latestActionAt)} {formatTime(adminUser.latestActionAt)}
                            </div>
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {metrics.admins.length === 0 && <p style={{ margin: "12px 0 0" }}>No admin users found.</p>}
            </div>
          )}
        </section>

        <section className="card">
          <h3>Recent Admin Changes</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Admin</th>
                  <th>Action</th>
                  <th>Target</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((entry) => (
                  <tr key={entry._id}>
                    <td>{entry.createdAt ? `${formatDate(entry.createdAt)} ${formatTime(entry.createdAt)}` : "-"}</td>
                    <td>
                      <strong>{entry.actorName || "Admin"}</strong>
                      <div style={{ color: "var(--admin-muted)", fontSize: "12px", marginTop: "4px" }}>
                        {entry.actorEmail || "-"}
                      </div>
                    </td>
                    <td>{entry.summary || entry.action || "-"}</td>
                    <td>{entry.entityLabel || entry.entityType || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {auditLogs.length === 0 && !isLoadingAudit && (
              <p style={{ margin: "12px 0 0" }}>
                No admin changes recorded yet. This list starts filling after the backend is running with audit logging
                and admins perform tracked actions.
              </p>
            )}
            {hasMoreAudit && (
              <div style={{ marginTop: "16px", textAlign: "center" }}>
                <button
                  className="secondary-btn"
                  onClick={() => setAuditPage((prev) => prev + 1)}
                  disabled={isLoadingAudit}
                  style={{ minWidth: "120px" }}
                >
                  {isLoadingAudit ? "Loading..." : "Load More"}
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="card">
          <h3>User Activity</h3>
          {isLoading ? (
            <p>Loading users...</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Time Spent</th>
                    <th>Last Active</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.users.map((u) => (
                    <tr key={u._id}>
                      <td>{u.name || "User"}</td>
                      <td>{u.email || "-"}</td>
                      <td>
                        <span className={u.isActive ? "users-status active" : "users-status idle"}>
                          {u.isActive ? "Active" : "Idle"}
                        </span>
                      </td>
                      <td>{formatTimeSpent(u.totalTimeSpentSec)}</td>
                      <td>{u.lastActiveAt ? `${formatDate(u.lastActiveAt)} ${formatTime(u.lastActiveAt)}` : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {metrics.users.length === 0 && <p style={{ margin: "12px 0 0" }}>No user activity data yet.</p>}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default AdminUsers;

