import { useEffect, useState } from "react";
import axios from "axios";
import AdminSidebar from "../components/admin/AdminSidebar";
import "./AdminCoupons.css";

function AdminCoupons() {
  const [coupons, setCoupons] = useState([]);
  const [code, setCode] = useState("");
  const [type, setType] = useState("percentage");
  const [value, setValue] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
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
  };

  const loadCoupons = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get("/api/coupons");
      setCoupons(Array.isArray(res.data) ? res.data : []);
    } catch {
      setCoupons([]);
      setMessage("Could not load coupons.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCoupons();
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
        expiresAt: expiresAt || undefined
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
      await axios.delete(`/api/coupons/${id}`);
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
                    <th>Expiry</th>
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
                      <td>{coupon.expiresAt ? formatDate(coupon.expiresAt) : "No expiry"}</td>
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

