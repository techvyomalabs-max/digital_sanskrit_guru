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
import { Line, Doughnut, Bar } from "react-chartjs-2";
import "./AdminShared.css";
import "./AdminSalesDashboard.css";

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

function AdminSalesDashboard() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await axios.get("/api/orders/analytics/sales", {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data?.success) {
          setData(res.data);
        } else {
          setError("Failed to parse sales analytics.");
        }
      } catch (err) {
        console.error("Fetch sales analytics error:", err);
        setError(err.response?.data?.message || "Failed to load sales dashboard analytics.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchAnalytics();
  }, [token]);

  // Chart Data preparation
  const monthlyTrendData = {
    labels: data?.monthlySalesTrends?.map((d) => d.month) || [],
    datasets: [
      {
        label: "Sales Volume (INR)",
        data: data?.monthlySalesTrends?.map((d) => d.amount) || [],
        borderColor: "#D97706",
        backgroundColor: "rgba(217, 119, 6, 0.05)",
        borderWidth: 2.5,
        tension: 0.35,
        fill: true,
        pointBackgroundColor: "#D97706",
        pointBorderColor: "var(--admin-surface, #ffffff)",
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6
      }
    ]
  };

  const formatDistributionData = {
    labels: data?.formatDistribution ? Object.keys(data.formatDistribution) : [],
    datasets: [
      {
        data: data?.formatDistribution ? Object.values(data.formatDistribution) : [],
        backgroundColor: [
          "#3b82f6", // Web Version
          "#f59e0b", // Flipbook
          "#ff9900", // Kindle
          "#10b981", // Paperback
          "#8b5cf6", // E-Book/PDF
          "#64748b"  // Other
        ],
        borderWidth: 2,
        borderColor: "var(--admin-surface, #ffffff)"
      }
    ]
  };

  const topProductsData = {
    labels: data?.topProducts?.map((p) => p.name.length > 25 ? p.name.slice(0, 25) + "..." : p.name) || [],
    datasets: [
      {
        label: "Units Sold",
        data: data?.topProducts?.map((p) => p.quantity) || [],
        backgroundColor: "rgba(217, 119, 6, 0.85)",
        borderColor: "var(--admin-primary, #D97706)",
        borderWidth: 1,
        borderRadius: 4
      }
    ]
  };

  const trendOptions = {
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
        ticks: { color: "var(--admin-muted)", font: { size: 11 } }
      }
    }
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "right",
        labels: {
          color: "var(--admin-text, #0f172a)",
          font: { size: 11.5, weight: "bold" },
          padding: 14
        }
      }
    }
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: "y",
    plugins: {
      legend: { display: false }
    },
    scales: {
      x: {
        grid: { color: "rgba(209, 213, 219, 0.15)" },
        ticks: { color: "var(--admin-muted)", font: { size: 11 } }
      },
      y: {
        grid: { display: false },
        ticks: { color: "var(--admin-text)", font: { size: 11.5, weight: 600 } }
      }
    }
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />

      <main className="admin-main">
        <header className="admin-header">
          <div>
            <h1>Sales Dashboard</h1>
            <p className="admin-orders-subtitle" style={{ margin: "6px 0 0", color: "var(--admin-muted)" }}>
              Monitor catalog orders growth, format distributions, and top-selling product assets.
            </p>
          </div>
        </header>

        {error && <p className="pricing-message error" style={{ margin: "0 0 20px" }}>{error}</p>}

        {isLoading ? (
          <div className="admin-dashboard-loading" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px" }}>
            <div className="admin-dashboard-spinner" />
            <p style={{ marginTop: "12px", color: "var(--admin-muted)" }}>Gathering analytics data...</p>
          </div>
        ) : (
          <>
            {/* Sales Summary Statistics */}
            <div className="stats">
              <div className="card analytics-card">
                <span>Gross Revenue</span>
                <p style={{ color: "#3b82f6" }}>
                  Rs {(data?.summary?.totalRevenue || 0).toLocaleString("en-IN")}
                </p>
              </div>
              <div className="card analytics-card">
                <span>Total Orders</span>
                <p>{data?.summary?.totalOrders}</p>
              </div>
              <div className="card analytics-card">
                <span>Items Sold</span>
                <p>{data?.summary?.totalItemsSold}</p>
              </div>
              <div className="card analytics-card">
                <span>Average Order Value</span>
                <p style={{ color: "#f59e0b" }}>
                  Rs {(data?.summary?.averageOrderValue || 0).toLocaleString("en-IN")}
                </p>
              </div>
            </div>

            {/* Dashboard Graphs Row 1 */}
            <div className="sales-dashboard-grid">
              <div className="card sales-dashboard-chart-card double-width">
                <h3>📈 Monthly Sales Performance</h3>
                <div className="chart-container">
                  <Line data={monthlyTrendData} options={trendOptions} />
                </div>
              </div>

              <div className="card sales-dashboard-chart-card">
                <h3>📖 Sales by Product Format</h3>
                <div className="chart-container">
                  <Doughnut data={formatDistributionData} options={doughnutOptions} />
                </div>
              </div>
            </div>

            {/* Dashboard Graphs Row 2 */}
            <div className="sales-dashboard-grid">
              <div className="card sales-dashboard-chart-card double-width">
                <h3>🏆 Top 10 Best-Selling Products</h3>
                <div className="chart-container">
                  <Bar data={topProductsData} options={barOptions} />
                </div>
              </div>

              <div className="card sales-dashboard-chart-card">
                <h3>🌍 Geographic Sales Distribution</h3>
                <div className="sales-geo-list">
                  {data?.geographicDistribution?.length > 0 ? (
                    data.geographicDistribution.map((geo, index) => (
                      <div key={`${geo.name}-${index}`} className="sales-geo-row" style={{ background: "var(--admin-surface-2)", borderColor: "var(--admin-border)" }}>
                        <span className="sales-geo-name" style={{ color: "var(--admin-text)" }}>📍 {geo.name}</span>
                        <strong className="sales-geo-count" style={{ color: "var(--admin-primary)" }}>
                          {geo.count} order{geo.count === 1 ? "" : "s"}
                        </strong>
                      </div>
                    ))
                  ) : (
                    <p style={{ margin: "20px 0", color: "var(--admin-muted)", textAlign: "center" }}>
                      No location data captured yet.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default AdminSalesDashboard;
