import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { ChevronLeft, ChevronRight, HandHeart, Mail, Phone, RefreshCw } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import AdminSidebar from "../components/admin/AdminSidebar";
import { formatDate, formatTime } from "../utils/date";
import "./AdminShared.css";
import "./AdminDashboard.css";
import "./AdminSupportRequests.css";

const PAGE_SIZE = 20;
const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "closed", label: "Closed" }
];
const STATUS_OPTIONS = STATUS_TABS.filter((tab) => tab.value);

function AdminSupportRequests() {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ new: 0, contacted: 0, closed: 0 });
  const [status, setStatus] = useState("new");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState("");
  const [noteDrafts, setNoteDrafts] = useState({});

  const authConfig = useCallback(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await axios.get("/api/support-interest/admin", {
        ...authConfig(),
        params: { status: status || undefined, page, limit: PAGE_SIZE }
      });
      setItems(Array.isArray(data?.items) ? data.items : []);
      setCounts(data?.counts || { new: 0, contacted: 0, closed: 0 });
      setTotalPages(Math.max(1, Number(data?.totalPages) || 1));
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load support requests.");
    } finally {
      setLoading(false);
    }
  }, [authConfig, page, status]);

  useEffect(() => {
    load();
  }, [load]);

  const changeTab = (value) => {
    setStatus(value);
    setPage(1);
  };

  const saveItem = async (item, changes) => {
    setSavingId(item._id);
    setError("");
    try {
      const { data } = await axios.patch(`/api/support-interest/admin/${item._id}`, changes, authConfig());
      const updated = data?.item;
      if (!updated) return;
      // An item whose status no longer matches the open tab leaves the list
      if (status && updated.status !== status) {
        setItems((prev) => prev.filter((x) => x._id !== item._id));
      } else {
        setItems((prev) => prev.map((x) => (x._id === item._id ? updated : x)));
      }
      if (changes.status && changes.status !== item.status) {
        setCounts((prev) => ({ ...prev, [item.status]: Math.max(0, (prev[item.status] || 0) - 1), [changes.status]: (prev[changes.status] || 0) + 1 }));
      }
      if (changes.adminNote !== undefined) {
        setNoteDrafts((prev) => {
          const next = { ...prev };
          delete next[item._id];
          return next;
        });
      }
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update the support request.");
    } finally {
      setSavingId("");
    }
  };

  const total = (counts.new || 0) + (counts.contacted || 0) + (counts.closed || 0);

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-main">
        <div className="admin-header">
          <div>
            <h1><HandHeart size={24} className="ui-inline-icon" aria-hidden="true" />Support Requests</h1>
            <p className="admin-header-subtitle">
              People who filled in the Support us form to sponsor, partner, donate or volunteer
            </p>
          </div>
          <button type="button" className="action-btn support-admin-refresh" onClick={load} disabled={loading}>
            <RefreshCw size={15} className="ui-inline-icon" aria-hidden="true" />Refresh
          </button>
        </div>

        <div className="support-admin-tabs" role="tablist" aria-label="Filter by status">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value || "all"}
              type="button"
              role="tab"
              aria-selected={status === tab.value}
              className={`support-admin-tab${status === tab.value ? " is-active" : ""}`}
              onClick={() => changeTab(tab.value)}
            >
              {tab.label}
              <span className="support-admin-tab-count">{tab.value ? counts[tab.value] || 0 : total}</span>
            </button>
          ))}
        </div>

        {error && (
          <div className="support-admin-error" role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <div className="support-admin-empty">Loading support requests...</div>
        ) : items.length === 0 ? (
          <div className="support-admin-empty">
            {status ? `No ${status} requests.` : "No support requests yet."}
          </div>
        ) : (
          <div className="support-admin-list">
            {items.map((item) => {
              const draft = noteDrafts[item._id];
              const noteValue = draft !== undefined ? draft : item.adminNote || "";
              const isSaving = savingId === item._id;
              return (
                <article key={item._id} className={`support-admin-card status-${item.status}`}>
                  <header className="support-admin-card-head">
                    <div>
                      <h2>{item.name}</h2>
                      <p className="support-admin-meta">
                        {item.organisation ? `${item.organisation} · ` : ""}
                        {formatDate(item.createdAt)} {formatTime(item.createdAt)}
                      </p>
                    </div>
                    <span className="support-admin-type">{item.supportTypeLabel}</span>
                  </header>

                  <div className="support-admin-contact">
                    <a href={`mailto:${item.email}`}><Mail size={15} aria-hidden="true" />{item.email}</a>
                    {item.phone && (
                      <a href={`tel:${item.phone.replace(/[^\d+]/g, "")}`}><Phone size={15} aria-hidden="true" />{item.phone}</a>
                    )}
                  </div>

                  <p className="support-admin-message">{item.message}</p>

                  <div className="support-admin-actions">
                    <label>
                      <span>Status</span>
                      <select
                        value={item.status}
                        disabled={isSaving}
                        onChange={(event) => saveItem(item, { status: event.target.value })}
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="support-admin-note">
                      <span>Internal note</span>
                      <textarea
                        rows={2}
                        maxLength={1000}
                        value={noteValue}
                        placeholder="Only admins see this"
                        onChange={(event) => setNoteDrafts((prev) => ({ ...prev, [item._id]: event.target.value }))}
                      />
                    </label>
                    {draft !== undefined && draft !== (item.adminNote || "") && (
                      <button
                        type="button"
                        className="action-btn support-admin-save"
                        disabled={isSaving}
                        onClick={() => saveItem(item, { adminNote: draft })}
                      >
                        {isSaving ? "Saving..." : "Save note"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <nav className="support-admin-pager" aria-label="Pages">
            <button type="button" className="action-btn" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft size={16} aria-hidden="true" />Previous
            </button>
            <span>Page {page} of {totalPages}</span>
            <button type="button" className="action-btn" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
              Next<ChevronRight size={16} aria-hidden="true" />
            </button>
          </nav>
        )}
      </main>
    </div>
  );
}

export default AdminSupportRequests;
