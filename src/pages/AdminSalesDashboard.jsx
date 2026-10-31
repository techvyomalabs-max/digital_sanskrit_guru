import { useEffect, useMemo, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
  Globe,
  Layers,
  CalendarDays,
  RefreshCw,
  IndianRupee,
  ShoppingBag,
  Package,
  Receipt
} from "lucide-react";
import axios from "axios";
import { useAuth } from "../hooks/useAuth";
import AdminSidebar from "../components/admin/AdminSidebar";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip
} from "chart.js";
import { Bar } from "react-chartjs-2";
import "./AdminShared.css";
import "./AdminSalesDashboard.css";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const DAY_MS = 24 * 60 * 60 * 1000;
const PRESETS = [
  { id: "7d", label: "7 days", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "12m", label: "12 months", days: 365 },
  { id: "custom", label: "Custom" }
];

const todayIST = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const shiftDay = (ymd, days) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const inr = (v, digits = 0) =>
  `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const shortInr = (v) => {
  const n = Number(v || 0);
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}k`;
  return `₹${Math.round(n)}`;
};
const niceDate = (ymd) =>
  ymd ? new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";

// Canvas charts cannot read CSS variables, so read the admin theme colours once per render.
function readTheme() {
  if (typeof window === "undefined") return {};
  const css = getComputedStyle(document.body);
  const pick = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  return {
    primary: pick("--admin-primary", "#D97706"),
    text: pick("--admin-text", "#0f172a"),
    muted: pick("--admin-muted", "#64748b"),
    border: pick("--admin-border", "#e2e8f0")
  };
}

function Change({ value, label = "vs previous period" }) {
  if (value === null || value === undefined) {
    return <span className="sd-change sd-change--none">No earlier data to compare</span>;
  }
  const up = value > 0;
  const flat = value === 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  return (
    <span className={`sd-change ${flat ? "sd-change--none" : up ? "sd-change--up" : "sd-change--down"}`}>
      <Icon size={13} aria-hidden="true" />
      {up ? "+" : ""}{value}% <span className="sd-change-label">{label}</span>
    </span>
  );
}

function BarList({ rows, valueKey = "revenueInr", formatValue = inr, sub, emptyText }) {
  const max = Math.max(1, ...rows.map((r) => Number(r[valueKey]) || 0));
  if (!rows.length) return <p className="sd-empty">{emptyText}</p>;
  return (
    <ul className="sd-barlist">
      {rows.map((row, index) => (
        <li key={`${row.name}-${index}`} className="sd-barlist-row">
          <div className="sd-barlist-top">
            <span className="sd-barlist-name" title={row.name}>{row.name}</span>
            <span className="sd-barlist-value">{formatValue(row[valueKey])}</span>
          </div>
          <div className="sd-barlist-track" aria-hidden="true">
            <span className="sd-barlist-fill" style={{ width: `${Math.max(2, (Number(row[valueKey]) / max) * 100)}%` }} />
          </div>
          {sub ? <span className="sd-barlist-sub">{sub(row)}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function AdminSalesDashboard() {
  const { token } = useAuth();
  const [preset, setPreset] = useState("30d");
  const [customFrom, setCustomFrom] = useState(() => shiftDay(todayIST(), -29));
  const [customTo, setCustomTo] = useState(() => todayIST());
  const [geoTab, setGeoTab] = useState("states");
  const [result, setResult] = useState({ key: "", data: null, error: "" });
  const [reloadKey, setReloadKey] = useState(0);

  const period = useMemo(() => {
    if (preset === "custom") return { from: customFrom, to: customTo };
    const days = PRESETS.find((p) => p.id === preset)?.days || 30;
    const to = todayIST();
    return { from: shiftDay(to, -(days - 1)), to };
  }, [preset, customFrom, customTo]);

  const periodError =
    !period.from || !period.to || period.from > period.to ? "Choose a start date on or before the end date." : "";
  const requestKey = `${period.from}|${period.to}|${reloadKey}`;
  // Loading = the figures on screen are not for the current period yet.
  const isLoading = !periodError && result.key !== requestKey;
  const data = result.data;
  const error = periodError || (result.key === requestKey ? result.error : "");

  useEffect(() => {
    if (periodError) return undefined;
    let active = true;
    axios
      .get("/api/orders/analytics/sales", {
        params: { from: period.from, to: period.to },
        headers: { Authorization: `Bearer ${token}` }
      })
      .then((res) => {
        if (!active) return;
        setResult(
          res.data?.success
            ? { key: requestKey, data: res.data, error: "" }
            : { key: requestKey, data: null, error: "Could not read the sales figures." }
        );
      })
      .catch((err) => {
        if (!active) return;
        setResult((prev) => ({
          key: requestKey,
          data: prev.data,
          error: err.response?.data?.message || "Could not load the sales figures."
        }));
      });
    return () => {
      active = false;
    };
  }, [period.from, period.to, periodError, requestKey, token]);

  const summary = data?.summary || {};
  const changes = data?.changes || {};
  const theme = readTheme();

  const trendChart = useMemo(() => {
    const trend = Array.isArray(data?.trend) ? data.trend : [];
    return {
      data: {
        labels: trend.map((b) => b.label),
        datasets: [
          {
            label: "Net revenue",
            data: trend.map((b) => b.netInr),
            backgroundColor: theme.primary,
            borderRadius: 4,
            maxBarThickness: 28
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const bucket = trend[ctx.dataIndex] || {};
                return [`Net ${inr(bucket.netInr)}`, `${bucket.orders} order${bucket.orders === 1 ? "" : "s"}`];
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: theme.border },
            border: { display: false },
            ticks: { color: theme.muted, font: { size: 11 }, callback: (v) => shortInr(v) }
          },
          x: {
            grid: { display: false },
            ticks: { color: theme.muted, font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }
          }
        }
      }
    };
  }, [data, theme.primary, theme.border, theme.muted]);

  const formats = Array.isArray(data?.formats) ? data.formats : [];
  const formatTotal = formats.reduce((s, f) => s + (Number(f.revenueInr) || 0), 0);
  const topProducts = Array.isArray(data?.topProducts) ? data.topProducts : [];
  const geoRows = geoTab === "states" ? data?.indianStates || [] : data?.countries || [];
  const hasSales = Number(summary.orders || 0) > 0;
  const unitLabel = data?.range?.unit === "month" ? "month" : "day";

  return (
    <div className="admin-layout">
      <AdminSidebar />

      <main className="admin-main sd-page">
        <header className="sd-header">
          <div>
            <h1>Sales Dashboard</h1>
            <p className="sd-subtitle">
              <CalendarDays size={14} aria-hidden="true" />
              {niceDate(period.from)} – {niceDate(period.to)} · India time · amounts in ₹
            </p>
          </div>
          <div className="sd-period">
            <div className="sd-period-chips" role="group" aria-label="Period">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`sd-chip${preset === p.id ? " is-active" : ""}`}
                  aria-pressed={preset === p.id}
                  onClick={() => setPreset(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {preset === "custom" ? (
              <div className="sd-period-custom">
                <label>
                  <span>From</span>
                  <input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} />
                </label>
                <label>
                  <span>To</span>
                  <input type="date" value={customTo} min={customFrom} max={todayIST()} onChange={(e) => setCustomTo(e.target.value)} />
                </label>
              </div>
            ) : null}
            <button type="button" className="sd-refresh" onClick={() => setReloadKey((k) => k + 1)} disabled={isLoading}>
              <RefreshCw size={14} aria-hidden="true" className={isLoading ? "sd-spin" : ""} /> Refresh
            </button>
          </div>
        </header>

        {error ? <p className="pricing-message error sd-error">{error}</p> : null}

        <section className={`sd-kpis${isLoading ? " is-loading" : ""}`} aria-label="Summary">
          <article className="sd-kpi sd-kpi--main">
            <span className="sd-kpi-label"><IndianRupee size={14} aria-hidden="true" />Net revenue</span>
            <strong className="sd-kpi-value">{inr(summary.netInr)}</strong>
            <span className="sd-kpi-sub">
              Gross {inr(summary.grossInr)} · Refunded {inr(summary.refundedInr)}
              {summary.refundedOrders ? ` (${summary.refundedOrders} order${summary.refundedOrders === 1 ? "" : "s"})` : ""}
            </span>
            <Change value={changes.netInr} />
          </article>
          <article className="sd-kpi">
            <span className="sd-kpi-label"><ShoppingBag size={14} aria-hidden="true" />Paid orders</span>
            <strong className="sd-kpi-value">{Number(summary.orders || 0).toLocaleString("en-IN")}</strong>
            <Change value={changes.orders} />
          </article>
          <article className="sd-kpi">
            <span className="sd-kpi-label"><Receipt size={14} aria-hidden="true" />Average order</span>
            <strong className="sd-kpi-value">{inr(summary.averageOrderInr)}</strong>
            <Change value={changes.averageOrderInr} />
          </article>
          <article className="sd-kpi">
            <span className="sd-kpi-label"><Package size={14} aria-hidden="true" />Items sold</span>
            <strong className="sd-kpi-value">{Number(summary.itemsSold || 0).toLocaleString("en-IN")}</strong>
            <Change value={changes.itemsSold} />
          </article>
        </section>

        <section className="sd-card sd-trend">
          <div className="sd-card-head">
            <h2><TrendingUp size={17} aria-hidden="true" />Net revenue by {unitLabel}</h2>
            <span className="sd-card-note">After refunds · hover a bar for orders</span>
          </div>
          <div className="sd-chart">
            {hasSales ? <Bar key={`${data?.range?.from}-${data?.range?.to}-${data?.range?.unit}`} data={trendChart.data} options={trendChart.options} /> : (
              <p className="sd-empty">{isLoading ? "Loading…" : "No paid orders in this period."}</p>
            )}
          </div>
        </section>

        <div className="sd-grid">
          <section className="sd-card sd-span-2">
            <div className="sd-card-head">
              <h2><Trophy size={17} aria-hidden="true" />Top products</h2>
              <span className="sd-card-note">By item value</span>
            </div>
            {topProducts.length ? (
              <div className="sd-table-wrap">
                <table className="sd-table">
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Product</th>
                      <th scope="col" className="num">Units</th>
                      <th scope="col" className="num">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((p, i) => (
                      <tr key={`${p.name}-${i}`}>
                        <td className="sd-rank">{i + 1}</td>
                        <td className="sd-product" title={p.name}>{p.name}</td>
                        <td className="num">{p.units}</td>
                        <td className="num">{inr(p.revenueInr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="sd-empty">No products sold in this period.</p>
            )}
          </section>

          <section className="sd-card">
            <div className="sd-card-head">
              <h2><Layers size={17} aria-hidden="true" />Sales by format</h2>
            </div>
            <BarList
              rows={formats}
              emptyText="No items sold in this period."
              sub={(row) =>
                `${row.units} unit${row.units === 1 ? "" : "s"} · ${formatTotal ? Math.round((row.revenueInr / formatTotal) * 100) : 0}% of value`
              }
            />
          </section>

          <section className="sd-card sd-span-3">
            <div className="sd-card-head">
              <h2><Globe size={17} aria-hidden="true" />Where orders come from</h2>
              <div className="sd-tabs" role="tablist" aria-label="Location">
                <button type="button" role="tab" aria-selected={geoTab === "states"} className={`sd-tab${geoTab === "states" ? " is-active" : ""}`} onClick={() => setGeoTab("states")}>
                  Indian states
                </button>
                <button type="button" role="tab" aria-selected={geoTab === "countries"} className={`sd-tab${geoTab === "countries" ? " is-active" : ""}`} onClick={() => setGeoTab("countries")}>
                  Countries
                </button>
              </div>
            </div>
            <div className="sd-geo">
              <BarList
                rows={geoRows}
                emptyText="No location data in this period."
                sub={(row) => `${row.orders} order${row.orders === 1 ? "" : "s"}`}
              />
            </div>
            <p className="sd-footnote">
              Digital-only orders often have no address; they appear as &ldquo;Not recorded&rdquo;.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

export default AdminSalesDashboard;
