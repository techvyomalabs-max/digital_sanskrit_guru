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
  const [copiedPayload, setCopiedPayload] = useState(false);

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
              backgroundColor: "rgba(0, 0, 0, 0.65)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1100,
              padding: "16px",
              backdropFilter: "blur(6px)"
            }}
            onClick={() => setSelectedThreat(null)}
          >
            <div 
              style={{
                width: "100%",
                maxWidth: "750px",
                maxHeight: "88vh",
                backgroundColor: "var(--bg-card, #ffffff)",
                border: "1px solid var(--border-color, #e2e8f0)",
                borderRadius: "14px",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
                color: "var(--text-primary, #0f172a)"
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center", 
                padding: "18px 24px",
                borderBottom: "1px solid var(--border-color, #e2e8f0)",
                backgroundColor: "var(--bg-surface, #f8fafc)"
              }}>
                <div>
                  <h3 style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>Inspect Blocked Payload</h3>
                  <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--text-muted)" }}>
                    Security threat interception details & parameter audit
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedThreat(null)} 
                  style={{
                    fontSize: "24px",
                    lineHeight: 1,
                    fontWeight: 400,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    padding: "4px 8px"
                  }}
                  title="Close Modal"
                >
                  &times;
                </button>
              </div>

              {/* Modal Body (Scrollable) */}
              <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", backgroundColor: "var(--bg-surface, #f8fafc)", padding: "14px", borderRadius: "8px", border: "1px solid var(--border-color, #e2e8f0)" }}>
                  <div>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: 700, color: "var(--text-muted)", display: "block" }}>Timestamp</span>
                    <strong style={{ fontSize: "13px" }}>{formatDate(selectedThreat.timestamp || selectedThreat.TIMESTAMP)} {formatTime(selectedThreat.timestamp || selectedThreat.TIMESTAMP)}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: 700, color: "var(--text-muted)", display: "block" }}>Threat Type</span>
                    <span style={{ 
                      display: "inline-block", 
                      fontSize: "12px", 
                      fontWeight: 700,
                      color: (selectedThreat.threat || selectedThreat.THREAT) === "NoSQL_INJECTION" ? "#ef4444" : "#f97316",
                      marginTop: "2px"
                    }}>
                      {(selectedThreat.threat || selectedThreat.THREAT).replace("_", " ")}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: 700, color: "var(--text-muted)", display: "block" }}>Target Path</span>
                    <code style={{ fontSize: "12px", color: "inherit", wordBreak: "break-all" }}>{selectedThreat.path || selectedThreat.PATH}</code>
                  </div>
                  <div>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: 700, color: "var(--text-muted)", display: "block" }}>Source IP</span>
                    <code style={{ fontSize: "12px", color: "inherit" }}>{selectedThreat.ip || selectedThreat.IP}</code>
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>
                      Payload & Parameter Content
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const content = JSON.stringify(selectedThreat.details || selectedThreat.DETAILS || {}, null, 2);
                        navigator.clipboard.writeText(content);
                        setCopiedPayload(true);
                        setTimeout(() => setCopiedPayload(false), 2000);
                      }}
                      style={{
                        padding: "4px 10px",
                        fontSize: "12px",
                        fontWeight: 600,
                        borderRadius: "6px",
                        border: "1px solid var(--border-color, #cbd5e1)",
                        backgroundColor: copiedPayload ? "#10b981" : "transparent",
                        color: copiedPayload ? "#ffffff" : "inherit",
                        cursor: "pointer",
                        transition: "all 0.2s"
                      }}
                    >
                      {copiedPayload ? "✓ Copied!" : "📋 Copy Payload"}
                    </button>
                  </div>
                  <div style={{
                    backgroundColor: "rgba(15, 23, 42, 0.05)",
                    border: "1px solid var(--border-color, #e2e8f0)",
                    borderRadius: "8px",
                    overflow: "hidden"
                  }}>
                    <pre 
                      style={{
                        margin: 0,
                        padding: "16px",
                        fontFamily: "'Fira Code', 'Consolas', monospace",
                        fontSize: "12.5px",
                        lineHeight: 1.6,
                        maxHeight: "360px",
                        overflowX: "auto",
                        overflowY: "auto",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        color: "inherit"
                      }}
                    >
                      {JSON.stringify(selectedThreat.details || selectedThreat.DETAILS || {}, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div style={{ 
                display: "flex", 
                justifyContent: "flex-end", 
                padding: "14px 24px", 
                borderTop: "1px solid var(--border-color, #e2e8f0)",
                backgroundColor: "var(--bg-surface, #f8fafc)"
              }}>
                <button 
                  onClick={() => setSelectedThreat(null)} 
                  className="action-btn"
                  style={{ padding: "8px 20px", borderRadius: "8px", fontWeight: 600 }}
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
