import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useAuth } from "../hooks/useAuth";
import AdminSidebar from "../components/admin/AdminSidebar";
import { formatDate, formatTime } from "../utils/date";
import "./AdminDashboard.css";

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
    users: []
  });

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
          users: Array.isArray(res?.data?.users) ? res.data.users : []
        });
        setError("");
      } catch {
        if (!active) return;
        setMetrics({ totalUsers: 0, activeUsers: 0, totalTimeSpentSec: 0, users: [] });
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

  const avgTimePerUser = useMemo(() => {
    if (metrics.totalUsers <= 0) return 0;
    return metrics.totalTimeSpentSec / metrics.totalUsers;
  }, [metrics.totalTimeSpentSec, metrics.totalUsers]);

  return (
    <div className="admin-layout">
      <AdminSidebar />

      <main className="admin-main">
        <div className="admin-header">
          <h1>User Insights</h1>
          <p style={{ margin: "6px 0 0", fontSize: "13px", color: "var(--admin-muted)" }}>
            Live user activity metrics updated every 15s.
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

