import { useEffect, useMemo, useState, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import axios from "axios";
import { apiBaseUrl } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { useCart } from "../hooks/useCart";
import { useWishlist } from "../hooks/useWishlist";
import { useDeliveryLocation } from "../hooks/useDeliveryLocation";
import { formatCurrencyForUser } from "../utils/currency";
import { formatDate } from "../utils/date";
import { reverseGeocodeCoordinates, getCurrentDevicePosition } from "../utils/geoAddress";
import "./MyAccount.css";
import LoadingSpinner from "../components/common/LoadingSpinner";
import { Bell, BellOff } from "lucide-react";

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

  const isGranted = permission === "granted";

  return (
    <section className="my-account-panel my-account-panel-compact">
      <div className="my-account-panel-head">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div className={`my-account-bell-icon-badge ${isGranted ? "active" : ""}`}>
            {isGranted ? <Bell size={20} /> : <BellOff size={20} />}
          </div>
          <div>
            <p className="my-account-section-kicker">Notifications</p>
            <h2>Push Notifications</h2>
          </div>
        </div>
      </div>

      <div className="my-account-push-box">
        <p className="my-account-push-desc">
          Get instant alerts for order updates, delivery status, and low-stock warnings for your wishlist items.
        </p>

        <div className="notifications-toggle-card">
          <div className="notifications-toggle-info">
            <span className="notifications-toggle-text">
              {isSubscribing
                ? "Updating settings..."
                : isGranted
                ? "Push Notifications Active"
                : "Push Notifications Off"}
            </span>
            <div className="notifications-status-row">
              <span className={`notifications-status-pill ${isGranted ? "active" : ""}`}>
                {isGranted ? "Enabled" : permission === "denied" ? "Blocked in browser" : "Disabled"}
              </span>
            </div>
          </div>

          <button
            type="button"
            className={`notifications-toggle${isGranted ? " on" : ""}`}
            onClick={isGranted ? unsubscribe : subscribe}
            disabled={isSubscribing || permission === "denied"}
            role="switch"
            aria-checked={isGranted}
            aria-label="Toggle push notifications"
          >
            <span className="notifications-toggle-thumb">
              {isSubscribing ? (
                <span className="notifications-spinner-dot" />
              ) : isGranted ? (
                <Bell size={12} style={{ color: "#059669" }} />
              ) : (
                <BellOff size={12} style={{ color: "#64748b" }} />
              )}
            </span>
          </button>
        </div>

        {status && <p className="my-account-push-msg">{status}</p>}

        {permission === "denied" && (
          <p className="my-account-push-hint" style={{ marginTop: "8px", fontSize: "13px", color: "var(--site-text-soft)" }}>
            🔒 To re-enable, click the lock icon in your browser address bar → Notifications → Allow.
          </p>
        )}
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
  const { user, token, updateProfileState } = useAuth();
  const { cartItems } = useCart();
  const { wishlist } = useWishlist();
  const { addresses, addAddress, updateAddress, removeAddress, setDefaultAddress } = useDeliveryLocation();
  const location = useLocation();
  const addressFormRef = useRef(null);
  const nameInputRef = useRef(null);
  const [orders, setOrders] = useState([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [showAddressForm, setShowAddressForm] = useState(addresses.length === 0);
  const [editingIndex, setEditingIndex] = useState(null);
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState(null);
  const [addressError, setAddressError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [addressLabel, setAddressLabel] = useState("Home");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [country, setCountry] = useState("India");
  const [enableCurrentLocation, setEnableCurrentLocation] = useState(true);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [locationStatusMessage, setLocationStatusMessage] = useState("");

  useEffect(() => {
    axios
      .get("/api/settings/public")
      .then((res) => {
        if (res.data?.enableCurrentLocation !== undefined) {
          setEnableCurrentLocation(res.data.enableCurrentLocation);
        }
      })
      .catch(() => {});
  }, []);

  const handleUseCurrentLocation = async () => {
    if (isDetectingLocation) return;
    setIsDetectingLocation(true);
    setLocationStatusMessage("Detecting your location...");

    try {
      const position = await getCurrentDevicePosition();
      const latitude = Number(position?.coords?.latitude);
      const longitude = Number(position?.coords?.longitude);

      if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
        throw new Error("Could not read coordinates from device.");
      }

      const resolved = await reverseGeocodeCoordinates(latitude, longitude);
      if (resolved.address) setAddress(resolved.address);
      if (resolved.landmark) setLandmark(resolved.landmark);
      if (resolved.city) setCity(resolved.city);
      if (resolved.state) setState(resolved.state);
      if (resolved.pincode) setPincode(resolved.pincode);
      if (resolved.country) setCountry(resolved.country);

      setLocationStatusMessage("Location detected! Please review and complete your Flat / House number.");
    } catch (err) {
      setLocationStatusMessage(err?.message || "Could not detect current location.");
    } finally {
      setIsDetectingLocation(false);
    }
  };

  // Profile Edit states
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(user?.name || "");
  const [profileEmail, setProfileEmail] = useState(user?.email || "");
  const [profilePassword, setProfilePassword] = useState("");
  const [profilePasswordConfirm, setProfilePasswordConfirm] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    if (user) {
      setProfileName(user.name || "");
      setProfileEmail(user.email || "");
    }
  }, [user]);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setProfileMessage("");
    setProfileError("");

    if (!profileName.trim()) {
      setProfileError("Name is required.");
      return;
    }
    if (!profileEmail.trim()) {
      setProfileError("Email is required.");
      return;
    }
    if (profilePassword && profilePassword !== profilePasswordConfirm) {
      setProfileError("Passwords do not match.");
      return;
    }

    setIsSavingProfile(true);
    try {
      const res = await axios.put(
        "/api/auth/profile",
        {
          name: profileName,
          email: profileEmail,
          password: profilePassword || undefined
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (res.data?.success) {
        updateProfileState(res.data);
        setProfileMessage("Profile updated successfully!");
        setProfilePassword("");
        setProfilePasswordConfirm("");
        setIsEditingProfile(false);
      } else {
        setProfileError("Failed to update profile.");
      }
    } catch (err) {
      console.error(err);
      setProfileError(err.response?.data?.message || "Failed to update profile details.");
    } finally {
      setIsSavingProfile(false);
    }
  };

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
    if (!token) {
      setIsLoadingOrders(false);
      return;
    }

    let active = true;
    const safetyTimer = setTimeout(() => {
      if (active) setIsLoadingOrders(false);
    }, 2500);

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
      })
      .finally(() => {
        if (!active) return;
        clearTimeout(safetyTimer);
        setIsLoadingOrders(false);
      });

    return () => {
      active = false;
      clearTimeout(safetyTimer);
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
    setAddressError("");
    setFieldErrors({});
  };

  const closeAddressForm = () => {
    resetAddressForm();
    setShowAddressForm(false);
    window.location.reload();
  };

  const openNewAddressForm = () => {
    resetAddressForm();
    setShowAddressForm(true);
    setTimeout(() => {
      if (addressFormRef.current) {
        addressFormRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      if (nameInputRef.current) {
        nameInputRef.current.focus();
      }
    }, 80);
  };

  const saveAddress = async () => {
    const errors = {};
    const digits = String(phone || "").replace(/\D/g, "");
    const cleanName = String(name || "").trim();
    const cleanAddress = String(address || "").trim();
    const cleanCity = String(city || "").trim();
    const cleanState = String(state || "").trim();
    const cleanPincode = String(pincode || "").trim();
    const cleanCountry = String(country || "").trim();

    if (!cleanName) errors.name = "Full Name is required.";
    if (!cleanAddress) errors.address = "Complete Address is required.";
    if (!cleanCity) errors.city = "City is required.";
    if (!cleanState) errors.state = "State is required.";
    if (!cleanCountry) errors.country = "Country is required.";

    const isIndia = !cleanCountry || cleanCountry.toLowerCase() === "india";
    if (!digits) {
      errors.phone = "Phone number is required.";
    } else if (isIndia && !/^[6-9]\d{9}$/.test(digits)) {
      errors.phone = "Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9 (e.g. 9876543210).";
    } else if (!isIndia && (digits.length < 7 || digits.length > 15)) {
      errors.phone = "Please enter a valid phone number (7 to 15 digits).";
    }

    if (!cleanPincode) {
      errors.pincode = "Postal code is required.";
    } else if (!/^[A-Za-z0-9\s-]{3,12}$/.test(cleanPincode)) {
      errors.pincode = "Enter a valid postal code (e.g. 560072 or 110001).";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setAddressError("Please fix the highlighted errors below.");
      return;
    }

    setFieldErrors({});
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
    setAddressError("");

    setTimeout(() => {
      if (addressFormRef.current) {
        addressFormRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      if (nameInputRef.current) {
        nameInputRef.current.focus();
      }
    }, 80);
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
          {isLoadingOrders ? (
            <LoadingSpinner text="Checking orders..." minHeight="70px" size="24px" />
          ) : orderSummary.latestOrder ? (
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
          {!isEditingProfile && (
            <button
              type="button"
              className="my-account-inline-link my-account-inline-btn"
              onClick={() => {
                setIsEditingProfile(true);
                setProfileMessage("");
                setProfileError("");
              }}
            >
              Edit Profile
            </button>
          )}
        </div>

        {isEditingProfile ? (
          <form onSubmit={handleProfileSave} className="my-account-address-form" style={{ marginTop: "14px" }}>
            <label>
              <span>Full Name</span>
              <input value={profileName} onChange={(e) => setProfileName(e.target.value)} required />
            </label>
            <label>
              <span>Email Address</span>
              <input type="email" value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} required />
            </label>
            <label>
              <span>New Password (Leave blank to keep current)</span>
              <input type="password" value={profilePassword} onChange={(e) => setProfilePassword(e.target.value)} placeholder="Minimum 6 characters" />
            </label>
            {profilePassword && (
              <label>
                <span>Confirm New Password</span>
                <input type="password" value={profilePasswordConfirm} onChange={(e) => setProfilePasswordConfirm(e.target.value)} required />
              </label>
            )}

            {profileError && <p className="my-account-form-error">{profileError}</p>}

            <div className="my-account-address-form-actions">
              <button type="submit" className="primary" disabled={isSavingProfile}>
                {isSavingProfile ? "Saving..." : "Save Details"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditingProfile(false);
                  setProfileName(user?.name || "");
                  setProfileEmail(user?.email || "");
                  setProfilePassword("");
                  setProfilePasswordConfirm("");
                  setProfileError("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
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
            {profileMessage && (
              <p style={{ margin: "14px 0 0", color: "#15803d", fontWeight: "700", fontSize: "13px" }}>
                {profileMessage}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="my-account-panel my-account-panel-compact">
        <div className="my-account-panel-head">
          <div>
            <p className="my-account-section-kicker">Address Book</p>
            <h2>Manage addresses</h2>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {showAddressForm ? (
              <button
                type="button"
                className="my-account-inline-link my-account-inline-btn"
                onClick={closeAddressForm}
              >
                ✕ Close Form
              </button>
            ) : null}
            <button
              type="button"
              className="my-account-inline-link my-account-inline-btn"
              onClick={openNewAddressForm}
            >
              ➕ Add New Address
            </button>
          </div>
        </div>

        {addresses.length > 0 ? (
          <div className="my-account-address-list">
            {addresses.map((item, index) => {
              const isEditingThisCard = editingIndex === index && showAddressForm;

              return (
                <div
                  key={`${item.name}-${item.pincode}-${index}`}
                  className={`my-account-address-item ${isEditingThisCard ? "editing-active" : ""}`}
                >
                  <div className="my-account-address-top">
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <strong>{item.name || "Address"}</strong>
                      {isEditingThisCard && (
                        <span className="my-account-editing-badge">✏️ Editing Now</span>
                      )}
                    </div>
                    <span>{item.label || "Saved address"}</span>
                  </div>
                  <p>{item.phone}</p>
                  <p>{item.address}</p>
                  {item.landmark ? <p>Landmark: {item.landmark}</p> : null}
                  <p>{[item.city, item.state, item.pincode, item.country].filter(Boolean).join(", ")}</p>
                  
                  <div className="my-account-address-actions">
                    {isEditingThisCard ? (
                      <button
                        type="button"
                        className="my-account-editing-cancel-btn"
                        onClick={() => {
                          resetAddressForm();
                          setShowAddressForm(false);
                          setAddressError("");
                        }}
                      >
                        ✕ Cancel Editing
                      </button>
                    ) : (
                      <button type="button" onClick={() => editAddress(index)}>
                        Edit
                      </button>
                    )}
                    {confirmDeleteIndex === index ? (
                      <div className="my-account-delete-confirm-box">
                        <span className="my-account-delete-confirm-text">Delete address?</span>
                        <button
                          type="button"
                          className="my-account-delete-confirm-btn"
                          onClick={() => {
                            deleteAddress(index);
                            setConfirmDeleteIndex(null);
                          }}
                        >
                          ✓ Confirm
                        </button>
                        <button
                          type="button"
                          className="my-account-delete-cancel-btn"
                          onClick={() => setConfirmDeleteIndex(null)}
                        >
                          ✕ Cancel
                        </button>
                      </div>
                    ) : (
                      <button type="button" className="danger" onClick={() => setConfirmDeleteIndex(index)}>
                        Delete
                      </button>
                    )}
                    {!item.isDefault ? (
                      <button type="button" onClick={() => setDefaultAddress(index)}>
                        Set Default
                      </button>
                    ) : (
                      <span className="my-account-default-pill">Default</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="my-account-empty">
            <p>No saved address yet. Add your first address here.</p>
          </div>
        )}

        {showAddressForm ? (
          <div ref={addressFormRef} className="my-account-address-form">
            <div className="my-account-address-form-header">
              <h3>
                {editingIndex !== null
                  ? `✏️ Edit Address: ${addresses[editingIndex]?.name || name || "Address"}`
                  : "➕ Add New Address"}
              </h3>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {enableCurrentLocation && (
                  <button
                    type="button"
                    className="my-account-form-close-btn"
                    onClick={handleUseCurrentLocation}
                    disabled={isDetectingLocation}
                    style={{ background: "var(--site-link)", color: "#fff", borderColor: "var(--site-link)" }}
                  >
                    📍 {isDetectingLocation ? "Detecting..." : "Use Current Location"}
                  </button>
                )}
                <button
                  type="button"
                  className="my-account-form-close-btn"
                  onClick={closeAddressForm}
                >
                  ✕ Close
                </button>
              </div>
            </div>

            {locationStatusMessage ? (
              <p style={{ fontSize: "13px", color: "var(--site-link)", marginBottom: "12px", fontWeight: "600" }}>
                {locationStatusMessage}
              </p>
            ) : null}

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
              <input
                ref={nameInputRef}
                value={name}
                className={fieldErrors.name ? "invalid-input" : ""}
                onChange={(e) => {
                  setName(e.target.value);
                  if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: "" }));
                }}
                placeholder="e.g. Rohan Sharma"
              />
              {fieldErrors.name && <span className="my-account-inline-error">⚠️ {fieldErrors.name}</span>}
            </label>
            <label>
              <span>Phone Number</span>
              <input
                type="tel"
                maxLength={15}
                value={phone}
                className={fieldErrors.phone ? "invalid-input" : ""}
                onChange={(e) => {
                  setPhone(e.target.value.replace(/[^\d+]/g, ""));
                  if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: "" }));
                }}
                placeholder="e.g. 9876543210"
              />
              {fieldErrors.phone && <span className="my-account-inline-error">⚠️ {fieldErrors.phone}</span>}
            </label>
            <label>
              <span>Complete Address</span>
              <textarea
                value={address}
                className={fieldErrors.address ? "invalid-input" : ""}
                onChange={(e) => {
                  setAddress(e.target.value);
                  if (fieldErrors.address) setFieldErrors((prev) => ({ ...prev, address: "" }));
                }}
                placeholder="Flat, house no., building, street, area"
              />
              {fieldErrors.address && <span className="my-account-inline-error">⚠️ {fieldErrors.address}</span>}
            </label>
            <label>
              <span>Landmark</span>
              <input value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="Optional landmark" />
            </label>
            <label>
              <span>City</span>
              <input
                value={city}
                className={fieldErrors.city ? "invalid-input" : ""}
                onChange={(e) => {
                  setCity(e.target.value);
                  if (fieldErrors.city) setFieldErrors((prev) => ({ ...prev, city: "" }));
                }}
                placeholder="e.g. Delhi"
              />
              {fieldErrors.city && <span className="my-account-inline-error">⚠️ {fieldErrors.city}</span>}
            </label>
            <label>
              <span>State</span>
              <input
                value={state}
                className={fieldErrors.state ? "invalid-input" : ""}
                onChange={(e) => {
                  setState(e.target.value);
                  if (fieldErrors.state) setFieldErrors((prev) => ({ ...prev, state: "" }));
                }}
                placeholder="e.g. Uttar Pradesh"
              />
              {fieldErrors.state && <span className="my-account-inline-error">⚠️ {fieldErrors.state}</span>}
            </label>
            <label>
              <span>Postal Code</span>
              <input
                value={pincode}
                className={fieldErrors.pincode ? "invalid-input" : ""}
                onChange={(e) => {
                  setPincode(e.target.value);
                  if (fieldErrors.pincode) setFieldErrors((prev) => ({ ...prev, pincode: "" }));
                }}
                placeholder="e.g. 110001 or SW1A 1AA"
              />
              {fieldErrors.pincode && <span className="my-account-inline-error">⚠️ {fieldErrors.pincode}</span>}
            </label>
            <label>
              <span>Country</span>
              <input
                value={country}
                className={fieldErrors.country ? "invalid-input" : ""}
                onChange={(e) => {
                  setCountry(e.target.value);
                  if (fieldErrors.country) setFieldErrors((prev) => ({ ...prev, country: "" }));
                }}
                placeholder="e.g. India, USA, UK"
              />
              {fieldErrors.country && <span className="my-account-inline-error">⚠️ {fieldErrors.country}</span>}
            </label>

            {addressError && (
              <p className="my-account-form-error">{addressError}</p>
            )}

            <div className="my-account-address-form-actions">
              <button type="button" className="primary" onClick={saveAddress}>
                {editingIndex === null ? "💾 Save Address" : "💾 Update Address"}
              </button>
              <button
                type="button"
                onClick={closeAddressForm}
              >
                Cancel
              </button>
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


