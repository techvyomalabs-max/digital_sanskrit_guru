import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  House,
  Info,
  Heart,
  Package,
  BookOpen,
  User,
  LogIn,
  UserPlus,
  HelpCircle,
  Mail,
  ShieldCheck,
  LogOut,
  Grid,
  ShoppingCart,
  Search,
  Menu,
  X,
  MapPin
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useCart } from "../../hooks/useCart";
import { useWishlist } from "../../hooks/useWishlist";
import { useDeliveryLocation } from "../../hooks/useDeliveryLocation";
import { reverseGeocodeCoordinates, getCurrentDevicePosition } from "../../utils/geoAddress";
import "./Navbar.css";

const onDemandUrl = String(
  import.meta.env.VITE_ONDEMAND_URL || "https://antiquewhite-squid-823975.hostingersite.com/#/"
).trim();

function Navbar({ bannerActive = false }) {
  const { user, logout } = useAuth();
  const { cartItems } = useCart();
  const { wishlist } = useWishlist();
  const { selectedAddress, addresses, selectedIndex, selectAddress, addAddress, removeAddress, setDefaultAddress } =
    useDeliveryLocation();
  const location = useLocation();
  const navigate = useNavigate();


  const [searchQuery, setSearchQuery] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState(null);
  const [isCollectionFilterMenuOpen, setIsCollectionFilterMenuOpen] = useState(false);
  const [isManagingAddresses, setIsManagingAddresses] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [locationStatusMessage, setLocationStatusMessage] = useState("");
  const [showModalAddressForm, setShowModalAddressForm] = useState(false);
  const [modalName, setModalName] = useState("");
  const [modalPhone, setModalPhone] = useState("");
  const [modalAddress, setModalAddress] = useState("");
  const [modalLandmark, setModalLandmark] = useState("");
  const [modalCity, setModalCity] = useState("");
  const [modalState, setModalState] = useState("");
  const [modalPincode, setModalPincode] = useState("");
  const [modalCountry, setModalCountry] = useState("India");
  const [modalLabel, setModalLabel] = useState("Home");
  const [modalFormError, setModalFormError] = useState("");
  const [collectionCategories, setCollectionCategories] = useState(["All"]);
  const [showAttachedBar, setShowAttachedBar] = useState(true);
  const hasLoadedCollectionCategories = useRef(false);
  const isAdminRoute = location.pathname.startsWith("/admin");

  const [storeIcons, setStoreIcons] = useState({
    home: "🏠",
    categories: "📚",
    wishlist: "❤️",
    cart: "🛒",
    profile: "👤",
    search: "🔍"
  });
  const [enableCurrentLocation, setEnableCurrentLocation] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchIcons = () => {
      axios.get("/api/settings/public")
        .then(res => {
          if (active) {
            if (res.data?.storeIcons) {
              setStoreIcons(res.data.storeIcons);
            }
            if (res.data?.enableCurrentLocation !== undefined) {
              setEnableCurrentLocation(res.data.enableCurrentLocation);
            }
          }
        })
        .catch(() => { });
    };

    fetchIcons();

    window.addEventListener("siteSettingsUpdated", fetchIcons);
    return () => {
      active = false;
      window.removeEventListener("siteSettingsUpdated", fetchIcons);
    };
  }, []);

  const renderIcon = (type, customValue) => {
    const isDefault = !customValue ||
      (type === "home" && customValue === "🏠") ||
      (type === "categories" && customValue === "📚") ||
      (type === "wishlist" && customValue === "❤️") ||
      (type === "cart" && customValue === "🛒") ||
      (type === "profile" && customValue === "👤") ||
      (type === "search" && customValue === "🔍");

    if (isDefault) {
      switch (type) {
        case "home": return <House size={20} className="lucide-icon" />;
        case "categories": return <Grid size={20} className="lucide-icon" />;
        case "wishlist": return <Heart size={20} className="lucide-icon" />;
        case "cart": return <ShoppingCart size={20} className="lucide-icon" />;
        case "profile": return <User size={20} className="lucide-icon" />;
        case "search": return <Search size={20} className="lucide-icon" />;
        default: return null;
      }
    }
    return <span className="custom-emoji-icon">{customValue}</span>;
  };

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > 140) {
        setShowAttachedBar(false);
        setIsCollectionFilterMenuOpen(false);
      } else if (currentScrollY < 60) {
        setShowAttachedBar(true);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!showAttachedBar) {
      document.documentElement.classList.add("navbar-attached-hidden");
    } else {
      document.documentElement.classList.remove("navbar-attached-hidden");
    }
    return () => {
      document.documentElement.classList.remove("navbar-attached-hidden");
    };
  }, [showAttachedBar]);



  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const query = searchQuery.trim();
    navigate(query ? `/search?q=${encodeURIComponent(query)}` : "/collection");
  };

  const handleSectionNav = (sectionKey) => {
    const targetId = `home-section-${sectionKey}`;
    if (location.pathname === "/") {
      document.querySelectorAll(".home-section-highlighted").forEach((el) => {
        el.classList.remove("home-section-highlighted");
      });

      const elem = document.getElementById(targetId);
      if (elem) {
        const header = document.querySelector(".navbar-container") || document.querySelector("header");
        const navbarHeight = header ? header.getBoundingClientRect().height : 120;
        const elementPosition = elem.getBoundingClientRect().top + window.pageYOffset;
        const offsetPosition = Math.max(0, elementPosition - navbarHeight - 16);

        window.scrollTo({
          top: offsetPosition,
          behavior: "smooth"
        });

        void elem.offsetWidth;
        elem.classList.add("home-section-highlighted");
      }
    } else {
      navigate(`/?scrollTo=${sectionKey}`);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const queryFromUrl = params.get("q") || params.get("search") || "";
    if (location.pathname === "/" || location.pathname === "/search") {
      setSearchQuery(queryFromUrl);
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    setIsMenuOpen(false);
    setIsAddressModalOpen(false);
    setIsCollectionFilterMenuOpen(false);
    setIsManagingAddresses(false);
    setIsDetectingLocation(false);
    setLocationStatusMessage("");
    setShowAttachedBar(window.scrollY < 140);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (isAdminRoute || !isCollectionFilterMenuOpen || hasLoadedCollectionCategories.current) {
      return undefined;
    }

    let active = true;

    axios
      .get("/api/products", {
        params: {
          page: 1,
          limit: 1,
          sort: "featured",
          category: "All"
        }
      })
      .then((res) => {
        if (!active) return;
        hasLoadedCollectionCategories.current = true;
        setCollectionCategories(
          Array.isArray(res.data?.categories) && res.data.categories.length > 0
            ? res.data.categories
            : ["All"]
        );
      })
      .catch(() => {
        if (!active) return;
        hasLoadedCollectionCategories.current = true;
        setCollectionCategories(["All"]);
      });

    return () => {
      active = false;
    };
  }, [isAdminRoute, isCollectionFilterMenuOpen]);

  useEffect(() => {
    if (isAddressModalOpen) return;
    setIsDetectingLocation(false);
    setLocationStatusMessage("");
  }, [isAddressModalOpen]);

  useEffect(() => {
    if (!isAddressModalOpen) return undefined;

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsAddressModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isAddressModalOpen]);

  const linkClassName = ({ isActive }) =>
    `navbar-link navbar-outline${isActive ? " navbar-link-active" : ""}`;
  const activeAddress = selectedAddress || addresses[0] || null;
  const deliveryLine1 = "Deliver to";
  const deliveryLine2 = activeAddress
    ? activeAddress.address ||
    [activeAddress.city, activeAddress.state, activeAddress.pincode].filter(Boolean).join(", ") ||
    "Saved address"
    : "Select your address";

  const getAddressLocationText = (item) =>
    [item?.city, item?.state, item?.pincode, item?.country].filter(Boolean).join(", ");

  const handleOpenInlineAddForm = () => {
    setModalName(user?.name || "");
    setModalPhone(user?.phone || "");
    setModalAddress("");
    setModalLandmark("");
    setModalCity("");
    setModalState("");
    setModalPincode("");
    setModalCountry("India");
    setModalLabel("Home");
    setModalFormError("");
    setShowModalAddressForm(true);
  };

  const handleUseCurrentLocation = async () => {
    if (isDetectingLocation) return;

    setIsDetectingLocation(true);
    setLocationStatusMessage("Detecting your current location...");
    setModalFormError("");

    try {
      const position = await getCurrentDevicePosition();
      const latitude = Number(position?.coords?.latitude);
      const longitude = Number(position?.coords?.longitude);

      if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
        throw new Error("Could not read coordinates from your device.");
      }

      const resolved = await reverseGeocodeCoordinates(latitude, longitude);

      // Pre-fill modal form fields and open completion form
      setModalName(user?.name || "");
      setModalPhone(user?.phone || "");
      setModalAddress(resolved.address || "");
      setModalLandmark(resolved.landmark || "");
      setModalCity(resolved.city || "");
      setModalState(resolved.state || "");
      setModalPincode(resolved.pincode || "");
      setModalCountry(resolved.country || "India");
      setModalLabel("Home");
      setShowModalAddressForm(true);

      setLocationStatusMessage("Location detected! Please review and complete your Flat / House number.");
    } catch (error) {
      setLocationStatusMessage(error?.message || "Could not use current location.");
    } finally {
      setIsDetectingLocation(false);
    }
  };

  const handleSaveModalAddress = (e) => {
    e.preventDefault();
    setModalFormError("");

    if (!modalName.trim()) {
      setModalFormError("Please enter your full name.");
      return;
    }
    if (!modalPhone.trim()) {
      setModalFormError("Please enter your phone number.");
      return;
    }
    if (!modalAddress.trim()) {
      setModalFormError("Please enter your street address / House No.");
      return;
    }
    if (!modalCity.trim() || !modalState.trim() || !modalPincode.trim()) {
      setModalFormError("Please complete City, State, and Pincode.");
      return;
    }

    const payload = {
      label: modalLabel,
      name: modalName.trim(),
      phone: modalPhone.trim(),
      address: modalAddress.trim(),
      landmark: modalLandmark.trim(),
      city: modalCity.trim(),
      state: modalState.trim(),
      pincode: modalPincode.trim(),
      country: modalCountry.trim() || "India",
      isDefault: addresses.length === 0
    };

    addAddress(payload);
    setShowModalAddressForm(false);
    setIsAddressModalOpen(false);
    setLocationStatusMessage("");
  };

  return (
    <>
      <nav className={`navbar${bannerActive ? " banner-active" : ""}${isAdminRoute ? " admin-navbar-mode" : ""}`}>
        {!isAdminRoute && (
          <div className="navbar-top">
            <div className="navbar-inner">
              <Link to="/" className="navbar-logo navbar-outline">
                <img
                  src="/logo.png"
                  alt="Digital Sanskrit Guru"
                  className="navbar-logo-img"
                />
              </Link>

              <button
                type="button"
                className="navbar-location navbar-location-btn navbar-outline"
                onClick={() => setIsAddressModalOpen(true)}
              >
                <span className="navbar-location-icon" aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <MapPin size={18} className="lucide-icon" />
                </span>
                <span className="navbar-location-text">
                  <span className="navbar-location-label">{deliveryLine1}</span>
                  <span className="navbar-location-value">{deliveryLine2}</span>
                </span>
              </button>

              <form className="navbar-search-wrap" onSubmit={handleSearchSubmit}>
                <input
                  className="navbar-search"
                  placeholder="Search products, courses, and topics"
                  aria-label="Search products, courses, and topics"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button type="submit" className="navbar-search-btn" aria-label="Search">
                  <span className="navbar-search-btn-icon" aria-hidden="true">
                    {renderIcon("search", storeIcons.search)}
                  </span>
                </button>
              </form>

              <div className="navbar-right">
                {user ? (
                  <Link className="navbar-account navbar-outline" to="/account">
                    <span className="navbar-account-line1">Hello, {user.name}</span>
                    <span className="navbar-account-line2">Your Account</span>
                  </Link>
                ) : (
                  <Link className="navbar-account navbar-outline" to="/login">
                    <span className="navbar-account-line1">Hello, Sign in</span>
                    <span className="navbar-account-line2">Account & Lists</span>
                  </Link>
                )}

                <Link className="navbar-orders navbar-outline" to="/my-orders">
                  <span className="navbar-account-line1">Returns</span>
                  <span className="navbar-account-line2">& Orders</span>
                </Link>

                <Link className="navbar-orders navbar-outline" to="/faq">
                  <span className="navbar-account-line1">Help</span>
                  <span className="navbar-account-line2">& FAQs</span>
                </Link>

                <Link className="navbar-cart navbar-outline" to="/cart">
                  <span className="navbar-cart-icon" aria-hidden="true">
                    {renderIcon("cart", storeIcons.cart)}
                  </span>
                  <span className="navbar-cart-label">Cart</span>
                  <span className="navbar-badge">
                    {cartItems.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0)}
                  </span>
                </Link>

                <button
                  type="button"
                  className="navbar-menu-toggle navbar-outline"
                  aria-expanded={isMenuOpen}
                  aria-controls="navbar-subbar-links"
                  aria-label={isMenuOpen ? "Close menu" : "Open menu"}
                  onClick={() => setIsMenuOpen((current) => !current)}
                >
                  <span className="navbar-menu-icon" aria-hidden="true">
                    {isMenuOpen ? <X size={20} className="lucide-icon" /> : <Menu size={20} className="lucide-icon" />}
                  </span>
                  <span className="navbar-menu-text">{isMenuOpen ? "Close" : "Menu"}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        <div className={`navbar-attached-bar ${!showAttachedBar && !isAdminRoute ? "navbar-attached-bar-hidden" : ""}`}>
          <div className="navbar-inner navbar-attached-bar-inner">
            <div className="navbar-attached-bar-start">
              {isAdminRoute ? (
                <>
                  <Link to="/" className="navbar-quick-nav-btn" style={{ fontWeight: 700, color: "#f59e0b" }}>
                    ← Storefront
                  </Link>
                  <NavLink to="/admin" end className={({ isActive }) => `navbar-quick-nav-btn${isActive ? " active" : ""}`}>
                    Dashboard
                  </NavLink>
                  <NavLink to="/admin/sales-dashboard" className={({ isActive }) => `navbar-quick-nav-btn${isActive ? " active" : ""}`}>
                    Sales Analytics
                  </NavLink>
                  <NavLink to="/admin/orders" className={({ isActive }) => `navbar-quick-nav-btn${isActive ? " active" : ""}`}>
                    Orders
                  </NavLink>
                  <NavLink to="/admin/products" className={({ isActive }) => `navbar-quick-nav-btn${isActive ? " active" : ""}`}>
                    Warehouse
                  </NavLink>
                  <NavLink to="/admin/users" className={({ isActive }) => `navbar-quick-nav-btn${isActive ? " active" : ""}`}>
                    Users
                  </NavLink>
                </>
              ) : (
                <>
                  {location.pathname !== "/collection" && (
                    <button
                      type="button"
                      className="navbar-collection-menu-btn"
                      aria-label="Open collection filters"
                      aria-expanded={isCollectionFilterMenuOpen}
                      onClick={() => setIsCollectionFilterMenuOpen((current) => !current)}
                    >
                      <Menu size={16} className="lucide-icon" style={{ marginRight: "6px" }} />
                      <span className="navbar-collection-menu-text">All</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="navbar-quick-nav-btn"
                    onClick={() => handleSectionNav("top-rated")}
                  >
                    Top Rated
                  </button>
                  <button
                    type="button"
                    className="navbar-quick-nav-btn"
                    onClick={() => handleSectionNav("new-arrivals")}
                  >
                    New Arrivals
                  </button>
                  <button
                    type="button"
                    className="navbar-quick-nav-btn"
                    onClick={() => handleSectionNav("budget-picks")}
                  >
                    Budget Picks
                  </button>
                </>
              )}
            </div>
            {/* {onDemandUrl ? (
              <a
                href={onDemandUrl}
                className="navbar-ondemand-btn"
                target="_blank"
                rel="noreferrer"
                aria-label="Ondemand website"
              >
                Open OnDemand
              </a>
            ) : null} */}
          </div>
          {!isAdminRoute && isCollectionFilterMenuOpen ? (
            <div className="navbar-collection-filter-menu">
              <strong className="navbar-collection-filter-title">Browse by category</strong>
              <div className="navbar-collection-filter-list">
                {collectionCategories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className="navbar-collection-filter-item"
                    onClick={() => {
                      setIsCollectionFilterMenuOpen(false);
                      navigate(
                        category === "All"
                          ? "/collection"
                          : `/collection?category=${encodeURIComponent(category)}`
                      );
                    }}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        {!isAdminRoute && isCollectionFilterMenuOpen ? (
          <button
            type="button"
            className="navbar-collection-filter-backdrop"
            aria-label="Close collection filters"
            onClick={() => setIsCollectionFilterMenuOpen(false)}
          />
        ) : null}

        {isAddressModalOpen && (
          <div
            className="navbar-address-modal-backdrop"
            onClick={() => {
              setIsAddressModalOpen(false);
              setShowModalAddressForm(false);
            }}
            role="presentation"
          >
            <div
              className="navbar-address-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="navbar-address-modal-title"
              onClick={(event) => event.stopPropagation()}
            >
              {showModalAddressForm ? (
                <div>
                  <div className="navbar-address-modal-head">
                    <h3 id="navbar-address-modal-title">
                      <span className="navbar-address-modal-head-icon" aria-hidden="true">
                        📍
                      </span>
                      {modalAddress ? "Complete & Save Location" : "Add New Address"}
                    </h3>
                    <button type="button" onClick={() => setShowModalAddressForm(false)}>
                      ✕ Back
                    </button>
                  </div>

                  <form onSubmit={handleSaveModalAddress} style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                    {locationStatusMessage ? (
                      <p style={{ fontSize: "12.5px", color: "var(--site-link)", margin: 0, fontWeight: "600" }}>
                        {locationStatusMessage}
                      </p>
                    ) : (
                      <p style={{ fontSize: "12px", color: "#64748b", margin: 0 }}>
                        Please enter your Flat / House number and Phone number to complete your address.
                      </p>
                    )}
                    {modalFormError && (
                      <p style={{ fontSize: "12.5px", color: "#ef4444", margin: 0, fontWeight: "600" }}>
                        {modalFormError}
                      </p>
                    )}

                    <div style={{ display: "flex", gap: "6px" }}>
                      {["Home", "Work", "Other"].map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setModalLabel(opt)}
                          style={{
                            padding: "4px 10px",
                            borderRadius: "999px",
                            border: "1px solid var(--site-border)",
                            background: modalLabel === opt ? "var(--site-link)" : "var(--site-surface)",
                            color: modalLabel === opt ? "#fff" : "var(--site-text)",
                            fontSize: "12px",
                            fontWeight: "600",
                            cursor: "pointer"
                          }}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "11.5px", fontWeight: "600", marginBottom: "2px" }}>Full Name *</label>
                        <input
                          type="text"
                          value={modalName}
                          onChange={(e) => setModalName(e.target.value)}
                          placeholder="e.g. Rohan Sharma"
                          style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--site-border)", borderRadius: "6px", fontSize: "13px", boxSizing: "border-box" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "11.5px", fontWeight: "600", marginBottom: "2px" }}>Phone Number *</label>
                        <input
                          type="tel"
                          value={modalPhone}
                          onChange={(e) => setModalPhone(e.target.value)}
                          placeholder="e.g. 9876543210"
                          style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--site-border)", borderRadius: "6px", fontSize: "13px", boxSizing: "border-box" }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "11.5px", fontWeight: "600", marginBottom: "2px" }}>Flat / House No. & Street Address *</label>
                      <input
                        type="text"
                        value={modalAddress}
                        onChange={(e) => setModalAddress(e.target.value)}
                        placeholder="e.g. Flat 302, Royal Residency, 10th Main"
                        style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--site-border)", borderRadius: "6px", fontSize: "13px", boxSizing: "border-box" }}
                      />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "11.5px", fontWeight: "600", marginBottom: "2px" }}>Landmark</label>
                        <input
                          type="text"
                          value={modalLandmark}
                          onChange={(e) => setModalLandmark(e.target.value)}
                          placeholder="Optional landmark"
                          style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--site-border)", borderRadius: "6px", fontSize: "13px", boxSizing: "border-box" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "11.5px", fontWeight: "600", marginBottom: "2px" }}>City *</label>
                        <input
                          type="text"
                          value={modalCity}
                          onChange={(e) => setModalCity(e.target.value)}
                          placeholder="City"
                          style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--site-border)", borderRadius: "6px", fontSize: "13px", boxSizing: "border-box" }}
                        />
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "11.5px", fontWeight: "600", marginBottom: "2px" }}>State *</label>
                        <input
                          type="text"
                          value={modalState}
                          onChange={(e) => setModalState(e.target.value)}
                          placeholder="State"
                          style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--site-border)", borderRadius: "6px", fontSize: "13px", boxSizing: "border-box" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "11.5px", fontWeight: "600", marginBottom: "2px" }}>Pincode *</label>
                        <input
                          type="text"
                          value={modalPincode}
                          onChange={(e) => setModalPincode(e.target.value)}
                          placeholder="Pincode"
                          style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--site-border)", borderRadius: "6px", fontSize: "13px", boxSizing: "border-box" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "11.5px", fontWeight: "600", marginBottom: "2px" }}>Country *</label>
                        <input
                          type="text"
                          value={modalCountry}
                          onChange={(e) => setModalCountry(e.target.value)}
                          placeholder="Country"
                          style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--site-border)", borderRadius: "6px", fontSize: "13px", boxSizing: "border-box" }}
                        />
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
                      <button
                        type="button"
                        onClick={() => setShowModalAddressForm(false)}
                        style={{ padding: "6px 12px", border: "1px solid var(--site-border)", background: "transparent", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        style={{ padding: "6px 16px", border: "none", background: "var(--site-link)", color: "#fff", borderRadius: "6px", cursor: "pointer", fontWeight: "600", fontSize: "13px" }}
                      >
                        Save & Select Address
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <>
                  <div className="navbar-address-modal-head">
                    <h3 id="navbar-address-modal-title">
                      <span className="navbar-address-modal-head-icon" aria-hidden="true">
                        📍
                      </span>
                      Select delivery address
                    </h3>
                    <button type="button" onClick={() => setIsAddressModalOpen(false)}>
                      Close
                    </button>
                  </div>

                  {enableCurrentLocation && (
                    <div className="navbar-address-current-location">
                      <button
                        type="button"
                        className="navbar-address-current-location-btn"
                        onClick={handleUseCurrentLocation}
                        disabled={isDetectingLocation}
                      >
                        {isDetectingLocation ? "Fetching location..." : "Use Current Location"}
                      </button>
                      {locationStatusMessage ? (
                        <p className="navbar-address-current-location-note">{locationStatusMessage}</p>
                      ) : null}
                    </div>
                  )}

                  {addresses.length > 0 ? (
                    <div className="navbar-address-options">
                      {addresses.map((item, index) => (
                        <article
                          key={`${item.name}-${item.pincode}-${index}`}
                          className={selectedIndex === index ? "navbar-address-option active" : "navbar-address-option"}
                        >
                          <div className="navbar-address-option-top">
                            <label className="navbar-address-radio">
                              <input
                                type="radio"
                                name="navbar-selected-address"
                                checked={selectedIndex === index}
                                onChange={() => selectAddress(index)}
                              />
                              <strong>{item.name || "Address"}</strong>
                            </label>
                            <span>{item.label || "Saved address"}</span>
                          </div>
                          {item.phone ? <p>{item.phone}</p> : null}
                          <p>{item.address}</p>
                          <p>{getAddressLocationText(item) || "Location details not available"}</p>
                          {item.isDefault ? <span className="navbar-address-default-pill">Default address</span> : null}

                          <div className="navbar-address-option-actions">
                            {selectedIndex !== index ? (
                              <button
                                type="button"
                                className="navbar-address-action primary"
                                onClick={() => {
                                  selectAddress(index);
                                  setIsAddressModalOpen(false);
                                }}
                              >
                                Deliver to this address
                              </button>
                            ) : (
                              <span className="navbar-address-selected-pill">Currently selected</span>
                            )}
                            {!item.isDefault ? (
                              <button
                                type="button"
                                className="navbar-address-action"
                                onClick={() => {
                                  setDefaultAddress(index);
                                }}
                              >
                                Set Default
                              </button>
                            ) : null}
                            {isManagingAddresses ? (
                              confirmDeleteIndex === index ? (
                                <div className="navbar-address-delete-confirm">
                                  <span>Delete?</span>
                                  <button
                                    type="button"
                                    className="navbar-confirm-yes"
                                    onClick={() => {
                                      removeAddress(index);
                                      setConfirmDeleteIndex(null);
                                    }}
                                  >
                                    Yes
                                  </button>
                                  <button
                                    type="button"
                                    className="navbar-confirm-no"
                                    onClick={() => setConfirmDeleteIndex(null)}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className="navbar-address-action danger"
                                  onClick={() => setConfirmDeleteIndex(index)}
                                >
                                  Delete
                                </button>
                              )
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="navbar-address-empty">No saved address yet. Add one to enable quick selection.</p>
                  )}

                  <div className="navbar-address-modal-actions">
                    <button type="button" onClick={handleOpenInlineAddForm} style={{ border: "none", background: "none", color: "var(--site-link)", cursor: "pointer", fontWeight: "600", fontSize: "13px" }}>
                      ➕ Add New Address
                    </button>
                    <button type="button" onClick={() => setIsManagingAddresses((current) => !current)}>
                      {isManagingAddresses ? "Done Managing" : "Manage Addresses"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

      </nav>

      {/* Mobile Bottom Navigation Bar */}
      <div className="navbar-mobile-bottom-bar">
        <NavLink to="/" className={({ isActive }) => `mobile-bottom-item${isActive ? " active" : ""}`} end>
          <span className="mobile-bottom-icon">{renderIcon("home", storeIcons.home)}</span>
          <span className="mobile-bottom-label">Home</span>
        </NavLink>
        <button
          type="button"
          className={`mobile-bottom-item${isCollectionFilterMenuOpen ? " active" : ""}`}
          onClick={() => {
            setIsCollectionFilterMenuOpen((prev) => !prev);
            if (location.pathname !== "/collection") {
              navigate("/collection");
            }
          }}
        >
          <span className="mobile-bottom-icon">{renderIcon("categories", storeIcons.categories)}</span>
          <span className="mobile-bottom-label">Categories</span>
        </button>
        <NavLink to="/wishlist" className={({ isActive }) => `mobile-bottom-item${isActive ? " active" : ""}`}>
          <div className="mobile-bottom-cart-wrap">
            <span className="mobile-bottom-icon">{renderIcon("wishlist", storeIcons.wishlist)}</span>
            {wishlist.length > 0 ? (
              <span className="mobile-bottom-badge">
                {wishlist.length}
              </span>
            ) : null}
          </div>
          <span className="mobile-bottom-label">Wishlist</span>
        </NavLink>
        <NavLink to={user ? "/account" : "/login"} className={({ isActive }) => `mobile-bottom-item${isActive ? " active" : ""}`}>
          <span className="mobile-bottom-icon">{renderIcon("profile", storeIcons.profile)}</span>
          <span className="mobile-bottom-label">{user ? "Profile" : "Login"}</span>
        </NavLink>
      </div>

      {isMenuOpen && (
        <button
          type="button"
          className="navbar-menu-backdrop"
          aria-label="Close navigation menu"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      <div className={`navbar-subbar ${isMenuOpen ? "navbar-subbar-open" : ""}`}>
        <div className="navbar-inner navbar-subbar-inner" id="navbar-subbar-links">
          <div className="navbar-subbar-header">
            <span className="navbar-subbar-title">Menu</span>
            <button
              type="button"
              className="navbar-subbar-close"
              onClick={() => setIsMenuOpen(false)}
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>

          <button
            type="button"
            className="navbar-mobile-location"
            onClick={() => setIsAddressModalOpen(true)}
          >
            {deliveryLine1} <strong>{deliveryLine2}</strong>
          </button>

          <NavLink className={linkClassName} to="/" end onClick={() => setIsMenuOpen(false)}>
            <House size={18} className="navbar-link-icon" />
            <span>Home</span>
          </NavLink>
          <NavLink className={linkClassName} to="/about" onClick={() => setIsMenuOpen(false)}>
            <Info size={18} className="navbar-link-icon" />
            <span>About Us</span>
          </NavLink>
          <NavLink className={linkClassName} to="/wishlist" onClick={() => setIsMenuOpen(false)}>
            <Heart size={18} className="navbar-link-icon" />
            <span>Wishlist</span>
            <span className="navbar-inline-count">{wishlist.length}</span>
          </NavLink>
          <NavLink className={linkClassName} to="/my-orders" onClick={() => setIsMenuOpen(false)}>
            <Package size={18} className="navbar-link-icon" />
            <span>My Orders</span>
          </NavLink>
          <NavLink className={linkClassName} to="/my-library" onClick={() => setIsMenuOpen(false)}>
            <BookOpen size={18} className="navbar-link-icon" />
            <span>My Digital Library</span>
          </NavLink>
          {user ? (
            <NavLink className={linkClassName} to="/account" onClick={() => setIsMenuOpen(false)}>
              <User size={18} className="navbar-link-icon" />
              <span>My Account</span>
            </NavLink>
          ) : (
            <NavLink className={linkClassName} to="/login" onClick={() => setIsMenuOpen(false)}>
              <LogIn size={18} className="navbar-link-icon" />
              <span>Login</span>
            </NavLink>
          )}
          <NavLink className={linkClassName} to="/faq" onClick={() => setIsMenuOpen(false)}>
            <HelpCircle size={18} className="navbar-link-icon" />
            <span>FAQ</span>
          </NavLink>
          <NavLink className={linkClassName} to="/contact" onClick={() => setIsMenuOpen(false)}>
            <Mail size={18} className="navbar-link-icon" />
            <span>Contact Us</span>
          </NavLink>
          {user?.isAdmin && (
            <NavLink className={linkClassName} to="/admin" onClick={() => setIsMenuOpen(false)}>
              <ShieldCheck size={18} className="navbar-link-icon" />
              <span>Admin Dashboard</span>
            </NavLink>
          )}
          {user ? (
            <button
              type="button"
              className="navbar-link navbar-logout navbar-outline"
              onClick={() => {
                setIsMenuOpen(false);
                logout();
              }}
            >
              <LogOut size={18} className="navbar-link-icon" />
              <span>Sign Out</span>
            </button>
          ) : (
            <NavLink className={linkClassName} to="/register" onClick={() => setIsMenuOpen(false)}>
              <UserPlus size={18} className="navbar-link-icon" />
              <span>New Customer? Register</span>
            </NavLink>
          )}
        </div>
      </div>
    </>
  );
}

export default Navbar;
