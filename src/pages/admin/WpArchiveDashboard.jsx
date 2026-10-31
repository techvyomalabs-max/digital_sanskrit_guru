import { useEffect, useState, useCallback } from "react";
import { Package, Phone, Mail } from "lucide-react";
import axios from "axios";
import { useAuth } from "../../hooks/useAuth";
import AdminSidebar from "../../components/admin/AdminSidebar";
import "../AdminShared.css";

function WpArchiveDashboard() {
  const { token } = useAuth();

  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [error, setError] = useState("");

  const [selectedOrder, setSelectedOrder] = useState(null);

  const loadStats = useCallback(async () => {
    try {
      const res = await axios.get("/api/admin/wp-archive/stats", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data?.success) {
        setStats(res.data);
      }
    } catch (err) {
      console.error("Failed to load WP Archive stats", err);
    }
  }, [token]);

  const loadOrders = useCallback(async (page = 1) => {
    setOrdersLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        limit: pagination.limit,
        search: search.trim(),
        status: statusFilter
      });
      const res = await axios.get(`/api/admin/wp-archive/orders?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data?.success) {
        setOrders(res.data.orders);
        setPagination(res.data.pagination);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to search WP Archive orders.");
    } finally {
      setOrdersLoading(false);
      setLoading(false);
    }
  }, [token, pagination.limit, search, statusFilter]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadOrders(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, statusFilter, loadOrders]);

  const formatPrice = (amount, currency = "INR") => {
    const num = Number(amount || 0);
    if (currency === "USD") return `$${num.toFixed(2)}`;
    return `₹${Math.round(num).toLocaleString("en-IN")}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? "N/A" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };

  const getStatusBadge = (status) => {
    const s = String(status || "").toLowerCase();
    if (s.includes("delivered") || s.includes("completed")) {
      return <span style={{ padding: "4px 10px", borderRadius: "12px", backgroundColor: "#dcfce7", color: "#15803d", fontWeight: "700", fontSize: "12px" }}>Delivered</span>;
    }
    if (s.includes("pending") || s.includes("processing")) {
      return <span style={{ padding: "4px 10px", borderRadius: "12px", backgroundColor: "#fef3c7", color: "#b45309", fontWeight: "700", fontSize: "12px" }}>Pending</span>;
    }
    return <span style={{ padding: "4px 10px", borderRadius: "12px", backgroundColor: "#fee2e2", color: "#b91c1c", fontWeight: "700", fontSize: "12px" }}>Cancelled</span>;
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />

      <main className="admin-main" style={{ padding: "24px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: "800", color: "var(--site-text, #0f172a)", margin: 0 }}>
              <Package size={22} className="ui-inline-icon" aria-hidden="true" />WordPress Archive Dashboard
            </h1>
            <p style={{ color: "var(--site-text-soft, #64748b)", fontSize: "14px", marginTop: "4px" }}>
              Search, filter, and audit historical WooCommerce orders with exact WP Order IDs
            </p>
          </div>
        </div>

        {/* Stats Grid */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "24px" }}>
          <div className="card" style={{ padding: "20px", borderRadius: "12px", backgroundColor: "#ffffff", border: "1px solid #e2e8f0" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", textTransform: "uppercase" }}>Total WP Orders</span>
            <h3 style={{ fontSize: "28px", fontWeight: "800", color: "#0f172a", margin: "8px 0 0" }}>
              {stats ? stats.totalOrders.toLocaleString("en-IN") : "..."}
            </h3>
            <span style={{ fontSize: "12px", color: "#16a34a" }}>All historical imports</span>
          </div>

          <div className="card" style={{ padding: "20px", borderRadius: "12px", backgroundColor: "#ffffff", border: "1px solid #e2e8f0" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", textTransform: "uppercase" }}>Delivered Orders</span>
            <h3 style={{ fontSize: "28px", fontWeight: "800", color: "#16a34a", margin: "8px 0 0" }}>
              {stats ? stats.deliveredCount.toLocaleString("en-IN") : "..."}
            </h3>
            <span style={{ fontSize: "12px", color: "#64748b" }}>Fulfilled WooCommerce orders</span>
          </div>

          <div className="card" style={{ padding: "20px", borderRadius: "12px", backgroundColor: "#ffffff", border: "1px solid #e2e8f0" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", textTransform: "uppercase" }}>Unique Customers</span>
            <h3 style={{ fontSize: "28px", fontWeight: "800", color: "#2563eb", margin: "8px 0 0" }}>
              {stats ? stats.uniqueCustomers.toLocaleString("en-IN") : "..."}
            </h3>
            <span style={{ fontSize: "12px", color: "#64748b" }}>Registered & guest buyers</span>
          </div>

          <div className="card" style={{ padding: "20px", borderRadius: "12px", backgroundColor: "#ffffff", border: "1px solid #e2e8f0" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", textTransform: "uppercase" }}>Historical INR Revenue</span>
            <h3 style={{ fontSize: "24px", fontWeight: "800", color: "#d97706", margin: "8px 0 0" }}>
              {stats ? formatPrice(stats.revenueByCurrency?.INR || 0, "INR") : "..."}
            </h3>
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              USD: {stats ? formatPrice(stats.revenueByCurrency?.USD || 0, "USD") : "$0"}
            </span>
          </div>
        </section>

        {/* Filter Controls */}
        <section className="card" style={{ padding: "20px", borderRadius: "12px", backgroundColor: "#ffffff", border: "1px solid #e2e8f0", marginBottom: "24px" }}>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: "260px" }}>
              <input
                type="text"
                placeholder="Search by exact WP Order # (e.g. 11180), customer email, name, or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "14px"
                }}
              />
            </div>

            <div style={{ width: "160px" }}>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "14px",
                  backgroundColor: "#ffffff"
                }}
              >
                <option value="All">All Statuses</option>
                <option value="Delivered">Delivered</option>
                <option value="Pending">Pending</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        </section>

        {/* Data Table */}
        <section className="card" style={{ padding: "0", borderRadius: "12px", backgroundColor: "#ffffff", border: "1px solid #e2e8f0", overflow: "hidden" }}>
          {error && (
            <div style={{ padding: "16px", backgroundColor: "#fee2e2", color: "#b91c1c", fontSize: "14px" }}>
              {error}
            </div>
          )}

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
              <thead>
                <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569", fontWeight: "700" }}>
                  <th style={{ padding: "14px 16px" }}>WP Order #</th>
                  <th style={{ padding: "14px 16px" }}>Customer</th>
                  <th style={{ padding: "14px 16px" }}>Date</th>
                  <th style={{ padding: "14px 16px" }}>Items Purchased</th>
                  <th style={{ padding: "14px 16px" }}>Total Amount</th>
                  <th style={{ padding: "14px 16px" }}>Status</th>
                  <th style={{ padding: "14px 16px", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {ordersLoading || loading ? (
                  <tr>
                    <td colSpan="7" style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>
                      Loading WP Archive orders...
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>
                      No WordPress Archive orders found matching your search.
                    </td>
                  </tr>
                ) : (
                  orders.map((o) => (
                    <tr key={o._id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "14px 16px", fontWeight: "800", color: "#0f172a" }}>
                        #{o.wpOrderId}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ fontWeight: "600", color: "#1e293b" }}>{o.billingName || "Customer"}</div>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>{o.billingEmail || "N/A"}</div>
                      </td>
                      <td style={{ padding: "14px 16px", color: "#475569" }}>
                        {formatDate(o.wpCreatedAt)}
                      </td>
                      <td style={{ padding: "14px 16px", color: "#334155", maxWidth: "250px" }}>
                        <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {o.items && o.items.length > 0 ? o.items[0].name : "WooCommerce Order"}
                        </div>
                        {o.items && o.items.length > 1 && (
                          <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "600" }}>
                            +{o.items.length - 1} more item(s)
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "14px 16px", fontWeight: "700", color: "#0f172a" }}>
                        {formatPrice(o.total, o.currencyDisplay?.currency || "INR")}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        {getStatusBadge(o.status)}
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "right" }}>
                        <button
                          type="button"
                          onClick={() => setSelectedOrder(o)}
                          style={{
                            padding: "6px 12px",
                            borderRadius: "6px",
                            backgroundColor: "#f1f5f9",
                            border: "1px solid #cbd5e1",
                            color: "#0f172a",
                            fontWeight: "600",
                            fontSize: "12.5px",
                            cursor: "pointer"
                          }}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", backgroundColor: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
            <span style={{ fontSize: "13px", color: "#64748b" }}>
              Showing {orders.length > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0} - {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} orders
            </span>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => loadOrders(pagination.page - 1)}
                style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", backgroundColor: pagination.page <= 1 ? "#f1f5f9" : "#ffffff", cursor: pagination.page <= 1 ? "not-allowed" : "pointer" }}
              >
                Previous
              </button>

              <span style={{ padding: "6px 12px", fontWeight: "600", fontSize: "14px" }}>
                Page {pagination.page} of {pagination.totalPages || 1}
              </span>

              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => loadOrders(pagination.page + 1)}
                style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", backgroundColor: pagination.page >= pagination.totalPages ? "#f1f5f9" : "#ffffff", cursor: pagination.page >= pagination.totalPages ? "not-allowed" : "pointer" }}
              >
                Next
              </button>
            </div>
          </div>
        </section>

        {/* Order Details Modal */}
        {selectedOrder && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(15, 23, 42, 0.5)",
              backdropFilter: "blur(4px)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 9999,
              padding: "16px"
            }}
          >
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "16px",
                maxWidth: "700px",
                width: "100%",
                maxHeight: "90vh",
                overflowY: "auto",
                padding: "24px",
                position: "relative",
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)"
              }}
            >
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                style={{
                  position: "absolute",
                  top: "16px",
                  right: "16px",
                  border: "none",
                  backgroundColor: "#f1f5f9",
                  borderRadius: "50%",
                  width: "32px",
                  height: "32px",
                  fontSize: "18px",
                  cursor: "pointer",
                  color: "#64748b"
                }}
              >
                &times;
              </button>

              <h2 style={{ fontSize: "20px", fontWeight: "800", margin: "0 0 4px" }}>
                WordPress Order #{selectedOrder.wpOrderId}
              </h2>
              <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 16px" }}>
                Date Placed: {formatDate(selectedOrder.wpCreatedAt)} | Status: {selectedOrder.status}
              </p>

              {/* Items Table */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px", marginBottom: "16px", backgroundColor: "#f8fafc" }}>
                <h4 style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: "700" }}>Purchased Items</h4>
                {selectedOrder.items && selectedOrder.items.map((item, idx) => (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: idx < selectedOrder.items.length - 1 ? "1px solid #e2e8f0" : "none" }}>
                    <div>
                      <strong style={{ fontSize: "14px" }}>{item.name}</strong>
                      <div style={{ fontSize: "12px", color: "#64748b" }}>Qty: {item.quantity} {item.isDigital ? "(Digital Format)" : ""}</div>
                    </div>
                    <span style={{ fontWeight: "700" }}>
                      {formatPrice(item.price * item.quantity, selectedOrder.currencyDisplay?.currency || "INR")}
                    </span>
                  </div>
                ))}
              </div>

              {/* Addresses */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px" }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: "13px", color: "#475569" }}>Billing Address</h4>
                  <div style={{ fontSize: "13px", color: "#1e293b", lineHeight: "1.4" }}>
                    <strong>{selectedOrder.billing?.name || selectedOrder.billingName}</strong><br />
                    {selectedOrder.billing?.address}<br />
                    {selectedOrder.billing?.city}, {selectedOrder.billing?.state} {selectedOrder.billing?.pincode}<br />
                    {selectedOrder.billing?.country}<br />
                    <Phone size={13} className="ui-inline-icon" aria-hidden="true" />{selectedOrder.billing?.phone || "N/A"}<br />
                    <Mail size={13} className="ui-inline-icon" aria-hidden="true" />{selectedOrder.billingEmail}
                  </div>
                </div>

                <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px" }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: "13px", color: "#475569" }}>Shipping Address</h4>
                  <div style={{ fontSize: "13px", color: "#1e293b", lineHeight: "1.4" }}>
                    <strong>{selectedOrder.shipping?.name || selectedOrder.billingName}</strong><br />
                    {selectedOrder.shipping?.address || selectedOrder.billing?.address}<br />
                    {selectedOrder.shipping?.city || selectedOrder.billing?.city}, {selectedOrder.shipping?.state || selectedOrder.billing?.state} {selectedOrder.shipping?.pincode || selectedOrder.billing?.pincode}<br />
                    {selectedOrder.shipping?.country || selectedOrder.billing?.country}
                  </div>
                </div>
              </div>

              {/* Financial Totals */}
              <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "12px", fontSize: "13px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span>Subtotal:</span>
                  <span>{formatPrice(selectedOrder.subtotal, selectedOrder.currencyDisplay?.currency || "INR")}</span>
                </div>
                {selectedOrder.gstAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span>GST:</span>
                    <span>{formatPrice(selectedOrder.gstAmount, selectedOrder.currencyDisplay?.currency || "INR")}</span>
                  </div>
                )}
                {selectedOrder.deliveryCharge > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span>Shipping:</span>
                    <span>{formatPrice(selectedOrder.deliveryCharge, selectedOrder.currencyDisplay?.currency || "INR")}</span>
                  </div>
                )}
                {selectedOrder.discount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", color: "#16a34a" }}>
                    <span>Discount ({selectedOrder.couponCode || "Coupon"}):</span>
                    <span>-{formatPrice(selectedOrder.discount, selectedOrder.currencyDisplay?.currency || "INR")}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "800", fontSize: "16px", borderTop: "1px solid #cbd5e1", paddingTop: "8px", marginTop: "8px" }}>
                  <span>Total Amount:</span>
                  <span style={{ color: "#d97706" }}>{formatPrice(selectedOrder.total, selectedOrder.currencyDisplay?.currency || "INR")}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default WpArchiveDashboard;
