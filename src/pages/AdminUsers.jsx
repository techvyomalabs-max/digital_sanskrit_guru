import { useEffect, useMemo, useState } from "react";
import {
  Users,
  UserPlus,
  Activity,
  ShoppingBag,
  Clock,
  CalendarDays,
  RefreshCw,
  Search,
  Trash2,
  TrendingUp,
  TrendingDown,
  Minus,
  Megaphone,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import axios from "axios";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from "chart.js";
import { Bar } from "react-chartjs-2";
import { useAuth } from "../hooks/useAuth";
import { useDialog } from "../hooks/useDialog";
import AdminSidebar from "../components/admin/AdminSidebar";
import { formatDate, formatTime } from "../utils/date";
import { startVisiblePolling } from "../utils/visiblePolling";
import "./AdminShared.css";
import "./AdminUsers.css";
import "./AdminUserInsights.css";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const DAY_MS = 24 * 60 * 60 * 1000;
const PRESETS = [
  { id: "7d", label: "7 days", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "12m", label: "12 months", days: 365 },
  { id: "custom", label: "Custom" }
];
const LIST_FILTERS = [
  { id: "Customer", label: "Customers" },
  { id: "Online", label: "Online now" },
  { id: "Admin", label: "Admins" },
  { id: "All", label: "Everyone" }
];
const SORTS = [
  { id: "recent", label: "Recently active" },
  { id: "newest", label: "Newest sign-ups" },
  { id: "time", label: "Most time on site" }
];

const todayIST = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const shiftDay = (ymd, days) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const niceDate = (ymd) =>
  ymd ? new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";
const num = (v) => Number(v || 0).toLocaleString("en-IN");
const inr = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function formatDuration(totalSec) {
  const sec = Math.max(0, Math.floor(Number(totalSec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec % 60}s`;
  return `${sec}s`;
}

function timeAgo(value) {
  if (!value) return "Never";
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff)) return "Never";
  if (diff < 60 * 1000) return "Just now";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} min ago`;
  if (diff < DAY_MS) return `${Math.floor(diff / 3600000)} h ago`;
  if (diff < 30 * DAY_MS) return `${Math.floor(diff / DAY_MS)} d ago`;
  return formatDate(value);
}

// Canvas charts cannot read CSS variables, so read the admin theme colours when drawing.
function readTheme() {
  if (typeof window === "undefined") return {};
  const css = getComputedStyle(document.body);
  const pick = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  return {
    primary: pick("--admin-primary", "#D97706"),
    muted: pick("--admin-muted", "#64748b"),
    border: pick("--admin-border", "#e2e8f0")
  };
}

/**
 * GETs an admin URL. The figures on screen stay until the new ones arrive; "isLoading" means
 * they are not for the current URL yet. pollMs > 0 refreshes while the tab is visible.
 */
function useAdminGet(url, token, pollMs = 0) {
  const [state, setState] = useState({ key: "", data: null, error: "" });
  const [reloadKey, setReloadKey] = useState(0);
  const key = `${url}|${reloadKey}`;

  useEffect(() => {
    if (!url) return undefined;
    let cancelled = false;
    const load = () =>
      axios
        .get(url, { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => {
          if (!cancelled) setState({ key, data: res.data, error: "" });
        })
        .catch((err) => {
          if (!cancelled) {
            setState((prev) => ({
              key,
              data: prev.data,
              error: err.response?.data?.message || "Could not load this section."
            }));
          }
        });
    load();
    const stop = pollMs > 0 ? startVisiblePolling(load, pollMs) : null;
    return () => {
      cancelled = true;
      if (stop) stop();
    };
  }, [url, token, key, pollMs]);

  return {
    data: state.data,
    error: state.key === key ? state.error : "",
    isLoading: state.key !== key,
    reload: () => setReloadKey((k) => k + 1)
  };
}

function Change({ value }) {
  if (value === null || value === undefined) {
    return <span className="ua-change ua-change--none">No earlier sign-ups to compare</span>;
  }
  const up = value > 0;
  const flat = value === 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  return (
    <span className={`ua-change ${flat ? "ua-change--none" : up ? "ua-change--up" : "ua-change--down"}`}>
      <Icon size={13} aria-hidden="true" />
      {up ? "+" : ""}{value}% <span className="ua-change-label">vs previous period</span>
    </span>
  );
}

function Kpi({ icon, label, value, sub, extra, main = false, live = false }) {
  const Icon = icon;
  return (
    <div className={`ua-kpi${main ? " ua-kpi--main" : ""}`}>
      <span className="ua-kpi-label">
        <Icon size={14} aria-hidden="true" />
        {label}
        {live ? <span className="ua-live" title="Right now, not tied to the period">Live</span> : null}
      </span>
      <strong className="ua-kpi-value">{value}</strong>
      {sub ? <span className="ua-kpi-sub">{sub}</span> : null}
      {extra}
    </div>
  );
}

function AdminUsers() {
  const { token, user } = useAuth();
  const { confirm, alert } = useDialog();

  // Period (drives sign-ups, conversion and sources)
  const [preset, setPreset] = useState("30d");
  const [customFrom, setCustomFrom] = useState(() => shiftDay(todayIST(), -29));
  const [customTo, setCustomTo] = useState(() => todayIST());
  const period = useMemo(() => {
    if (preset === "custom") return { from: customFrom, to: customTo };
    const days = PRESETS.find((p) => p.id === preset)?.days || 30;
    const to = todayIST();
    return { from: shiftDay(to, -(days - 1)), to };
  }, [preset, customFrom, customTo]);
  const periodError =
    !period.from || !period.to || period.from > period.to ? "Choose a start date on or before the end date." : "";
  const periodQuery = periodError ? "" : `from=${period.from}&to=${period.to}`;

  // Customer list
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [listFilter, setListFilter] = useState("Customer");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const next = searchInput.trim();
    if (next === search) return undefined;
    const id = window.setTimeout(() => {
      setSearch(next);
      setPage(1);
    }, 350);
    return () => window.clearTimeout(id);
  }, [searchInput, search]);

  const overview = useAdminGet(periodQuery ? `/api/auth/admin/users-overview?${periodQuery}` : "", token, 60000);
  const sources = useAdminGet(periodQuery ? `/api/auth/admin/signups-by-source?${periodQuery}` : "", token);
  const listParams = new URLSearchParams({ page: String(page), limit: "25", search, status: listFilter, sort });
  const list = useAdminGet(`/api/auth/admin/users-metrics?${listParams.toString()}`, token, 60000);

  const summary = overview.data?.summary || {};
  const range = overview.data?.range;
  const unitLabel = range?.unit === "month" ? "month" : "day";
  const users = Array.isArray(list.data?.users) ? list.data.users : [];
  const pagination = list.data?.pagination || { page: 1, limit: 25, total: 0, totalPages: 1 };
  const sourceRows = useMemo(() => {
    const rows = Array.isArray(sources.data?.rows) ? sources.data.rows : [];
    return [...rows.filter((r) => r.source !== "Not tracked"), ...rows.filter((r) => r.source === "Not tracked")];
  }, [sources.data]);
  const maxSourceSignups = Math.max(1, ...sourceRows.map((r) => Number(r.signups) || 0));

  const trendChart = useMemo(() => {
    const trend = Array.isArray(overview.data?.trend) ? overview.data.trend : [];
    const theme = readTheme();
    return {
      hasData: trend.some((t) => t.signups > 0),
      data: {
        labels: trend.map((t) => t.label),
        datasets: [
          {
            label: "New sign-ups",
            data: trend.map((t) => t.signups),
            backgroundColor: theme.primary,
            borderRadius: 4,
            maxBarThickness: 36
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.y} sign-up${ctx.parsed.y === 1 ? "" : "s"}` } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: theme.muted, maxRotation: 0, autoSkipPadding: 12 } },
          y: { beginAtZero: true, grid: { color: theme.border }, ticks: { color: theme.muted, precision: 0 } }
        }
      }
    };
  }, [overview.data]);

  const handleDeleteUser = async (userItem) => {
    if (userItem._id === user?._id) {
      await alert({ title: "Action Not Allowed", message: "You cannot delete your own account.", tone: "danger" });
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
      await axios.delete(`/api/auth/admin/users/${userItem._id}`, { headers: { Authorization: `Bearer ${token}` } });
      list.reload();
      overview.reload();
    } catch (err) {
      await alert({ title: "Error", message: err.response?.data?.message || "Failed to soft delete user.", tone: "danger" });
    }
  };

  const refreshAll = () => {
    overview.reload();
    sources.reload();
    list.reload();
  };
  const anyLoading = overview.isLoading || sources.isLoading || list.isLoading;
  const firstRow = pagination.total ? (pagination.page - 1) * pagination.limit + 1 : 0;
  const lastRow = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div className="admin-layout">
      <AdminSidebar />

      <main className="admin-main ua-page">
        <header className="ua-header">
          <div>
            <h1>User Activity &amp; Insights</h1>
            <p className="ua-subtitle">
              <CalendarDays size={14} aria-hidden="true" />
              {range ? `${niceDate(range.from)} – ${niceDate(range.to)}` : "Loading…"} · customers only, admin accounts are
              not counted
            </p>
          </div>
          <div className="ua-period">
            <div className="ua-chips" role="group" aria-label="Period">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`ua-chip${preset === p.id ? " is-active" : ""}`}
                  onClick={() => setPreset(p.id)}
                  aria-pressed={preset === p.id}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {preset === "custom" ? (
              <div className="ua-custom">
                <label>
                  From
                  <input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} />
                </label>
                <label>
                  To
                  <input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} />
                </label>
              </div>
            ) : null}
            <button type="button" className="ua-refresh" onClick={refreshAll} disabled={anyLoading}>
              <RefreshCw size={14} className={anyLoading ? "ua-spin" : ""} aria-hidden="true" />
              Refresh
            </button>
          </div>
        </header>

        {periodError ? <p className="pricing-message error ua-error">{periodError}</p> : null}
        {overview.error ? <p className="pricing-message error ua-error">{overview.error}</p> : null}

        <section className={`ua-kpis${overview.isLoading ? " is-loading" : ""}`} aria-label="Key figures">
          <Kpi
            main
            icon={UserPlus}
            label="New sign-ups"
            value={num(summary.newSignups)}
            sub={`${num(summary.customers)} customers in total`}
            extra={<Change value={overview.data?.changes?.newSignups} />}
          />
          <Kpi
            live
            icon={Activity}
            label="Online now"
            value={
              <span className="ua-online">
                <span className={`ua-dot${summary.onlineNow ? " is-on" : ""}`} aria-hidden="true" />
                {num(summary.onlineNow)}
              </span>
            }
            sub={`${num(summary.active24h)} active in the last 24 hours`}
          />
          <Kpi
            live
            icon={Users}
            label="Active last 7 days"
            value={num(summary.active7d)}
            sub={`${num(summary.active30d)} in the last 30 days`}
          />
          <Kpi
            icon={ShoppingBag}
            label="Sign-ups who bought"
            value={`${summary.conversionPercent || 0}%`}
            sub={`${num(summary.newBuyers)} of ${num(summary.newSignups)} new customers have paid`}
          />
          <Kpi
            icon={Clock}
            label="Avg time on site"
            value={formatDuration(summary.avgTimePerEngagedSec)}
            sub={`per customer who has used the site (${num(summary.engagedCustomers)})`}
          />
        </section>

        <section className="ua-grid">
          <div className="ua-card ua-span-2">
            <div className="ua-card-head">
              <h2><UserPlus size={16} aria-hidden="true" />New sign-ups by {unitLabel}</h2>
              <span className="ua-card-note">Hover a bar for the count</span>
            </div>
            <div className="ua-chart">
              {trendChart.hasData ? (
                <Bar key={`${range?.from}-${range?.to}-${range?.unit}`} data={trendChart.data} options={trendChart.options} />
              ) : (
                <p className="ua-empty">{overview.isLoading ? "Loading…" : "No sign-ups in this period."}</p>
              )}
            </div>
          </div>

          <div className="ua-card">
            <div className="ua-card-head">
              <h2><Activity size={16} aria-hidden="true" />How active customers are</h2>
            </div>
            <ul className="ua-funnel">
              {[
                ["Online now", summary.onlineNow],
                ["Last 24 hours", summary.active24h],
                ["Last 7 days", summary.active7d],
                ["Last 30 days", summary.active30d],
                ["Ever used the site", summary.engagedCustomers],
                ["All customers", summary.customers]
              ].map(([label, value]) => (
                <li key={label}>
                  <div className="ua-funnel-top">
                    <span>{label}</span>
                    <strong>{num(value)}</strong>
                  </div>
                  <div className="ua-track" aria-hidden="true">
                    <span
                      className="ua-fill"
                      style={{ width: `${summary.customers ? Math.max(1.5, (Number(value || 0) / summary.customers) * 100) : 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <p className="ua-footnote">Counted from each customer&apos;s last visit while signed in.</p>
          </div>
        </section>

        <section className="ua-card">
          <div className="ua-card-head">
            <h2><Megaphone size={16} aria-hidden="true" />Where sign-ups come from</h2>
            <span className="ua-card-note">
              {num(sources.data?.totalSignups)} sign-ups · {num(sources.data?.trackedSignups)} with a known source
            </span>
          </div>
          {sources.error ? (
            <p className="pricing-message error ua-error">{sources.error}</p>
          ) : !sourceRows.length ? (
            <p className="ua-empty">{sources.isLoading ? "Loading…" : "No sign-ups in this period."}</p>
          ) : (
            <div className={`ua-table-wrap${sources.isLoading ? " is-loading" : ""}`}>
              <table className="ua-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Medium</th>
                    <th>Campaign</th>
                    <th className="ua-col-bar">Sign-ups</th>
                    <th className="num">Bought</th>
                    <th className="num">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceRows.map((row, idx) => {
                    const notTracked = row.source === "Not tracked";
                    return (
                      <tr key={`${row.source}-${row.medium}-${row.campaign}-${idx}`} className={notTracked ? "is-muted" : ""}>
                        <td>
                          <strong>{row.source}</strong>
                          {notTracked ? <span className="ua-hint">Joined before tracking started, or the browser blocked it</span> : null}
                        </td>
                        <td>{row.medium || "—"}</td>
                        <td>{row.campaign || "—"}</td>
                        <td className="ua-col-bar">
                          <div className="ua-inline-bar">
                            <div className="ua-track" aria-hidden="true">
                              <span className="ua-fill" style={{ width: `${Math.max(2, (row.signups / maxSourceSignups) * 100)}%` }} />
                            </div>
                            <span className="ua-inline-value">
                              {num(row.signups)} <small>{row.sharePercent}%</small>
                            </span>
                          </div>
                        </td>
                        <td className="num">{num(row.buyers)}</td>
                        <td className="num">{inr(row.revenueInInr)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="ua-card">
          <div className="ua-card-head ua-list-head">
            <h2><Users size={16} aria-hidden="true" />People</h2>
            <div className="ua-list-controls">
              <label className="ua-search">
                <Search size={15} aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Search name or email"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  aria-label="Search people"
                />
              </label>
              <div className="ua-chips ua-chips--small" role="group" aria-label="Show">
                {LIST_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`ua-chip${listFilter === f.id ? " is-active" : ""}`}
                    aria-pressed={listFilter === f.id}
                    onClick={() => { setListFilter(f.id); setPage(1); }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <select className="ua-select" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} aria-label="Sort by">
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {list.error ? <p className="pricing-message error ua-error">{list.error}</p> : null}

          {!list.data && list.isLoading ? (
            <p className="ua-empty">Loading…</p>
          ) : !users.length ? (
            <p className="ua-empty">No one matches this search.</p>
          ) : (
            <div className={`ua-table-wrap${list.isLoading ? " is-loading" : ""}`}>
              <table className="ua-table ua-people">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Joined</th>
                    <th>Source</th>
                    <th className="num">Orders</th>
                    <th className="num">Time on site</th>
                    <th>Last active</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((item) => (
                    <tr key={item._id}>
                      <td>
                        <div className="ua-person">
                          <span className="ua-avatar" aria-hidden="true">
                            {(item.name || item.email || "?").trim().charAt(0).toUpperCase()}
                          </span>
                          <div className="ua-person-text">
                            <strong>
                              {item.name || "Customer"}
                              {item.isAdmin ? <span className="ua-badge">Admin</span> : null}
                            </strong>
                            <span>{item.email || "—"}</span>
                          </div>
                        </div>
                      </td>
                      <td className="ua-nowrap">{item.joinedAt ? formatDate(item.joinedAt) : "—"}</td>
                      <td>
                        {item.source ? (
                          <>
                            <span className="ua-source">{item.source}</span>
                            {item.campaign ? <span className="ua-hint">{item.campaign}</span> : null}
                          </>
                        ) : (
                          <span className="ua-muted">—</span>
                        )}
                      </td>
                      <td className="num">
                        {item.orders ? (
                          <>
                            {num(item.orders)}
                            <span className="ua-hint">{inr(item.spentInr)}</span>
                          </>
                        ) : (
                          <span className="ua-muted">0</span>
                        )}
                      </td>
                      <td className="num">{formatDuration(item.totalTimeSpentSec)}</td>
                      <td className="ua-nowrap">
                        <span className={`ua-dot${item.isActive ? " is-on" : ""}`} aria-hidden="true" />
                        <span title={item.lastActiveAt ? `${formatDate(item.lastActiveAt)} ${formatTime(item.lastActiveAt)}` : ""}>
                          {item.isActive ? "Online now" : timeAgo(item.lastActiveAt)}
                        </span>
                      </td>
                      <td className="num">
                        <button
                          type="button"
                          className="ua-icon-btn"
                          onClick={() => handleDeleteUser(item)}
                          disabled={item._id === user?._id}
                          title={item._id === user?._id ? "You cannot delete your own account" : "Move to Recycle Bin"}
                          aria-label={`Move ${item.email || item.name} to Recycle Bin`}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pagination.total > 0 ? (
            <div className="ua-pager">
              <span>
                {num(firstRow)}–{num(lastRow)} of {num(pagination.total)}
              </span>
              <div>
                <button type="button" disabled={pagination.page <= 1} onClick={() => setPage(pagination.page - 1)} aria-label="Previous page">
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>
                <span>
                  Page {pagination.page} of {pagination.totalPages || 1}
                </span>
                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPage(pagination.page + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

export default AdminUsers;
