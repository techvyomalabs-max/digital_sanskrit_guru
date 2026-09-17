import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useAuth } from "../hooks/useAuth";
import AdminSidebar from "../components/admin/AdminSidebar";
import { formatDate, formatTime } from "../utils/date";
import "./AdminShared.css";
import "./AdminDashboard.css";

function AdminSecurityLogs() {
  const { token } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedThreat, setSelectedThreat] = useState(null);

  // Turnstile switch state
  const [turnstileEnabled, setTurnstileEnabled] = useState(true);
  const [savingTurnstile, setSavingTurnstile] = useState(false);
  const [turnstileMessage, setTurnstileMessage] = useState("");

  const fetchSettings = async () => {
    try {
      const res = await axios.get("/api/settings", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data) {
        setTurnstileEnabled(res.data.turnstileEnabled !== false);
      }
    } catch (err) {
      console.warn("Failed to fetch settings:", err);
    }
  };

  const toggleTurnstile = async () => {
    const nextState = !turnstileEnabled;
    setSavingTurnstile(true);
    setTurnstileMessage("");
    try {
      await axios.put(
        "/api/settings",
        { turnstileEnabled: nextState },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTurnstileEnabled(nextState);
      try {
        localStorage.setItem("dsg-turnstile-enabled", String(nextState));
      } catch {}
      setTurnstileMessage(
        nextState
          ? "✅ Cloudflare Turnstile is now ACTIVE across all forms."
          : "⚠️ Cloudflare Turnstile is now DISABLED (forms will submit directly)."
      );
      setTimeout(() => setTurnstileMessage(""), 5000);
    } catch (err) {
      setTurnstileMessage("❌ Failed to update Turnstile setting.");
    } finally {
      setSavingTurnstile(false);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/auth/admin/security-logs", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLogs(res.data?.logs || []);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load security logs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchSettings();
  }, [token]);

  // Stats calculation
  const stats = useMemo(() => {
    let nosql = 0;
    let xss = 0;
    logs.forEach(log => {
      const threat = String(log.threat || log.THREAT || "");
      if (threat === "NoSQL_INJECTION") nosql++;
      if (threat === "XSS_EXPLOIT") xss++;
    });
    return { total: logs.length, nosql, xss };
  }, [logs]);

  // Filter logs by search query
  const filteredLogs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return logs;
    return logs.filter(log => {
      const ip = (log.ip || log.IP || "").toLowerCase();
      const path = (log.path || log.PATH || "").toLowerCase();
      const threat = (log.threat || log.THREAT || "").toLowerCase();
      return ip.includes(query) || path.includes(query) || threat.includes(query);
    });
  }, [logs, searchQuery]);

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-main">
        <div className="admin-header">
          <div>
            <h1>Security Threat Monitor</h1>
            <p className="admin-header-subtitle">
              Audit log of active intrusion and injection attempts blocked by the Vulnerability Guard
            </p>
          </div>
          <button 
            onClick={fetchLogs} 
            className="action-btn" 
            style={{ padding: "8px 16px", borderRadius: "6px" }}
          >
            Refresh Logs
          </button>
        </div>

        {/* Cloudflare Turnstile Bot Protection Master Switch */}
        <div className="card" style={{ marginBottom: "24px", padding: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", border: turnstileEnabled ? "1px solid #10b981" : "1px solid #f59e0b" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <h3 style={{ margin: 0, fontSize: "18px" }}>🛡️ Cloudflare Turnstile Bot Protection</h3>
              <span style={{ 
                padding: "3px 10px", 
                borderRadius: "20px", 
                fontSize: "12px", 
                fontWeight: "700",
                backgroundColor: turnstileEnabled ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                color: turnstileEnabled ? "#10b981" : "#ef4444"
              }}>
                {turnstileEnabled ? "ENABLED" : "DISABLED"}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)", maxWidth: "600px" }}>
              Protects Login, Registration, and Password Reset forms against brute-force bot scripts and spam. When turned OFF, security challenges are bypassed immediately.
            </p>
            {turnstileMessage && (
              <p style={{ margin: "8px 0 0 0", fontSize: "13px", fontWeight: "600", color: turnstileEnabled ? "#10b981" : "#f59e0b" }}>
                {turnstileMessage}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={toggleTurnstile}
            disabled={savingTurnstile}
            style={{
              padding: "10px 20px",
              borderRadius: "8px",
              fontWeight: "700",
              fontSize: "14px",
              cursor: "pointer",
              border: "none",
              backgroundColor: turnstileEnabled ? "#ef4444" : "#10b981",
              color: "#ffffff",
              transition: "all 0.2s ease",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
            }}
          >
            {savingTurnstile ? "Updating..." : turnstileEnabled ? "Disable Turnstile" : "Enable Turnstile"}
          </button>
        </div>

        {/* Threat Stats Cards */}
        <div className="revenue-kpi-grid" style={{ marginBottom: "24px" }}>
          <div className="card revenue-kpi-card" style={{ borderLeft: "4px solid #3b82f6" }}>
            <h4>Total Threats Intercepted</h4>
            <p>{stats.total}</p>
          </div>
          <div className="card revenue-kpi-card" style={{ borderLeft: "4px solid #ef4444" }}>
            <h4>NoSQL Injection Attempts</h4>
            <p style={{ color: "#ef4444" }}>{stats.nosql}</p>
          </div>
          <div className="card revenue-kpi-card" style={{ borderLeft: "4px solid #f97316" }}>
            <h4>XSS Script exploits</h4>
            <p style={{ color: "#f97316" }}>{stats.xss}</p>
          </div>
        </div>

        <section className="card">
          <div className="table-controls" style={{ padding: "16px", display: "flex", gap: "12px" }}>
            <input
              type="text"
              placeholder="Search by IP, endpoint, or threat type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                padding: "10px 14px",
                border: "1px solid var(--border-color, #cbd5e1)",
                borderRadius: "8px",
                backgroundColor: "transparent",
                color: "inherit",
                fontSize: "14px"
              }}
            />
          </div>

          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
              Loading security logs...
            </div>
          ) : error ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#ef4444" }}>
              {error}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
              No threat occurrences detected. Your site is secure!
            </div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Source IP</th>
                    <th>Threat Type</th>
                    <th>Target Path</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log, index) => {
                    const timestamp = log.timestamp || log.TIMESTAMP || new Date().toISOString();
                    const ip = log.ip || log.IP || "Unknown";
                    const threat = log.threat || log.THREAT || "Injection";
                    const path = log.path || log.PATH || "/";
                    
                    return (
                      <tr key={index} style={{ cursor: "pointer" }} onClick={() => setSelectedThreat(log)}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{formatDate(timestamp)}</div>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{formatTime(timestamp)}</div>
                        </td>
                        <td style={{ fontFamily: "monospace", fontSize: "13px" }}>{ip}</td>
                        <td>
                          <span 
                            className={`table-status`} 
                            style={{
                              backgroundColor: threat === "NoSQL_INJECTION" ? "rgba(239, 68, 68, 0.15)" : "rgba(249, 115, 22, 0.15)",
                              color: threat === "NoSQL_INJECTION" ? "#ef4444" : "#f97316",
                              padding: "4px 8px",
                              borderRadius: "4px",
                              fontWeight: "bold",
                              fontSize: "11px"
                            }}
                          >
                            {threat.replace("_", " ")}
                          </span>
                        </td>
                        <td style={{ fontFamily: "monospace", fontSize: "13px", color: "var(--text-muted)" }}>
                          {path}
                        </td>
                        <td>
                          <button 
                            className="text-btn" 
                            style={{ color: "#3b82f6", fontWeight: "bold" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedThreat(log);
                            }}
                          >
                            Inspect Payload
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Inspect Details Modal overlay */}
        {selectedThreat && (
          <div 
            style={{
              position: "fixed",
              top: 0, right: 0, bottom: 0, left: 0,
              backgroundColor: "rgba(0, 0, 0, 0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1100,
              backdropFilter: "blur(4px)"
            }}
            onClick={() => setSelectedThreat(null)}
          >
            <div 
              style={{
                width: "90%",
                maxWidth: "600px",
                backgroundColor: "var(--bg-card, #ffffff)",
                border: "1px solid var(--border-color, #e2e8f0)",
                borderRadius: "12px",
                padding: "24px",
                color: "var(--text-primary, #0f172a)"
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ fontSize: "18px", fontWeight: 700 }}>Inspect Blocked Payload</h3>
                <button 
                  onClick={() => setSelectedThreat(null)} 
                  style={{
                    fontSize: "20px",
                    fontWeight: 300,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "inherit"
                  }}
                >
                  &times;
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
                <div>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)", display: "block" }}>Timestamp</span>
                  <strong style={{ fontSize: "14px" }}>{formatDate(selectedThreat.timestamp || selectedThreat.TIMESTAMP)} at {formatTime(selectedThreat.timestamp || selectedThreat.TIMESTAMP)}</strong>
                </div>
                <div>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)", display: "block" }}>Threat Type</span>
                  <strong style={{ fontSize: "14px" }}>{(selectedThreat.threat || selectedThreat.THREAT).replace("_", " ")}</strong>
                </div>
                <div>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)", display: "block" }}>Target Path URL</span>
                  <strong style={{ fontSize: "14px", fontFamily: "monospace" }}>{selectedThreat.path || selectedThreat.PATH}</strong>
                </div>
                <div>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)", display: "block" }}>Client IP Source</span>
                  <strong style={{ fontSize: "14px", fontFamily: "monospace" }}>{selectedThreat.ip || selectedThreat.IP}</strong>
                </div>
                <div>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Exploit Payload Details</span>
                  <pre 
                    style={{
                      backgroundColor: "rgba(0,0,0,0.05)",
                      padding: "12px",
                      borderRadius: "6px",
                      fontFamily: "monospace",
                      fontSize: "13px",
                      overflowX: "auto",
                      whiteSpace: "pre-wrap"
                    }}
                  >
                    {JSON.stringify(selectedThreat.details || selectedThreat.DETAILS || {}, null, 2)}
                  </pre>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button 
                  onClick={() => setSelectedThreat(null)} 
                  className="action-btn"
                  style={{ padding: "8px 16px", borderRadius: "6px" }}
                >
                  Close Details
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default AdminSecurityLogs;
