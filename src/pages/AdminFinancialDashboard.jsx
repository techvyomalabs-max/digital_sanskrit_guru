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

  // Filter transactions for GST place of supply
  const filteredTransactions = (() => {
    if (!data?.recentTransactions) return [];
    if (gstFilter === "all") return data.recentTransactions;
    
    const warehouse = String(data.warehouseState || "Karnataka").toLowerCase().trim();
    if (gstFilter === "intra") {
      return data.recentTransactions.filter(
        (t) => String(t.placeOfSupply).toLowerCase().trim() === warehouse
      );
    }
    if (gstFilter === "inter") {
      return data.recentTransactions.filter(
        (t) => String(t.placeOfSupply).toLowerCase().trim() !== warehouse
      );
    }
    return data.recentTransactions;
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
        borderColor: "#2563eb",
        backgroundColor: "transparent",
        borderWidth: 2,
        tension: 0.3,
        pointBackgroundColor: "#2563eb",
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
          "#2563eb", // Subtotal
          "#8b5cf6", // GST
          "#d97706", // Delivery
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
        labels: { color: "var(--site-text, #111827)", boxWidth: 12 }
      }
    },
    scales: {
      y: {
        grid: { color: "rgba(209, 213, 219, 0.15)" },
        ticks: { color: "#64748b", font: { size: 11 } }
      },
      x: {
        grid: { display: false },
        ticks: { color: "#64748b", font: { size: 11 } }
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
        ticks: { color: "#64748b", font: { size: 11 } }
      },
      x: {
        grid: { display: false },
        ticks: { color: "#334155", font: { size: 12, weight: 600 } }
      }
    }
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />

      <main className="admin-main financial-dashboard-page">
        <header className="admin-orders-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
          <div>
            <p className="admin-orders-kicker">Accounting & Taxes</p>
            <h1>Financial Dashboard</h1>
            <p className="admin-orders-subtitle">
              GST compliance calculation, Place of Supply matching, and payment ledger reconciliation.
            </p>
          </div>
          {!isLoading && (
            <button className="gstr-export-btn" onClick={exportGstr1Csv}>
              📥 Export GSTR-1 Report (CSV)
            </button>
          )}
        </header>

        {error && <p className="admin-orders-feedback error">{error}</p>}

        {isLoading ? (
          <div className="admin-dashboard-loading">
            <div className="admin-dashboard-spinner" />
            <p>Processing financial registers...</p>
          </div>
        ) : (
          <>
            {/* Financial Cards Grid */}
            <section className="admin-orders-overview" aria-label="Financial summaries grid">
              <article className="admin-overview-card">
                <p className="admin-overview-label">Gross Revenue</p>
                <p className="admin-overview-value text-blue">
                  Rs {(data?.summary?.grossRevenue || 0).toLocaleString("en-IN")}
                </p>
              </article>
              <article className="admin-overview-card highlight-green">
                <p className="admin-overview-label">Net Earnings</p>
                <p className="admin-overview-value text-green">
                  Rs {(data?.summary?.netRevenue || 0).toLocaleString("en-IN")}
                </p>
                <small className="admin-overview-subnote">Gross Revenue - GST - Shipping</small>
              </article>
              <article className="admin-overview-card">
                <p className="admin-overview-label">Total GST Tax</p>
                <p className="admin-overview-value text-purple">
                  Rs {(data?.summary?.taxGST || 0).toLocaleString("en-IN")}
                </p>
              </article>
              <article className="admin-overview-card">
                <p className="admin-overview-label">CGST + SGST (Intra-state)</p>
                <p className="admin-overview-value text-blue-muted">
                  Rs {((data?.summary?.cgst || 0) + (data?.summary?.sgst || 0)).toLocaleString("en-IN")}
                </p>
                <small className="admin-overview-subnote">Warehouse State: {data?.warehouseState || "Karnataka"}</small>
              </article>
              <article className="admin-overview-card">
                <p className="admin-overview-label">IGST (Inter-state)</p>
                <p className="admin-overview-value text-indigo">
                  Rs {(data?.summary?.igst || 0).toLocaleString("en-IN")}
                </p>
              </article>
            </section>

            {/* Reconciliation Tools Row */}
            <section className="recon-tools-section">
              <div className="recon-tools-header">
                <h3>🔄 Automated Payment Reconciliation Audit</h3>
                <span className="recon-badge">Razorpay API Sync Status: Online</span>
              </div>
              <div className="recon-stats-grid">
                <div className="recon-stat-box green">
                  <strong>{reconStats.reconciled}</strong>
                  <span>Reconciled Transactions</span>
                </div>
                <div className="recon-stat-box orange">
                  <strong>{reconStats.pending}</strong>
                  <span>Pending Review</span>
                </div>
                <div className="recon-stat-box blue">
                  <strong>{reconStats.total}</strong>
                  <span>Total Scanned Ledger Logs</span>
                </div>
              </div>
            </section>

            {/* Charts Row */}
            <div className="sales-dashboard-grid">
              <div className="sales-dashboard-chart-card double-width">
                <h3>📈 Revenue & Profit Growth</h3>
                <div className="chart-container">
                  <Line data={monthlyTrendData} options={trendOptions} />
                </div>
              </div>

              <div className="sales-dashboard-chart-card">
                <h3>📊 Fee Components Breakdown</h3>
                <div className="chart-container">
                  <Bar data={feesBreakdownData} options={barOptions} />
                </div>
              </div>
            </div>

            {/* Recent Transactions Ledger */}
            <div className="financial-ledger-card">
              <div className="ledger-card-header-row">
                <h3>📒 Transaction Audit Ledger & GSTR Place of Supply</h3>
                
                {/* GST Place of Supply Filter */}
                <div className="pos-filter-group">
                  <label htmlFor="pos-filter">Place of Supply:</label>
                  <select 
                    id="pos-filter"
                    value={gstFilter} 
                    onChange={(e) => setGstFilter(e.target.value)}
                    className="pos-filter-select"
                  >
                    <option value="all">All States</option>
                    <option value="intra">Intra-state (CGST + SGST)</option>
                    <option value="inter">Inter-state (IGST)</option>
                  </select>
                </div>
              </div>

              <div className="admin-orders-table-wrap">
                <table className="admin-orders-table">
                  <thead>
                    <tr>
                      <th>Order ID</th>
                      <th>Date</th>
                      <th>Place of Supply</th>
                      <th>Taxable Subtotal</th>
                      <th>CGST</th>
                      <th>SGST</th>
                      <th>IGST</th>
                      <th>Discount</th>
                      <th>Total Collected</th>
                      <th>Reconciliation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.length > 0 ? (
                      filteredTransactions.map((tx) => (
                        <tr key={tx._id}>
                          <td className="order-code">#{tx._id.slice(-6).toUpperCase()}</td>
                          <td>{new Date(tx.createdAt).toLocaleDateString("en-IN")}</td>
                          <td>
                            <strong>{tx.placeOfSupply}</strong>
                            <small style={{ display: "block", color: "#64748b" }}>{tx.customer}</small>
                          </td>
                          <td>Rs {tx.subtotal.toFixed(2)}</td>
                          <td>{tx.cgst > 0 ? `Rs ${tx.cgst.toFixed(2)}` : "—"}</td>
                          <td>{tx.sgst > 0 ? `Rs ${tx.sgst.toFixed(2)}` : "—"}</td>
                          <td>{tx.igst > 0 ? `Rs ${tx.igst.toFixed(2)}` : "—"}</td>
                          <td className={tx.discount > 0 ? "text-red" : ""}>
                            {tx.discount > 0 ? `- Rs ${tx.discount.toFixed(2)}` : "—"}
                          </td>
                          <td>
                            <strong>Rs {tx.total.toFixed(2)}</strong>
                          </td>
                          <td>
                            <span className={`recon-status-badge ${tx.reconciliationStatus.toLowerCase().replace(" ", "-")}`}>
                              {tx.reconciliationStatus}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="10" style={{ textAlign: "center", padding: "30px" }}>
                          No transaction matches the filter option.
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
