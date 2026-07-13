import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import AdminSidebar from "../components/admin/AdminSidebar";
import { formatDate, formatDateForFileName, formatTime } from "../utils/date";
import { formatBaseCurrency, formatOrderDisplayCurrency, convertCurrencyAmount } from "../utils/currency";
import "./AdminOrders.css";

const Icon = ({ name }) => {
  const paths = {
    export: "M12 3v10m0 0 4-4m-4 4-4-4M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4",
    invoice: "M7 3h8l4 4v14H7V3Zm8 0v5h5M10 12h6M10 16h6M10 20h4",
    search: "M11 5a6 6 0 1 1 0 12a6 6 0 0 1 0-12Zm4.5 10.5L20 20",
    reset: "M4 4v6h6M20 20v-6h-6M5 15a7 7 0 0 0 12 3M19 9A7 7 0 0 0 7 6",
    view: "M2 12s4-7 10-7s10 7 10 7s-4 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6a3 3 0 0 0 0 6"
  };

  return (
    <svg className="admin-order-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={paths[name]} />
    </svg>
  );
};

const BACKEND_STATUSES = ["Pending", "Shipped", "Delivered", "Cancelled"];
const DISPLAY_STATUSES = ["On Hold", ...BACKEND_STATUSES];
const PAYMENT_STATUSES = ["Pending", "Paid", "Failed", "Refunded"];
const RETURN_STATUSES = ["Not Requested", "Requested", "Approved", "Rejected", "Refunded"];
const RETURN_FILTER_KEY = "Return Requests";

function AdminOrders() {
  const { token, user } = useAuth();
  const canUpdateOrders = Boolean(user?.isAdmin);
  const canViewRevenue = Boolean(user?.isAdmin);
  const [orders, setOrders] = useState([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusCounts, setStatusCounts] = useState({
    "On Hold": 0, Pending: 0, Shipped: 0, Delivered: 0, Cancelled: 0, [RETURN_FILTER_KEY]: 0, All: 0
  });
  const [overviewStats, setOverviewStats] = useState({
    totalOrders: 0,
    totalRevenue: 0,
    pendingPayments: 0,
    fulfilledOrders: 0
  });

  const [fromDateTime, setFromDateTime] = useState("");
  const [toDateTime, setToDateTime] = useState("");
  const [activeQuickFilter, setActiveQuickFilter] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText, setDebouncedSearchText] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [updatingOrderId, setUpdatingOrderId] = useState("");
  const [generatingInvoiceOrderId, setGeneratingInvoiceOrderId] = useState("");
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [pageMessage, setPageMessage] = useState("");
  const statusStep = {
    "On Hold": 0,
    Pending: 1,
    Shipped: 2,
    Delivered: 3,
    Cancelled: 0
  };

  const getPaymentStatus = (order) => {
    if (String(order?.refundStatus || "").trim() === "Refunded") return "Refunded";
    const raw = String(order?.paymentStatus || "").trim();
    if (PAYMENT_STATUSES.includes(raw)) return raw;
    return "Paid";
  };

  const getReturnStatus = (item) => {
    const raw = String(item?.returnRequest?.status || "").trim();
    return RETURN_STATUSES.includes(raw) ? raw : "Not Requested";
  };

  const hasReturnRequests = (order) =>
    Array.isArray(order?.items) && order.items.some((item) => getReturnStatus(item) !== "Not Requested");

  const getDisplayStatus = (order) => {
    const rawStatus = String(order?.status || "").trim();
    if (rawStatus === "Cancelled") return "Cancelled";
    if (getPaymentStatus(order) !== "Paid") return "On Hold";
    if (BACKEND_STATUSES.includes(rawStatus)) return rawStatus;
    return "Pending";
  };

  const toInputDateTime = (date) => {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "";

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const loadOrders = async () => {
    setIsLoadingOrders(true);
    try {
      const params = {
        page: currentPage,
        limit: 20,
        sort: sortOrder,
        search: debouncedSearchText,
        status: selectedStatus,
        fromDateTime,
        toDateTime
      };
      const res = await axios.get("/api/orders", {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = res.data || {};
      setOrders(Array.isArray(data.orders) ? data.orders : []);
      setTotalOrders(data.totalOrders || 0);
      setTotalPages(data.totalPages || 1);
      if (data.statusSummary) {
        setStatusCounts(data.statusSummary);
      }
      if (data.overviewStats) {
        setOverviewStats(data.overviewStats);
      }
      setPageMessage("");
    } catch (err) {
      setOrders([]);
      setTotalOrders(0);
      setTotalPages(1);
      setPageMessage(err?.response?.data?.message || "Unable to load orders right now.");
    } finally {
      setIsLoadingOrders(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchText, selectedStatus, sortOrder, fromDateTime, toDateTime]);

  useEffect(() => {
    if (!token) return;
    void loadOrders();
  }, [token, currentPage, debouncedSearchText, selectedStatus, sortOrder, fromDateTime, toDateTime]);

  const updateStatus = async (orderId, status) => {
    const safeStatus = DISPLAY_STATUSES.includes(status) ? status : "On Hold";
    const targetOrder = orders.find((item) => item?._id === orderId);
    const paymentStatus = getPaymentStatus(targetOrder);
    const apiStatus = safeStatus === "On Hold" ? "Pending" : safeStatus;

    if (
      (apiStatus === "Pending" || apiStatus === "Shipped" || apiStatus === "Delivered") &&
      paymentStatus !== "Paid"
    ) {
      window.alert("Payment is not completed. Keep this order On Hold.");
      return;
    }

    if (!BACKEND_STATUSES.includes(apiStatus)) {
      window.alert("Invalid status selected.");
      return;
    }

    let reason = "";
    let trackingId = "";
    let courierPartner = "";

    if (apiStatus === "Cancelled") {
      const cancellationReason = window.prompt("Reason for cancelling this order?", "Cancelled by admin");
      if (cancellationReason === null) return;
      reason = cancellationReason;
    }

    if (apiStatus === "Shipped") {
      const partner = window.prompt("Enter Courier Partner (Delhivery / India Post / Other):", "Delhivery");
      if (partner === null) return; // user cancelled
      const tracking = window.prompt("Enter Tracking ID / Waybill Number:");
      if (tracking === null) return; // user cancelled

      courierPartner = partner.trim();
      trackingId = tracking.trim();
    }

    setUpdatingOrderId(orderId);
    try {
      await axios.put(
        `/api/orders/${orderId}/status`,
        { status: apiStatus, reason, trackingId, courierPartner },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      await loadOrders();
      setPageMessage("Order updated successfully.");
    } catch (err) {
      setPageMessage(err?.response?.data?.message || "Unable to update this order.");
    } finally {
      setUpdatingOrderId("");
    }
  };

  const updateReturnStatus = async (orderId, itemId, returnStatus) => {
    let adminReason = "";
    if (returnStatus === "Rejected") {
      const rejectionReason = window.prompt("Reason for rejecting this return request?", "Return request rejected by admin");
      if (rejectionReason === null) return;
      adminReason = rejectionReason.trim();
      if (!adminReason) {
        window.alert("Please enter a rejection reason.");
        return;
      }
    }

    setUpdatingOrderId(orderId);
    try {
      await axios.put(
        `/api/orders/${orderId}/items/${itemId}/return-status`,
        { returnStatus, adminReason },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      await loadOrders();
      setPageMessage("Return request updated successfully.");
    } catch (err) {
      setPageMessage(err?.response?.data?.message || "Unable to update the return request.");
    } finally {
      setUpdatingOrderId("");
    }
  };

  const exportOrdersCsv = async () => {
    try {
      setPageMessage("Preparing export...");
      const params = {
        limit: "all",
        sort: sortOrder,
        search: debouncedSearchText,
        status: selectedStatus,
        fromDateTime,
        toDateTime
      };
      const res = await axios.get("/api/orders", {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });
      const allMatchingOrders = res.data?.orders || [];
      if (allMatchingOrders.length === 0) {
        window.alert("No orders to export.");
        setPageMessage("");
        return;
      }

      const headers = [
        "Order ID",
        "Customer",
        "Email",
        "Payment Country",
        "Items",
        "Total INR",
        "Customer Display Total",
        "Order Status",
        "Payment Status",
        "Refund Status",
        "Created At"
      ];

      const rows = allMatchingOrders.map((order) => {
        const itemCount = (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 1), 0);
        return [
          order._id,
          order.user?.name || "Unknown",
          order.user?.email || "",
          getPaymentCountry(order),
          itemCount,
          Math.round(getOrderBaseTotal(order)),
          formatCustomerPaid(order),
          getDisplayStatus(order),
          getPaymentStatus(order),
          order?.refundStatus || "Not Applicable",
          new Date(order.createdAt).toISOString()
        ];
      });

      const csv = [headers, ...rows]
        .map((line) => line.map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`).join(","))
        .join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `orders-${formatDateForFileName(new Date())}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setPageMessage("Export completed successfully.");
    } catch (err) {
      console.error("CSV Export failed:", err);
      setPageMessage("Failed to export orders.");
    }
  };

  const applyQuickFilter = (type) => {
    const now = new Date();
    let from = null;

    if (type === "24h") {
      from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (type === "7d") {
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (type === "month") {
      from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    }

    if (!from) return;
    setFromDateTime(toInputDateTime(from));
    setToDateTime(toInputDateTime(now));
    setActiveQuickFilter(type);
  };

  const generateInvoice = async (order) => {
    setGeneratingInvoiceOrderId(String(order?._id || ""));
    setPageMessage("");

    try {
      const { generateInvoicePdf } = await import("../utils/invoicePdf");
      await generateInvoicePdf(order, {
        customerName: order?.user?.name || order?.shipping?.name || "Customer",
        customerEmail: order?.user?.email || "N/A",
        filePrefix: "invoice"
      });
    } catch {
      setPageMessage("Unable to generate invoice right now.");
    } finally {
      setGeneratingInvoiceOrderId("");
    }
  };

  const formatMoney = (value) => {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return formatBaseCurrency(0);
    return formatBaseCurrency(amount, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  const getOrderBaseTotal = (order) => {
    const displayCurrency = String(
      order?.currencyDisplay?.currency ||
        order?.displayCurrency ||
        order?.currency ||
        "INR"
    )
      .trim()
      .toUpperCase();

    const hasStoredDisplayAmount =
      order?.currencyDisplay?.amount !== null &&
      order?.currencyDisplay?.amount !== undefined &&
      order?.currencyDisplay?.amount !== "";

    const paidAmount = hasStoredDisplayAmount
      ? Number(order.currencyDisplay.amount)
      : Number(order?.total || 0);

    if (displayCurrency === "INR") {
      return paidAmount;
    }

    return convertCurrencyAmount(paidAmount, {
      sourceCurrency: displayCurrency,
      currency: "INR"
    });
  };

  const formatCustomerPaid = (order, amountKey = "total", fallbackValue = order?.total || 0) =>
    formatOrderDisplayCurrency(order, amountKey, fallbackValue, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
      fallbackToUserCurrency: true
    });

  const getPaymentCountry = (order) => {
    const detectedCountry = String(order?.currencyDisplay?.detectedCountry || "").trim().toUpperCase();
    const shippingCountry = String(order?.shipping?.country || "").trim();
    if (detectedCountry) return detectedCountry;
    return shippingCountry || "Unknown";
  };

  const getCapturedCurrencyLabel = (order) => {
    const explicitCurrency = String(order?.currencyDisplay?.currency || order?.displayCurrency || order?.currency || "")
      .trim()
      .toUpperCase();
    if (explicitCurrency) return `Captured ${explicitCurrency}`;

    const paymentCountry = getPaymentCountry(order);
    const normalizedCountry = String(paymentCountry || "").trim().toUpperCase();
    const inferredCurrencyMap = {
      IN: "INR",
      INDIA: "INR",
      US: "USD",
      USA: "USD",
      "UNITED STATES": "USD",
      GB: "GBP",
      UK: "GBP",
      "UNITED KINGDOM": "GBP",
      CA: "CAD",
      CANADA: "CAD",
      AU: "AUD",
      AUSTRALIA: "AUD",
      SG: "SGD",
      SINGAPORE: "SGD",
      AE: "AED",
      UAE: "AED",
      "UNITED ARAB EMIRATES": "AED",
      DE: "EUR",
      FR: "EUR",
      IT: "EUR",
      ES: "EUR",
      NL: "EUR",
      IE: "EUR",
      PT: "EUR",
      BE: "EUR"
    };

    return `Captured ${inferredCurrencyMap[normalizedCountry] || "INR"}`;
  };

  const getCustomerName = (order) => order?.user?.name || order?.shipping?.name || "Unknown customer";

  const getCustomerInitials = (order) => {
    const name = getCustomerName(order);
    return (
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("") || "U"
    );
  };

  const getItemCount = (order) =>
    (order?.items || []).reduce((sum, item) => sum + Number(item?.quantity || 1), 0);

  const formatOrderDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Date unavailable";
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />

      <main className="admin-main admin-orders-page">
        <div className="admin-orders-header">
          <div>
            <p className="admin-orders-kicker">Operations</p>
            <h1>Orders</h1>
            <p className="admin-orders-subtitle">
              Monitor customer payments, fulfillment progress, and store totals from one place.
            </p>
          </div>
          <div className="admin-orders-header-actions">
            <span className="admin-orders-count">
              Showing {orders.length > 0 ? (currentPage - 1) * 20 + 1 : 0} - {Math.min(currentPage * 20, totalOrders)} of {totalOrders}
            </span>
            <button className="export-btn" onClick={exportOrdersCsv}>
              <Icon name="export" />
              Export CSV
            </button>
          </div>
        </div>

        {pageMessage ? <p className="admin-orders-feedback">{pageMessage}</p> : null}

        <section className="admin-orders-overview" aria-label="Orders summary">
          <article className="admin-overview-card">
            <p className="admin-overview-label">Visible Orders</p>
            <p className="admin-overview-value">{overviewStats.totalOrders}</p>
          </article>
          {canViewRevenue ? (
            <article className="admin-overview-card">
              <p className="admin-overview-label">Visible Revenue</p>
              <p className="admin-overview-value">{formatMoney(overviewStats.totalRevenue)}</p>
            </article>
          ) : null}
          <article className="admin-overview-card">
            <p className="admin-overview-label">Payment Follow-up</p>
            <p className="admin-overview-value">{overviewStats.pendingPayments}</p>
          </article>
          <article className="admin-overview-card">
            <p className="admin-overview-label">Fulfilled Orders</p>
            <p className="admin-overview-value">{overviewStats.fulfilledOrders}</p>
          </article>
        </section>

        <section className="status-management-panel" aria-label="Status filters">
          <button
            className={selectedStatus === "All" ? "status-filter-chip active" : "status-filter-chip"}
            onClick={() => setSelectedStatus("All")}
          >
            All ({statusCounts.All || 0})
          </button>
          <button
            className={selectedStatus === RETURN_FILTER_KEY ? "status-filter-chip active" : "status-filter-chip"}
            onClick={() => setSelectedStatus(RETURN_FILTER_KEY)}
          >
            Return Requests ({statusCounts[RETURN_FILTER_KEY] || 0})
          </button>
          {DISPLAY_STATUSES.map((status) => (
            <button
              key={status}
              className={selectedStatus === status ? "status-filter-chip active" : "status-filter-chip"}
              onClick={() => setSelectedStatus(status)}
            >
              {status} ({statusCounts[status] || 0})
            </button>
          ))}
        </section>

        <section className="orders-filter-bar" aria-label="Order filters">
          <label className="orders-search-field">
            <span>Search orders</span>
            <span className="orders-search-input-wrap">
              <Icon name="search" />
              <input
                type="search"
                placeholder="Order ID, customer, email, item..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </span>
          </label>

          <div className="quick-filter-buttons" aria-label="Quick date filters">
            <button
              className={activeQuickFilter === "24h" ? "quick-filter-btn active" : "quick-filter-btn"}
              onClick={() => applyQuickFilter("24h")}
            >
              Last 24h
            </button>
            <button
              className={activeQuickFilter === "7d" ? "quick-filter-btn active" : "quick-filter-btn"}
              onClick={() => applyQuickFilter("7d")}
            >
              Last 7 Days
            </button>
            <button
              className={activeQuickFilter === "month" ? "quick-filter-btn active" : "quick-filter-btn"}
              onClick={() => applyQuickFilter("month")}
            >
              This Month
            </button>
          </div>

          <div className="orders-date-grid">
            <label>
              <span>From</span>
              <input
                type="datetime-local"
                value={fromDateTime}
                onChange={(e) => {
                  setFromDateTime(e.target.value);
                  setActiveQuickFilter("");
                }}
              />
            </label>
            <label>
              <span>To</span>
              <input
                type="datetime-local"
                value={toDateTime}
                onChange={(e) => {
                  setToDateTime(e.target.value);
                  setActiveQuickFilter("");
                }}
              />
            </label>
          </div>

          <label className="orders-sort-field">
            <span>Sort</span>
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
          </label>

          <button
            className="clear-filter-btn"
            onClick={() => {
              setFromDateTime("");
              setToDateTime("");
              setActiveQuickFilter("");
              setSearchText("");
            }}
          >
            <Icon name="reset" />
            Reset
          </button>
        </section>

        {!isLoadingOrders && orders.length === 0 && (
          <section className="admin-orders-empty">
            <h2>No orders found</h2>
            <p>Try a different status, search term, or date range.</p>
          </section>
        )}

        {isLoadingOrders && (
          <div className="admin-orders-table-wrap">
            <table className="admin-orders-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Country</th>
                  <th>Items</th>
                  <th>Customer Paid</th>
                  <th>Store Total</th>
                  <th>Payment</th>
                  <th>Fulfillment</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={`orders-skeleton-${idx}`}>
                    <td><span className="skeleton-block" /></td>
                    <td><span className="skeleton-block" /></td>
                    <td><span className="skeleton-block" /></td>
                    <td><span className="skeleton-block" /></td>
                    <td><span className="skeleton-block" /></td>
                    <td><span className="skeleton-block" /></td>
                    <td><span className="skeleton-block" /></td>
                    <td><span className="skeleton-block" /></td>
                    <td><span className="skeleton-block" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoadingOrders && orders.length > 0 && (
          <div className="admin-orders-table-wrap">
            <table className="admin-orders-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Country</th>
                  <th>Items</th>
                  <th>Customer Paid</th>
                  <th>Store Total</th>
                  <th>Payment</th>
                  <th>Fulfillment</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const displayStatus = getDisplayStatus(order);
                  const statusKey = displayStatus.toLowerCase().replace(/\s+/g, "-");
                  const paymentStatus = getPaymentStatus(order);
                  const isCancelled = displayStatus === "Cancelled";
                  const canProgressStatus = paymentStatus === "Paid" && !isCancelled;
                  const productCount = getItemCount(order);
                  const returnItems = Array.isArray(order?.items)
                    ? order.items.filter((item) => getReturnStatus(item) !== "Not Requested")
                    : [];
                  return (
                    <tr key={order._id}>
                      <td className="order-code">
                        <Link to={`/admin/orders/${order._id}`} className="order-code-link">
                          #{order._id.slice(-6).toUpperCase()}
                        </Link>
                        <span>{formatOrderDate(order.createdAt)}</span>
                        {order.lastUpdatedAt ? (
                          <small style={{ display: "block", marginTop: "6px", color: "var(--admin-muted)" }}>
                            Last updated by {order.lastUpdatedByName || order.lastUpdatedByEmail || "Admin"} on{" "}
                            {formatDate(order.lastUpdatedAt)} {formatTime(order.lastUpdatedAt)}
                          </small>
                        ) : null}
                      </td>
                      <td>
                        <div className="admin-order-customer">
                          <span className="admin-order-avatar">{getCustomerInitials(order)}</span>
                          <span className="admin-order-customer-text">
                            <strong>{getCustomerName(order)}</strong>
                            <small>{order.user?.email || "-"}</small>
                          </span>
                        </div>
                      </td>
                      <td className="admin-order-country-cell">
                        <strong>{getPaymentCountry(order)}</strong>
                        <small>{order?.currencyDisplay?.detectedCountry ? "Detected" : "Shipping"}</small>
                      </td>
                      <td>
                        <span className="admin-order-items-count">{productCount}</span>
                      </td>
                      <td className="admin-order-amount-cell">
                        <strong>{formatCustomerPaid(order)}</strong>
                        <small>{getCapturedCurrencyLabel(order)}</small>
                      </td>
                      <td className="admin-order-amount-cell">
                        <strong>{formatMoney(getOrderBaseTotal(order))}</strong>
                        <small>INR base</small>
                      </td>
                      <td>
                        <div className="admin-order-payment-cell">
                          <span className={`admin-order-status status-payment-${paymentStatus.toLowerCase()}`}>
                            {paymentStatus === "Refunded"
                              ? "Refunded"
                              : paymentStatus === "Paid"
                                ? "Paid"
                                : paymentStatus === "Failed"
                                  ? "Failed"
                                  : "Not Paid"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="admin-status-update">
                          <div className="order-status-tracker">
                            {DISPLAY_STATUSES.filter((status) => {
                              if (status === "Cancelled") return isCancelled;
                              return true;
                            }).map((status, index) => {
                              const active = statusStep[displayStatus] >= index;
                              const isCurrent = displayStatus === status;
                              return (
                                <div key={`${order._id}-${status}`} className="order-status-step">
                                  <span className={active ? "tracker-dot active" : "tracker-dot"} />
                                  <span className={isCurrent ? "tracker-label current" : "tracker-label"}>
                                    {status}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          <div className="status-controls">
                            <span className={`admin-order-status status-${statusKey}`}>
                              {displayStatus}
                            </span>
                            {displayStatus === "Delivered" && order.deliveredAt && (
                              <small style={{ display: "block", marginTop: "4px", color: "#16a34a", fontWeight: "600" }}>
                                Delivered: {formatDate(order.deliveredAt)}
                              </small>
                            )}
                            {canUpdateOrders && displayStatus === "On Hold" && (
                              <button
                                className="status-action-btn"
                                disabled
                                title="Waiting for successful payment"
                              >
                                Move to Pending
                              </button>
                            )}
                            {canUpdateOrders && displayStatus === "Pending" && canProgressStatus && (
                              <button
                                className="status-action-btn"
                                disabled={updatingOrderId === order._id}
                                onClick={() => updateStatus(order._id, "Shipped")}
                              >
                                {updatingOrderId === order._id ? "Updating..." : "Mark Shipped"}
                              </button>
                            )}
                            {canUpdateOrders && displayStatus === "Shipped" && canProgressStatus && (
                              <button
                                className="status-action-btn"
                                disabled={updatingOrderId === order._id}
                                onClick={() => updateStatus(order._id, "Delivered")}
                              >
                                {updatingOrderId === order._id ? "Updating..." : "Mark Delivered"}
                              </button>
                            )}
                            {canUpdateOrders && ["On Hold", "Pending"].includes(displayStatus) && (
                              <button
                                className="status-action-btn cancel"
                                disabled={updatingOrderId === order._id}
                                onClick={() => updateStatus(order._id, "Cancelled")}
                              >
                                {updatingOrderId === order._id ? "Updating..." : "Cancel"}
                              </button>
                            )}
                            {!canProgressStatus ? (
                              <p className="admin-status-note">
                                {isCancelled
                                  ? `Refund: ${order?.refundStatus || "Not Applicable"}`
                                  : paymentStatus === "Failed"
                                    ? "Payment failed"
                                    : "Waiting for successful payment"}
                              </p>
                            ) : null}
                            {returnItems.length > 0 ? (
                              <div className="admin-return-panel">
                                {returnItems.map((item) => {
                                  const itemId = String(item?._id || item?.id || item?.product || "").trim();
                                  const returnStatus = getReturnStatus(item);
                                  return (
                                    <div key={`${order._id}-${itemId}`} className="admin-return-item">
                                      <span className={`admin-order-status status-return-${returnStatus.toLowerCase().replace(/\s+/g, "-")}`}>
                                        {item?.name || "Item"}: {returnStatus}
                                      </span>
                                      {item?.returnRequest?.reason ? (
                                        <p className="admin-status-note">Reason: {item.returnRequest.reason}</p>
                                      ) : null}
                                      {item?.returnRequest?.adminReason ? (
                                        <p className="admin-status-note">Admin note: {item.returnRequest.adminReason}</p>
                                      ) : null}
                                      {canUpdateOrders && returnStatus === "Requested" ? (
                                        <div className="admin-return-actions">
                                          <button
                                            className="status-action-btn"
                                            disabled={updatingOrderId === order._id}
                                            onClick={() => updateReturnStatus(order._id, itemId, "Approved")}
                                          >
                                            {updatingOrderId === order._id ? "Updating..." : "Approve Return"}
                                          </button>
                                          <button
                                            className="status-action-btn cancel"
                                            disabled={updatingOrderId === order._id}
                                            onClick={() => updateReturnStatus(order._id, itemId, "Rejected")}
                                          >
                                            {updatingOrderId === order._id ? "Updating..." : "Reject"}
                                          </button>
                                        </div>
                                      ) : null}
                                      {canUpdateOrders && returnStatus === "Approved" ? (
                                        <button
                                          className="status-action-btn"
                                          disabled={updatingOrderId === order._id}
                                          onClick={() => updateReturnStatus(order._id, itemId, "Refunded")}
                                        >
                                          {updatingOrderId === order._id ? "Updating..." : "Mark Refunded"}
                                        </button>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                            <select
                              id={`status-${order._id}`}
                              value={displayStatus}
                              disabled={!canUpdateOrders || updatingOrderId === order._id || !canProgressStatus}
                              onChange={(e) => updateStatus(order._id, e.target.value)}
                            >
                              {displayStatus === "On Hold" ? <option value="On Hold">On Hold</option> : null}
                              <option value="Pending">Pending</option>
                              <option value="Shipped">Shipped</option>
                              <option value="Delivered">Delivered</option>
                              <option value="Cancelled">Cancelled</option>
                            </select>
                          </div>
                        </div>
                      </td>
                      <td className="admin-order-actions">
                        <Link
                          to={`/admin/orders/${order._id}`}
                          className="admin-order-icon-btn"
                          title="View order"
                          aria-label="View order"
                        >
                          <Icon name="view" />
                        </Link>
                        <button
                          className="admin-order-icon-btn"
                          disabled={generatingInvoiceOrderId === order._id}
                          onClick={() => void generateInvoice(order)}
                          title={generatingInvoiceOrderId === order._id ? "Generating invoice" : "Generate invoice"}
                          aria-label={generatingInvoiceOrderId === order._id ? "Generating invoice" : "Generate invoice"}
                        >
                          <Icon name="invoice" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="admin-pagination-container">
            <button
              className="pagination-btn"
              disabled={currentPage === 1 || isLoadingOrders}
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            >
              Previous
            </button>
            <span className="pagination-info">
              Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
            </span>
            <button
              className="pagination-btn"
              disabled={currentPage === totalPages || isLoadingOrders}
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Next
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default AdminOrders;
