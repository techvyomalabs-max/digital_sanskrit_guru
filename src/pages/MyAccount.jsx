import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import axios from "axios";
import { apiBaseUrl } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { useCart } from "../hooks/useCart";
import { useWishlist } from "../hooks/useWishlist";
import { useDeliveryLocation } from "../hooks/useDeliveryLocation";
import { formatCurrencyForUser } from "../utils/currency";
import { formatDate } from "../utils/date";
import "./MyAccount.css";

// ── Push Notification Subscribe Section ──────────────────────────────────────
function PushSubscribeSection({ token }) {
  const [permission, setPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const [status, setStatus] = useState("");
  const [isSubscribing, setIsSubscribing] = useState(false);

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  }

  const subscribe = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("Push notifications are not supported by your browser.");
      return;
    }
    setIsSubscribing(true);
    setStatus("");
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") {
        setStatus("Notification permission denied. Enable it in browser settings.");
        return;
      }
      const sw = await navigator.serviceWorker.ready;
      const existing = await sw.pushManager.getSubscription();
      if (existing) {
        setStatus("✅ You are already subscribed to push notifications.");
        return;
      }
      const keyRes = await fetch(`${apiBaseUrl || ""}/api/push/vapid-key`);
      if (!keyRes.ok) throw new Error("Could not get push key.");
      const { publicKey } = await keyRes.json();
      const sub = await sw.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
      if (token) {
        await axios.post("/api/push/subscribe", sub.toJSON(), {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      setStatus("✅ Subscribed! You'll receive notifications for orders and stock alerts.");
    } catch (err) {
      setStatus(err?.message || "Failed to subscribe.");
    } finally {
      setIsSubscribing(false);
    }
  };

  const unsubscribe = async () => {
    setIsSubscribing(true);
    setStatus("");
    try {
      const sw = await navigator.serviceWorker.ready;
      const sub = await sw.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        if (token) {
          await axios.delete("/api/push/unsubscribe", {
            headers: { Authorization: `Bearer ${token}` },
            data: { endpoint: sub.endpoint }
          });
        }
      }
      setPermission("default");
      setStatus("Unsubscribed from push notifications.");
    } catch {
      setStatus("Failed to unsubscribe.");
    } finally {
      setIsSubscribing(false);
    }
  };

  if (!("Notification" in window) || !("serviceWorker" in navigator)) return null;

  return (
    <section className="my-account-panel my-account-panel-compact">
      <div className="my-account-panel-head">
        <div>
          <p className="my-account-section-kicker">Notifications</p>
          <h2>Push Notifications</h2>
        </div>
      </div>
      <div className="my-account-push-box">
        <p className="my-account-push-desc">
          Get instant alerts for order updates, delivery status, and low-stock warnings for your wishlist items.
        </p>
        <div className="my-account-push-status">
          <span className={`my-account-push-dot ${permission === "granted" ? "on" : "off"}`} />
          {permission === "granted" ? "Notifications enabled" : permission === "denied" ? "Notifications blocked in browser" : "Notifications not enabled"}
        </div>
        {status && <p className="my-account-push-msg">{status}</p>}
        <div className="my-account-push-actions">
          {permission !== "denied" && permission !== "granted" && (
            <button
              type="button"
              className="my-account-push-btn primary"
              onClick={subscribe}
              disabled={isSubscribing}
            >
              {isSubscribing ? "Subscribing..." : "Enable Push Notifications"}
            </button>
          )}
          {permission === "granted" && (
            <button
              type="button"
              className="my-account-push-btn"
              onClick={unsubscribe}
              disabled={isSubscribing}
            >
              {isSubscribing ? "Processing..." : "Disable Notifications"}
            </button>
          )}
          {permission === "denied" && (
            <p className="my-account-push-hint">To re-enable, click the lock icon in your browser address bar → Notifications → Allow.</p>
          )}
        </div>
      </div>
    </section>
  );
}


async function fetchCoordinatesForAddress(parts = {}) {
  const query = [
    parts.address,
    parts.landmark,
    parts.city,
    parts.state,
    parts.pincode,
    parts.country
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(", ");

  if (!query) {
    return { latitude: null, longitude: null };
  }

  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "1",
    addressdetails: "1"
  });

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      return { latitude: null, longitude: null };
    }

    const results = await response.json();
    const first = Array.isArray(results) ? results[0] : null;
    const latitude = Number(first?.lat);
    const longitude = Number(first?.lon);

    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return { latitude: null, longitude: null };
    }

    return { latitude, longitude };
  } catch {
    return { latitude: null, longitude: null };
  }
}

function MyAccount() {
  const { user, token } = useAuth();
  const { cartItems } = useCart();
  const { wishlist } = useWishlist();
  const { addresses, addAddress, updateAddress, removeAddress, setDefaultAddress } = useDeliveryLocation();
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [showAddressForm, setShowAddressForm] = useState(addresses.length === 0);
  const [editingIndex, setEditingIndex] = useState(null);
  const [addressError, setAddressError] = useState("");
  const [addressLabel, setAddressLabel] = useState("Home");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [country, setCountry] = useState("India");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shouldOpenAddressForm = params.get("openAddressForm") === "1";
    const shouldScrollToAddresses = location.hash === "#manage-address" || shouldOpenAddressForm;

    if (!shouldOpenAddressForm && !shouldScrollToAddresses) return;

    if (shouldOpenAddressForm) {
      setEditingIndex(null);
      setShowAddressForm(true);
    }

    window.requestAnimationFrame(() => {
      document.getElementById("manage-address")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [location.hash, location.search]);

  useEffect(() => {
    if (!token) return;

    let active = true;

    axios
      .get("/api/orders/my", {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then((res) => {
        if (!active) return;
        setOrders(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        if (!active) return;
        setOrders([]);
      });

    return () => {
      active = false;
    };
  }, [token]);

  const orderSummary = useMemo(() => {
    const delivered = orders.filter((order) => String(order?.status || "").toLowerCase() === "delivered").length;
    const open = orders.filter((order) => {
      const status = String(order?.status || "").toLowerCase();
      return status && status !== "delivered";
    }).length;
    const latestOrder = orders[0] || null;

    return {
      total: orders.length,
      delivered,
      open,
      latestOrder
    };
  }, [orders]);

  const recentOrders = useMemo(() => orders.slice(0, 2), [orders]);

  const manageTiles = [
    {
      eyebrow: "Orders",
      title: "Your Orders",
      text: "Track packages, return items, and download invoices from one place.",
      meta: `${orderSummary.total} total orders`,
      link: "/my-orders",
      action: "View orders"
    },
    {
      eyebrow: "Security",
      title: "Login & Security",
      text: "Check your account details and keep your profile information in one place.",
      meta: user?.email || "No email saved",
      link: "/account",
      action: "View details"
    },
    {
      eyebrow: "Saved For Later",
      title: "Wishlist",
      text: "Revisit the products you want later without searching again.",
      meta: `${wishlist.length} wishlist items`,
      link: "/wishlist",
      action: "Open wishlist"
    },
    {
      eyebrow: "Shopping",
      title: "Your Cart",
      text: "Continue checkout with the items you already selected.",
      meta: `${cartItems.length} items in cart`,
      link: "/cart",
      action: "Go to cart"
    }
  ];

  if (user?.isAdmin) {
    manageTiles.push({
      eyebrow: "Store Control",
      title: "Admin Dashboard",
      text: "Open products, users, orders, and settings from your admin workspace.",
      meta: "Administrator access",
      link: "/admin",
      action: "Open admin"
    });
  }

  const resetAddressForm = () => {
    setAddressLabel("Home");
    setName("");
    setPhone("");
    setAddress("");
    setLandmark("");
    setCity("");
    setState("");
    setPincode("");
    setCountry("India");
    setEditingIndex(null);
  };

  const saveAddress = async () => {
    const cleanPhone = String(phone || "").replace(/\D/g, "");
    const cleanPincode = String(pincode || "").trim();
    const cleanCountry = String(country || "").trim();

    if (!name || !cleanPhone || !address || !city || !state || !cleanPincode || !cleanCountry) {
      setAddressError("Please fill full name, phone, address, city, state, postal code, and country.");
      return;
    }

    if (cleanPhone.length < 10) {
      setAddressError("Enter a valid phone number (at least 10 digits).");
      return;
    }

    if (!/^[A-Za-z0-9\s-]{3,12}$/.test(cleanPincode)) {
      setAddressError("Enter a valid postal code.");
      return;
    }

    setAddressError("");

    const existingAddress = editingIndex === null ? null : addresses[editingIndex] || null;
    const nextCoordinates = await fetchCoordinatesForAddress({
      address,
      landmark,
      city,
      state,
      pincode: cleanPincode,
      country: cleanCountry
    });

    const payload = {
      label: addressLabel,
      name,
      phone: cleanPhone,
      address,
      landmark,
      city,
      state,
      pincode: cleanPincode,
      country: cleanCountry,
      latitude:
        nextCoordinates.latitude !== null
          ? nextCoordinates.latitude
          : existingAddress?.latitude ?? null,
      longitude:
        nextCoordinates.longitude !== null
          ? nextCoordinates.longitude
          : existingAddress?.longitude ?? null,
      isDefault: editingIndex === null ? addresses.length === 0 : addresses[editingIndex]?.isDefault
    };

    if (editingIndex === null) {
      addAddress(payload);
    } else {
      updateAddress(editingIndex, payload);
    }

    resetAddressForm();
    setShowAddressForm(false);
    setAddressError("");
  };

  const editAddress = (index) => {
    const current = addresses[index];
    if (!current) return;

    setAddressLabel(current.label || "Home");
    setName(current.name || "");
    setPhone(current.phone || "");
    setAddress(current.address || "");
    setLandmark(current.landmark || "");
    setCity(current.city || "");
    setState(current.state || "");
    setPincode(current.pincode || "");
    setCountry(current.country || "India");
    setEditingIndex(index);
    setShowAddressForm(true);
  };

  const deleteAddress = (index) => {
    removeAddress(index);
    if (editingIndex === index) {
      resetAddressForm();
    }
  };

  return (
    <div className="my-account-page">
      <section className="my-account-header">
        <div>
          <p className="my-account-kicker">Your Account</p>
          <h1>Hello, {user?.name || "Customer"}</h1>
          <p className="my-account-subtitle">
            Access your orders, saved items, and account shortcuts just like an account home page.
          </p>
        </div>

        <div className="my-account-highlight">
          <span className="my-account-highlight-label">Latest order</span>
          {orderSummary.latestOrder ? (
            <>
              <strong>{formatDate(orderSummary.latestOrder.createdAt)}</strong>
              <p>
                {orderSummary.latestOrder.status || "Pending"} •{" "}
                {formatCurrencyForUser(orderSummary.latestOrder.total)}
              </p>
              <Link to="/my-orders" className="my-account-pill-link">
                Track order
              </Link>
            </>
          ) : (
            <>
              <strong>No orders yet</strong>
              <p>Start shopping to see your recent orders here.</p>
              <Link to="/" className="my-account-pill-link">
                Continue shopping
              </Link>
            </>
          )}
        </div>
      </section>

      <section className="my-account-summary-strip">
        <div className="my-account-summary-item">
          <span>Total Orders</span>
          <strong>{orderSummary.total}</strong>
        </div>
        <div className="my-account-summary-item">
          <span>Open Orders</span>
          <strong>{orderSummary.open}</strong>
        </div>
        <div className="my-account-summary-item">
          <span>Delivered</span>
          <strong>{orderSummary.delivered}</strong>
        </div>
        <div className="my-account-summary-item">
          <span>Wishlist</span>
          <strong>{wishlist.length}</strong>
        </div>
      </section>

      <section className="my-account-section my-account-section-compact">
        <div className="my-account-section-head">
          <div>
            <p className="my-account-section-kicker">Account Services</p>
            <h2>Your account</h2>
          </div>
        </div>

        <div className="my-account-tile-grid">
          {manageTiles.map((tile) => (
            <Link key={tile.title} to={tile.link} className="my-account-tile">
              <div className="my-account-tile-icon" aria-hidden="true">
                {tile.title.charAt(0)}
              </div>
              <div className="my-account-tile-copy">
                <p className="my-account-tile-eyebrow">{tile.eyebrow}</p>
                <h3>{tile.title}</h3>
                <p>{tile.text}</p>
                <div className="my-account-tile-footer">
                  <span>{tile.meta}</span>
                  <strong>{tile.action}</strong>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section id="manage-address" className="my-account-panel my-account-panel-compact">
        <div className="my-account-panel-head">
          <div>
            <p className="my-account-section-kicker">Profile</p>
            <h2>Account details</h2>
          </div>
        </div>

        <div className="my-account-detail-list">
          <div className="my-account-detail-row">
            <span>Name</span>
            <strong>{user?.name || "Not available"}</strong>
          </div>
          <div className="my-account-detail-row">
            <span>Email</span>
            <strong>{user?.email || "Not available"}</strong>
          </div>
          <div className="my-account-detail-row">
            <span>Account Type</span>
            <strong>{user?.isAdmin ? "Administrator" : "Customer"}</strong>
          </div>
          <div className="my-account-detail-row">
            <span>Items in Cart</span>
            <strong>{cartItems.length}</strong>
          </div>
        </div>
      </section>

      <section className="my-account-panel my-account-panel-compact">
        <div className="my-account-panel-head">
          <div>
            <p className="my-account-section-kicker">Address Book</p>
            <h2>Manage addresses</h2>
          </div>
          <button
            type="button"
            className="my-account-inline-link my-account-inline-btn"
            onClick={() => {
              if (showAddressForm && editingIndex !== null) {
                resetAddressForm();
              }
              setShowAddressForm((current) => !current);
            }}
          >
            {showAddressForm ? "Close" : "Add New Address"}
          </button>
        </div>

        {addresses.length > 0 ? (
          <div className="my-account-address-list">
            {addresses.map((item, index) => (
              <div key={`${item.name}-${item.pincode}-${index}`} className="my-account-address-item">
                <div className="my-account-address-top">
                  <strong>{item.name || "Address"}</strong>
                  <span>{item.label || "Saved address"}</span>
                </div>
                <p>{item.phone}</p>
                <p>{item.address}</p>
                {item.landmark ? <p>Landmark: {item.landmark}</p> : null}
                <p>{[item.city, item.state, item.pincode, item.country].filter(Boolean).join(", ")}</p>
                <div className="my-account-address-actions">
                  <button type="button" onClick={() => editAddress(index)}>
                    Edit
                  </button>
                  <button type="button" className="danger" onClick={() => deleteAddress(index)}>
                    Delete
                  </button>
                  {!item.isDefault ? (
                    <button type="button" onClick={() => setDefaultAddress(index)}>
                      Set Default
                    </button>
                  ) : (
                    <span className="my-account-default-pill">Default</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="my-account-empty">
            <p>No saved address yet. Add your first address here.</p>
          </div>
        )}

        {showAddressForm ? (
          <div className="my-account-address-form">
            <div className="my-account-label-row">
              {["Home", "Work", "Other"].map((option) => (
                <button
                  key={option}
                  type="button"
                  className={addressLabel === option ? "my-account-label-chip active" : "my-account-label-chip"}
                  onClick={() => setAddressLabel(option)}
                >
                  {option}
                </button>
              ))}
            </div>

            <label>
              <span>Full Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rohan Sharma" />
            </label>
            <label>
              <span>Phone Number</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 9876543210" />
            </label>
            <label>
              <span>Complete Address</span>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Flat, house no., building, street, area"
              />
            </label>
            <label>
              <span>Landmark</span>
              <input value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="Optional landmark" />
            </label>
            <label>
              <span>City</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Delhi" />
            </label>
            <label>
              <span>State</span>
              <input value={state} onChange={(e) => setState(e.target.value)} placeholder="e.g. Uttar Pradesh" />
            </label>
            <label>
              <span>Postal Code</span>
              <input value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="e.g. 110001 or SW1A 1AA" />
            </label>
            <label>
              <span>Country</span>
              <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. India, USA, UK" />
            </label>

            {addressError && (
              <p className="my-account-form-error">{addressError}</p>
            )}

            <div className="my-account-address-form-actions">
              <button type="button" className="primary" onClick={saveAddress}>
                {editingIndex === null ? "Save Address" : "Update Address"}
              </button>
              {editingIndex !== null ? (
                <button
                  type="button"
                  onClick={() => {
                    resetAddressForm();
                    setShowAddressForm(false);
                    setAddressError("");
                  }}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      <section className="my-account-panel my-account-panel-compact">
        <div className="my-account-panel-head">
          <div>
            <p className="my-account-section-kicker">Recent Activity</p>
            <h2>Your recent orders</h2>
          </div>
          <Link to="/my-orders" className="my-account-inline-link">
            See all
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <div className="my-account-empty">
            <p>You have not placed any orders yet.</p>
            <Link to="/" className="my-account-inline-link">
              Start shopping
            </Link>
          </div>
        ) : (
          <div className="my-account-recent-orders">
            {recentOrders.map((order) => (
              <div key={order._id} className="my-account-order-card">
                <div className="my-account-order-meta">
                  <div>
                    <span>Ordered on</span>
                    <strong>{formatDate(order.createdAt)}</strong>
                  </div>
                  <div>
                    <span>Total</span>
                    <strong>{formatCurrencyForUser(order.total)}</strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>{order.status || "Pending"}</strong>
                  </div>
                </div>
                <div className="my-account-order-body">
                  <div>
                    <p className="my-account-order-id">Order ID: {order._id}</p>
                    <p className="my-account-order-items">
                      {(order.items || [])
                        .slice(0, 3)
                        .map((item) => `${item.name} x ${item.quantity || 1}`)
                        .join(", ")}
                    </p>
                  </div>
                  <Link to="/my-orders" className="my-account-pill-link">
                    View details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <PushSubscribeSection token={token} />
    </div>
  );
}

export default MyAccount;


