import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useAuth } from "../hooks/useAuth";
import AdminSidebar from "../components/admin/AdminSidebar";
import "./AdminShared.css";
import "./AdminProducts.css";

const isDigitalProduct = (p) =>
  Boolean(p?.isDigital) ||
  Boolean(p?.webReaderLink) ||
  Boolean(p?.kindleLink) ||
  Boolean(p?.courseLink) ||
  ["web", "kindle", "e-book", "ebook", "flipbook", "course", "pdf"].some((k) =>
    String(p?.category || p?.digitalType || "").toLowerCase().includes(k)
  );

function AdminProducts() {
  const { token } = useAuth();
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [drafts, setDrafts] = useState({});
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [showDigital, setShowDigital] = useState(false);
  const [rowOrder, setRowOrder] = useState([]);
  const hasInitializedRowOrder = useRef(false);
  const productsRef = useRef(products);
  productsRef.current = products;

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
          units: 0
        };
      }
      acc[category].units += stock;
      return acc;
    }, {});

    const rawZones = Object.values(zoneMap);
    const totalUnits = rawZones.reduce((sum, zone) => sum + zone.units, 0);

    const zones = rawZones
      .map((zone) => ({
        category: zone.category,
        units: zone.units,
        share: totalUnits > 0 ? Math.round((zone.units / totalUnits) * 100) : 0
      }))
      .sort((a, b) => b.units - a.units);

    const restockQueue = [...products]
      .filter((product) => !isDigitalProduct(product) && Number(product?.stock || 0) <= 5)
      .sort((a, b) => Number(a?.stock || 0) - Number(b?.stock || 0))
      .slice(0, 8)
      .map((product) => ({
        ...product,
        priority: Number(product?.stock || 0) === 0 ? "Critical" : "Medium"
      }));

    return { zones, totalUnits, restockQueue };
  }, [products]);

  const physicalOutOfStockCount = useMemo(() => {
    return products.filter((p) => !isDigitalProduct(p) && Number(p?.stock || 0) === 0).length;
  }, [products]);

  const physicalLowStockCount = useMemo(() => {
    return products.filter((p) => !isDigitalProduct(p) && Number(p?.stock || 0) <= 5).length;
  }, [products]);

  const recomputeRowOrder = useCallback(() => {
    const query = warehouseSearch.trim().toLowerCase();
    const currentProducts = productsRef.current || [];

    const filtered = currentProducts.filter((product) => {
      const isDigital = isDigitalProduct(product);
      if (!showDigital && isDigital) return false;
      if (lowStockOnly && Number(product?.stock || 0) > 5) return false;

      const category = String(product?.category || "General");
      if (warehouseZoneFilter !== "All" && category !== warehouseZoneFilter) return false;
      if (!query) return true;
      const haystack = `${product?.name || ""} ${category}`.toLowerCase();
      return haystack.includes(query);
    });

    filtered.sort((a, b) => {
      const stockDiff = Number(a?.stock || 0) - Number(b?.stock || 0);
      if (stockDiff !== 0) return stockDiff;
      return String(a?.name || "").localeCompare(String(b?.name || ""));
    });

    setRowOrder(filtered.map((p) => p._id));
  }, [warehouseSearch, warehouseZoneFilter, lowStockOnly, showDigital]);

  // Initial load: compute row order once products first arrive
  useEffect(() => {
    if (!hasInitializedRowOrder.current && products.length > 0) {
      hasInitializedRowOrder.current = true;
      recomputeRowOrder();
    }
  }, [products, recomputeRowOrder]);

  // Filter or search changes: recompute row order
  useEffect(() => {
    if (hasInitializedRowOrder.current) {
      recomputeRowOrder();
    }
  }, [recomputeRowOrder]);

  const productMap = useMemo(() => {
    const map = new Map();
    products.forEach((p) => map.set(p._id, p));
    return map;
  }, [products]);

  const warehouseStockRows = useMemo(() => {
    return rowOrder.map((id) => productMap.get(id)).filter(Boolean);
  }, [rowOrder, productMap]);

  const handleDraftChange = (productId, val) => {
    setDrafts((prev) => ({
      ...prev,
      [productId]: val
    }));
  };

  const handleStepDraft = (product, delta) => {
    const raw = drafts[product._id];
    const base = raw !== undefined ? Number(raw) : Number(product.stock ?? 0);
    const safeBase = Number.isFinite(base) ? base : Number(product.stock ?? 0);
    const nextVal = Math.max(0, Math.floor(safeBase) + delta);
    setDrafts((prev) => ({
      ...prev,
      [product._id]: String(nextVal)
    }));
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

  const handleSaveStock = async (product) => {
    const raw = drafts[product._id];
    if (raw === undefined) return;
    const trimmed = String(raw).trim();
    if (!/^\d+$/.test(trimmed)) return;
    const nextStock = Number(trimmed);
    if (nextStock === Number(product.stock ?? 0)) return;

    await updateWarehouseStock(
      product,
      nextStock,
      `Stock set to ${nextStock} for ${product.name}.`
    );
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[product._id];
      return next;
    });
  };

  const adjustStock = async (product, delta) => {
    const nextStock = Math.max(0, Number(product?.stock || 0) + delta);
    await updateWarehouseStock(product, nextStock, `Stock updated for ${product.name}.`);
  };

  const restockCritical = async () => {
    // Find ALL physical products with 0 stock across entire catalog
    const critical = products.filter(
      (product) => !isDigitalProduct(product) && Number(product?.stock || 0) === 0
    );
    if (critical.length === 0) {
      setWarehouseMessage("No physical out-of-stock products to restock.");
      return;
    }

    const confirmed = window.confirm(
      `Restock ${critical.length} physical product(s)? This will set all 0-stock items to 10 units.`
    );
    if (!confirmed) return;

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
      setWarehouseMessage(`✓ Successfully restocked ${critical.length} critical physical product(s) to 10 units!`);
      await loadProducts();
    } catch {
      setWarehouseMessage("Bulk restock failed. Please check network connection and retry.");
    } finally {
      setStockActionLoading("");
    }
  };

  const restockAllLowStock = async () => {
    // Find ALL physical products with <= 5 stock across entire catalog
    const lowStockItems = products.filter(
      (product) => !isDigitalProduct(product) && Number(product?.stock || 0) <= 5
    );
    if (lowStockItems.length === 0) {
      setWarehouseMessage("All physical products have healthy inventory levels (> 5 units).");
      return;
    }

    const confirmed = window.confirm(
      `Restock ${lowStockItems.length} physical product(s)? This will add +10 units to all items with 5 or fewer units in stock.`
    );
    if (!confirmed) return;

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
      setWarehouseMessage(`✓ Added +10 units to ${lowStockItems.length} low-stock physical product(s)!`);
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
              Live inventory tracking, stock by category, and restock queue automation.
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
          <h3 style={{ margin: "0 0 16px", fontSize: "16px", fontWeight: 700 }}>🏭 Stock Overview & Restock Queue</h3>
          <div className="warehouse-summary-grid">
            <div className="warehouse-metric">
              <span>Total Stored Units</span>
              <strong>{warehouseAnalytics.totalUnits}</strong>
            </div>
            <div className="warehouse-metric">
              <span>Out of Stock</span>
              <strong style={{ color: inventoryAnalytics.outOfStockCount > 0 ? "#dc2626" : "#059669" }}>
                {inventoryAnalytics.outOfStockCount}
              </strong>
            </div>
            <div className="warehouse-metric">
              <span>Categories</span>
              <strong>{warehouseAnalytics.zones.length}</strong>
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
              <h4 className="warehouse-subheading">📊 Stock by Category</h4>
              <div className="warehouse-zone-list">
                {warehouseAnalytics.zones.length === 0 ? (
                  <p style={{ color: "var(--admin-muted)" }}>No stock data available.</p>
                ) : (
                  warehouseAnalytics.zones.map((zone) => {
                    const shareText = zone.units > 0 && zone.share === 0 ? "<1%" : `${zone.share}%`;
                    return (
                      <div key={zone.category} className="warehouse-zone-row">
                        <div className="warehouse-info-col">
                          <strong>{zone.category}</strong>
                        </div>
                        <div className="warehouse-zone-bar-track">
                          <div
                            className="warehouse-zone-bar-fill"
                            style={{ width: `${zone.share}%` }}
                          />
                        </div>
                        <p style={{ fontWeight: 700, color: "var(--admin-text)" }}>
                          {zone.units} units · {shareText}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                <h4 className="warehouse-subheading" style={{ margin: 0 }}>⚡ Priority Restock Queue</h4>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    className="warehouse-action-btn"
                    disabled={Boolean(stockActionLoading) || physicalOutOfStockCount === 0}
                    onClick={restockCritical}
                    title="Restock all 0-stock physical products to 10 units"
                    style={{ background: physicalOutOfStockCount > 0 ? "linear-gradient(135deg, #b91c1c 0%, #ef4444 100%)" : undefined, borderColor: physicalOutOfStockCount > 0 ? "#b91c1c" : undefined }}
                  >
                    {stockActionLoading === "bulk-critical" ? "Restocking..." : `Restock 0-Stock (${physicalOutOfStockCount})`}
                  </button>
                  <button
                    className="warehouse-action-btn"
                    disabled={Boolean(stockActionLoading) || physicalLowStockCount === 0}
                    onClick={restockAllLowStock}
                    title="Add +10 units to all physical products with <= 5 stock"
                  >
                    {stockActionLoading === "bulk-low" ? "Restocking..." : `Restock All Low (${physicalLowStockCount})`}
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
              <option value="All">🌐 All Categories</option>
              {warehouseAnalytics.zones.map((zone) => (
                <option key={zone.category} value={zone.category}>
                  {zone.category}
                </option>
              ))}
            </select>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, color: "var(--admin-text, #0f172a)", cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={lowStockOnly}
                onChange={(e) => setLowStockOnly(e.target.checked)}
                style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#2563eb" }}
              />
              <span>Low stock only</span>
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, color: "var(--admin-text, #0f172a)", cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={showDigital}
                onChange={(e) => setShowDigital(e.target.checked)}
                style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#2563eb" }}
              />
              <span>Show digital products</span>
            </label>
            <button
              type="button"
              className="warehouse-action-btn"
              style={{ padding: "8px 14px", fontSize: "13px" }}
              onClick={recomputeRowOrder}
              title="Re-sort rows by stock and name"
            >
              🔄 Re-sort
            </button>
          </div>

          <div className="warehouse-manager-list">
            {isLoading ? (
              <p style={{ padding: "20px 0", color: "var(--admin-muted)", textAlign: "center" }}>
                Loading warehouse products...
              </p>
            ) : warehouseStockRows.length === 0 ? (
              <p style={{ padding: "20px 0", color: "var(--admin-muted)", textAlign: "center" }}>
                No products match the current search or category filter.
              </p>
            ) : (
              warehouseStockRows.map((product) => {
                const isDigital = isDigitalProduct(product);
                const stock = Number(product.stock || 0);
                const pillClass = stock === 0 ? "stock-pill-critical" : stock <= 5 ? "stock-pill-warning" : "stock-pill-ok";
                const pillText = stock === 0 ? "Out of Stock" : stock <= 5 ? `Low (${stock})` : `In Stock (${stock})`;

                const rawDraft = drafts[product._id];
                const draftValue = rawDraft !== undefined ? rawDraft : String(stock);
                const trimmedDraft = String(draftValue).trim();
                const isValidInteger = /^\d+$/.test(trimmedDraft);
                const parsedDraft = Number(trimmedDraft);
                const canSave =
                  rawDraft !== undefined &&
                  isValidInteger &&
                  parsedDraft !== stock &&
                  stockActionLoading !== product._id;

                return (
                  <div key={product._id} className="warehouse-manager-row">
                    <div className="warehouse-info-col">
                      <strong>{product.name}</strong>
                      <span>{product.category || "General"} • ₹{(product.price || 0).toLocaleString("en-IN")}</span>
                    </div>

                    {isDigital ? (
                      <span
                        className="stock-pill"
                        style={{
                          background: "rgba(148, 163, 184, 0.16)",
                          color: "#64748b",
                          border: "1px solid rgba(148, 163, 184, 0.3)"
                        }}
                      >
                        Digital – no stock needed
                      </span>
                    ) : (
                      <>
                        <span className={`stock-pill ${pillClass}`}>{pillText}</span>
                        <div className="warehouse-stock-controls">
                          <button
                            type="button"
                            disabled={stockActionLoading === product._id}
                            onClick={() => handleStepDraft(product, -1)}
                            title="Decrease draft by 1"
                          >
                            −1
                          </button>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={draftValue}
                            onChange={(e) => handleDraftChange(product._id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && canSave) {
                                e.preventDefault();
                                handleSaveStock(product);
                              }
                            }}
                          />
                          <button
                            type="button"
                            disabled={stockActionLoading === product._id}
                            onClick={() => handleStepDraft(product, 1)}
                            title="Increase draft by 1"
                          >
                            +1
                          </button>
                          <button
                            type="button"
                            className="set-btn"
                            disabled={!canSave}
                            onClick={() => handleSaveStock(product)}
                            title="Save stock value"
                          >
                            {stockActionLoading === product._id ? "..." : "Save"}
                          </button>
                        </div>
                      </>
                    )}
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

