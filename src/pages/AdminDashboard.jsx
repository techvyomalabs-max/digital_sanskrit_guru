import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../hooks/useAuth";
import AdminSidebar from "../components/admin/AdminSidebar";
import SalesChart from "../components/SalesChart";
import { formatDate, formatTime } from "../utils/date";
import {
  normalizeDistancePricing,
  normalizeWarehouseLocation,
  parseGoogleMapsCoordinates
} from "../utils/deliveryPricing";
import "./AdminDashboard.css";

const LOW_STOCK_THRESHOLD = 5;

function normalizeStatus(status) {
  if (status === "Shipped" || status === "Delivered") return status;
  return "Pending";
}

function formatCurrency(value) {
  return `Rs ${Math.round(Number(value) || 0).toLocaleString("en-IN")}`;
}

function formatPercent(value) {
  return `${Math.round(Number(value) || 0)}%`;
}

function AdminDashboard() {
  const { token } = useAuth();
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [orderLoadError, setOrderLoadError] = useState("");
  const [dismissedNotifications, setDismissedNotifications] = useState([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [pricingSettings, setPricingSettings] = useState({
    gstPercent: 0,
    deliveryCharge: 0,
    warehouseLocation: {
      name: "",
      address: "",
      mapUrl: "",
      latitude: "",
      longitude: ""
    },
    distancePricing: {
      enabled: true,
      baseFee: 0,
      perKmCharge: 0,
      freeRadiusKm: 0,
      maxCharge: ""
    }
  });
  const [isSavingPricing, setIsSavingPricing] = useState(false);
  const [isGettingWarehouseLocation, setIsGettingWarehouseLocation] = useState(false);
  const [pricingMessage, setPricingMessage] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [isMakingAdmin, setIsMakingAdmin] = useState(false);
  const [makeAdminMessage, setMakeAdminMessage] = useState("");

  useEffect(() => {
    let active = true;

    const loadDashboard = async (silent = false) => {
      if (!silent && active) {
        setIsRefreshing(true);
      }

      try {
        const [productRes, orderRes] = await Promise.all([
          axios.get("/api/products"),
          axios.get("/api/orders", {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);
        if (!active) return;
        setProducts(productRes.data);
        setOrders(orderRes.data);
        setOrderLoadError("");
        setLastUpdatedAt(new Date());
      } catch {
        if (!active) return;
        setProducts([]);
        setOrders([]);
        setOrderLoadError("Could not load orders. Top selling products may be unavailable.");
      } finally {
        if (active) {
          setIsInitialLoading(false);
        }
        if (!silent && active) {
          setIsRefreshing(false);
        }
      }
    };

    loadDashboard();
    const pollId = setInterval(() => {
      loadDashboard(true);
    }, 15000);

    return () => {
      active = false;
      clearInterval(pollId);
    };
  }, [token]);

  useEffect(() => {
    let active = true;
    axios
      .get("/api/settings")
      .then((res) => {
        if (!active) return;
        setPricingSettings({
          gstPercent: String(Number(res.data?.gstPercent || 0)),
          deliveryCharge: String(Number(res.data?.deliveryCharge || 0)),
          warehouseLocation: {
            name: String(res.data?.warehouseLocation?.name || ""),
            address: String(res.data?.warehouseLocation?.address || ""),
            mapUrl: String(res.data?.warehouseLocation?.mapUrl || ""),
            latitude:
              res.data?.warehouseLocation?.latitude === null || res.data?.warehouseLocation?.latitude === undefined
                ? ""
                : String(res.data.warehouseLocation.latitude),
            longitude:
              res.data?.warehouseLocation?.longitude === null || res.data?.warehouseLocation?.longitude === undefined
                ? ""
                : String(res.data.warehouseLocation.longitude)
          },
          distancePricing: {
            enabled: res.data?.distancePricing?.enabled !== false,
            baseFee: String(Number(res.data?.distancePricing?.baseFee ?? res.data?.deliveryCharge ?? 0)),
            perKmCharge: String(Number(res.data?.distancePricing?.perKmCharge || 0)),
            freeRadiusKm: String(Number(res.data?.distancePricing?.freeRadiusKm || 0)),
            maxCharge:
              res.data?.distancePricing?.maxCharge === null || res.data?.distancePricing?.maxCharge === undefined
                ? ""
                : String(Number(res.data.distancePricing.maxCharge))
          }
        });
      })
      .catch(() => {
        if (!active) return;
        setPricingSettings({
          gstPercent: "0",
          deliveryCharge: "0",
          warehouseLocation: { name: "", address: "", mapUrl: "", latitude: "", longitude: "" },
          distancePricing: { enabled: true, baseFee: "0", perKmCharge: "0", freeRadiusKm: "0", maxCharge: "" }
        });
      });

    return () => {
      active = false;
    };
  }, []);

  const savePricingSettings = async () => {
    setIsSavingPricing(true);
    setPricingMessage("");
    try {
      const payload = {
        gstPercent: Math.max(0, Number(pricingSettings.gstPercent || 0)),
        deliveryCharge: Math.max(0, Number(pricingSettings.deliveryCharge || 0)),
        warehouseLocation: normalizeWarehouseLocation(pricingSettings.warehouseLocation),
        distancePricing: normalizeDistancePricing(pricingSettings.distancePricing, pricingSettings.deliveryCharge)
      };

      const res = await axios.put("/api/settings", payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setPricingSettings({
        gstPercent: String(Number(res.data?.gstPercent || 0)),
        deliveryCharge: String(Number(res.data?.deliveryCharge || 0)),
        warehouseLocation: {
          name: String(res.data?.warehouseLocation?.name || ""),
          address: String(res.data?.warehouseLocation?.address || ""),
          mapUrl: String(res.data?.warehouseLocation?.mapUrl || ""),
          latitude:
            res.data?.warehouseLocation?.latitude === null || res.data?.warehouseLocation?.latitude === undefined
              ? ""
              : String(res.data.warehouseLocation.latitude),
          longitude:
            res.data?.warehouseLocation?.longitude === null || res.data?.warehouseLocation?.longitude === undefined
              ? ""
              : String(res.data.warehouseLocation.longitude)
        },
        distancePricing: {
          enabled: res.data?.distancePricing?.enabled !== false,
          baseFee: String(Number(res.data?.distancePricing?.baseFee ?? res.data?.deliveryCharge ?? 0)),
          perKmCharge: String(Number(res.data?.distancePricing?.perKmCharge || 0)),
          freeRadiusKm: String(Number(res.data?.distancePricing?.freeRadiusKm || 0)),
          maxCharge:
            res.data?.distancePricing?.maxCharge === null || res.data?.distancePricing?.maxCharge === undefined
              ? ""
              : String(Number(res.data.distancePricing.maxCharge))
        }
      });
      setPricingMessage("Pricing settings updated.");
    } catch (err) {
      setPricingMessage(err?.response?.data?.message || "Could not save pricing settings.");
    } finally {
      setIsSavingPricing(false);
    }
  };

  const updateWarehouseField = (field, value) => {
    setPricingSettings((prev) => ({
      ...prev,
      warehouseLocation: { ...prev.warehouseLocation, [field]: value }
    }));
  };

  const updateDistancePricingField = (field, value) => {
    setPricingSettings((prev) => ({
      ...prev,
      distancePricing: { ...prev.distancePricing, [field]: value }
    }));
  };

  const applyGoogleMapsLocation = () => {
    const parsed = parseGoogleMapsCoordinates(pricingSettings.warehouseLocation.mapUrl);

    if (!parsed) {
      setPricingMessage("Could not read coordinates from the Google Maps link.");
      return;
    }

    setPricingSettings((prev) => ({
      ...prev,
      warehouseLocation: {
        ...prev.warehouseLocation,
        latitude: String(parsed.latitude),
        longitude: String(parsed.longitude)
      }
    }));
    setPricingMessage("Warehouse coordinates extracted from Google Maps link.");
  };

  const useCurrentWarehouseLocation = () => {
    if (!navigator.geolocation) {
      setPricingMessage("Geolocation is not supported on this device.");
      return;
    }

    setIsGettingWarehouseLocation(true);
    setPricingMessage("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPricingSettings((prev) => ({
          ...prev,
          warehouseLocation: {
            ...prev.warehouseLocation,
            latitude: String(position?.coords?.latitude ?? ""),
            longitude: String(position?.coords?.longitude ?? "")
          }
        }));
        setPricingMessage("Warehouse coordinates updated from current location.");
        setIsGettingWarehouseLocation(false);
      },
      () => {
        setPricingMessage("Could not get the current location for the warehouse.");
        setIsGettingWarehouseLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const makeUserAdmin = async () => {
    const email = String(adminEmail || "").trim().toLowerCase();
    if (!email) {
      setMakeAdminMessage("Enter user email.");
      return;
    }

    setIsMakingAdmin(true);
    setMakeAdminMessage("");
    try {
      const res = await axios.put(
        "/api/auth/make-admin",
        { email },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMakeAdminMessage(res?.data?.message || "User promoted to admin.");
      setAdminEmail("");
    } catch (err) {
      setMakeAdminMessage(err?.response?.data?.message || "Could not make user admin.");
    } finally {
      setIsMakingAdmin(false);
    }
  };

  const topProducts = useMemo(() => {
    const salesByName = orders.reduce((acc, order) => {
      (order.items || []).forEach((item) => {
        const itemName = String(item?.name || item?.product?.name || item?.title || "").trim();
        if (!itemName) return;
        acc[itemName] = (acc[itemName] || 0) + Number(item?.quantity || 1);
      });
      return acc;
    }, {});

    return Object.entries(salesByName)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [orders]);

  const analytics = useMemo(() => {
    const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const totalQuantity = orders.reduce((sum, order) => {
      return sum + (order.items || []).reduce((itemSum, item) => itemSum + Number(item.quantity || 1), 0);
    }, 0);
    const averageOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;
    const statuses = orders.reduce(
      (acc, order) => {
        acc[normalizeStatus(order?.status)] += 1;
        return acc;
      },
      { Pending: 0, Shipped: 0, Delivered: 0 }
    );
    const customers = orders.reduce((acc, order) => {
      const key = String(order?.user?._id || order?.user?.email || order?.shipping?.phone || "").trim();
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const uniqueCustomers = Object.keys(customers).length;
    const repeatCustomers = Object.values(customers).filter((count) => count > 1).length;

    return {
      totalRevenue,
      totalQuantity,
      averageOrderValue,
      statuses,
      uniqueCustomers,
      repeatCustomers,
      repeatRate: uniqueCustomers > 0 ? (repeatCustomers / uniqueCustomers) * 100 : 0
    };
  }, [orders]);

  const revenueKpis = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const last7d = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const last30d = now.getTime() - 30 * 24 * 60 * 60 * 1000;

    return orders.reduce(
      (acc, order) => {
        const orderTs = new Date(order?.createdAt).getTime();
        const total = Number(order?.total || 0);
        if (Number.isNaN(orderTs)) return acc;

        if (orderTs >= startOfToday) acc.today += total;
        if (orderTs >= last7d) acc.last7Days += total;
        if (orderTs >= last30d) acc.last30Days += total;
        acc.total += total;
        return acc;
      },
      { today: 0, last7Days: 0, last30Days: 0, total: 0 }
    );
  }, [orders]);

  const lowStockProducts = useMemo(() => {
    return products
      .filter((product) => Number(product?.stock ?? 0) <= LOW_STOCK_THRESHOLD)
      .sort((a, b) => Number(a?.stock ?? 0) - Number(b?.stock ?? 0))
      .slice(0, 6);
  }, [products]);

  const aiPredictions = useMemo(() => {
    const monthlyRevenueMap = orders.reduce((acc, order) => {
      const date = new Date(order?.createdAt);
      if (Number.isNaN(date.getTime())) return acc;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      acc[key] = (acc[key] || 0) + Number(order?.total || 0);
      return acc;
    }, {});

    const monthlyPoints = Object.entries(monthlyRevenueMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([, value], index) => ({ x: index, y: Number(value || 0) }));

    if (monthlyPoints.length < 2) {
      const fallback = monthlyPoints[monthlyPoints.length - 1]?.y || 0;
      return {
        nextMonthRevenue: fallback,
        confidence: 42,
        trend: "Insufficient data",
        monthlyPoints: monthlyPoints.map((point) => point.y)
      };
    }

    const n = monthlyPoints.length;
    const sumX = monthlyPoints.reduce((sum, point) => sum + point.x, 0);
    const sumY = monthlyPoints.reduce((sum, point) => sum + point.y, 0);
    const sumXY = monthlyPoints.reduce((sum, point) => sum + point.x * point.y, 0);
    const sumX2 = monthlyPoints.reduce((sum, point) => sum + point.x * point.x, 0);
    const denominator = n * sumX2 - sumX * sumX;
    const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;
    const nextX = n;
    const predicted = Math.max(0, intercept + slope * nextX);

    const avgAbsDelta =
      monthlyPoints.slice(1).reduce((sum, point, idx) => {
        return sum + Math.abs(point.y - monthlyPoints[idx].y);
      }, 0) /
      Math.max(1, monthlyPoints.length - 1);
    const volatility = sumY > 0 ? Math.min(1, avgAbsDelta / (sumY / n || 1)) : 1;
    const confidence = Math.max(35, Math.round((1 - volatility) * 100));

    return {
      nextMonthRevenue: predicted,
      confidence,
      trend: slope > 0 ? "Upward trend" : slope < 0 ? "Downward trend" : "Stable trend",
      monthlyPoints: monthlyPoints.map((point) => point.y)
    };
  }, [orders]);

  const advancedAnalytics = useMemo(() => {
    const now = new Date();
    const last30Start = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    const prev30Start = now.getTime() - 60 * 24 * 60 * 60 * 1000;

    const last30 = orders.filter((order) => new Date(order?.createdAt).getTime() >= last30Start);
    const prev30 = orders.filter((order) => {
      const ts = new Date(order?.createdAt).getTime();
      return ts >= prev30Start && ts < last30Start;
    });

    const last30Revenue = last30.reduce((sum, order) => sum + Number(order?.total || 0), 0);
    const prev30Revenue = prev30.reduce((sum, order) => sum + Number(order?.total || 0), 0);
    const revenueGrowth =
      prev30Revenue > 0 ? ((last30Revenue - prev30Revenue) / prev30Revenue) * 100 : last30Revenue > 0 ? 100 : 0;

    const statusCounts = orders.reduce(
      (acc, order) => {
        const status = normalizeStatus(order?.status);
        acc[status] += 1;
        return acc;
      },
      { Pending: 0, Shipped: 0, Delivered: 0 }
    );

    const weekdayRevenue = orders.reduce((acc, order) => {
      const date = new Date(order?.createdAt);
      if (Number.isNaN(date.getTime())) return acc;
      const day = date.toLocaleDateString("en-IN", { weekday: "short" });
      acc[day] = (acc[day] || 0) + Number(order?.total || 0);
      return acc;
    }, {});
    const weekdaySeries = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => ({
      day,
      value: weekdayRevenue[day] || 0
    }));

    const customerSpendMap = orders.reduce((acc, order) => {
      const name = String(order?.user?.name || order?.shipping?.name || "Customer").trim();
      acc[name] = (acc[name] || 0) + Number(order?.total || 0);
      return acc;
    }, {});
    const topCustomerEntry = Object.entries(customerSpendMap).sort((a, b) => b[1] - a[1])[0];

    return {
      last30Revenue,
      prev30Revenue,
      revenueGrowth,
      statusCounts,
      weekdaySeries,
      topCustomer: topCustomerEntry ? { name: topCustomerEntry[0], spend: topCustomerEntry[1] } : null
    };
  }, [orders]);

  const notifications = useMemo(() => {
    const list = [];
    if (analytics.statuses.Pending >= 5) {
      list.push({
        id: "pending",
        type: "warning",
        text: `${analytics.statuses.Pending} orders are still pending shipment.`
      });
    }
    if (lowStockProducts.length > 0) {
      list.push({
        id: "low-stock",
        type: "alert",
        text: `${lowStockProducts.length} products are low on stock.`
      });
    }
    if (analytics.repeatRate >= 30) {
      list.push({
        id: "repeat-customers",
        type: "success",
        text: `Repeat customer rate is ${Math.round(analytics.repeatRate)}%.`
      });
    }
    return list.filter((item) => !dismissedNotifications.includes(item.id));
  }, [analytics.statuses.Pending, analytics.repeatRate, dismissedNotifications, lowStockProducts.length]);

  return (
    <div className="admin-layout">
      <AdminSidebar />

      <main className="admin-main">
        <div className="admin-header">
          <div>
            <h1>Admin Dashboard</h1>
            <p style={{ margin: "6px 0 0", fontSize: "13px", color: "var(--admin-muted)" }}>
              Live sales updates every 15s
              {isRefreshing ? " | Refreshing..." : ""}
              {lastUpdatedAt ? ` | Last update: ${formatTime(lastUpdatedAt)}` : ""}
            </p>
          </div>
          <Link className="admin-header-link-btn" to="/admin/theme">
            Theme Settings
          </Link>
        </div>

        <section className="card pricing-controls-card">
          <div className="pricing-controls-header">
            <div>
              <h3>Tax & Delivery Controls</h3>
              <p>Configure pricing rules applied automatically at checkout.</p>
            </div>
            <span className="pricing-badge">Live Pricing</span>
          </div>

          <div className="pricing-preview-row">
            <div className="pricing-preview-chip">
              <span>Current GST</span>
              <strong>{Number(pricingSettings.gstPercent || 0)}%</strong>
            </div>
            <div className="pricing-preview-chip">
              <span>Fallback Delivery</span>
              <strong>{formatCurrency(Number(pricingSettings.deliveryCharge || 0))}</strong>
            </div>
            <div className="pricing-preview-chip">
              <span>Rate / KM</span>
              <strong>{formatCurrency(Number(pricingSettings.distancePricing.perKmCharge || 0))}</strong>
            </div>
          </div>

          <div className="pricing-controls-grid">
            <label className="pricing-field">
              <span className="pricing-label">GST Rate</span>
              <span className="pricing-hint">Tax percentage applied on subtotal</span>
              <div className="pricing-input-wrap">
              <input
                type="number"
                min="0"
                max="50"
                step="0.1"
                value={pricingSettings.gstPercent}
                onChange={(e) =>
                  setPricingSettings((prev) => ({ ...prev, gstPercent: e.target.value }))
                }
              />
                <em>%</em>
              </div>
            </label>
            <label className="pricing-field">
              <span className="pricing-label">Fallback Delivery Fee</span>
              <span className="pricing-hint">Used when warehouse or customer coordinates are missing</span>
              <div className="pricing-input-wrap">
              <input
                type="number"
                min="0"
                step="1"
                value={pricingSettings.deliveryCharge}
                onChange={(e) =>
                  setPricingSettings((prev) => ({ ...prev, deliveryCharge: e.target.value }))
                }
              />
                <em>Flat</em>
              </div>
            </label>
          </div>

          <div className="distance-pricing-section">
            <div className="distance-pricing-header">
              <div>
                <h4>Warehouse Location</h4>
                <p>Distance-based delivery uses the warehouse coordinates and customer coordinates.</p>
              </div>
              <button
                type="button"
                className="pricing-link-btn"
                onClick={useCurrentWarehouseLocation}
                disabled={isGettingWarehouseLocation}
              >
                {isGettingWarehouseLocation ? "Getting Location..." : "Use Current Location"}
              </button>
            </div>

            <div className="distance-pricing-grid">
              <label className="pricing-field">
                <span className="pricing-label">Warehouse Name</span>
                <input
                  type="text"
                  placeholder="e.g. Digital Sanskrit Guru Warehouse"
                  value={pricingSettings.warehouseLocation.name}
                  onChange={(e) => updateWarehouseField("name", e.target.value)}
                />
              </label>

              <label className="pricing-field pricing-field-wide">
                <span className="pricing-label">Warehouse Address</span>
                <input
                  type="text"
                  placeholder="e.g. Noida, Uttar Pradesh"
                  value={pricingSettings.warehouseLocation.address}
                  onChange={(e) => updateWarehouseField("address", e.target.value)}
                />
              </label>

              <label className="pricing-field pricing-field-wide">
                <span className="pricing-label">Google Maps Link</span>
                <div className="warehouse-map-url-row">
                  <input
                    type="text"
                    placeholder="Paste Google Maps location link"
                    value={pricingSettings.warehouseLocation.mapUrl}
                    onChange={(e) => updateWarehouseField("mapUrl", e.target.value)}
                  />
                  <button type="button" className="pricing-link-btn" onClick={applyGoogleMapsLocation}>
                    Use Maps Link
                  </button>
                </div>
              </label>

              <label className="pricing-field">
                <span className="pricing-label">Warehouse Latitude</span>
                <input
                  type="number"
                  step="any"
                  placeholder="28.6139"
                  value={pricingSettings.warehouseLocation.latitude}
                  onChange={(e) => updateWarehouseField("latitude", e.target.value)}
                />
              </label>

              <label className="pricing-field">
                <span className="pricing-label">Warehouse Longitude</span>
                <input
                  type="number"
                  step="any"
                  placeholder="77.2090"
                  value={pricingSettings.warehouseLocation.longitude}
                  onChange={(e) => updateWarehouseField("longitude", e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="distance-pricing-section">
            <div className="distance-pricing-header">
              <div>
                <h4>Distance Pricing Formula</h4>
                <p>Final delivery fee = base fee + ((distance - free radius) x rate per km).</p>
              </div>
            </div>

            <div className="distance-pricing-grid">
              <label className="pricing-field">
                <span className="pricing-label">Distance Pricing</span>
                <select
                  value={pricingSettings.distancePricing.enabled ? "enabled" : "disabled"}
                  onChange={(e) => updateDistancePricingField("enabled", e.target.value === "enabled")}
                >
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>

              <label className="pricing-field">
                <span className="pricing-label">Base Fee</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={pricingSettings.distancePricing.baseFee}
                  onChange={(e) => updateDistancePricingField("baseFee", e.target.value)}
                />
              </label>

              <label className="pricing-field">
                <span className="pricing-label">Per KM Charge</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={pricingSettings.distancePricing.perKmCharge}
                  onChange={(e) => updateDistancePricingField("perKmCharge", e.target.value)}
                />
              </label>

              <label className="pricing-field">
                <span className="pricing-label">Free Radius (KM)</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={pricingSettings.distancePricing.freeRadiusKm}
                  onChange={(e) => updateDistancePricingField("freeRadiusKm", e.target.value)}
                />
              </label>

              <label className="pricing-field">
                <span className="pricing-label">Maximum Charge</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Optional"
                  value={pricingSettings.distancePricing.maxCharge}
                  onChange={(e) => updateDistancePricingField("maxCharge", e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="pricing-actions-row">
            <button className="pricing-save-btn" onClick={savePricingSettings} disabled={isSavingPricing}>
              {isSavingPricing ? "Saving..." : "Save Charges"}
            </button>
            <span>Changes apply to all new orders immediately.</span>
          </div>
          {pricingMessage && (
            <p className={`pricing-message ${pricingMessage.includes("updated") ? "success" : "error"}`}>
              {pricingMessage}
            </p>
          )}
        </section>

        <section className="card make-admin-card">
          <div className="make-admin-header">
            <h3>Admin Access Control</h3>
            <p>Promote an existing user to admin by email.</p>
          </div>
          <div className="make-admin-form">
            <input
              type="email"
              placeholder="Enter user email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
            />
            <button onClick={makeUserAdmin} disabled={isMakingAdmin}>
              {isMakingAdmin ? "Updating..." : "Make Admin"}
            </button>
          </div>
          {makeAdminMessage && <p className="make-admin-message">{makeAdminMessage}</p>}
        </section>

        {notifications.length > 0 && (
          <section className="card notifications-card">
            <div className="notifications-header">
              <h3>Admin Notifications</h3>
              <span>{notifications.length} new</span>
            </div>
            <div className="notifications-list">
              {notifications.map((item) => (
                <div key={item.id} className={`notification-item notification-${item.type}`}>
                  <p>{item.text}</p>
                  <button onClick={() => setDismissedNotifications((prev) => [...prev, item.id])}>Dismiss</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {isInitialLoading ? (
          <section className="stats">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={`dash-stat-skeleton-${idx}`} className="card analytics-card">
                <div className="skeleton-block skeleton-heading" />
                <div className="skeleton-block skeleton-value" />
                <div className="skeleton-block skeleton-meta" />
              </div>
            ))}
          </section>
        ) : (
          <div className="stats">
            <div className="card analytics-card">
              <h3>Total Products</h3>
              <p>{products.length}</p>
              <span>Catalog size</span>
            </div>
            <div className="card analytics-card">
              <h3>Total Orders</h3>
              <p>{orders.length}</p>
              <span>{analytics.statuses.Pending} pending</span>
            </div>
            <div className="card analytics-card">
              <h3>Total Revenue</h3>
              <p>{formatCurrency(analytics.totalRevenue)}</p>
              <span>From all orders</span>
            </div>
            <div className="card analytics-card">
              <h3>Average Order</h3>
              <p>{formatCurrency(analytics.averageOrderValue)}</p>
              <span>{analytics.totalQuantity} units sold</span>
            </div>
          </div>
        )}

        <section className="revenue-kpi-grid">
          <div className="card revenue-kpi-card">
            <h4>Revenue Today</h4>
            <p>{formatCurrency(revenueKpis.today)}</p>
          </div>
          <div className="card revenue-kpi-card">
            <h4>Revenue Last 7 Days</h4>
            <p>{formatCurrency(revenueKpis.last7Days)}</p>
          </div>
          <div className="card revenue-kpi-card">
            <h4>Revenue Last 30 Days</h4>
            <p>{formatCurrency(revenueKpis.last30Days)}</p>
          </div>
          <div className="card revenue-kpi-card">
            <h4>Total Revenue</h4>
            <p>{formatCurrency(revenueKpis.total)}</p>
          </div>
        </section>

        <section className="card ai-prediction-card">
          <div className="ai-prediction-header">
            <div>
              <h3>AI Sales Predictions</h3>
              <p>Trend-based forecast generated from recent monthly revenue.</p>
            </div>
            <div className="ai-confidence-wrap">
              <span className="ai-confidence">Confidence: {formatPercent(aiPredictions.confidence)}</span>
              <div className="ai-confidence-track">
                <div className="ai-confidence-fill" style={{ width: `${Math.max(8, aiPredictions.confidence)}%` }} />
              </div>
            </div>
          </div>
          <div className="ai-prediction-grid">
            <div className="ai-prediction-metric">
              <span>Predicted Next Month Revenue</span>
              <strong>{formatCurrency(aiPredictions.nextMonthRevenue)}</strong>
              <p className="ai-trend-note">{aiPredictions.trend}</p>
              <div className="ai-insight-tags">
                <span>Model: Linear trend</span>
                <span>Window: Last 6 months</span>
              </div>
            </div>
            <div className="ai-prediction-sparkline">
              {aiPredictions.monthlyPoints.length === 0 ? (
                <p>Not enough historical data.</p>
              ) : (
                aiPredictions.monthlyPoints.map((value, index) => {
                  const max = Math.max(...aiPredictions.monthlyPoints, 1);
                  const h = Math.max(10, Math.round((value / max) * 100));
                  return (
                    <div key={`${value}-${index}`} className="spark-col">
                      <div className="spark-bar" style={{ height: `${h}%` }} />
                      <span>M{index + 1}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <section className="card">
          <h3>Advanced Analytics Dashboard</h3>
          <div className="advanced-analytics-grid">
            <div className="advanced-analytics-panel advanced-analytics-highlight">
              <h4>Revenue Performance (30d)</h4>
              <p>{formatCurrency(advancedAnalytics.last30Revenue)}</p>
              <span className={advancedAnalytics.revenueGrowth >= 0 ? "trend-positive" : "trend-negative"}>
                vs previous 30d: {formatPercent(advancedAnalytics.revenueGrowth)}
              </span>
            </div>
            <div className="advanced-analytics-panel">
              <h4>Status Funnel</h4>
              <div className="status-funnel-list">
                <div>
                  <span>Pending</span>
                  <strong>{advancedAnalytics.statusCounts.Pending}</strong>
                </div>
                <div>
                  <span>Shipped</span>
                  <strong>{advancedAnalytics.statusCounts.Shipped}</strong>
                </div>
                <div>
                  <span>Delivered</span>
                  <strong>{advancedAnalytics.statusCounts.Delivered}</strong>
                </div>
              </div>
            </div>
            <div className="advanced-analytics-panel">
              <h4>Top Customer</h4>
              {advancedAnalytics.topCustomer ? (
                <>
                  <p>{advancedAnalytics.topCustomer.name}</p>
                  <span>{formatCurrency(advancedAnalytics.topCustomer.spend)} total spend</span>
                </>
              ) : (
                <span>No customer spend data</span>
              )}
            </div>
            <div className="advanced-analytics-panel">
              <h4>Weekday Revenue Pattern</h4>
              <div className="weekday-bars">
                {advancedAnalytics.weekdaySeries.map((entry) => {
                  const max = Math.max(...advancedAnalytics.weekdaySeries.map((d) => d.value), 1);
                  const barW = Math.max(6, Math.round((entry.value / max) * 100));
                  return (
                    <div key={entry.day} className="weekday-row">
                      <span>{entry.day}</span>
                      <div className="weekday-track">
                        <div className="weekday-fill" style={{ width: `${barW}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="charts-grid">
          <div className="card">
            <SalesChart orders={orders} />
          </div>
          <div className="card">
            <h3 style={{ margin: "0 0 14px" }}>Best Selling Product Chart</h3>
            {topProducts.length === 0 ? (
              <p>No sales data yet.</p>
            ) : (
              <div className="best-products-chart">
                {topProducts.map(([productName, soldCount], index) => {
                  const percent = Math.max(8, Math.round((soldCount / topProducts[0][1]) * 100));
                  return (
                    <div key={productName} className="best-product-row">
                      <span>{productName}</span>
                      <div className="best-product-bar-track">
                        <div
                          className="best-product-bar"
                          style={{ width: `${percent}%`, animationDelay: `${index * 120}ms` }}
                        />
                      </div>
                      <strong>{soldCount}</strong>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="dashboard-grid">
          <div className="card">
            <h3>Low Stock Alerts</h3>
            {lowStockProducts.length === 0 ? (
              <p>No low-stock items right now.</p>
            ) : (
              lowStockProducts.map((product) => (
                <div key={product._id} className="row">
                  <span>{product.name}</span>
                  <strong className={Number(product.stock || 0) === 0 ? "stock-critical" : "stock-warning"}>
                    {Number(product.stock || 0) === 0 ? "Out of stock" : `${product.stock} left`}
                  </strong>
                </div>
              ))
            )}
          </div>
          <div className="card">
            <h3>Customer Analytics</h3>
            <div className="customer-metrics">
              <div>
                <span>Unique Customers</span>
                <strong>{analytics.uniqueCustomers}</strong>
              </div>
              <div>
                <span>Repeat Customers</span>
                <strong>{analytics.repeatCustomers}</strong>
              </div>
              <div>
                <span>Repeat Rate</span>
                <strong>{Math.round(analytics.repeatRate)}%</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <h3>Recent Orders</h3>
          {orderLoadError && <p>{orderLoadError}</p>}
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 8).map((order) => {
                  const status = normalizeStatus(order?.status);
                  const itemCount = (order.items || []).reduce(
                    (sum, item) => sum + Number(item.quantity || 1),
                    0
                  );

                  return (
                    <tr key={order._id}>
                      <td>#{order._id.slice(-6).toUpperCase()}</td>
                      <td>{order.user?.name || "Unknown"}</td>
                      <td>{formatDate(order.createdAt)}</td>
                      <td>{itemCount}</td>
                      <td>Rs {Math.round(order.total || 0)}</td>
                      <td>
                        <span className={`table-status status-${status.toLowerCase()}`}>{status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {orders.length === 0 && <p style={{ margin: "12px 0 0" }}>No orders found.</p>}
          </div>
        </section>
      </main>
    </div>
  );
}

export default AdminDashboard;

