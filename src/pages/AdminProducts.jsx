import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useAuth } from "../hooks/useAuth";
import AdminSidebar from "../components/admin/AdminSidebar";
import "./AdminShared.css";
import "./AdminProducts.css";

function AdminProducts() {
  const { token } = useAuth();
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [warehouseAdjustments, setWarehouseAdjustments] = useState({});
  const [stockActionLoading, setStockActionLoading] = useState("");
  const [warehouseMessage, setWarehouseMessage] = useState("");
  const [warehouseSearch, setWarehouseSearch] = useState("");
  const [warehouseZoneFilter, setWarehouseZoneFilter] = useState("All");

  useEffect(() => {
    setIsLoading(true);
    axios
      .get("/api/products")
      .then((res) => setProducts(res.data))
      .catch(() => setProducts([]))
      .finally(() => setIsLoading(false));
  }, []);

  const loadProducts = async () => {
    try {
      const res = await axios.get("/api/products");
      setProducts(res.data);
    } catch {
      setProducts([]);
    }
  };

  const inventoryAnalytics = useMemo(() => {
    const totalStockUnits = products.reduce((sum, product) => sum + Number(product?.stock || 0), 0);
    const outOfStockCount = products.filter((product) => Number(product?.stock || 0) === 0).length;
    const lowStockCount = products.filter((product) => {
      const stock = Number(product?.stock || 0);
      return stock > 0 && stock <= 5;
    }).length;
    const inventoryValue = products.reduce(
      (sum, product) => sum + Number(product?.price || 0) * Number(product?.stock || 0),
      0
    );

    const categoryMap = products.reduce((acc, product) => {
      const category = String(product?.category || "General");
      acc[category] = (acc[category] || 0) + Number(product?.stock || 0);
      return acc;
    }, {});

    const categoryStock = Object.entries(categoryMap).sort((a, b) => b[1] - a[1]);

    return {
      totalStockUnits,
      outOfStockCount,
      lowStockCount,
      inventoryValue,
      categoryStock
    };
  }, [products]);

  const warehouseAnalytics = useMemo(() => {
    const zoneMap = products.reduce((acc, product) => {
      const category = String(product?.category || "General");
      const stock = Number(product?.stock || 0);
      if (!acc[category]) {
        acc[category] = {
          category,
          zone: `Zone-${Object.keys(acc).length + 1}`,
          units: 0
        };
      }
      acc[category].units += stock;
      return acc;
    }, {});

    const zones = Object.values(zoneMap).map((zone) => {
      const capacity = Math.max(50, Math.ceil(zone.units * 1.4));
      const utilization = capacity > 0 ? Math.round((zone.units / capacity) * 100) : 0;
      return { ...zone, capacity, utilization };
    });

    const totalUnits = zones.reduce((sum, zone) => sum + zone.units, 0);
    const totalCapacity = zones.reduce((sum, zone) => sum + zone.capacity, 0);
    const warehouseUtilization = totalCapacity > 0 ? Math.round((totalUnits / totalCapacity) * 100) : 0;

    const restockQueue = [...products]
      .filter((product) => Number(product?.stock || 0) <= 5)
      .sort((a, b) => Number(a?.stock || 0) - Number(b?.stock || 0))
      .slice(0, 8)
      .map((product) => ({
        ...product,
        priority: Number(product?.stock || 0) === 0 ? "Critical" : "Medium"
      }));

    return { zones, totalUnits, totalCapacity, warehouseUtilization, restockQueue };
  }, [products]);

  const warehouseStockRows = useMemo(() => {
    const query = warehouseSearch.trim().toLowerCase();

    return [...products]
      .filter((product) => {
        const category = String(product?.category || "General");
        if (warehouseZoneFilter !== "All" && category !== warehouseZoneFilter) return false;
        if (!query) return true;
        const haystack = `${product?.name || ""} ${category}`.toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => Number(a?.stock || 0) - Number(b?.stock || 0));
  }, [products, warehouseSearch, warehouseZoneFilter]);

  const getAdjustmentValue = (product) => {
    const raw = warehouseAdjustments[product._id];
    const numeric = Number(raw);
    if (Number.isNaN(numeric) || numeric <= 0) return 1;
    return Math.floor(numeric);
  };

  const updateWarehouseStock = async (product, nextStock, message) => {
    const safeStock = Math.max(0, Number(nextStock) || 0);
    setStockActionLoading(product._id);
    setWarehouseMessage("");
    try {
      await axios.put(
        `/api/products/${product._id}`,
        { stock: safeStock },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setWarehouseMessage(message);
      await loadProducts();
    } catch {
      setWarehouseMessage("Stock update failed. Please try again.");
    } finally {
      setStockActionLoading("");
    }
  };

  const adjustStock = async (product, delta) => {
    const nextStock = Math.max(0, Number(product?.stock || 0) + delta);
    await updateWarehouseStock(product, nextStock, `Stock updated for ${product.name}.`);
  };

  const applySetStock = async (product) => {
    const nextStock = getAdjustmentValue(product);
    await updateWarehouseStock(product, nextStock, `Stock set to ${nextStock} for ${product.name}.`);
  };

  const restockCritical = async () => {
    // Find ALL products with 0 stock across entire catalog
    const critical = products.filter((product) => Number(product?.stock || 0) === 0);
    if (critical.length === 0) {
      setWarehouseMessage("No out-of-stock (0 units) products to restock. All items have available inventory.");
      return;
    }

    setStockActionLoading("bulk-critical");
    setWarehouseMessage("");
    try {
      await Promise.all(
        critical.map((product) =>
          axios.put(
            `/api/products/${product._id}`,
            { stock: 10 },
            { headers: { Authorization: `Bearer ${token}` } }
          )
        )
      );
      setWarehouseMessage(`✓ Successfully restocked ${critical.length} critical product(s) to 10 units!`);
      await loadProducts();
    } catch {
      setWarehouseMessage("Bulk restock failed. Please check network connection and retry.");
    } finally {
      setStockActionLoading("");
    }
  };

  const restockAllLowStock = async () => {
    // Find ALL products with <= 5 stock across entire catalog
    const lowStockItems = products.filter((product) => Number(product?.stock || 0) <= 5);
    if (lowStockItems.length === 0) {
      setWarehouseMessage("All products have healthy inventory levels (> 5 units).");
      return;
    }

    setStockActionLoading("bulk-low");
    setWarehouseMessage("");
    try {
      await Promise.all(
        lowStockItems.map((product) =>
          axios.put(
            `/api/products/${product._id}`,
            { stock: Math.max(10, Number(product?.stock || 0) + 10) },
            { headers: { Authorization: `Bearer ${token}` } }
          )
        )
      );
      setWarehouseMessage(`✓ Added +10 units to ${lowStockItems.length} low-stock product(s)!`);
      await loadProducts();
    } catch {
      setWarehouseMessage("Low-stock restock failed. Please retry.");
    } finally {
      setStockActionLoading("");
    }
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />

      <main className="admin-main">
        <div className="admin-header" style={{ marginBottom: "20px" }}>
          <div>
            <h1>Warehouse Management</h1>
            <p style={{ margin: "4px 0 0", color: "var(--admin-muted)", fontSize: "13.5px" }}>
              Live inventory tracking, storage zone capacity, and restock queue automation.
            </p>
          </div>
        </div>

        {/* Top 4 Inventory KPI Cards */}
        <section className="inventory-analytics-grid">
          <div className="inv-kpi-card blue">
            <div className="inv-kpi-top">
              <span className="inv-kpi-label">Total Stock Units</span>
              <div className="inv-kpi-icon-wrap">📦</div>
            </div>
            <div className="inv-kpi-amount">{inventoryAnalytics.totalStockUnits}</div>
            <span className="inv-kpi-subtext">Across {products.length} products</span>
          </div>

          <div className="inv-kpi-card green">
            <div className="inv-kpi-top">
              <span className="inv-kpi-label">Inventory Value</span>
              <div className="inv-kpi-icon-wrap green">💰</div>
            </div>
            <div className="inv-kpi-amount">₹{Math.round(inventoryAnalytics.inventoryValue).toLocaleString("en-IN")}</div>
            <span className="inv-kpi-subtext">Estimated stock valuation</span>
          </div>

          <div className="inv-kpi-card red">
            <div className="inv-kpi-top">
              <span className="inv-kpi-label">Out of Stock</span>
              <div className="inv-kpi-icon-wrap red">⚠️</div>
            </div>
            <div className="inv-kpi-amount">{inventoryAnalytics.outOfStockCount}</div>
            <span className="inv-kpi-subtext">Needs immediate restocking</span>
          </div>

          <div className="inv-kpi-card amber">
            <div className="inv-kpi-top">
              <span className="inv-kpi-label">Low Stock</span>
              <div className="inv-kpi-icon-wrap amber">⏱</div>
            </div>
            <div className="inv-kpi-amount">{inventoryAnalytics.lowStockCount}</div>
            <span className="inv-kpi-subtext">Items with 1-5 units remaining</span>
          </div>
        </section>

        {/* Category Distribution Analytics */}
        <section className="card">
          <h3 style={{ margin: "0 0 14px", fontSize: "16px", fontWeight: 700 }}>📊 Category Inventory Distribution</h3>
          {isLoading ? (
            <p style={{ color: "var(--admin-muted)" }}>Loading inventory data...</p>
          ) : inventoryAnalytics.categoryStock.length === 0 ? (
            <p style={{ color: "var(--admin-muted)" }}>No inventory data available.</p>
          ) : (
            <div className="inventory-bars">
              {inventoryAnalytics.categoryStock.map(([category, units]) => {
                const maxUnits = inventoryAnalytics.categoryStock[0][1] || 1;
                const widthPercent = Math.max(5, Math.round((units / maxUnits) * 100));
                return (
                  <div key={category} className="inventory-bar-row">
                    <span>{category}</span>
                    <div className="inventory-bar-track">
                      <div className="inventory-bar-fill" style={{ width: `${widthPercent}%` }} />
                    </div>
                    <strong style={{ color: "var(--admin-text)", fontSize: "13px" }}>{units} units</strong>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Storage Zones & Restock Queue */}
        <section className="card">
          <h3 style={{ margin: "0 0 16px", fontSize: "16px", fontWeight: 700 }}>🏭 Warehouse Capacity & Restock Queue</h3>
          <div className="warehouse-summary-grid">
            <div className="warehouse-metric">
              <span>Total Stored Units</span>
              <strong>{warehouseAnalytics.totalUnits}</strong>
            </div>
            <div className="warehouse-metric">
              <span>Warehouse Capacity</span>
              <strong>{warehouseAnalytics.totalCapacity}</strong>
            </div>
            <div className="warehouse-metric">
              <span>Overall Utilization</span>
              <strong style={{ color: warehouseAnalytics.warehouseUtilization > 85 ? "#dc2626" : "#2563eb" }}>
                {warehouseAnalytics.warehouseUtilization}%
              </strong>
            </div>
            <div className="warehouse-metric">
              <span>Restock Queue</span>
              <strong style={{ color: warehouseAnalytics.restockQueue.length > 0 ? "#d97706" : "#059669" }}>
                {warehouseAnalytics.restockQueue.length}
              </strong>
            </div>
          </div>

          <div className="warehouse-zones-grid">
            <div>
              <h4 className="warehouse-subheading">📍 Storage Zones</h4>
              <div className="warehouse-zone-list">
                {warehouseAnalytics.zones.length === 0 ? (
                  <p style={{ color: "var(--admin-muted)" }}>No zone data available.</p>
                ) : (
                  warehouseAnalytics.zones.map((zone) => (
                    <div key={zone.zone} className="warehouse-zone-row">
                      <div className="warehouse-info-col">
                        <strong>{zone.zone}</strong>
                        <span>{zone.category}</span>
                      </div>
                      <div className="warehouse-zone-bar-track">
                        <div
                          className="warehouse-zone-bar-fill"
                          style={{ width: `${Math.min(100, zone.utilization)}%` }}
                        />
                      </div>
                      <p style={{ fontWeight: 700, color: "var(--admin-text)" }}>
                        {zone.units}/{zone.capacity}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                <h4 className="warehouse-subheading" style={{ margin: 0 }}>⚡ Priority Restock Queue</h4>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    className="warehouse-action-btn"
                    disabled={Boolean(stockActionLoading) || inventoryAnalytics.outOfStockCount === 0}
                    onClick={restockCritical}
                    title="Restock all 0-stock products to 10 units"
                    style={{ background: inventoryAnalytics.outOfStockCount > 0 ? "linear-gradient(135deg, #b91c1c 0%, #ef4444 100%)" : undefined, borderColor: inventoryAnalytics.outOfStockCount > 0 ? "#b91c1c" : undefined }}
                  >
                    {stockActionLoading === "bulk-critical" ? "Restocking..." : `Restock 0-Stock (${inventoryAnalytics.outOfStockCount})`}
                  </button>
                  <button
                    className="warehouse-action-btn"
                    disabled={Boolean(stockActionLoading) || warehouseAnalytics.restockQueue.length === 0}
                    onClick={restockAllLowStock}
                    title="Add +10 units to all products with <= 5 stock"
                  >
                    {stockActionLoading === "bulk-low" ? "Restocking..." : `Restock All Low (${warehouseAnalytics.restockQueue.length})`}
                  </button>
                </div>
              </div>

              {warehouseMessage && (
                <div style={{ padding: "8px 12px", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: "8px", marginBottom: "12px", color: "#059669", fontSize: "13px", fontWeight: 600 }}>
                  {warehouseMessage}
                </div>
              )}

              <div className="warehouse-restock-list">
                {isLoading ? (
                  <p style={{ color: "var(--admin-muted)", padding: "20px 0", textAlign: "center" }}>
                    Analyzing stock levels...
                  </p>
                ) : warehouseAnalytics.restockQueue.length === 0 ? (
                  <p style={{ color: "var(--admin-muted)", padding: "20px 0", textAlign: "center" }}>
                    ✓ All products are sufficiently stocked. No items in restock queue.
                  </p>
                ) : (
                  warehouseAnalytics.restockQueue.map((product) => (
                    <div key={product._id} className="warehouse-restock-row">
                      <div className="warehouse-info-col">
                        <strong>{product.name}</strong>
                        <span>{product.category || "General"} • ₹{(product.price || 0).toLocaleString("en-IN")}</span>
                      </div>
                      <span className={product.priority === "Critical" ? "restock-tag critical" : "restock-tag"}>
                        {product.priority === "Critical" ? "⚠️ Out of Stock" : "⏱ Low Stock"}
                      </span>
                      <div className="warehouse-stock-actions">
                        <p style={{ fontWeight: 800, color: product.stock === 0 ? "#dc2626" : "#d97706", margin: 0 }}>
                          {product.stock} units
                        </p>
                        <div className="warehouse-stock-controls">
                          <button
                            disabled={stockActionLoading === product._id}
                            onClick={() => adjustStock(product, 10)}
                            title="Quick add +10 units"
                            className="set-btn"
                            style={{ padding: "6px 10px", fontSize: "12px" }}
                          >
                            {stockActionLoading === product._id ? "..." : "+10 Restock"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Stock Manager with Search & Zone Filtering */}
        <section className="card">
          <h3 style={{ margin: "0 0 16px", fontSize: "16px", fontWeight: 700 }}>📦 Warehouse Stock Inventory</h3>
          <div className="warehouse-manager-tools">
            <input
              placeholder="🔍 Search product name or category..."
              value={warehouseSearch}
              onChange={(e) => setWarehouseSearch(e.target.value)}
            />
            <select
              value={warehouseZoneFilter}
              onChange={(e) => setWarehouseZoneFilter(e.target.value)}
            >
              <option value="All">🌐 All Storage Zones</option>
              {warehouseAnalytics.zones.map((zone) => (
                <option key={zone.category} value={zone.category}>
                  {zone.zone} ({zone.category})
                </option>
              ))}
            </select>
          </div>

          <div className="warehouse-manager-list">
            {isLoading ? (
              <p style={{ padding: "20px 0", color: "var(--admin-muted)", textAlign: "center" }}>
                Loading warehouse products...
              </p>
            ) : warehouseStockRows.length === 0 ? (
              <p style={{ padding: "20px 0", color: "var(--admin-muted)", textAlign: "center" }}>
                No products match the current search or zone filters.
              </p>
            ) : (
              warehouseStockRows.map((product) => {
                const stock = Number(product.stock || 0);
                const pillClass = stock === 0 ? "stock-pill-critical" : stock <= 5 ? "stock-pill-warning" : "stock-pill-ok";
                const pillText = stock === 0 ? "Out of Stock" : stock <= 5 ? `Low (${stock})` : `In Stock (${stock})`;

                return (
                  <div key={product._id} className="warehouse-manager-row">
                    <div className="warehouse-info-col">
                      <strong>{product.name}</strong>
                      <span>{product.category || "General"} • ₹{(product.price || 0).toLocaleString("en-IN")}</span>
                    </div>
                    <span className={`stock-pill ${pillClass}`}>{pillText}</span>
                    <div className="warehouse-stock-controls">
                      <button
                        disabled={stockActionLoading === product._id}
                        onClick={() => adjustStock(product, -getAdjustmentValue(product))}
                        title="Subtract units"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={warehouseAdjustments[product._id] ?? "10"}
                        onChange={(e) =>
                          setWarehouseAdjustments((prev) => ({
                            ...prev,
                            [product._id]: e.target.value
                          }))
                        }
                      />
                      <button
                        disabled={stockActionLoading === product._id}
                        onClick={() => adjustStock(product, getAdjustmentValue(product))}
                        title="Add units"
                      >
                        +
                      </button>
                      <button
                        className="set-btn"
                        disabled={stockActionLoading === product._id}
                        onClick={() => applySetStock(product)}
                        title="Set exact stock"
                      >
                        {stockActionLoading === product._id ? "..." : "Set"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default AdminProducts;

