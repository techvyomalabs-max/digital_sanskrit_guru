import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useAuth } from "../hooks/useAuth";
import AdminSidebar from "../components/admin/AdminSidebar";
import "./AdminDashboard.css";

function AdminProducts() {
  const { token } = useAuth();
  const [products, setProducts] = useState([]);
  const [warehouseAdjustments, setWarehouseAdjustments] = useState({});
  const [stockActionLoading, setStockActionLoading] = useState("");
  const [warehouseMessage, setWarehouseMessage] = useState("");
  const [warehouseSearch, setWarehouseSearch] = useState("");
  const [warehouseZoneFilter, setWarehouseZoneFilter] = useState("All");

  useEffect(() => {
    axios
      .get("/api/products")
      .then((res) => setProducts(res.data))
      .catch(() => setProducts([]));
  }, []);

  const loadProducts = async () => {
    const res = await axios.get("/api/products");
    setProducts(res.data);
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
    const critical = warehouseAnalytics.restockQueue.filter((product) => Number(product?.stock || 0) === 0);
    if (critical.length === 0) {
      setWarehouseMessage("No critical products to restock.");
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
      setWarehouseMessage(`Restocked ${critical.length} critical product(s) to 10 units.`);
      await loadProducts();
    } catch {
      setWarehouseMessage("Bulk restock failed. Please retry.");
    } finally {
      setStockActionLoading("");
    }
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />

      <main className="admin-main">
        <div className="admin-header">
          <h1>Warehouse Management</h1>
        </div>

        <section className="inventory-analytics-grid">
          <div className="card analytics-card">
            <h3>Total Stock Units</h3>
            <p>{inventoryAnalytics.totalStockUnits}</p>
            <span>Across all products</span>
          </div>
          <div className="card analytics-card">
            <h3>Inventory Value</h3>
            <p>Rs {Math.round(inventoryAnalytics.inventoryValue).toLocaleString("en-IN")}</p>
            <span>Stock x price estimate</span>
          </div>
          <div className="card analytics-card">
            <h3>Out of Stock</h3>
            <p>{inventoryAnalytics.outOfStockCount}</p>
            <span>Needs immediate restock</span>
          </div>
          <div className="card analytics-card">
            <h3>Low Stock</h3>
            <p>{inventoryAnalytics.lowStockCount}</p>
            <span>Items with 1-5 units left</span>
          </div>
        </section>

        <section className="card">
          <h3>Inventory Analytics</h3>
          {inventoryAnalytics.categoryStock.length === 0 ? (
            <p>No inventory data available.</p>
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
                    <strong>{units} units</strong>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="card">
          <h3>Warehouse Management</h3>
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
              <span>Utilization</span>
              <strong>{warehouseAnalytics.warehouseUtilization}%</strong>
            </div>
            <div className="warehouse-metric">
              <span>Restock Queue</span>
              <strong>{warehouseAnalytics.restockQueue.length}</strong>
            </div>
          </div>

          <div className="warehouse-zones-grid">
            <div>
              <h4 className="warehouse-subheading">Storage Zones</h4>
              <div className="warehouse-zone-list">
                {warehouseAnalytics.zones.length === 0 ? (
                  <p>No zone data available.</p>
                ) : (
                  warehouseAnalytics.zones.map((zone) => (
                    <div key={zone.zone} className="warehouse-zone-row">
                      <div>
                        <strong>{zone.zone}</strong>
                        <span>{zone.category}</span>
                      </div>
                      <div className="warehouse-zone-bar-track">
                        <div
                          className="warehouse-zone-bar-fill"
                          style={{ width: `${Math.min(100, zone.utilization)}%` }}
                        />
                      </div>
                      <p>
                        {zone.units}/{zone.capacity}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <h4 className="warehouse-subheading">Restock Queue</h4>
              <div className="warehouse-restock-tools">
                <button
                  className="warehouse-action-btn"
                  disabled={stockActionLoading === "bulk-critical"}
                  onClick={restockCritical}
                >
                  {stockActionLoading === "bulk-critical" ? "Restocking..." : "Restock Critical"}
                </button>
                {warehouseMessage && <span>{warehouseMessage}</span>}
              </div>
              <div className="warehouse-restock-list">
                {warehouseAnalytics.restockQueue.length === 0 ? (
                  <p>All products are sufficiently stocked.</p>
                ) : (
                  warehouseAnalytics.restockQueue.map((product) => (
                    <div key={product._id} className="warehouse-restock-row">
                      <div>
                        <strong>{product.name}</strong>
                        <span>{product.category || "General"}</span>
                      </div>
                      <span className={product.priority === "Critical" ? "restock-tag critical" : "restock-tag"}>
                        {product.priority}
                      </span>
                      <div className="warehouse-stock-actions">
                        <p>{product.stock} left</p>
                        <div className="warehouse-stock-controls">
                          <button
                            disabled={stockActionLoading === product._id}
                            onClick={() => adjustStock(product, -getAdjustmentValue(product))}
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
                          >
                            +
                          </button>
                          <button
                            className="set-btn"
                            disabled={stockActionLoading === product._id}
                            onClick={() => applySetStock(product)}
                          >
                            {stockActionLoading === product._id ? "..." : "Set"}
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

        <section className="card">
          <h3>Warehouse Stock Manager</h3>
          <div className="warehouse-manager-tools">
            <input
              placeholder="Search stock by product or category..."
              value={warehouseSearch}
              onChange={(e) => setWarehouseSearch(e.target.value)}
            />
            <select
              value={warehouseZoneFilter}
              onChange={(e) => setWarehouseZoneFilter(e.target.value)}
            >
              <option value="All">All Zones</option>
              {warehouseAnalytics.zones.map((zone) => (
                <option key={zone.category} value={zone.category}>
                  {zone.zone} - {zone.category}
                </option>
              ))}
            </select>
          </div>

          <div className="warehouse-manager-list">
            {warehouseStockRows.length === 0 ? (
              <p>No products match current warehouse filters.</p>
            ) : (
              warehouseStockRows.map((product) => (
                <div key={product._id} className="warehouse-manager-row">
                  <div>
                    <strong>{product.name}</strong>
                    <span>{product.category || "General"}</span>
                  </div>
                  <p>{product.stock} units</p>
                  <div className="warehouse-stock-controls">
                    <button
                      disabled={stockActionLoading === product._id}
                      onClick={() => adjustStock(product, -getAdjustmentValue(product))}
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
                    >
                      +
                    </button>
                    <button
                      className="set-btn"
                      disabled={stockActionLoading === product._id}
                      onClick={() => applySetStock(product)}
                    >
                      {stockActionLoading === product._id ? "..." : "Set"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default AdminProducts;

