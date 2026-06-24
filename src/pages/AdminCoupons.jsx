import { useEffect, useState } from "react";
import axios from "axios";
import AdminSidebar from "../components/admin/AdminSidebar";
import { useAuth } from "../hooks/useAuth";
import { formatDate, formatTime } from "../utils/date";
import "./AdminCoupons.css";

function AdminCoupons() {
  const { token } = useAuth();
  const [coupons, setCoupons] = useState([]);
  const [code, setCode] = useState("");
  const [type, setType] = useState("percentage");
  const [value, setValue] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [assignedUserEmail, setAssignedUserEmail] = useState("");
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [productsList, setProductsList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  const formatDate = (input) => {
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const clearForm = () => {
    setCode("");
    setType("percentage");
    setValue("");
    setMinOrder("");
    setExpiresAt("");
    setAssignedUserEmail("");
    setSelectedProducts([]);
  };

  const loadCoupons = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get("/api/coupons/admin/all", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCoupons(Array.isArray(res.data) ? res.data : []);
    } catch {
      setCoupons([]);
      setMessage("Could not load coupons.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadProducts = async () => {
    try {
      const res = await axios.get("/api/products");
      setProductsList(Array.isArray(res.data) ? res.data : []);
    } catch {
      console.error("Could not load products.");
    }
  };

  useEffect(() => {
    loadCoupons();
    loadProducts();
  }, []);

  const createCoupon = async () => {
    const normalizedCode = String(code || "").trim().toUpperCase();
    const couponValue = Number(value);
    const couponMinOrder = Number(minOrder || 0);

    if (!normalizedCode || Number.isNaN(couponValue) || couponValue <= 0) {
      setMessage("Enter valid coupon code and discount value.");
      return;
    }

    setIsSaving(true);
    setMessage("");
    try {
      await axios.post("/api/coupons", {
        code: normalizedCode,
        type,
        value: couponValue,
        minOrder: Number.isNaN(couponMinOrder) ? 0 : couponMinOrder,
        expiresAt: expiresAt || undefined,
        assignedUserEmail: assignedUserEmail || undefined,
        applicableProducts: selectedProducts
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      clearForm();
      setMessage("Coupon created successfully.");
      await loadCoupons();
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to create coupon.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteCoupon = async (id) => {
    const shouldDelete = window.confirm("Delete this coupon?");
    if (!shouldDelete) return;

    setMessage("");
    try {
      await axios.delete(`/api/coupons/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessage("Coupon deleted.");
      await loadCoupons();
    } catch {
      setMessage("Failed to delete coupon.");
    }
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />

      <main className="admin-main">
        <div className="admin-header">
          <h1>Coupon Manager</h1>
          <p>Create, review, and remove discount codes from one place.</p>
        </div>

        <section className="card coupon-form-card">
          <h3>Create Coupon</h3>
          <div className="coupon-form-grid">
            <input
              placeholder="Coupon Code (e.g. WELCOME10)"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed Amount</option>
            </select>
            <input
              type="number"
              min="1"
              placeholder="Discount Value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <input
              type="number"
              min="0"
              placeholder="Minimum Order"
              value={minOrder}
              onChange={(e) => setMinOrder(e.target.value)}
            />
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <input
              placeholder="Gift to Email (Optional)"
              type="email"
              value={assignedUserEmail}
              onChange={(e) => setAssignedUserEmail(e.target.value)}
            />
          </div>

          <div className="applicable-products-container">
            <h4 className="selection-label">Restrict to Products (Optional - leave blank for all)</h4>
            <div className="applicable-products-list">
              {productsList.map((prod) => (
                <label key={prod._id} className="applicable-product-item">
                  <input
                    type="checkbox"
                    checked={selectedProducts.includes(prod._id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedProducts([...selectedProducts, prod._id]);
                      } else {
                        setSelectedProducts(selectedProducts.filter((id) => id !== prod._id));
                      }
                    }}
                  />
                  <span>{prod.name} (Rs {prod.price})</span>
                </label>
              ))}
            </div>
          </div>

          <div className="coupon-form-actions">
            <button className="primary-btn" disabled={isSaving} onClick={createCoupon}>
              {isSaving ? "Creating..." : "Create Coupon"}
            </button>
            {message && <span className="coupon-message">{message}</span>}
          </div>
        </section>

        <section className="card coupon-list-card">
          <div className="coupon-list-header">
            <h3>All Coupons</h3>
            <span>{isLoading ? "Loading..." : `${coupons.length} coupons`}</span>
          </div>

          {isLoading ? (
            <div className="coupon-empty">Loading coupons...</div>
          ) : coupons.length === 0 ? (
            <div className="coupon-empty">No coupons found.</div>
          ) : (
            <div className="coupon-table-wrap">
              <table className="coupon-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Type</th>
                    <th>Discount</th>
                    <th>Min Order</th>
                    <th>Restrictions</th>
                    <th>Usage</th>
                    <th>Expiry</th>
                    <th>Last Updated</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {coupons.map((coupon) => (
                    <tr key={coupon._id}>
                      <td>
                        <span className="code-pill">{coupon.code}</span>
                      </td>
                      <td>{coupon.type === "percentage" ? "Percentage" : "Fixed"}</td>
                      <td>{coupon.type === "percentage" ? `${coupon.value}%` : `Rs ${coupon.value}`}</td>
                      <td>Rs {Number(coupon.minOrder || 0)}</td>
                      <td>
                        {coupon.assignedUserEmail && (
                          <div className="restrict-item">
                            👤 <strong>User:</strong> {coupon.assignedUserEmail}
                          </div>
                        )}
                        {coupon.applicableProducts && coupon.applicableProducts.length > 0 && (
                          <div className="restrict-item">
                            📦 <strong>Products:</strong> {coupon.applicableProducts.map((p) => p?.name || "Product").join(", ")}
                          </div>
                        )}
                        {!coupon.assignedUserEmail && (!coupon.applicableProducts || coupon.applicableProducts.length === 0) && (
                          <span style={{ color: "var(--admin-muted)" }}>None (Storewide)</span>
                        )}
                      </td>
                      <td>{coupon.usedBy ? coupon.usedBy.length : 0} uses</td>
                      <td>{coupon.expiresAt ? formatDate(coupon.expiresAt) : "No expiry"}</td>
                      <td>
                        {coupon.lastUpdatedAt ? (
                          <>
                            <div>{coupon.lastUpdatedByName || coupon.lastUpdatedByEmail || "Admin"}</div>
                            <div style={{ color: "var(--admin-muted)", fontSize: "12px", marginTop: "4px" }}>
                              {formatDate(coupon.lastUpdatedAt)} {formatTime(coupon.lastUpdatedAt)}
                            </div>
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>
                        <button className="danger-btn" onClick={() => deleteCoupon(coupon._id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default AdminCoupons;

