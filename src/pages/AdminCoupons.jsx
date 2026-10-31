import { Fragment, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Search, X } from "lucide-react";
import AdminSidebar from "../components/admin/AdminSidebar";
import { useAuth } from "../hooks/useAuth";
import { useDialog } from "../hooks/useDialog";
import { formatTime } from "../utils/date";
import "./AdminCoupons.css";

const IST = "Asia/Kolkata";
const DAY_MS = 24 * 60 * 60 * 1000;

// Calendar date (YYYY-MM-DD) in India time, for comparing expiry days.
const istDate = (input) => new Date(input).toLocaleDateString("en-CA", { timeZone: IST });
const daysBetween = (fromDate, toDate) => Math.round((Date.parse(toDate) - Date.parse(fromDate)) / DAY_MS);

const getUsedCount = (coupon) => Number(coupon.usageCount || 0);

const getCouponStatus = (coupon) => {
  if (coupon.isActive === false) return { key: "inactive", label: "Inactive" };
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
    return { key: "expired", label: "Expired" };
  }
  if (coupon.usageLimit && getUsedCount(coupon) >= coupon.usageLimit) {
    return { key: "used-up", label: "Limit reached" };
  }
  return { key: "active", label: "Active" };
};

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "expired", label: "Expired" },
  { key: "used-up", label: "Limit reached" }
];

function AdminCoupons() {
  const { token } = useAuth();
  const { confirm } = useDialog();
  const [coupons, setCoupons] = useState([]);
  const [code, setCode] = useState("");
  const [type, setType] = useState("percentage");
  const [value, setValue] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [assignedUserEmail, setAssignedUserEmail] = useState("");
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [productsList, setProductsList] = useState([]);
  const [productSearch, setProductSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState({ text: "", tone: "" });
  const [listMessage, setListMessage] = useState({ text: "", tone: "" });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [renewingId, setRenewingId] = useState(null);
  const [renewDate, setRenewDate] = useState("");
  const [renewLimit, setRenewLimit] = useState("");
  const [renewResetCustomers, setRenewResetCustomers] = useState(false);
  const [renewError, setRenewError] = useState("");
  const [isRenewing, setIsRenewing] = useState(false);

  const todayDate = istDate(Date.now());

  const formatDate = (input) => {
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: IST });
  };

  // Picked YYYY-MM-DD shown as "30 Oct 2026" without shifting the day.
  const formatPickedDate = (picked) => formatDate(`${picked}T12:00:00+05:30`);

  const formatDiscount = (coupon) => (coupon.type === "percentage" ? `${coupon.value}% off` : `Rs ${coupon.value} off`);

  const getExpiryNote = (coupon) => {
    if (!coupon.expiresAt) return { text: "Never expires", tone: "" };
    const days = daysBetween(todayDate, istDate(coupon.expiresAt));
    if (days === 0) return { text: "Ends today", tone: "warn" };
    if (days === 1) return { text: "Ends tomorrow", tone: "warn" };
    if (days > 1) return { text: `${days} days left`, tone: days <= 7 ? "warn" : "" };
    if (days === -1) return { text: "Ended yesterday", tone: "danger" };
    return { text: `Ended ${-days} days ago`, tone: "danger" };
  };

  const startRenew = (coupon) => {
    const expiry = coupon.expiresAt ? new Date(coupon.expiresAt) : null;
    const isFuture = expiry && expiry.getTime() >= Date.now();
    setRenewingId(coupon._id);
    setRenewDate(isFuture ? istDate(expiry) : "");
    setRenewLimit(coupon.usageLimit ? String(coupon.usageLimit) : "");
    setRenewResetCustomers(false);
    setRenewError("");
    setListMessage({ text: "", tone: "" });
  };

  const cancelRenew = () => {
    setRenewingId(null);
    setRenewDate("");
    setRenewLimit("");
    setRenewResetCustomers(false);
    setRenewError("");
  };

  const saveRenew = async (coupon) => {
    const used = getUsedCount(coupon);
    const limit = renewLimit === "" ? null : Number(renewLimit);
    if (limit !== null && (!Number.isInteger(limit) || limit <= used)) {
      setRenewError(`Total uses must be a whole number above ${used} (times already used), or empty for no limit.`);
      return;
    }

    setIsRenewing(true);
    setRenewError("");
    try {
      await axios.patch(`/api/coupons/${coupon._id}/renew`, {
        expiresAt: renewDate || null,
        usageLimit: limit,
        resetCustomerUses: renewResetCustomers
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const until = renewDate ? `until ${formatPickedDate(renewDate)}` : "with no expiry";
      setListMessage({ text: `${coupon.code} is active ${until}. Discount unchanged.`, tone: "success" });
      cancelRenew();
      await loadCoupons({ quiet: true });
    } catch (err) {
      setRenewError(err?.response?.data?.message || "Failed to renew coupon.");
    } finally {
      setIsRenewing(false);
    }
  };

  const clearForm = () => {
    setCode("");
    setType("percentage");
    setValue("");
    setMinOrder("");
    setExpiresAt("");
    setUsageLimit("");
    setAssignedUserEmail("");
    setSelectedProducts([]);
    setProductSearch("");
  };

  const loadCoupons = async ({ quiet = false } = {}) => {
    if (!quiet) setIsLoading(true);
    try {
      const res = await axios.get("/api/coupons/admin/all", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCoupons(Array.isArray(res.data) ? res.data : []);
    } catch {
      setCoupons([]);
      setListMessage({ text: "Could not load coupons.", tone: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  const loadProducts = async () => {
    try {
      const res = await axios.get("/api/products", { params: { includeHidden: 1 } });
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
    const couponUsageLimit = usageLimit === "" ? null : Number(usageLimit);

    if (!normalizedCode) {
      setMessage({ text: "Enter a coupon code.", tone: "error" });
      return;
    }
    if (Number.isNaN(couponValue) || couponValue <= 0) {
      setMessage({ text: "Enter a discount greater than 0.", tone: "error" });
      return;
    }
    if (type === "percentage" && couponValue > 100) {
      setMessage({ text: "Percentage discount cannot be more than 100%.", tone: "error" });
      return;
    }
    if (couponUsageLimit !== null && (!Number.isInteger(couponUsageLimit) || couponUsageLimit < 1)) {
      setMessage({ text: "Total uses must be a whole number, or empty for no limit.", tone: "error" });
      return;
    }

    setIsSaving(true);
    setMessage({ text: "", tone: "" });
    try {
      await axios.post("/api/coupons", {
        code: normalizedCode,
        type,
        value: couponValue,
        minOrder: Number.isNaN(couponMinOrder) ? 0 : couponMinOrder,
        expiresAt: expiresAt || undefined,
        usageLimit: couponUsageLimit,
        assignedUserEmail: assignedUserEmail || undefined,
        applicableProducts: selectedProducts
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      clearForm();
      setMessage({ text: `Coupon ${normalizedCode} created.`, tone: "success" });
      await loadCoupons({ quiet: true });
    } catch (err) {
      setMessage({ text: err?.response?.data?.message || "Failed to create coupon.", tone: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteCoupon = async (coupon) => {
    const shouldDelete = await confirm({
      title: "Delete Coupon?",
      message: `Move ${coupon.code} to the Recycle Bin? Customers will no longer be able to use it.`,
      tone: "danger",
      confirmText: "Delete Coupon"
    });
    if (!shouldDelete) return;

    setListMessage({ text: "", tone: "" });
    try {
      await axios.delete(`/api/coupons/${coupon._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (renewingId === coupon._id) cancelRenew();
      setListMessage({ text: `${coupon.code} moved to Recycle Bin.`, tone: "success" });
      await loadCoupons({ quiet: true });
    } catch {
      setListMessage({ text: "Failed to delete coupon.", tone: "error" });
    }
  };

  const toggleProduct = (id, checked) => {
    setSelectedProducts((prev) => (checked ? [...prev, id] : prev.filter((pid) => pid !== id)));
  };

  const visibleProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) return productsList;
    return productsList.filter((prod) => String(prod.name || "").toLowerCase().includes(term));
  }, [productsList, productSearch]);

  const statusCounts = useMemo(() => {
    const counts = { all: coupons.length, active: 0, expired: 0, "used-up": 0 };
    coupons.forEach((coupon) => {
      const key = getCouponStatus(coupon).key;
      if (key === "inactive") counts.expired += 1;
      else counts[key] += 1;
    });
    return counts;
  }, [coupons]);

  const visibleCoupons = useMemo(() => {
    const term = search.trim().toUpperCase();
    return coupons.filter((coupon) => {
      const key = getCouponStatus(coupon).key;
      const filterKey = key === "inactive" ? "expired" : key;
      if (statusFilter !== "all" && filterKey !== statusFilter) return false;
      return !term || String(coupon.code || "").toUpperCase().includes(term);
    });
  }, [coupons, search, statusFilter]);

  const previewParts = [];
  const previewValue = Number(value);
  if (previewValue > 0) {
    previewParts.push(type === "percentage" ? `${previewValue}% off` : `Rs ${previewValue} off`);
    previewParts.push(Number(minOrder) > 0 ? `on orders of Rs ${Number(minOrder)} or more` : "on any order");
    previewParts.push(selectedProducts.length ? `for ${selectedProducts.length} selected product${selectedProducts.length === 1 ? "" : "s"}` : "storewide");
    previewParts.push(expiresAt ? `until ${formatPickedDate(expiresAt)}` : "with no expiry");
    if (usageLimit) previewParts.push(`for the first ${usageLimit} use${Number(usageLimit) === 1 ? "" : "s"}`);
    if (assignedUserEmail) previewParts.push(`only for ${assignedUserEmail}`);
  }

  return (
    <div className="admin-layout">
      <AdminSidebar />

      <main className="admin-main">
        <div className="admin-header">
          <h1>Coupon Manager</h1>
          <p>Create, renew, and remove discount codes from one place.</p>
        </div>

        <section className="card coupon-form-card">
          <h3>Create Coupon</h3>

          <div className="coupon-form-section">
            <h4 className="coupon-section-title">Discount</h4>
            <div className="coupon-form-grid">
              <label className="coupon-field">
                <span>Coupon code</span>
                <input
                  placeholder="e.g. WELCOME10"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, ""))}
                  maxLength={30}
                />
              </label>
              <div className="coupon-field">
                <span id="coupon-type-label">Discount type</span>
                <div className="coupon-segmented" role="group" aria-labelledby="coupon-type-label">
                  <button
                    type="button"
                    className={type === "percentage" ? "is-selected" : ""}
                    aria-pressed={type === "percentage"}
                    onClick={() => setType("percentage")}
                  >
                    Percentage %
                  </button>
                  <button
                    type="button"
                    className={type === "fixed" ? "is-selected" : ""}
                    aria-pressed={type === "fixed"}
                    onClick={() => setType("fixed")}
                  >
                    Fixed Rs
                  </button>
                </div>
              </div>
              <label className="coupon-field">
                <span>Discount</span>
                <div className={`coupon-input-affix ${type === "percentage" ? "has-suffix" : "has-prefix"}`}>
                  {type === "fixed" && <em>Rs</em>}
                  <input
                    type="number"
                    inputMode="decimal"
                    min="1"
                    max={type === "percentage" ? "100" : undefined}
                    placeholder={type === "percentage" ? "10" : "200"}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                  {type === "percentage" && <em>%</em>}
                </div>
              </label>
              <label className="coupon-field">
                <span>Minimum order</span>
                <div className="coupon-input-affix has-prefix">
                  <em>Rs</em>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    placeholder="0 (any amount)"
                    value={minOrder}
                    onChange={(e) => setMinOrder(e.target.value)}
                  />
                </div>
              </label>
            </div>
          </div>

          <div className="coupon-form-section">
            <h4 className="coupon-section-title">Validity & limits <small>all optional</small></h4>
            <div className="coupon-form-grid">
              <label className="coupon-field">
                <span>Expiry date</span>
                <div className="coupon-date-wrap">
                  <input
                    type="date"
                    min={todayDate}
                    className={expiresAt ? "" : "is-empty"}
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                  />
                  {expiresAt && (
                    <button type="button" className="coupon-clear-btn" onClick={() => setExpiresAt("")} aria-label="Clear expiry date">
                      <X size={14} />
                    </button>
                  )}
                </div>
                <small>{expiresAt ? "Valid until the end of this day (India time)" : "Empty = never expires"}</small>
              </label>
              <label className="coupon-field">
                <span>Total uses</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  placeholder="No limit"
                  value={usageLimit}
                  onChange={(e) => setUsageLimit(e.target.value)}
                />
                <small>Across all customers</small>
              </label>
              <label className="coupon-field coupon-field--wide">
                <span>Only for this customer</span>
                <input
                  placeholder="customer@example.com"
                  type="email"
                  value={assignedUserEmail}
                  onChange={(e) => setAssignedUserEmail(e.target.value)}
                />
                <small>Empty = any customer. Each customer can use a coupon once.</small>
              </label>
            </div>
          </div>

          <div className="coupon-form-section">
            <div className="coupon-products-head">
              <h4 className="coupon-section-title">
                Applies to <small>{selectedProducts.length ? `${selectedProducts.length} selected` : "all products"}</small>
              </h4>
              {selectedProducts.length > 0 && (
                <button type="button" className="coupon-link-btn" onClick={() => setSelectedProducts([])}>
                  Clear selection
                </button>
              )}
            </div>
            <div className="coupon-search">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                placeholder="Search products to restrict this coupon"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>
            <div className="applicable-products-list">
              {visibleProducts.length === 0 ? (
                <p className="coupon-muted coupon-small">No products match “{productSearch}”.</p>
              ) : (
                visibleProducts.map((prod) => {
                  // Shoppers always buy one format, never the parent, so a coupon on the parent would never apply.
                  const isFormatParent = prod.hasOptions === true;
                  return (
                    <label
                      key={prod._id}
                      className={`applicable-product-item${isFormatParent ? " is-disabled" : ""}`}
                      title={isFormatParent ? "This product is sold in formats. Select the formats instead." : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={selectedProducts.includes(prod._id)}
                        disabled={isFormatParent}
                        onChange={(e) => toggleProduct(prod._id, e.target.checked)}
                      />
                      <span>
                        {prod.name}
                        {isFormatParent && <em className="applicable-product-note">Select its formats instead</em>}
                      </span>
                      {!isFormatParent && <small>Rs {prod.price}</small>}
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {previewParts.length > 0 && (
            <p className="coupon-preview">
              <strong>{code || "This coupon"}</strong> gives {previewParts.join(", ")}.
            </p>
          )}

          <div className="coupon-form-actions">
            <button className="primary-btn" disabled={isSaving} onClick={createCoupon}>
              {isSaving ? "Creating..." : "Create Coupon"}
            </button>
            {message.text && (
              <span className={`coupon-message coupon-message--${message.tone}`} role="status">{message.text}</span>
            )}
          </div>
        </section>

        <section className="card coupon-list-card">
          <div className="coupon-list-header">
            <h3>All Coupons</h3>
            <span>{isLoading ? "Loading..." : `${visibleCoupons.length} of ${coupons.length}`}</span>
          </div>

          <div className="coupon-toolbar">
            <div className="coupon-filters" role="tablist" aria-label="Filter coupons by status">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === f.key}
                  className={statusFilter === f.key ? "is-selected" : ""}
                  onClick={() => setStatusFilter(f.key)}
                >
                  {f.label} <span>{statusCounts[f.key]}</span>
                </button>
              ))}
            </div>
            <div className="coupon-search coupon-search--compact">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                placeholder="Search code"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {listMessage.text && (
            <p className={`coupon-list-message coupon-list-message--${listMessage.tone}`} role="status">
              {listMessage.text}
            </p>
          )}

          {isLoading ? (
            <div className="coupon-empty">Loading coupons...</div>
          ) : coupons.length === 0 ? (
            <div className="coupon-empty">No coupons yet. Create your first one above.</div>
          ) : visibleCoupons.length === 0 ? (
            <div className="coupon-empty">No coupons match this filter.</div>
          ) : (
            <div className="coupon-table-wrap">
              <table className="coupon-table">
                <thead>
                  <tr>
                    <th>Coupon</th>
                    <th>Applies to</th>
                    <th>Usage</th>
                    <th>Validity</th>
                    <th>Status</th>
                    <th>Last updated</th>
                    <th className="coupon-actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCoupons.map((coupon) => {
                    const status = getCouponStatus(coupon);
                    const needsReactivation = status.key !== "active";
                    const isRenewOpen = renewingId === coupon._id;
                    const used = getUsedCount(coupon);
                    const customersWhoUsed = Array.isArray(coupon.usedBy) ? coupon.usedBy.length : 0;
                    const expiryNote = getExpiryNote(coupon);
                    const products = Array.isArray(coupon.applicableProducts) ? coupon.applicableProducts : [];
                    const productNames = products.map((p) => p?.name || "Product");
                    return (
                      <Fragment key={coupon._id}>
                        <tr className={isRenewOpen ? "coupon-row--editing" : undefined}>
                          <td>
                            <span className="code-pill">{coupon.code}</span>
                            <div className="coupon-sub">
                              {formatDiscount(coupon)}
                              {Number(coupon.minOrder || 0) > 0 ? ` · min Rs ${Number(coupon.minOrder)}` : ""}
                            </div>
                          </td>
                          <td className="coupon-applies">
                            {productNames.length > 0 ? (
                              <div className="coupon-clamp" title={productNames.join("\n")}>
                                <strong>{productNames.length} product{productNames.length === 1 ? "" : "s"}:</strong>{" "}
                                {productNames.join(", ")}
                              </div>
                            ) : (
                              <span className="coupon-muted">All products</span>
                            )}
                            {coupon.assignedUserEmail && (
                              <div className="coupon-sub" title={coupon.assignedUserEmail}>
                                Only {coupon.assignedUserEmail}
                              </div>
                            )}
                          </td>
                          <td className="coupon-nowrap">
                            <div>{coupon.usageLimit ? `${used} / ${coupon.usageLimit}` : used} {used === 1 && !coupon.usageLimit ? "use" : "uses"}</div>
                            <div className="coupon-sub">{coupon.usageLimit ? `${Math.max(0, coupon.usageLimit - used)} left` : "No limit"}</div>
                          </td>
                          <td className="coupon-nowrap">
                            <div>{coupon.expiresAt ? formatDate(coupon.expiresAt) : "No expiry"}</div>
                            <div className={`coupon-sub ${expiryNote.tone ? `coupon-sub--${expiryNote.tone}` : ""}`}>{expiryNote.text}</div>
                          </td>
                          <td>
                            <span className={`coupon-status coupon-status--${status.key}`}>{status.label}</span>
                          </td>
                          <td className="coupon-nowrap">
                            {coupon.lastUpdatedAt ? (
                              <>
                                <div className="coupon-ellipsis" title={coupon.lastUpdatedByEmail || ""}>
                                  {coupon.lastUpdatedByName || coupon.lastUpdatedByEmail || "Admin"}
                                </div>
                                <div className="coupon-sub">
                                  {formatDate(coupon.lastUpdatedAt)}, {formatTime(coupon.lastUpdatedAt)}
                                </div>
                              </>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="coupon-actions-col">
                            <div className="coupon-row-actions">
                              <button
                                type="button"
                                className={`secondary-btn ${needsReactivation ? "secondary-btn--accent" : ""}`}
                                onClick={() => (isRenewOpen ? cancelRenew() : startRenew(coupon))}
                                aria-expanded={isRenewOpen}
                              >
                                {isRenewOpen ? "Close" : needsReactivation ? "Reactivate" : "Renew"}
                              </button>
                              <button type="button" className="danger-btn" onClick={() => deleteCoupon(coupon)}>
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isRenewOpen && (
                          <tr className="coupon-renew-row">
                            <td colSpan={7}>
                              <div className="coupon-renew">
                                <div className="coupon-renew-title">
                                  {needsReactivation ? "Reactivate" : "Renew"} <span className="code-pill">{coupon.code}</span>
                                  <span className="coupon-muted">Discount stays {formatDiscount(coupon)}</span>
                                </div>
                                <div className="coupon-renew-fields">
                                  <label className="coupon-field">
                                    <span>New expiry date</span>
                                    <div className="coupon-date-wrap">
                                      <input
                                        type="date"
                                        min={todayDate}
                                        className={renewDate ? "" : "is-empty"}
                                        value={renewDate}
                                        onChange={(e) => setRenewDate(e.target.value)}
                                      />
                                      {renewDate && (
                                        <button type="button" className="coupon-clear-btn" onClick={() => setRenewDate("")} aria-label="Clear expiry date">
                                          <X size={14} />
                                        </button>
                                      )}
                                    </div>
                                    <small>{renewDate ? "Valid until the end of this day (India time)" : "Empty = never expires"}</small>
                                  </label>
                                  <label className="coupon-field">
                                    <span>Total uses</span>
                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      min={used + 1}
                                      step="1"
                                      placeholder="No limit"
                                      value={renewLimit}
                                      onChange={(e) => setRenewLimit(e.target.value)}
                                    />
                                    <small>Used {used} time{used === 1 ? "" : "s"} so far. Empty = no limit</small>
                                  </label>
                                  <label className={`coupon-check ${customersWhoUsed === 0 ? "is-disabled" : ""}`}>
                                    <input
                                      type="checkbox"
                                      checked={renewResetCustomers}
                                      disabled={customersWhoUsed === 0}
                                      onChange={(e) => setRenewResetCustomers(e.target.checked)}
                                    />
                                    <span>
                                      Let customers who already used it use it again
                                      <small>
                                        {customersWhoUsed === 0
                                          ? "No customer has used it yet."
                                          : `${customersWhoUsed} customer${customersWhoUsed === 1 ? "" : "s"}. Their past orders keep the discount they got.`}
                                      </small>
                                    </span>
                                  </label>
                                </div>
                                {renewError && <p className="coupon-renew-error" role="alert">{renewError}</p>}
                                <div className="coupon-row-actions">
                                  <button type="button" className="primary-btn" disabled={isRenewing} onClick={() => saveRenew(coupon)}>
                                    {isRenewing ? "Saving..." : needsReactivation ? "Reactivate coupon" : "Save changes"}
                                  </button>
                                  <button type="button" className="secondary-btn" disabled={isRenewing} onClick={cancelRenew}>
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
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
