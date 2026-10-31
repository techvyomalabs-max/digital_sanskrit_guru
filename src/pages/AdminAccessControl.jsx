import { useEffect, useState } from "react";
import { LayoutDashboard, TrendingUp, Wallet, Users, ShieldCheck, Package, Warehouse, PencilLine, Tag, Megaphone, Palette, Crown, Lock } from "lucide-react";
import axios from "axios";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { useDialog } from "../hooks/useDialog";
import AdminSidebar from "../components/admin/AdminSidebar";
import { formatDate, formatTime } from "../utils/date";
import "./AdminShared.css";
import "./AdminDashboard.css";
import "./AdminUsers.css";

const ALL_PAGES = [
  { key: "dashboard", icon: LayoutDashboard, label: "Dashboard", desc: "Overview & metrics" },
  { key: "sales-dashboard", icon: TrendingUp, label: "Sales Analytics", desc: "Interactive sales & format metrics" },
  { key: "financial-dashboard", icon: Wallet, label: "Finance & Taxes", desc: "Interactive revenue & taxation metrics" },
  { key: "users", icon: Users, label: "User Insights", desc: "User activity metrics" },
  { key: "admin-access", icon: ShieldCheck, label: "Admin Roles", desc: "Admin access control" },
  { key: "orders", icon: Package, label: "Orders & Shipping", desc: "View & fulfill orders" },
  { key: "products", icon: Warehouse, label: "Warehouse Products", desc: "View inventory" },
  { key: "add-products", icon: PencilLine, label: "Add & Edit Products", desc: "Create/edit items" },
  { key: "coupons", icon: Tag, label: "Discount Coupons", desc: "Manage coupons" },
  { key: "marketing", icon: Megaphone, label: "Marketing Offers", desc: "Festive & push alerts" },
  { key: "theme", icon: Palette, label: "Theme & Site", desc: "Branding & banners" }
];

function AdminAccessControl() {
  const { token, user: currentUser } = useAuth();
  const { showToast } = useToast();
  const { confirm, alert } = useDialog();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingUserId, setUpdatingUserId] = useState("");
  const [editingAdmin, setEditingAdmin] = useState(null);

  // Form states for creating/updating admin access
  const [adminEmail, setAdminEmail] = useState("");
  const [adminLevelSelect, setAdminLevelSelect] = useState(2);
  const [newAdminRole, setNewAdminRole] = useState("Custom Sub-Admin");
  const [allowedPagesSelect, setAllowedPagesSelect] = useState(["orders", "products", "add-products"]);
  const [isMakingAdmin, setIsMakingAdmin] = useState(false);
  const [makeAdminMessage, setMakeAdminMessage] = useState("");

  const [metrics, setMetrics] = useState({
    admins: []
  });

  const [auditLogs, setAuditLogs] = useState([]);
  const [auditPage, setAuditPage] = useState(1);
  const [hasMoreAudit, setHasMoreAudit] = useState(false);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  const fetchMetrics = async () => {
    try {
      const res = await axios.get("/api/auth/admin/users-metrics", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMetrics({
        admins: Array.isArray(res?.data?.admins) ? res.data.admins : []
      });
      setError("");
    } catch {
      setMetrics({ admins: [] });
      setError("Could not load admin user list.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 15000);
    return () => clearInterval(interval);
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
            const existingIds = new Set(prev.map((item) => item._id));
            const filteredNew = newLogs.filter((item) => !existingIds.has(item._id));
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

  const togglePagePermission = (pageKey) => {
    setAllowedPagesSelect((prev) => {
      if (prev.includes(pageKey)) {
        return prev.filter((p) => p !== pageKey);
      } else {
        return [...prev, pageKey];
      }
    });
  };

  const makeUserAdmin = async () => {
    const email = String(adminEmail || "").trim().toLowerCase();
    if (!email) {
      setMakeAdminMessage("Enter user email address.");
      return;
    }

    setIsMakingAdmin(true);
    setMakeAdminMessage("");
    try {
      const res = await axios.put(
        "/api/auth/make-admin",
        {
          email,
          adminLevel: adminLevelSelect,
          adminRole: adminLevelSelect === 1 ? "Super Admin" : newAdminRole,
          allowedPages: adminLevelSelect === 1 ? ALL_PAGES.map((p) => p.key) : allowedPagesSelect
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMakeAdminMessage(res?.data?.message || "Admin access granted.");
      setAdminEmail("");
      await fetchMetrics();
    } catch (err) {
      setMakeAdminMessage(err?.response?.data?.message || "Could not grant admin access.");
    } finally {
      setIsMakingAdmin(false);
    }
  };

  const handleUpdateRole = async (userId, adminLevel, adminRole, allowedPages) => {
    setUpdatingUserId(userId);
    try {
      const res = await axios.put(
        "/api/auth/update-admin-role",
        { userId, action: "updateRole", adminLevel, adminRole, allowedPages },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showToast(res?.data?.message || "Admin permissions updated successfully.", "success");
      await fetchMetrics();
    } catch (err) {
      await alert({
        title: "Error",
        message: err?.response?.data?.message || "Failed to update admin role.",
        tone: "danger"
      });
    } finally {
      setUpdatingUserId("");
    }
  };

  const handleSavePermissionEdit = async () => {
    if (!editingAdmin) return;
    await handleUpdateRole(
      editingAdmin._id,
      editingAdmin.adminLevel,
      editingAdmin.adminRole,
      editingAdmin.allowedPages
    );
    setEditingAdmin(null);
  };

  const handleRevokeAdmin = async (userId) => {
    const confirmed = await confirm({
      title: "Revoke Admin Access?",
      message: "Are you sure you want to revoke admin access for this user?",
      tone: "danger",
      confirmText: "Revoke Access"
    });
    if (!confirmed) return;
    setUpdatingUserId(userId);
    try {
      await axios.put(
        "/api/auth/update-admin-role",
        { userId, action: "revokeAdmin" },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await fetchMetrics();
    } catch (err) {
      await alert({
        title: "Error",
        message: err?.response?.data?.message || "Failed to revoke admin access.",
        tone: "danger"
      });
    } finally {
      setUpdatingUserId("");
    }
  };

  const isCurrentSuperAdmin = Number(currentUser?.adminLevel || 1) === 1;

  return (
    <div className="admin-layout">
      <AdminSidebar />

      <main className="admin-main">
        <div className="admin-header">
          <h1><ShieldCheck size={24} className="ui-inline-icon" aria-hidden="true" />Admin Roles & Access Control</h1><br></br>
          <p style={{ margin: "6px 0 0", fontSize: "13px", color: "var(--admin-muted)" }}>
            Grant admin access, configure 1st & 2nd Level Admin roles, select particular page permissions, and review audit logs.
          </p>
        </div>

        {error && <p className="pricing-message error">{error}</p>}

        {isCurrentSuperAdmin && (
          <section className="card make-admin-card">
            <div className="make-admin-header">
              <h3>
                <ShieldCheck size={18} className="ui-inline-icon" aria-hidden="true" />Grant & Configure Admin Access
              </h3>
              <p>Promote an existing account to admin and select exact page permissions.</p>
            </div>

            <div style={{ marginTop: "16px", display: "flex", gap: "20px", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 600, fontSize: "14px", color: "var(--admin-text)" }}>
                <input
                  type="radio"
                  name="adminLevelSelect"
                  value={1}
                  checked={adminLevelSelect === 1}
                  onChange={() => {
                    setAdminLevelSelect(1);
                    setNewAdminRole("Super Admin");
                  }}
                />
                <Crown size={15} className="ui-inline-icon" aria-hidden="true" />1st Level Admin (Super Admin - All Pages)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 600, fontSize: "14px", color: "var(--admin-text)" }}>
                <input
                  type="radio"
                  name="adminLevelSelect"
                  value={2}
                  checked={adminLevelSelect === 2}
                  onChange={() => {
                    setAdminLevelSelect(2);
                    setNewAdminRole("Custom Sub-Admin");
                  }}
                />
                <ShieldCheck size={15} className="ui-inline-icon" aria-hidden="true" />2nd Level Admin (Particular Page Access)
              </label>
            </div>

            <div className="make-admin-form-grid" style={{ marginTop: "16px" }}>
              <div className="make-admin-input-wrap">
                <label className="make-admin-label">User Email Address</label>
                <input
                  type="email"
                  className="make-admin-input"
                  placeholder="e.g. team.member@example.com"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                />
              </div>

              <div className="make-admin-select-wrap">
                <label className="make-admin-label">Role Title</label>
                <input
                  type="text"
                  className="make-admin-input"
                  placeholder="e.g. Order Support / Store Manager"
                  value={newAdminRole}
                  onChange={(e) => setNewAdminRole(e.target.value)}
                  disabled={adminLevelSelect === 1}
                />
              </div>

              <button className="make-admin-btn" onClick={makeUserAdmin} disabled={isMakingAdmin}>
                <Lock size={15} className="ui-inline-icon" aria-hidden="true" />{isMakingAdmin ? "Assigning..." : "Assign Access"}
              </button>
            </div>

            {adminLevelSelect === 2 && (
              <div style={{ marginTop: "18px", padding: "16px", borderRadius: "10px", backgroundColor: "var(--admin-input-bg, #f9fafb)", border: "1px solid var(--admin-border)" }}>
                <label className="make-admin-label" style={{ display: "block", marginBottom: "10px" }}>
                  Particular Page Permissions (Select pages to grant):
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "10px" }}>
                  {ALL_PAGES.map((pageItem) => {
                    const isChecked = allowedPagesSelect.includes(pageItem.key);
                    return (
                      <label
                        key={pageItem.key}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "8px",
                          padding: "8px 12px",
                          borderRadius: "8px",
                          border: isChecked ? "1px solid #3b82f6" : "1px solid var(--admin-border)",
                          backgroundColor: isChecked ? "rgba(59, 130, 246, 0.08)" : "transparent",
                          cursor: "pointer",
                          fontSize: "13px"
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => togglePagePermission(pageItem.key)}
                          style={{ marginTop: "3px" }}
                        />
                        <div>
                          <strong style={{ display: "block", color: "var(--admin-text)" }}><pageItem.icon size={14} className="ui-inline-icon" aria-hidden="true" />{pageItem.label}</strong>
                          <span style={{ fontSize: "11px", color: "var(--admin-muted)" }}>{pageItem.desc}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="role-preview-badge" style={{ marginTop: "16px" }}>
              <strong>Access Scope:</strong>
              {adminLevelSelect === 1 ? (
                "1st Level Super Admin: Full unrestricted access to all pages, site settings, and user access management."
              ) : (
                `2nd Level Sub-Admin (${newAdminRole}): Restricted access to ${allowedPagesSelect.length} selected pages (${allowedPagesSelect.join(", ")}).`
              )}
            </div>

            {makeAdminMessage && (
              <p className={`make-admin-message ${makeAdminMessage.includes("now") || makeAdminMessage.includes("granted") ? "success" : "error"}`}>
                {makeAdminMessage}
              </p>
            )}
          </section>
        )}

        <section className="card">
          <h3>Current Admin Accounts</h3>
          {isLoading ? (
            <p>Loading admins...</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Admin User</th>
                    <th>Level & Role</th>
                    <th>Page Access Permissions</th>
                    <th>Status</th>
                    <th>Granted By</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.admins.map((adminUser) => {
                    const isSelf = currentUser?._id === adminUser._id;
                    const isSuperAdmin = isCurrentSuperAdmin;
                    const adminLevel = Number(adminUser.adminLevel || 1);
                    const pages = Array.isArray(adminUser.allowedPages) ? adminUser.allowedPages : [];

                    return (
                      <tr key={adminUser._id}>
                        <td>
                          <strong>{adminUser.name || "Admin"}</strong>
                          <div style={{ color: "var(--admin-muted)", fontSize: "12px", marginTop: "4px" }}>
                            {adminUser.email || "-"}
                          </div>
                        </td>
                        <td>
                          <div>
                            <span
                              style={{
                                padding: "2px 8px",
                                borderRadius: "12px",
                                fontSize: "11px",
                                fontWeight: 700,
                                backgroundColor: adminLevel === 1 ? "rgba(233, 69, 96, 0.15)" : "rgba(59, 130, 246, 0.15)",
                                color: adminLevel === 1 ? "#e94560" : "#3b82f6"
                              }}
                            >
                              {adminLevel === 1 ? "Level 1: Super Admin" : "Level 2: Sub-Admin"}
                            </span>
                            <div style={{ fontSize: "12px", color: "var(--admin-muted)", marginTop: "4px" }}>
                              {adminUser.adminRole || (adminLevel === 1 ? "Super Admin" : "Page Sub-Admin")}
                            </div>
                          </div>
                        </td>
                        <td>
                          {adminLevel === 1 ? (
                            <span style={{ fontSize: "12px", color: "#10b981", fontWeight: 600 }}>
                              <Crown size={13} className="ui-inline-icon" aria-hidden="true" />All Pages (Unrestricted)
                            </span>
                          ) : (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", maxWidth: "280px" }}>
                              {pages.map((p) => (
                                <span
                                  key={p}
                                  style={{
                                    fontSize: "11px",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    backgroundColor: "rgba(59, 130, 246, 0.1)",
                                    border: "1px solid rgba(59, 130, 246, 0.2)",
                                    color: "var(--admin-text)"
                                  }}
                                >
                                  {p}
                                </span>
                              ))}
                              {pages.length === 0 && <span style={{ fontSize: "12px", color: "var(--admin-muted)" }}>No pages granted</span>}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className={adminUser.isActive ? "users-status active" : "users-status idle"}>
                            {adminUser.isActive ? "Active" : "Idle"}
                          </span>
                        </td>
                        <td>
                          {adminUser.adminGrantedByEmail || adminUser.adminGrantedByName
                            ? `${adminUser.adminGrantedByName || "Admin"}${adminUser.adminGrantedByEmail ? ` (${adminUser.adminGrantedByEmail})` : ""}`
                            : "-"}
                        </td>
                        <td>
                          {isSuperAdmin && !isSelf ? (
                            <div style={{ display: "flex", gap: "6px" }}>
                              <button
                                onClick={() =>
                                  setEditingAdmin({
                                    _id: adminUser._id,
                                    email: adminUser.email,
                                    adminLevel,
                                    adminRole: adminUser.adminRole || (adminLevel === 1 ? "Super Admin" : "Custom Sub-Admin"),
                                    allowedPages: pages
                                  })
                                }
                                style={{
                                  padding: "4px 10px",
                                  borderRadius: "6px",
                                  border: "1px solid #3b82f6",
                                  backgroundColor: "transparent",
                                  color: "#3b82f6",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  cursor: "pointer"
                                }}
                              >
                                Edit Permissions
                              </button>
                              <button
                                onClick={() => handleRevokeAdmin(adminUser._id)}
                                disabled={updatingUserId === adminUser._id}
                                style={{
                                  padding: "4px 10px",
                                  borderRadius: "6px",
                                  border: "1px solid #ef4444",
                                  backgroundColor: "transparent",
                                  color: "#ef4444",
                                  fontSize: "12px",
                                  cursor: "pointer"
                                }}
                              >
                                Revoke
                              </button>
                            </div>
                          ) : (
                            <span style={{ color: "var(--admin-muted)", fontSize: "12px" }}>
                              {isSelf ? "Current User" : "View Only"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {editingAdmin && (
                <div style={{ marginTop: "20px", padding: "20px", borderRadius: "12px", border: "1px solid #3b82f6", backgroundColor: "var(--admin-surface, #fff)" }}>
                  <h4 style={{ margin: "0 0 8px", color: "var(--admin-text)" }}>
                    <ShieldCheck size={16} className="ui-inline-icon" aria-hidden="true" />Edit Page Permissions for {editingAdmin.email}
                  </h4>
                  <p style={{ margin: "0 0 16px", fontSize: "13px", color: "var(--admin-muted)" }}>
                    Select admin level and check particular pages to grant access.
                  </p>

                  <div style={{ display: "flex", gap: "20px", marginBottom: "16px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}>
                      <input
                        type="radio"
                        name="editAdminLevel"
                        checked={editingAdmin.adminLevel === 1}
                        onChange={() => setEditingAdmin((prev) => ({ ...prev, adminLevel: 1, adminRole: "Super Admin" }))}
                      />
                      <Crown size={14} className="ui-inline-icon" aria-hidden="true" />Level 1 (Super Admin - All Pages)
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}>
                      <input
                        type="radio"
                        name="editAdminLevel"
                        checked={editingAdmin.adminLevel === 2}
                        onChange={() => setEditingAdmin((prev) => ({ ...prev, adminLevel: 2, adminRole: "Custom Sub-Admin" }))}
                      />
                      <ShieldCheck size={14} className="ui-inline-icon" aria-hidden="true" />Level 2 (Sub-Admin - Particular Pages)
                    </label>
                  </div>

                  {editingAdmin.adminLevel === 2 && (
                    <div style={{ marginBottom: "16px" }}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--admin-text)", marginBottom: "8px" }}>
                        Granted Particular Pages:
                      </label>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "8px" }}>
                        {ALL_PAGES.map((pageItem) => {
                          const isChecked = editingAdmin.allowedPages.includes(pageItem.key);
                          return (
                            <label
                              key={pageItem.key}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                padding: "6px 10px",
                                borderRadius: "6px",
                                border: isChecked ? "1px solid #3b82f6" : "1px solid var(--admin-border)",
                                backgroundColor: isChecked ? "rgba(59, 130, 246, 0.08)" : "transparent",
                                cursor: "pointer",
                                fontSize: "12px"
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setEditingAdmin((prev) => {
                                    const exists = prev.allowedPages.includes(pageItem.key);
                                    const newPages = exists
                                      ? prev.allowedPages.filter((p) => p !== pageItem.key)
                                      : [...prev.allowedPages, pageItem.key];
                                    return { ...prev, allowedPages: newPages };
                                  });
                                }}
                              />
                              <span><pageItem.icon size={14} className="ui-inline-icon" aria-hidden="true" />{pageItem.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      onClick={handleSavePermissionEdit}
                      disabled={updatingUserId === editingAdmin._id}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "8px",
                        backgroundColor: "#3b82f6",
                        color: "#fff",
                        border: "none",
                        fontWeight: 600,
                        fontSize: "13px",
                        cursor: "pointer"
                      }}
                    >
                      Save Permission Changes
                    </button>
                    <button
                      onClick={() => setEditingAdmin(null)}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "8px",
                        backgroundColor: "transparent",
                        color: "var(--admin-muted)",
                        border: "1px solid var(--admin-border)",
                        fontSize: "13px",
                        cursor: "pointer"
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {metrics.admins.length === 0 && <p style={{ margin: "12px 0 0" }}>No admin users found.</p>}
            </div>
          )}
        </section>

        <section className="card">
          <h3>Recent Admin Changes & Audit Logs</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Admin</th>
                  <th>Action</th>
                  <th>Target User / Item</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((entry) => (
                  <tr key={entry._id}>
                    <td>
                      <div>{formatDate(entry.createdAt)}</div>
                      <div style={{ color: "var(--admin-muted)", fontSize: "12px", marginTop: "2px" }}>
                        {formatTime(entry.createdAt)}
                      </div>
                    </td>
                    <td>
                      <strong>{entry.actorName || "Admin"}</strong>
                      <div style={{ color: "var(--admin-muted)", fontSize: "12px", marginTop: "2px" }}>
                        {entry.actorEmail || "-"}
                      </div>
                    </td>
                    <td>
                      <span className="audit-action-tag">{entry.action}</span>
                    </td>
                    <td>
                      <strong>{entry.entityLabel || entry.entityId || "-"}</strong>
                      {entry.entityType && (
                        <span style={{ color: "var(--admin-muted)", fontSize: "12px", marginLeft: "6px" }}>
                          ({entry.entityType})
                        </span>
                      )}
                    </td>
                    <td>{entry.summary || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {auditLogs.length === 0 && !isLoadingAudit && (
              <p style={{ margin: "12px 0 0" }}>No admin changes logged yet.</p>
            )}
          </div>
          {hasMoreAudit && (
            <div style={{ marginTop: "12px", textAlign: "center" }}>
              <button
                onClick={() => setAuditPage((prev) => prev + 1)}
                disabled={isLoadingAudit}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "1px solid var(--admin-border)",
                  backgroundColor: "var(--admin-surface)",
                  color: "var(--admin-text)",
                  cursor: "pointer",
                  fontSize: "13px"
                }}
              >
                {isLoadingAudit ? "Loading..." : "Load More Audit Logs"}
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default AdminAccessControl;
