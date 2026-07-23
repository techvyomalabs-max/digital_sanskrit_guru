import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { House, Grid, Heart, ShoppingCart, User, Search, Menu, X, MapPin } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useCart } from "../../hooks/useCart";
import { useWishlist } from "../../hooks/useWishlist";
import { useDeliveryLocation } from "../../hooks/useDeliveryLocation";
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
  const [isCollectionFilterMenuOpen, setIsCollectionFilterMenuOpen] = useState(false);
  const [isManagingAddresses, setIsManagingAddresses] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [locationStatusMessage, setLocationStatusMessage] = useState("");
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
        .catch(() => {});
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

  const getCurrentPosition = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by this browser."));
        return;
      }

      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
      });
    });

  const buildStreetAddress = (address = {}) => {
    const parts = [address?.house_number, address?.road, address?.neighbourhood, address?.suburb]
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    return parts.join(", ");
  };

  const firstAddressValue = (address = {}, keys = []) => {
    for (const key of keys) {
      const value = String(address?.[key] || "").trim();
      if (value) return value;
    }
    return "";
  };

  const fetchAddressFromCoordinates = async (latitude, longitude) => {
    const radarKey = import.meta.env.VITE_RADAR_PUBLISHABLE_KEY;

    if (radarKey) {
      try {
        const response = await fetch(
          `https://api.radar.io/v1/geocode/reverse?coordinates=${latitude},${longitude}`,
          {
            method: "GET",
            headers: {
              Authorization: radarKey
            }
          }
        );

        if (response.ok) {
          const data = await response.json();
          const addressObj = data?.addresses?.[0] || {};
          return {
            name: String(user?.name || "Current Location").trim(),
            phone: "",
            label: "Home",
            address: addressObj.formattedAddress || "Current location",
            landmark: addressObj.placeLabel || "",
            city: addressObj.city || addressObj.sublocality || "",
            state: addressObj.state || addressObj.stateCode || "",
            pincode: addressObj.postalCode || "",
            country: addressObj.country || "India",
            latitude: Number(latitude),
            longitude: Number(longitude),
            isDefault: addresses.length === 0
          };
        }
      } catch (err) {
        console.warn("Radar reverse geocoding failed, falling back to Nominatim", err);
      }
    }

    // Fallback to Nominatim
    const params = new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      format: "jsonv2",
      addressdetails: "1"
    });

    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error("Could not resolve your location.");
    }

    const data = await response.json();
    const address = data?.address || {};
    const streetAddress = buildStreetAddress(address) || String(data?.name || "").trim();
    const city = firstAddressValue(address, ["city", "town", "village", "municipality", "county"]);
    const state = firstAddressValue(address, ["state", "region", "state_district"]);
    const pincode = firstAddressValue(address, ["postcode"]);
    const country = firstAddressValue(address, ["country"]) || "India";

    return {
      name: String(user?.name || "Current Location").trim(),
      phone: "",
      label: "Home",
      address: streetAddress || String(data?.display_name || "").trim() || "Current location",
      landmark: firstAddressValue(address, ["building", "amenity", "shop"]),
      city,
      state,
      pincode,
      country,
      latitude: Number(latitude),
      longitude: Number(longitude),
      isDefault: addresses.length === 0
    };
  };

  const handleUseCurrentLocation = async () => {
    if (isDetectingLocation) return;

    setIsDetectingLocation(true);
    setLocationStatusMessage("Detecting your current location...");

    try {
      const position = await getCurrentPosition();
      const latitude = Number(position?.coords?.latitude);
      const longitude = Number(position?.coords?.longitude);

      if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
        throw new Error("Could not read coordinates from your device.");
      }

      const payload = await fetchAddressFromCoordinates(latitude, longitude);
      addAddress(payload);
      setLocationStatusMessage("Current location saved as an address.");
    } catch (error) {
      setLocationStatusMessage(error?.message || "Could not use current location.");
    } finally {
      setIsDetectingLocation(false);
    }
  };

  return (
    <>
      <nav className={`navbar${bannerActive ? " banner-active" : ""}`}>
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

      <div className={`navbar-attached-bar ${!showAttachedBar ? "navbar-attached-bar-hidden" : ""}`}>
        <div className="navbar-inner navbar-attached-bar-inner">
          <div className="navbar-attached-bar-start">
            {!isAdminRoute ? (
              <>
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
                <button
                  type="button"
                  className="navbar-quick-nav-btn"
                  onClick={() => {
                    if (location.pathname === "/") {
                      document.getElementById("home-section-top-rated")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    } else {
                      navigate("/?scrollTo=top-rated");
                    }
                  }}
                >
                  Top Rated
                </button>
                <button
                  type="button"
                  className="navbar-quick-nav-btn"
                  onClick={() => {
                    if (location.pathname === "/") {
                      document.getElementById("home-section-new-arrivals")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    } else {
                      navigate("/?scrollTo=new-arrivals");
                    }
                  }}
                >
                  New Arrivals
                </button>
                <button
                  type="button"
                  className="navbar-quick-nav-btn"
                  onClick={() => {
                    if (location.pathname === "/") {
                      document.getElementById("home-section-budget-picks")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    } else {
                      navigate("/?scrollTo=budget-picks");
                    }
                  }}
                >
                  Budget Picks
                </button>
              </>
            ) : null}
          </div>
          {onDemandUrl ? (
            <a
              href={onDemandUrl}
              className="navbar-ondemand-btn"
              target="_blank"
              rel="noreferrer"
              aria-label="Ondemand website"
            >
              Open OnDemand
            </a>
          ) : null}
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
          onClick={() => setIsAddressModalOpen(false)}
          role="presentation"
        >
          <div
            className="navbar-address-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="navbar-address-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
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
                        <button
                          type="button"
                          className="navbar-address-action danger"
                          onClick={() => {
                            removeAddress(index);
                          }}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="navbar-address-empty">No saved address yet. Add one to enable quick selection.</p>
            )}

            <div className="navbar-address-modal-actions">
              <Link to="/account?openAddressForm=1#manage-address" onClick={() => setIsAddressModalOpen(false)}>
                Add Address
              </Link>
              <button type="button" onClick={() => setIsManagingAddresses((current) => !current)}>
                {isManagingAddresses ? "Done Managing" : "Manage Addresses"}
              </button>
            </div>
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
            Home
          </NavLink>
          <NavLink className={linkClassName} to="/about" onClick={() => setIsMenuOpen(false)}>
            About Us
          </NavLink>
          <NavLink className={linkClassName} to="/wishlist" onClick={() => setIsMenuOpen(false)}>
            Wishlist <span className="navbar-inline-count">{wishlist.length}</span>
          </NavLink>
          <NavLink className={linkClassName} to="/my-orders" onClick={() => setIsMenuOpen(false)}>
            My Orders
          </NavLink>
          <NavLink className={linkClassName} to="/my-library" onClick={() => setIsMenuOpen(false)}>
            📚 My Digital Library
          </NavLink>
          {user ? (
            <NavLink className={linkClassName} to="/account" onClick={() => setIsMenuOpen(false)}>
              My Account
            </NavLink>
          ) : (
            <NavLink className={linkClassName} to="/login" onClick={() => setIsMenuOpen(false)}>
              Login
            </NavLink>
          )}
          {user?.isAdmin && (
            <NavLink className={linkClassName} to="/admin" onClick={() => setIsMenuOpen(false)}>
              Admin Dashboard
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
              Sign Out
            </button>
          ) : (
            <NavLink className={linkClassName} to="/register" onClick={() => setIsMenuOpen(false)}>
              New Customer? Register
            </NavLink>
          )}
        </div>
      </div>
    </>
  );
}

export default Navbar;
