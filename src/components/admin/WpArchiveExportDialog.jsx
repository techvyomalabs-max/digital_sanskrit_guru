import { useEffect, useId, useRef, useState } from "react";
import axios from "axios";
import { X, FileSpreadsheet, FileText, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

const DEFAULT_LIMITS = { csv: 10000, pdf: 500 };

/** Today's date in India time as "YYYY-MM-DD". */
function istToday() {
  return new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

function shiftMonths(isoDate, months) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(d, lastDay));
  return date.toISOString().slice(0, 10);
}

function quickRanges() {
  const today = istToday();
  const [y, m] = today.split("-").map(Number);
  const fyStartYear = m >= 4 ? y : y - 1;
  return [
    { key: "month", label: "This month", from: `${today.slice(0, 7)}-01`, to: today },
    { key: "3m", label: "Last 3 months", from: shiftMonths(today, -3), to: today },
    { key: "fy", label: "This financial year", from: `${fyStartYear}-04-01`, to: today },
    { key: "prev-fy", label: "Last financial year", from: `${fyStartYear - 1}-04-01`, to: `${fyStartYear}-03-31` },
    { key: "all", label: "All time", from: "", to: "" }
  ];
}

/**
 * Export dialog for the WP Archive: pick filters and a format, see how many orders match,
 * and download only when the result is within the format's limit.
 */
function WpArchiveExportDialog({ token, initialFilters, currencies = [], onClose, onDownload, downloading, downloadError = "" }) {
  const titleId = useId();
  const firstFieldRef = useRef(null);
  const [filters, setFilters] = useState(() => ({
    from: "",
    to: "",
    status: initialFilters?.status || "All",
    paymentStatus: "All",
    currency: "All",
    search: initialFilters?.search || ""
  }));
  const [format, setFormat] = useState("csv");
  const [preview, setPreview] = useState({ loading: true, count: null, limits: DEFAULT_LIMITS, allowed: { csv: false, pdf: false }, error: "" });

  const setField = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    firstFieldRef.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Count the matching orders whenever the filters change (debounced)
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setPreview((current) => ({ ...current, loading: true, error: "" }));
      try {
        const params = new URLSearchParams(filters);
        const res = await axios.get(`/api/admin/wp-archive/orders/export/preview?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (cancelled) return;
        setPreview({
          loading: false,
          count: res.data.count,
          limits: res.data.limits || DEFAULT_LIMITS,
          allowed: res.data.allowed || { csv: false, pdf: false },
          error: ""
        });
      } catch (err) {
        if (cancelled) return;
        setPreview((current) => ({
          ...current,
          loading: false,
          count: null,
          allowed: { csv: false, pdf: false },
          error: err.response?.data?.message || "Could not count the matching orders."
        }));
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filters, token]);

  const ranges = quickRanges();
  const activeRange = ranges.find((r) => r.from === filters.from && r.to === filters.to)?.key || "";
  const limit = preview.limits[format];
  const count = preview.count;
  const canDownload = !preview.loading && !preview.error && preview.allowed[format] && !downloading;

  let statusMessage = null;
  if (downloadError && !downloading) {
    statusMessage = { tone: "error", text: downloadError };
  } else if (preview.error) {
    statusMessage = { tone: "error", text: preview.error };
  } else if (preview.loading || count === null) {
    statusMessage = { tone: "info", text: "Counting matching orders..." };
  } else if (count === 0) {
    statusMessage = { tone: "error", text: "No orders match these filters." };
  } else if (count > limit) {
    statusMessage = {
      tone: "error",
      text: `${count.toLocaleString("en-IN")} orders match, but a ${format.toUpperCase()} export can include at most ${limit.toLocaleString("en-IN")}. Narrow the filters, for example with a shorter date range${format === "pdf" && count <= preview.limits.csv ? ", or choose CSV" : ""}.`
    };
  } else {
    statusMessage = { tone: "ok", text: `${count.toLocaleString("en-IN")} ${count === 1 ? "order" : "orders"} will be exported.` };
  }

  const handleSubmit = (event) => {
    event.preventDefault();
    if (canDownload) onDownload(format, filters);
  };

  return (
    <div className="wp-export-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="wp-export-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={handleSubmit}>
        <div className="wp-export-head">
          <h2 id={titleId}>Export WP Archive orders</h2>
          <button type="button" className="wp-export-close" onClick={onClose} aria-label="Close export">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <fieldset className="wp-export-section">
          <legend>Order date</legend>
          <div className="wp-export-chips" role="group" aria-label="Quick date ranges">
            {ranges.map((range) => (
              <button
                key={range.key}
                type="button"
                className={`wp-export-chip${activeRange === range.key ? " is-active" : ""}`}
                aria-pressed={activeRange === range.key}
                onClick={() => setFilters((current) => ({ ...current, from: range.from, to: range.to }))}
              >
                {range.label}
              </button>
            ))}
          </div>
          <div className="wp-export-grid">
            <label>
              <span>From</span>
              <input ref={firstFieldRef} type="date" value={filters.from} max={filters.to || istToday()} onChange={(e) => setField("from", e.target.value)} />
            </label>
            <label>
              <span>To</span>
              <input type="date" value={filters.to} min={filters.from || undefined} max={istToday()} onChange={(e) => setField("to", e.target.value)} />
            </label>
          </div>
        </fieldset>

        <fieldset className="wp-export-section">
          <legend>Filters</legend>
          <div className="wp-export-grid wp-export-grid-3">
            <label>
              <span>Order status</span>
              <select value={filters.status} onChange={(e) => setField("status", e.target.value)}>
                <option value="All">All statuses</option>
                <option value="Delivered">Delivered</option>
                <option value="Pending">Pending</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </label>
            <label>
              <span>Payment</span>
              <select value={filters.paymentStatus} onChange={(e) => setField("paymentStatus", e.target.value)}>
                <option value="All">All payments</option>
                <option value="Paid">Paid</option>
                <option value="Pending">Pending</option>
                <option value="Failed">Failed</option>
              </select>
            </label>
            <label>
              <span>Currency</span>
              <select value={filters.currency} onChange={(e) => setField("currency", e.target.value)}>
                <option value="All">All currencies</option>
                {currencies.map((cur) => (
                  <option key={cur} value={cur}>{cur}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="wp-export-search">
            <span>Customer or order search (optional)</span>
            <input
              type="text"
              value={filters.search}
              maxLength={200}
              placeholder="WP Order #, email, name or phone"
              onChange={(e) => setField("search", e.target.value)}
            />
          </label>
        </fieldset>

        <fieldset className="wp-export-section">
          <legend>Format</legend>
          <div className="wp-export-formats">
            {[
              { value: "csv", icon: FileSpreadsheet, title: "CSV spreadsheet", note: `Up to ${preview.limits.csv.toLocaleString("en-IN")} orders` },
              { value: "pdf", icon: FileText, title: "PDF report", note: `Up to ${preview.limits.pdf.toLocaleString("en-IN")} orders` }
            ].map((opt) => {
              const Icon = opt.icon;
              return (
                <label key={opt.value} className={`wp-export-format${format === opt.value ? " is-active" : ""}`}>
                  <input type="radio" name="wp-export-format" value={opt.value} checked={format === opt.value} onChange={() => setFormat(opt.value)} />
                  <Icon size={20} aria-hidden="true" />
                  <span>
                    <strong>{opt.title}</strong>
                    <small>{opt.note}</small>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className={`wp-export-status is-${statusMessage.tone}`} role="status" aria-live="polite">
          {statusMessage.tone === "ok" ? <CheckCircle2 size={16} aria-hidden="true" /> : statusMessage.tone === "error" ? <AlertTriangle size={16} aria-hidden="true" /> : <Loader2 size={16} className="wp-archive-spin" aria-hidden="true" />}
          <span>{statusMessage.text}</span>
        </div>

        <div className="wp-export-actions">
          <button type="button" className="wp-archive-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="wp-archive-btn wp-archive-btn-primary" disabled={!canDownload}>
            {downloading ? <Loader2 size={16} className="wp-archive-spin" aria-hidden="true" /> : format === "csv" ? <FileSpreadsheet size={16} aria-hidden="true" /> : <FileText size={16} aria-hidden="true" />}
            {downloading ? "Preparing..." : `Download ${format.toUpperCase()}`}
          </button>
        </div>
      </form>
    </div>
  );
}

export default WpArchiveExportDialog;
