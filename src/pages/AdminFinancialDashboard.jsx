import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "../hooks/useAuth";
import AdminSidebar from "../components/admin/AdminSidebar";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
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
  ArcElement,
  Title,
  Tooltip,
  Legend
);

function AdminFinancialDashboard() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [gstFilter, setGstFilter] = useState("all");
  const [reconFilter, setReconFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await axios.get("/api/orders/analytics/finance", {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data?.success) {
          setData(res.data);
        } else {
          setError("Failed to parse financial analytics.");
        }
      } catch (err) {
        console.error("Fetch financial analytics error:", err);
        setError(err.response?.data?.message || "Failed to load financial dashboard analytics.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchAnalytics();
  }, [token]);

  // Reconciliation stats computation
  const reconStats = (() => {
    if (!data?.recentTransactions) return { total: 0, reconciled: 0, pending: 0 };
    const txs = data.recentTransactions;
    const reconciled = txs.filter((t) => t.reconciliationStatus === "Reconciled").length;
    const pending = txs.filter((t) => t.reconciliationStatus === "Pending Review").length;
    return {
      total: txs.length,
      reconciled,
      pending
    };
  })();

  // Filter transactions for GST place of supply, reconciliation status, and search query
  const filteredTransactions = (() => {
    if (!data?.recentTransactions) return [];
    let list = data.recentTransactions;

    // Search query filter (Order ID, Customer, Place of Supply)
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter((t) => 
        (t._id && t._id.toLowerCase().includes(q)) ||
        (t.customer && t.customer.toLowerCase().includes(q)) ||
        (t.placeOfSupply && t.placeOfSupply.toLowerCase().includes(q))
      );
    }

    // Place of supply filter
    const warehouse = String(data.warehouseState || "Karnataka").toLowerCase().trim();
    if (gstFilter === "intra") {
      list = list.filter(
        (t) => String(t.placeOfSupply).toLowerCase().trim() === warehouse
      );
    } else if (gstFilter === "inter") {
      list = list.filter(
        (t) => String(t.placeOfSupply).toLowerCase().trim() !== warehouse
      );
    }

    // Reconciliation status filter
    if (reconFilter === "reconciled") {
      list = list.filter((t) => t.reconciliationStatus === "Reconciled");
    } else if (reconFilter === "pending") {
      list = list.filter((t) => t.reconciliationStatus === "Pending Review");
    }

    return list;
  })();

  // Visible rows aggregate totals for quick auditing reconciliation
  const visibleTotals = (() => {
    return filteredTransactions.reduce(
      (acc, tx) => {
        acc.subtotal += tx.subtotal || 0;
        acc.tax += (tx.cgst || 0) + (tx.sgst || 0) + (tx.igst || 0);
        acc.total += tx.total || 0;
        return acc;
      },
      { subtotal: 0, tax: 0, total: 0 }
    );
  })();

  // GSTR-1 CSV Report Export
  const exportGstr1Csv = () => {
    if (!data?.recentTransactions) return;
    
    // CSV headers matching GSTR-1 format guidelines
    const headers = [
      "Invoice Number",
      "Invoice Date",
      "Customer",
      "Place Of Supply (State)",
      "Taxable Subtotal (INR)",
      "CGST (INR)",
      "SGST (INR)",
      "IGST (INR)",
      "Shipping Charge (INR)",
      "Discount Applied (INR)",
      "Invoice Value (INR)",
      "Reconciliation Status"
    ];

    const rows = data.recentTransactions.map((tx) => [
      `"${tx._id}"`,
      `"${new Date(tx.createdAt).toLocaleDateString("en-IN")}"`,
      `"${tx.customer.replace(/"/g, '""')}"`,
      `"${tx.placeOfSupply}"`,
      tx.subtotal.toFixed(2),
      tx.cgst.toFixed(2),
      tx.sgst.toFixed(2),
      tx.igst.toFixed(2),
      tx.deliveryCharge.toFixed(2),
      tx.discount.toFixed(2),
      tx.total.toFixed(2),
      `"${tx.reconciliationStatus}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `GSTR1_Reconciliation_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Chart Data preparation
  const monthlyTrendData = {
    labels: data?.monthlyTrends?.map((d) => d.month) || [],
    datasets: [
      {
        label: "Gross Revenue",
        data: data?.monthlyTrends?.map((d) => d.gross) || [],
        borderColor: "#3b82f6",
        backgroundColor: "transparent",
        borderWidth: 2,
        tension: 0.3,
        pointBackgroundColor: "#3b82f6",
        pointRadius: 3
      },
      {
        label: "Net Earnings",
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

  const feesBreakdownData = {
    labels: ["Subtotal", "GST Collected", "Delivery Collected", "Discounts Applied"],
    datasets: [
      {
        label: "Total Collection (INR)",
        data: [
          (data?.summary?.grossRevenue || 0) - (data?.summary?.taxGST || 0) - (data?.summary?.shippingCharges || 0),
          data?.summary?.taxGST || 0,
          data?.summary?.shippingCharges || 0,
          data?.summary?.discountsGiven || 0
        ],
        backgroundColor: [
          "#3b82f6", // Subtotal
          "#8b5cf6", // GST
          "#f59e0b", // Delivery
          "#ef4444"  // Discounts
        ],
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
      legend: { display: false }
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

  return (
    <div className="admin-layout">
      <AdminSidebar />

      <main className="admin-main">
        <header className="fin-header-wrap">
          <div>
            <h1>Financial Dashboard</h1>
            <p className="fin-subtitle">
              GST compliance calculation, Place of Supply matching, and payment ledger reconciliation.
            </p>
          </div>
          {!isLoading && (
            <button className="gstr-export-btn" onClick={exportGstr1Csv}>
              <span>📥</span> Export GSTR-1 Report (CSV)
            </button>
          )}
        </header>

        {error && <p className="pricing-message error" style={{ margin: "0 0 20px" }}>{error}</p>}

        {isLoading ? (
          <div className="admin-dashboard-loading" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px" }}>
            <div className="admin-dashboard-spinner" />
            <p style={{ marginTop: "12px", color: "var(--admin-muted)" }}>Processing financial registers...</p>
          </div>
        ) : (
          <>
            {/* Top 5 Financial KPI Cards Grid */}
            <div className="fin-kpi-grid">
              <div className="fin-kpi-card fin-kpi-revenue">
                <div className="fin-kpi-top">
                  <span className="fin-kpi-label">Gross Revenue</span>
                  <div className="fin-kpi-icon-wrap">
                    <span>📈</span>
                  </div>
                </div>
                <div className="fin-kpi-value-row">
                  <span className="fin-kpi-currency">₹</span>
                  <span className="fin-kpi-amount">{(data?.summary?.grossRevenue || 0).toLocaleString("en-IN")}</span>
                </div>
                <div className="fin-kpi-footer">
                  <span className="fin-kpi-tag blue">Total Invoiced</span>
                </div>
              </div>

              <div className="fin-kpi-card fin-kpi-earnings highlight-green">
                <div className="fin-kpi-top">
                  <span className="fin-kpi-label">Net Earnings</span>
                  <div className="fin-kpi-icon-wrap green">
                    <span>💰</span>
                  </div>
                </div>
                <div className="fin-kpi-value-row">
                  <span className="fin-kpi-currency">₹</span>
                  <span className="fin-kpi-amount">{(data?.summary?.netRevenue || 0).toLocaleString("en-IN")}</span>
                </div>
                <div className="fin-kpi-footer">
                  <span className="fin-kpi-tag green">Gross - GST - Shipping</span>
                </div>
              </div>

              <div className="fin-kpi-card fin-kpi-tax">
                <div className="fin-kpi-top">
                  <span className="fin-kpi-label">Total GST Tax</span>
                  <div className="fin-kpi-icon-wrap purple">
                    <span>🏛️</span>
                  </div>
                </div>
                <div className="fin-kpi-value-row">
                  <span className="fin-kpi-currency">₹</span>
                  <span className="fin-kpi-amount">{(data?.summary?.taxGST || 0).toLocaleString("en-IN")}</span>
                </div>
                <div className="fin-kpi-footer">
                  <span className="fin-kpi-tag purple">Tax Collected</span>
                </div>
              </div>

              <div className="fin-kpi-card fin-kpi-intra">
                <div className="fin-kpi-top">
                  <span className="fin-kpi-label">CGST + SGST</span>
                  <div className="fin-kpi-icon-wrap sky">
                    <span>📍</span>
                  </div>
                </div>
                <div className="fin-kpi-value-row">
                  <span className="fin-kpi-currency">₹</span>
                  <span className="fin-kpi-amount">{((data?.summary?.cgst || 0) + (data?.summary?.sgst || 0)).toLocaleString("en-IN")}</span>
                </div>
                <div className="fin-kpi-footer">
                  <span className="fin-kpi-tag sky" title={`Warehouse State: ${data?.warehouseState || "Karnataka"}`}>
                    Intra-state • {data?.warehouseState || "Karnataka"}
                  </span>
                </div>
              </div>

              <div className="fin-kpi-card fin-kpi-inter">
                <div className="fin-kpi-top">
                  <span className="fin-kpi-label">IGST (Inter-state)</span>
                  <div className="fin-kpi-icon-wrap indigo">
                    <span>🌐</span>
                  </div>
                </div>
                <div className="fin-kpi-value-row">
                  <span className="fin-kpi-currency">₹</span>
                  <span className="fin-kpi-amount">{(data?.summary?.igst || 0).toLocaleString("en-IN")}</span>
                </div>
                <div className="fin-kpi-footer">
                  <span className="fin-kpi-tag indigo">Inter-state Orders</span>
                </div>
              </div>
            </div>

            {/* Automated Payment Reconciliation Audit Section */}
            <div className="fin-recon-section">
              <div className="fin-recon-header">
                <div className="fin-recon-title-area">
                  <h3>🔄 Automated Payment Reconciliation Audit</h3>
                </div>
                <span className="fin-recon-badge-live">
                  <span className="fin-pulse-dot"></span>
                  Razorpay API Sync Status: Online
                </span>
              </div>
              <div className="fin-recon-stats-grid">
                <div className="fin-recon-stat-card green">
                  <div className="fin-recon-icon-box green">✓</div>
                  <div className="fin-recon-stat-details">
                    <strong>{reconStats.reconciled}</strong>
                    <span>Reconciled Transactions</span>
                  </div>
                </div>
                <div className="fin-recon-stat-card orange">
                  <div className="fin-recon-icon-box orange">⏱</div>
                  <div className="fin-recon-stat-details">
                    <strong>{reconStats.pending}</strong>
                    <span>Pending Review</span>
                  </div>
                </div>
                <div className="fin-recon-stat-card blue">
                  <div className="fin-recon-icon-box blue">📊</div>
                  <div className="fin-recon-stat-details">
                    <strong>{reconStats.total}</strong>
                    <span>Total Scanned Ledger Logs</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Charts Row */}
            <div className="fin-charts-grid">
              <div className="fin-chart-card">
                <h3>📈 Revenue & Profit Growth</h3>
                <div className="chart-container">
                  <Line data={monthlyTrendData} options={trendOptions} />
                </div>
              </div>

              <div className="fin-chart-card">
                <h3>📊 Fee Components Breakdown</h3>
                <div className="chart-container">
                  <Bar data={feesBreakdownData} options={barOptions} />
                </div>
              </div>
            </div>

            {/* Recent Transactions Ledger */}
            <div className="fin-ledger-card">
              <div className="fin-ledger-header">
                <div className="fin-ledger-title-wrap">
                  <h3>📒 Transaction Audit Ledger & GSTR Place of Supply</h3>
                  <span className="fin-ledger-count-badge">
                    {filteredTransactions.length} of {data?.recentTransactions?.length || 0} entries
                  </span>
                </div>
                
                <div className="fin-ledger-controls">
                  {/* Search bar */}
                  <div className="fin-search-box">
                    <span className="fin-search-icon">🔍</span>
                    <input
                      type="text"
                      placeholder="Search ID, customer, state..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="fin-search-input"
                    />
                  </div>

                  {/* GST Place of Supply Filter */}
                  <div className="pos-filter-group">
                    <select 
                      id="pos-filter"
                      value={gstFilter} 
                      onChange={(e) => setGstFilter(e.target.value)}
                      className="pos-filter-select"
                      title="Filter by GST Place of Supply"
                    >
                      <option value="all">🌐 All States</option>
                      <option value="intra">📍 Intra-state (CGST+SGST)</option>
                      <option value="inter">✈️ Inter-state (IGST)</option>
                    </select>
                  </div>

                  {/* Reconciliation Filter */}
                  <div className="pos-filter-group">
                    <select 
                      id="recon-filter"
                      value={reconFilter} 
                      onChange={(e) => setReconFilter(e.target.value)}
                      className="pos-filter-select"
                      title="Filter by Reconciliation Status"
                    >
                      <option value="all">⚡ All Status</option>
                      <option value="reconciled">✓ Reconciled</option>
                      <option value="pending">⏱ Pending Review</option>
                    </select>
                  </div>

                  {(searchTerm || gstFilter !== "all" || reconFilter !== "all") && (
                    <button 
                      className="fin-reset-btn" 
                      onClick={() => {
                        setSearchTerm("");
                        setGstFilter("all");
                        setReconFilter("all");
                      }}
                      title="Reset all filters"
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
                      <th style={{ borderColor: "var(--admin-border)" }}>Order ID</th>
                      <th style={{ borderColor: "var(--admin-border)" }}>Date</th>
                      <th style={{ borderColor: "var(--admin-border)" }}>Place of Supply</th>
                      <th style={{ borderColor: "var(--admin-border)", textAlign: "right" }}>Taxable Subtotal</th>
                      <th style={{ borderColor: "var(--admin-border)", textAlign: "right" }}>CGST</th>
                      <th style={{ borderColor: "var(--admin-border)", textAlign: "right" }}>SGST</th>
                      <th style={{ borderColor: "var(--admin-border)", textAlign: "right" }}>IGST</th>
                      <th style={{ borderColor: "var(--admin-border)", textAlign: "right" }}>Discount</th>
                      <th style={{ borderColor: "var(--admin-border)", textAlign: "right" }}>Total Collected</th>
                      <th style={{ borderColor: "var(--admin-border)", textAlign: "center" }}>Reconciliation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.length > 0 ? (
                      filteredTransactions.map((tx) => {
                        const isIntra = String(tx.placeOfSupply).toLowerCase().trim() === String(data?.warehouseState || "Karnataka").toLowerCase().trim();
                        return (
                          <tr key={tx._id}>
                            <td style={{ borderColor: "var(--admin-border-soft)" }}>
                              <span className="fin-order-code-badge">
                                #{tx._id.slice(-6).toUpperCase()}
                              </span>
                            </td>
                            <td style={{ borderColor: "var(--admin-border-soft)", whiteSpace: "nowrap" }}>
                              {new Date(tx.createdAt).toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric"
                              })}
                            </td>
                            <td style={{ borderColor: "var(--admin-border-soft)" }}>
                              <div style={{ fontWeight: 600, color: "var(--admin-text)" }}>{tx.placeOfSupply}</div>
                              <small style={{ display: "block", color: "var(--admin-muted)" }}>{tx.customer}</small>
                              <span className={`fin-pos-pill ${isIntra ? "intra" : "inter"}`}>
                                {isIntra ? "Intra-state" : "Inter-state"}
                              </span>
                            </td>
                            <td style={{ borderColor: "var(--admin-border-soft)", textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>
                              ₹{tx.subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td style={{ borderColor: "var(--admin-border-soft)", textAlign: "right", fontFamily: "monospace" }}>
                              {tx.cgst > 0 ? `₹${tx.cgst.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : <span style={{ color: "var(--admin-muted)" }}>—</span>}
                            </td>
                            <td style={{ borderColor: "var(--admin-border-soft)", textAlign: "right", fontFamily: "monospace" }}>
                              {tx.sgst > 0 ? `₹${tx.sgst.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : <span style={{ color: "var(--admin-muted)" }}>—</span>}
                            </td>
                            <td style={{ borderColor: "var(--admin-border-soft)", textAlign: "right", fontFamily: "monospace" }}>
                              {tx.igst > 0 ? `₹${tx.igst.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : <span style={{ color: "var(--admin-muted)" }}>—</span>}
                            </td>
                            <td className={tx.discount > 0 ? "text-red" : ""} style={{ borderColor: "var(--admin-border-soft)", textAlign: "right", fontFamily: "monospace" }}>
                              {tx.discount > 0 ? `- ₹${tx.discount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : <span style={{ color: "var(--admin-muted)" }}>—</span>}
                            </td>
                            <td style={{ borderColor: "var(--admin-border-soft)", textAlign: "right", fontFamily: "monospace" }}>
                              <strong style={{ color: "var(--admin-text)", fontSize: "13.5px" }}>
                                ₹{tx.total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </strong>
                            </td>
                            <td style={{ borderColor: "var(--admin-border-soft)", textAlign: "center" }}>
                              <span className={`recon-status-badge ${tx.reconciliationStatus.toLowerCase().replace(/\s+/g, "-")}`}>
                                {tx.reconciliationStatus === "Reconciled" ? "✓ Reconciled" : "⏱ Pending Review"}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="10" style={{ textAlign: "center", padding: "40px 20px", borderColor: "var(--admin-border-soft)" }}>
                          <div style={{ fontSize: "28px", marginBottom: "8px" }}>📑</div>
                          <p style={{ margin: 0, fontWeight: 600, color: "var(--admin-text)" }}>No matching transactions found</p>
                          <small style={{ color: "var(--admin-muted)" }}>Try clearing search terms or adjusting the Place of Supply filter.</small>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Summary Footer for Filtered Transactions */}
              {filteredTransactions.length > 0 && (
                <div className="fin-ledger-summary-footer">
                  <div className="fin-summary-stats">
                    <div className="fin-summary-stat-item">
                      <span>Visible Subtotal:</span>
                      <strong>₹{visibleTotals.subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    </div>
                    <div className="fin-summary-stat-item">
                      <span>GST Tax:</span>
                      <strong style={{ color: "#7c3aed" }}>₹{visibleTotals.tax.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    </div>
                    <div className="fin-summary-stat-item">
                      <span>Total Invoiced:</span>
                      <strong style={{ color: "#2563eb" }}>₹{visibleTotals.total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    </div>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--admin-muted)", fontWeight: 600 }}>
                    Warehouse State: <strong style={{ color: "var(--admin-text)" }}>{data?.warehouseState || "Karnataka"}</strong>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default AdminFinancialDashboard;
