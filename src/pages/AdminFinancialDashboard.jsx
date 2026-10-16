import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { useAuth } from "../hooks/useAuth";
import { useDialog } from "../hooks/useDialog";
import AdminSidebar from "../components/admin/AdminSidebar";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import "./AdminShared.css";
import "./AdminSalesDashboard.css";
import "./AdminFinancialDashboard.css";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const PAGE_SIZE = 50;

function formatISTDate(dateVal) {
  if (!dateVal) return "—";
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatISTDateDmy(dateVal) {
  if (!dateVal) return "";
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).formatToParts(d);
  const day = parts.find((p) => p.type === "day")?.value || "01";
  const month = parts.find((p) => p.type === "month")?.value || "01";
  const year = parts.find((p) => p.type === "year")?.value || "2026";
  return `${day}-${month}-${year}`;
}

const WARNING_LABELS = {
  missing_invoice_number: "Missing invoice number",
  missing_place_of_supply: "Missing Place of Supply",
  tax_recomputed: "Tax recomputed from GST total",
  missing_fx_rate: "Missing exchange rate",
  refund_date_approximate: "Approximate refund date"
};

function formatWarningTooltip(warnings = []) {
  if (!warnings || !warnings.length) return "";
  return warnings.map((w) => WARNING_LABELS[w] || w).join("; ");
}

const escapeCsv = (val) => {
  let str = String(val ?? "");
  if (/^\s*[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
};

function AdminFinancialDashboard() {
  const { token } = useAuth();
  const { alert: dialogAlert } = useDialog();

  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Period Selector State
  const [periodMode, setPeriodMode] = useState("month"); // "month" | "custom"
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const istStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    return istStr.slice(0, 7);
  });
  const [customFrom, setCustomFrom] = useState(() => {
    const istStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    return `${istStr.slice(0, 7)}-01`;
  });
  const [customTo, setCustomTo] = useState(() => {
    const istStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    const ym = istStr.slice(0, 7);
    const [y, m] = ym.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${ym}-${String(lastDay).padStart(2, "0")}`;
  });

  // Table Filters & Pagination
  const [searchTerm, setSearchTerm] = useState("");
  const [gstFilter, setGstFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);

  // Active query parameters
  const activePeriod = useMemo(() => {
    if (periodMode === "month") {
      if (!selectedMonth || !/^\d{4}-\d{2}$/.test(selectedMonth)) {
        return { from: "", to: "" };
      }
      const [y, m] = selectedMonth.split("-").map(Number);
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return {
        from: `${selectedMonth}-01`,
        to: `${selectedMonth}-${String(lastDay).padStart(2, "0")}`
      };
    }
    return {
      from: customFrom,
      to: customTo
    };
  }, [periodMode, selectedMonth, customFrom, customTo]);

  useEffect(() => {
    if (!activePeriod.from || !activePeriod.to) {
      setIsLoading(false);
      setData(null);
      setError("Please select a valid period.");
      return;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(activePeriod.from) || !dateRegex.test(activePeriod.to)) {
      setIsLoading(false);
      setData(null);
      setError("Invalid period date format.");
      return;
    }

    if (activePeriod.from > activePeriod.to) {
      setIsLoading(false);
      setData(null);
      setError("'From' date must be before or equal to 'To' date");
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError("");

    axios
      .get(`/api/orders/analytics/finance?from=${activePeriod.from}&to=${activePeriod.to}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then((res) => {
        if (isMounted) {
          if (res.data?.success) {
            setData(res.data);
            setCurrentPage(1);
          } else {
            setData(null);
            setError("Failed to parse financial analytics.");
          }
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error("Fetch financial analytics error:", err);
          setData(null);
          setError(err.response?.data?.message || "Failed to load financial dashboard analytics.");
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [token, activePeriod.from, activePeriod.to]);

  // Filtered Invoices
  const filteredInvoices = useMemo(() => {
    if (!data?.invoices) return [];
    let list = data.invoices;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(
        (inv) =>
          (inv.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(q)) ||
          (inv.orderId && inv.orderId.toLowerCase().includes(q)) ||
          (inv.customer && inv.customer.toLowerCase().includes(q)) ||
          (inv.email && inv.email.toLowerCase().includes(q)) ||
          (inv.placeOfSupply && inv.placeOfSupply.toLowerCase().includes(q))
      );
    }

    const businessState = String(data?.businessState || "Karnataka").toLowerCase().trim();
    if (gstFilter === "intra") {
      list = list.filter((inv) => String(inv.placeOfSupply).toLowerCase().trim() === businessState);
    } else if (gstFilter === "inter") {
      list = list.filter((inv) => String(inv.placeOfSupply).toLowerCase().trim() !== businessState);
    }

    return list;
  }, [data?.invoices, data?.businessState, searchTerm, gstFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / PAGE_SIZE));
  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredInvoices.slice(start, start + PAGE_SIZE);
  }, [filteredInvoices, currentPage]);

  // CSV Export Handlers
  const exportInvoicesCsv = () => {
    if (!data?.invoices || !data.invoices.length) {
      if (dialogAlert) {
        dialogAlert("No invoices available to export for the selected period.");
      }
      return;
    }

    const headers = [
      "Invoice Number",
      "Invoice Date (IST)",
      "Customer",
      "Email",
      "Place Of Supply",
      "Export",
      "Currency",
      "Original Total",
      "Taxable Value (INR)",
      "CGST (INR)",
      "SGST (INR)",
      "IGST (INR)",
      "Delivery (INR)",
      "Discount (INR)",
      "Total (INR)",
      "Refunded (INR)",
      "Refund Status",
      "Payment Ref",
      "Tax Source",
      "Warnings"
    ];

    const rows = data.invoices.map((inv) => [
      escapeCsv(inv.invoiceNumber || ""),
      escapeCsv(formatISTDateDmy(inv.invoiceDate)),
      escapeCsv(inv.customer || ""),
      escapeCsv(inv.email || ""),
      escapeCsv(inv.placeOfSupply || ""),
      escapeCsv(inv.isExport ? "Yes" : "No"),
      escapeCsv(inv.currency || "INR"),
      (Number(inv.originalTotal) || 0).toFixed(2),
      (Number(inv.taxableValueInr) || 0).toFixed(2),
      (Number(inv.cgst) || 0).toFixed(2),
      (Number(inv.sgst) || 0).toFixed(2),
      (Number(inv.igst) || 0).toFixed(2),
      (Number(inv.deliveryInr) || 0).toFixed(2),
      (Number(inv.discountInr) || 0).toFixed(2),
      (Number(inv.totalInr) || 0).toFixed(2),
      (Number(inv.refundedInr) || 0).toFixed(2),
      escapeCsv(inv.refundStatus || ""),
      escapeCsv(inv.paymentRef || ""),
      escapeCsv(inv.taxSource || ""),
      escapeCsv((inv.warnings || []).join(", "))
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const periodLabel = `${data.period?.from || "from"}_to_${data.period?.to || "to"}`;
    link.setAttribute("download", `DSG_invoices_${periodLabel}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportCreditNotesCsv = () => {
    if (!data?.creditNotes || !data.creditNotes.length) {
      if (dialogAlert) {
        dialogAlert("No credit notes available to export for the selected period.");
      }
      return;
    }

    const headers = [
      "Invoice Number",
      "Refund Date (IST)",
      "Refund ID",
      "Method",
      "Reason",
      "Place Of Supply",
      "Refund Amount (INR)",
      "Taxable Reversal (INR)",
      "CGST Reversal (INR)",
      "SGST Reversal (INR)",
      "IGST Reversal (INR)",
      "Tax Treatment",
      "Warnings"
    ];

    const rows = data.creditNotes.map((cn) => [
      escapeCsv(cn.invoiceNumber || ""),
      escapeCsv(formatISTDateDmy(cn.refundDate)),
      escapeCsv(cn.refundId || ""),
      escapeCsv(cn.method || ""),
      escapeCsv(cn.reason || ""),
      escapeCsv(cn.placeOfSupply || ""),
      (Number(cn.refundInr) || 0).toFixed(2),
      (Number(cn.taxableValueInr) || 0).toFixed(2),
      (Number(cn.cgst) || 0).toFixed(2),
      (Number(cn.sgst) || 0).toFixed(2),
      (Number(cn.igst) || 0).toFixed(2),
      escapeCsv(cn.taxTreatment || "proportional"),
      escapeCsv((cn.warnings || []).join(", "))
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const periodLabel = `${data.period?.from || "from"}_to_${data.period?.to || "to"}`;
    link.setAttribute("download", `DSG_credit_notes_${periodLabel}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Chart Data preparation
  const monthlyTrendData = {
    labels: data?.monthlyTrends?.map((d) => d.month) || [],
    datasets: [
      {
        label: "Gross Revenue (₹)",
        data: data?.monthlyTrends?.map((d) => d.gross) || [],
        borderColor: "#3b82f6",
        backgroundColor: "transparent",
        borderWidth: 2,
        tension: 0.3,
        pointBackgroundColor: "#3b82f6",
        pointRadius: 3
      },
      {
        label: "Net Earnings (₹)",
        data: data?.monthlyTrends?.map((d) => d.net) || [],
        borderColor: "#10b981",
        backgroundColor: "transparent",
        borderWidth: 2,
        tension: 0.3,
        pointBackgroundColor: "#10b981",
        pointRadius: 3
      }
    ]
  };

  const monthlyTaxRefundData = {
    labels: data?.monthlyTrends?.map((d) => d.month) || [],
    datasets: [
      {
        label: "GST Tax Collected (₹)",
        data: data?.monthlyTrends?.map((d) => d.tax) || [],
        backgroundColor: "#8b5cf6",
        borderRadius: 4
      },
      {
        label: "Refunds on orders placed this month (₹)",
        data: data?.monthlyTrends?.map((d) => d.refunds) || [],
        backgroundColor: "#ef4444",
        borderRadius: 4
      }
    ]
  };

  const trendOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top",
        labels: { color: "var(--admin-text, #0f172a)", boxWidth: 12 }
      }
    },
    scales: {
      y: {
        grid: { color: "rgba(209, 213, 219, 0.15)" },
        ticks: { color: "var(--admin-muted)", font: { size: 11 } }
      },
      x: {
        grid: { display: false },
        ticks: { color: "var(--admin-muted)", font: { size: 11 } }
      }
    }
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top",
        labels: { color: "var(--admin-text, #0f172a)", boxWidth: 12 }
      }
    },
    scales: {
      y: {
        grid: { color: "rgba(209, 213, 219, 0.15)" },
        ticks: { color: "var(--admin-muted)", font: { size: 11 } }
      },
      x: {
        grid: { display: false },
        ticks: { color: "var(--admin-text)", font: { size: 12, weight: 600 } }
      }
    }
  };

  const hasWarnings = Boolean(data?.warnings && Object.keys(data.warnings).length > 0);

  return (
    <div className="admin-layout">
      <AdminSidebar />

      <main className="admin-main">
        {/* Header & Period Bar */}
        <header className="fin-header-wrap">
          <div>
            <h1>Financial Dashboard</h1>
            <p className="fin-subtitle">
              Tax ledger registers, Place of Supply compliance, and GSTR-1 credit note accounting.
            </p>
            {data?.period && (
              <div className="fin-period-indicator">
                <span className="fin-indicator-badge">
                  📅 Selected Period: <strong>{formatISTDate(data.period.from)}</strong> – <strong>{formatISTDate(data.period.to)}</strong>
                </span>
                <span className="fin-indicator-state">
                  State of Operation: <strong>{data.businessState || "Karnataka"}</strong>
                </span>
              </div>
            )}
          </div>

          <div className="fin-header-controls-area">
            {/* Period Mode Selector */}
            <div className="fin-period-picker-bar">
              <div className="fin-period-toggle">
                <button
                  type="button"
                  className={`fin-toggle-btn ${periodMode === "month" ? "active" : ""}`}
                  onClick={() => setPeriodMode("month")}
                >
                  By Month
                </button>
                <button
                  type="button"
                  className={`fin-toggle-btn ${periodMode === "custom" ? "active" : ""}`}
                  onClick={() => setPeriodMode("custom")}
                >
                  Custom Range
                </button>
              </div>

              {periodMode === "month" ? (
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="fin-period-input"
                  title="Select Month"
                />
              ) : (
                <div className="fin-custom-range-inputs">
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="fin-period-input"
                    title="From Date"
                  />
                  <span className="fin-range-to">to</span>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="fin-period-input"
                    title="To Date"
                  />
                </div>
              )}
            </div>

            {/* Export Actions */}
            <div className="fin-export-actions">
              <div className="fin-export-buttons-row">
                <button
                  type="button"
                  className="gstr-export-btn"
                  onClick={exportInvoicesCsv}
                  disabled={isLoading || !data?.invoices?.length}
                  title="Export invoices as GSTR-1 CSV"
                >
                  <span>📥</span> Export invoices (CSV)
                </button>
                <button
                  type="button"
                  className="gstr-export-btn btn-secondary"
                  onClick={exportCreditNotesCsv}
                  disabled={isLoading || !data?.creditNotes?.length}
                  title="Export credit notes / refunds as CSV"
                >
                  <span>📋</span> Export credit notes (CSV)
                </button>
              </div>
              <div className="fin-draft-disclaimer">
                Draft figures — confirm refund/credit-note, export and digital-sale treatment with your accountant before filing.
              </div>
            </div>
          </div>
        </header>

        {error && <p className="pricing-message error" style={{ margin: "0 0 20px" }}>{error}</p>}

        {/* Warnings Banner */}
        {hasWarnings && (
          <div className="fin-warning-banner">
            <div className="fin-warning-banner-title">
              <span>⚠️</span>
              <strong>Audit & Compliance Warnings for Period</strong>
            </div>
            <ul className="fin-warning-list">
              {Object.entries(data.warnings).map(([code, info]) => {
                let label = `${info.count} entry/entries flagged with ${code}`;
                if (code === "missing_place_of_supply") {
                  label = `${info.count} invoice(s) have no Place of Supply recorded`;
                } else if (code === "missing_invoice_number") {
                  label = `${info.count} invoice(s) have no invoice number`;
                } else if (code === "tax_recomputed") {
                  label = `${info.count} invoice(s) had tax recomputed from GST total (missing saved tax split)`;
                } else if (code === "missing_fx_rate") {
                  label = `${info.count} non-INR invoice(s) missing FX conversion rate`;
                } else if (code === "refund_date_approximate") {
                  label = `${info.count} credit note(s) have approximate refund date`;
                }
                return (
                  <li key={code} className="fin-warning-item">
                    <span>{label}</span>
                    {info.invoiceNumbers?.length > 0 && (
                      <span className="fin-warning-invoices">
                        ({info.invoiceNumbers.join(", ")}
                        {info.count > info.invoiceNumbers.length ? "..." : ""})
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {isLoading ? (
          <div className="admin-dashboard-loading" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px" }}>
            <div className="admin-dashboard-spinner" />
            <p style={{ marginTop: "12px", color: "var(--admin-muted)" }}>Processing financial registers...</p>
          </div>
        ) : (
          <>
            {/* 9 Summary Cards Grid (All labelled INR) */}
            <div className="fin-summary-cards-grid">
              <div className="fin-kpi-card fin-kpi-invoices">
                <div className="fin-kpi-top">
                  <span className="fin-kpi-label">Invoices</span>
                  <div className="fin-kpi-icon-wrap">📄</div>
                </div>
                <div className="fin-kpi-value-row">
                  <span className="fin-kpi-amount">{data?.summary?.invoiceCount || 0}</span>
                </div>
                <div className="fin-kpi-footer">
                  <span className="fin-kpi-tag blue">Paid Invoices in Period</span>
                </div>
              </div>

              <div className="fin-kpi-card fin-kpi-revenue">
                <div className="fin-kpi-top">
                  <span className="fin-kpi-label">Gross Invoiced (INR)</span>
                  <div className="fin-kpi-icon-wrap">📈</div>
                </div>
                <div className="fin-kpi-value-row">
                  <span className="fin-kpi-currency">₹</span>
                  <span className="fin-kpi-amount">{(data?.summary?.grossInvoicedInr || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="fin-kpi-footer">
                  <span className="fin-kpi-tag blue">Gross Total Invoiced</span>
                </div>
              </div>

              <div className="fin-kpi-card fin-kpi-refunds highlight-red">
                <div className="fin-kpi-top">
                  <span className="fin-kpi-label">Refunds (INR)</span>
                  <div className="fin-kpi-icon-wrap red">↩️</div>
                </div>
                <div className="fin-kpi-value-row">
                  <span className="fin-kpi-currency">₹</span>
                  <span className="fin-kpi-amount">{(data?.summary?.refundsInr || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="fin-kpi-footer">
                  <span className="fin-kpi-tag red">Credit Notes / Refunds</span>
                </div>
              </div>

              <div className="fin-kpi-card fin-kpi-earnings highlight-green">
                <div className="fin-kpi-top">
                  <span className="fin-kpi-label">Net Received (INR)</span>
                  <div className="fin-kpi-icon-wrap green">💰</div>
                </div>
                <div className="fin-kpi-value-row">
                  <span className="fin-kpi-currency">₹</span>
                  <span className="fin-kpi-amount">{(data?.summary?.netReceivedInr || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="fin-kpi-footer">
                  <span className="fin-kpi-tag green">Gross − Refunds</span>
                </div>
              </div>

              <div className="fin-kpi-card fin-kpi-taxable">
                <div className="fin-kpi-top">
                  <span className="fin-kpi-label">Taxable Value (INR)</span>
                  <div className="fin-kpi-icon-wrap amber">🏷️</div>
                </div>
                <div className="fin-kpi-value-row">
                  <span className="fin-kpi-currency">₹</span>
                  <span className="fin-kpi-amount">{(data?.summary?.taxableValueInr || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="fin-kpi-footer">
                  <span className="fin-kpi-tag amber">Subtotal Before Tax</span>
                </div>
              </div>

              <div className="fin-kpi-card fin-kpi-intra">
                <div className="fin-kpi-top">
                  <span className="fin-kpi-label">CGST (INR)</span>
                  <div className="fin-kpi-icon-wrap sky">📍</div>
                </div>
                <div className="fin-kpi-value-row">
                  <span className="fin-kpi-currency">₹</span>
                  <span className="fin-kpi-amount">{(data?.summary?.cgst || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="fin-kpi-footer">
                  <span className="fin-kpi-tag sky">Central GST</span>
                </div>
              </div>

              <div className="fin-kpi-card fin-kpi-intra">
                <div className="fin-kpi-top">
                  <span className="fin-kpi-label">SGST (INR)</span>
                  <div className="fin-kpi-icon-wrap sky">📍</div>
                </div>
                <div className="fin-kpi-value-row">
                  <span className="fin-kpi-currency">₹</span>
                  <span className="fin-kpi-amount">{(data?.summary?.sgst || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="fin-kpi-footer">
                  <span className="fin-kpi-tag sky">State GST</span>
                </div>
              </div>

              <div className="fin-kpi-card fin-kpi-inter">
                <div className="fin-kpi-top">
                  <span className="fin-kpi-label">IGST (INR)</span>
                  <div className="fin-kpi-icon-wrap indigo">🌐</div>
                </div>
                <div className="fin-kpi-value-row">
                  <span className="fin-kpi-currency">₹</span>
                  <span className="fin-kpi-amount">{(data?.summary?.igst || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="fin-kpi-footer">
                  <span className="fin-kpi-tag indigo">Integrated GST</span>
                </div>
              </div>

              <div className="fin-kpi-card fin-kpi-tax highlight-purple">
                <div className="fin-kpi-top">
                  <span className="fin-kpi-label">Net Tax after CN (INR)</span>
                  <div className="fin-kpi-icon-wrap purple">🏛️</div>
                </div>
                <div className="fin-kpi-value-row">
                  <span className="fin-kpi-currency">₹</span>
                  <span className="fin-kpi-amount">{(data?.summary?.netTaxInr || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="fin-kpi-footer">
                  <span className="fin-kpi-tag purple">Invoice Tax − CN Tax</span>
                </div>
              </div>
            </div>

            {/* Charts Row */}
            <div className="fin-charts-grid">
              <div className="fin-chart-card">
                <h3>📈 12-Month Revenue & Net Earnings Trend</h3>
                <div className="chart-container">
                  <Line data={monthlyTrendData} options={trendOptions} />
                </div>
              </div>

              <div className="fin-chart-card">
                <h3>📊 12-Month GST Tax & Refunds</h3>
                <div className="chart-container">
                  <Bar data={monthlyTaxRefundData} options={barOptions} />
                </div>
              </div>
            </div>

            {/* Invoices Ledger Table */}
            <div className="fin-ledger-card">
              <div className="fin-ledger-header">
                <div className="fin-ledger-title-wrap">
                  <h3>📒 Invoices Tax Ledger</h3>
                  <span className="fin-ledger-count-badge">
                    {filteredInvoices.length} of {data?.invoices?.length || 0} invoices
                  </span>
                </div>

                <div className="fin-ledger-controls">
                  <div className="fin-search-box">
                    <span className="fin-search-icon">🔍</span>
                    <input
                      type="text"
                      placeholder="Search invoice, customer, state..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="fin-search-input"
                    />
                  </div>

                  <div className="pos-filter-group">
                    <select
                      id="pos-filter"
                      value={gstFilter}
                      onChange={(e) => {
                        setGstFilter(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="pos-filter-select"
                      title="Filter by GST Place of Supply"
                    >
                      <option value="all">🌐 All States</option>
                      <option value="intra">📍 Intra-state (CGST+SGST)</option>
                      <option value="inter">✈️ Inter-state (IGST)</option>
                    </select>
                  </div>

                  {(searchTerm || gstFilter !== "all") && (
                    <button
                      type="button"
                      className="fin-reset-btn"
                      onClick={() => {
                        setSearchTerm("");
                        setGstFilter("all");
                        setCurrentPage(1);
                      }}
                      title="Reset filters"
                    >
                      ✕ Reset
                    </button>
                  )}
                </div>
              </div>

              <div className="admin-table-wrap" style={{ borderColor: "var(--admin-border)" }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th style={{ borderColor: "var(--admin-border)" }}>Invoice No</th>
                      <th style={{ borderColor: "var(--admin-border)" }}>Date (IST)</th>
                      <th style={{ borderColor: "var(--admin-border)" }}>Customer</th>
                      <th style={{ borderColor: "var(--admin-border)" }}>Place of Supply</th>
                      <th style={{ borderColor: "var(--admin-border)", textAlign: "right" }}>Taxable (₹)</th>
                      <th style={{ borderColor: "var(--admin-border)", textAlign: "right" }}>CGST (₹)</th>
                      <th style={{ borderColor: "var(--admin-border)", textAlign: "right" }}>SGST (₹)</th>
                      <th style={{ borderColor: "var(--admin-border)", textAlign: "right" }}>IGST (₹)</th>
                      <th style={{ borderColor: "var(--admin-border)", textAlign: "right" }}>Total ₹</th>
                      <th style={{ borderColor: "var(--admin-border)", textAlign: "center" }}>Original</th>
                      <th style={{ borderColor: "var(--admin-border)", textAlign: "right" }}>Refunded ₹</th>
                      <th style={{ borderColor: "var(--admin-border)", textAlign: "center" }}>Payment Ref</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedInvoices.length > 0 ? (
                      paginatedInvoices.map((inv) => {
                        const isIntra =
                          String(inv.placeOfSupply).toLowerCase().trim() ===
                          String(data?.businessState || "Karnataka").toLowerCase().trim();
                        const hasRowWarnings = inv.warnings && inv.warnings.length > 0;

                        return (
                          <tr key={inv.orderId || inv.invoiceNumber}>
                            <td style={{ borderColor: "var(--admin-border-soft)", whiteSpace: "nowrap" }}>
                              <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                <span className="fin-order-code-badge">
                                  {inv.invoiceNumber || "Unassigned"}
                                </span>
                                {hasRowWarnings && (
                                  <span
                                    className="fin-warning-marker"
                                    title={formatWarningTooltip(inv.warnings)}
                                  >
                                    ⚠️
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ borderColor: "var(--admin-border-soft)", whiteSpace: "nowrap" }}>
                              {formatISTDate(inv.invoiceDate)}
                            </td>
                            <td style={{ borderColor: "var(--admin-border-soft)" }}>
                              <div style={{ fontWeight: 600, color: "var(--admin-text)" }}>{inv.customer}</div>
                              <small style={{ color: "var(--admin-muted)" }}>{inv.email}</small>
                            </td>
                            <td style={{ borderColor: "var(--admin-border-soft)" }}>
                              <div style={{ fontWeight: 600, color: "var(--admin-text)" }}>{inv.placeOfSupply}</div>
                              <span className={`fin-pos-pill ${inv.isExport ? "export" : isIntra ? "intra" : "inter"}`}>
                                {inv.isExport ? "Export" : isIntra ? "Intra-state" : "Inter-state"}
                              </span>
                            </td>
                            <td style={{ borderColor: "var(--admin-border-soft)", textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>
                              ₹{(Number(inv.taxableValueInr) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td style={{ borderColor: "var(--admin-border-soft)", textAlign: "right", fontFamily: "monospace" }}>
                              {inv.cgst > 0 ? `₹${Number(inv.cgst).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : <span style={{ color: "var(--admin-muted)" }}>—</span>}
                            </td>
                            <td style={{ borderColor: "var(--admin-border-soft)", textAlign: "right", fontFamily: "monospace" }}>
                              {inv.sgst > 0 ? `₹${Number(inv.sgst).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : <span style={{ color: "var(--admin-muted)" }}>—</span>}
                            </td>
                            <td style={{ borderColor: "var(--admin-border-soft)", textAlign: "right", fontFamily: "monospace" }}>
                              {inv.igst > 0 ? `₹${Number(inv.igst).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : <span style={{ color: "var(--admin-muted)" }}>—</span>}
                            </td>
                            <td style={{ borderColor: "var(--admin-border-soft)", textAlign: "right", fontFamily: "monospace" }}>
                              <strong style={{ color: "var(--admin-text)", fontSize: "13.5px" }}>
                                ₹{(Number(inv.totalInr) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </strong>
                            </td>
                            <td style={{ borderColor: "var(--admin-border-soft)", textAlign: "center", whiteSpace: "nowrap" }}>
                              {inv.currency && inv.currency !== "INR" ? (
                                <span className="fin-original-ccy-badge">
                                  {inv.currency} {Number(inv.originalTotal || 0).toFixed(2)}
                                </span>
                              ) : (
                                <span style={{ color: "var(--admin-muted)" }}>—</span>
                              )}
                            </td>
                            <td style={{ borderColor: "var(--admin-border-soft)", textAlign: "right", fontFamily: "monospace" }}>
                              {inv.refundedInr > 0 ? (
                                <span className="text-red">
                                  ₹{Number(inv.refundedInr).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              ) : (
                                <span style={{ color: "var(--admin-muted)" }}>—</span>
                              )}
                            </td>
                            <td style={{ borderColor: "var(--admin-border-soft)", textAlign: "center", whiteSpace: "nowrap" }}>
                              <span className={`fin-payment-ref-badge ${inv.paymentRef === "Razorpay" ? "rzp" : inv.paymentRef.startsWith("Manual") ? "manual" : "none"}`}>
                                {inv.paymentRef}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="12" style={{ textAlign: "center", padding: "40px 20px", borderColor: "var(--admin-border-soft)" }}>
                          <div style={{ fontSize: "28px", marginBottom: "8px" }}>📑</div>
                          <p style={{ margin: 0, fontWeight: 600, color: "var(--admin-text)" }}>No matching invoices found</p>
                          <small style={{ color: "var(--admin-muted)" }}>Try clearing search terms or adjusting the period.</small>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Client-side Pagination Footer */}
              {totalPages > 1 && (
                <div className="fin-pagination-wrap">
                  <div className="fin-pagination-info">
                    Showing {(currentPage - 1) * PAGE_SIZE + 1} to {Math.min(currentPage * PAGE_SIZE, filteredInvoices.length)} of {filteredInvoices.length} invoices
                  </div>
                  <div className="fin-pagination-controls">
                    <button
                      type="button"
                      className="fin-page-btn"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    >
                      ← Previous
                    </button>
                    <span className="fin-page-current">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      type="button"
                      className="fin-page-btn"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Separate Credit Notes (Refunds) Table */}
            <div className="fin-ledger-card" style={{ marginTop: "24px" }}>
              <div className="fin-ledger-header">
                <div className="fin-ledger-title-wrap">
                  <h3>📋 Credit Notes (Refunds Register)</h3>
                  <span className="fin-ledger-count-badge">
                    {data?.creditNotes?.length || 0} credit notes in period
                  </span>
                </div>
              </div>

              <div className="admin-table-wrap" style={{ borderColor: "var(--admin-border)" }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th style={{ borderColor: "var(--admin-border)" }}>Invoice No</th>
                      <th style={{ borderColor: "var(--admin-border)" }}>Refund Date (IST)</th>
                      <th style={{ borderColor: "var(--admin-border)" }}>Refund ID</th>
                      <th style={{ borderColor: "var(--admin-border)" }}>Method</th>
                      <th style={{ borderColor: "var(--admin-border)" }}>Reason</th>
                      <th style={{ borderColor: "var(--admin-border)" }}>Place of Supply</th>
                      <th style={{ borderColor: "var(--admin-border)", textAlign: "right" }}>Refund Amount (₹)</th>
                      <th style={{ borderColor: "var(--admin-border)", textAlign: "right" }}>Taxable Rev. (₹)</th>
                      <th style={{ borderColor: "var(--admin-border)", textAlign: "right" }}>CGST Rev. (₹)</th>
                      <th style={{ borderColor: "var(--admin-border)", textAlign: "right" }}>SGST Rev. (₹)</th>
                      <th style={{ borderColor: "var(--admin-border)", textAlign: "right" }}>IGST Rev. (₹)</th>
                      <th style={{ borderColor: "var(--admin-border)", textAlign: "center" }}>Treatment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.creditNotes && data.creditNotes.length > 0 ? (
                      data.creditNotes.map((cn, idx) => (
                        <tr key={cn.refundId || `${cn.invoiceNumber}-${idx}`}>
                          <td style={{ borderColor: "var(--admin-border-soft)", whiteSpace: "nowrap" }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                              <span className="fin-order-code-badge">
                                {cn.invoiceNumber || "Unassigned"}
                              </span>
                              {cn.warnings?.includes("refund_date_approximate") && (
                                <span className="fin-warning-marker" title="Approximate refund date">
                                  ⏱
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ borderColor: "var(--admin-border-soft)", whiteSpace: "nowrap" }}>
                            {formatISTDate(cn.refundDate)}
                          </td>
                          <td style={{ borderColor: "var(--admin-border-soft)", fontFamily: "monospace", fontSize: "12px" }}>
                            {cn.refundId || "Manual"}
                          </td>
                          <td style={{ borderColor: "var(--admin-border-soft)", textTransform: "capitalize" }}>
                            {cn.method}
                          </td>
                          <td style={{ borderColor: "var(--admin-border-soft)", maxWidth: "200px" }}>
                            <div style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }} title={cn.reason}>
                              {cn.reason || "—"}
                            </div>
                          </td>
                          <td style={{ borderColor: "var(--admin-border-soft)" }}>
                            {cn.placeOfSupply}
                          </td>
                          <td style={{ borderColor: "var(--admin-border-soft)", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#dc2626" }}>
                            ₹{(Number(cn.refundInr) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ borderColor: "var(--admin-border-soft)", textAlign: "right", fontFamily: "monospace" }}>
                            ₹{(Number(cn.taxableValueInr) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ borderColor: "var(--admin-border-soft)", textAlign: "right", fontFamily: "monospace" }}>
                            {cn.cgst > 0 ? `₹${Number(cn.cgst).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                          </td>
                          <td style={{ borderColor: "var(--admin-border-soft)", textAlign: "right", fontFamily: "monospace" }}>
                            {cn.sgst > 0 ? `₹${Number(cn.sgst).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                          </td>
                          <td style={{ borderColor: "var(--admin-border-soft)", textAlign: "right", fontFamily: "monospace" }}>
                            {cn.igst > 0 ? `₹${Number(cn.igst).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                          </td>
                          <td style={{ borderColor: "var(--admin-border-soft)", textAlign: "center" }}>
                            <span className="fin-tax-treatment-tag">
                              {cn.taxTreatment || "proportional"}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="12" style={{ textAlign: "center", padding: "30px 20px", borderColor: "var(--admin-border-soft)" }}>
                          <p style={{ margin: 0, fontWeight: 600, color: "var(--admin-text)" }}>No credit notes / refunds recorded in this period</p>
                          <small style={{ color: "var(--admin-muted)" }}>Any processed refunds falling into this date window will appear here as credit notes.</small>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default AdminFinancialDashboard;
