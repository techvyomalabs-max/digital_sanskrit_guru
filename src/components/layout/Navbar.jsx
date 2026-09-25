import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import "./Navbar.css";

const DEFAULT_COLLECTION_CATEGORIES = [
  "All",
  "Bundle",
  "Web Version",
  "E-Book - Kindle",
  "Book - Paperback",
  "Combo",
  "Flipbook",
  "Learning path",
  "Course Products",
  "USB Stick",
  "Audio Device",
  "Bulk Products",
  "Festival Offer",
  "Calendar - Paperback"
];

const getAddressLocationText = (item) =>
  [item?.city, item?.state, item?.pincode, item?.country].filter(Boolean).join(", ");

function Navbar({ bannerActive = false }) {
  const { user, logout } = useAuth();
  const { cartItems } = useCart();
  const { wishlist } = useWishlist();
  const {
    selectedAddress,
    addresses,
    selectedIndex,
    selectAddress,
    removeAddress,
    setDefaultAddress
  } = useDeliveryLocation();
  const location = useLocation();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [addressToDelete, setAddressToDelete] = useState(null);
  const [isCollectionFilterMenuOpen, setIsCollectionFilterMenuOpen] = useState(false);
  const [collectionCategories, setCollectionCategories] = useState(DEFAULT_COLLECTION_CATEGORIES);
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

  // Fetch public settings / icons
  useEffect(() => {
    let active = true;
    const fetchIcons = () => {
      axios
        .get("/api/settings/public")
        .then((res) => {
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
    const isDefault =
      !customValue ||
      (type === "home" && customValue === "🏠") ||
      (type === "categories" && customValue === "📚") ||
      (type === "wishlist" && customValue === "❤️") ||
      (type === "cart" && customValue === "🛒") ||
      (type === "profile" && customValue === "👤") ||
      (type === "search" && customValue === "🔍");

    if (isDefault) {
      switch (type) {
        case "home":
          return <House size={20} className="lucide-icon" />;
        case "categories":
          return <Grid size={20} className="lucide-icon" />;
        case "wishlist":
          return <Heart size={20} className="lucide-icon" />;
        case "cart":
          return <ShoppingCart size={20} className="lucide-icon" />;
        case "profile":
          return <User size={20} className="lucide-icon" />;
        case "search":
          return <Search size={20} className="lucide-icon" />;
        default:
          return null;
      }
    }
    return <span className="custom-emoji-icon">{customValue}</span>;
  };

  // Performant scroll listener with state guards
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > 140) {
        setShowAttachedBar((prev) => {
          if (prev) {
            setIsCollectionFilterMenuOpen(false);
            return false;
          }
          return prev;
        });
      } else if (currentScrollY < 60) {
        setShowAttachedBar((prev) => (!prev ? true : prev));
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

  // Synchronize search query with URL params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const queryFromUrl = params.get("q") || params.get("search") || "";
    if (location.pathname === "/search") {
      setSearchQuery(queryFromUrl);
    } else if (location.pathname === "/" && queryFromUrl) {
      setSearchQuery(queryFromUrl);
    } else {
      setSearchQuery("");
    }
  }, [location.pathname, location.search]);

  // Reset transient menus on route navigation
  useEffect(() => {
    setIsMenuOpen(false);
    setIsAddressModalOpen(false);
    setIsCollectionFilterMenuOpen(false);
    setShowAttachedBar(window.scrollY < 140);
  }, [location.pathname, location.search]);

  // Fetch product categories once for collection dropdown
  useEffect(() => {
    if (isAdminRoute || hasLoadedCollectionCategories.current) {
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
        if (Array.isArray(res.data?.categories) && res.data.categories.length > 0) {
          setCollectionCategories(res.data.categories);
        }
      })
      .catch(() => {
        if (!active) return;
        hasLoadedCollectionCategories.current = true;
      });

    return () => {
      active = false;
    };
  }, [isAdminRoute]);

  // Escape key handler for address modal
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

  const handleNavClick = useCallback(() => {
    setIsMenuOpen(false);
    setSearchQuery("");
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const query = searchQuery.trim();
    navigate(query ? `/search?q=${encodeURIComponent(query)}` : "/collection");
  };

  const handleSectionNav = (sectionKey) => {
    setSearchQuery("");
    const targetId = `home-section-${sectionKey}`;
    if (location.pathname === "/") {
      document.querySelectorAll(".home-section-highlighted").forEach((el) => {
        el.classList.remove("home-section-highlighted");
      });

      const elem = document.getElementById(targetId);
      if (elem) {
        const header =
          document.querySelector(".navbar-container") || document.querySelector("header");
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

  // Memoized values for performance
  const activeAddress = useMemo(
    () => selectedAddress || addresses[0] || null,
    [selectedAddress, addresses]
  );

  const deliveryLine1 = "Deliver to";
  const deliveryLine2 = useMemo(() => {
    if (!activeAddress) return "Select your address";
    return (
      activeAddress.address ||
      getAddressLocationText(activeAddress) ||
      "Saved address"
    );
  }, [activeAddress]);

  const totalCartCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0),
    [cartItems]
  );

  const linkClassName = ({ isActive }) =>
    `navbar-link navbar-outline${isActive ? " navbar-link-active" : ""}`;

  // Address modal navigation handlers
  const handleAddNewAddressRedirect = () => {
    setIsAddressModalOpen(false);
    if (user) {
      navigate("/account?addNewAddress=true#manage-address", {
        state: { targetSection: "manage-address", action: "add-address" }
      });
      window.dispatchEvent(new CustomEvent("addNewAccountAddress"));
    } else {
      navigate(
        `/login?redirect=${encodeURIComponent("/account?addNewAddress=true#manage-address")}`
      );
    }
  };

  const handleUseCurrentLocationRedirect = () => {
    setIsAddressModalOpen(false);
    if (user) {
      navigate("/account?useCurrentLocation=true#manage-address", {
        state: { targetSection: "manage-address", action: "use-current-location" }
      });
      window.dispatchEvent(new CustomEvent("useCurrentLocationAccountAddress"));
    } else {
      navigate(
        `/login?redirect=${encodeURIComponent("/account?useCurrentLocation=true#manage-address")}`
      );
    }
  };

  const handleOpenEditAddressForm = (index) => {
    setIsAddressModalOpen(false);
    if (user) {
      navigate(`/account?editAddress=${index}#manage-address`, {
        state: { targetSection: "manage-address", editAddressIndex: index }
      });
      window.dispatchEvent(
        new CustomEvent("editAccountAddress", {
          detail: { index }
        })
      );
    } else {
      navigate(
        `/login?redirect=${encodeURIComponent(`/account?editAddress=${index}#manage-address`)}`
      );
    }
  };

  const handleManageAddressesRedirect = () => {
    setIsAddressModalOpen(false);
    if (user) {
      navigate("/account#manage-address", { state: { targetSection: "manage-address" } });
      setTimeout(() => {
        const el = document.getElementById("manage-address");
        if (el) {
          const navOffset = 140;
          const elementPosition = el.getBoundingClientRect().top + window.pageYOffset;
          window.scrollTo({
            top: Math.max(0, elementPosition - navOffset),
            behavior: "smooth"
          });
          el.classList.add("my-account-panel-highlight");
          setTimeout(() => el.classList.remove("my-account-panel-highlight"), 2500);
        }
      }, 50);
    } else {
      navigate("/login?redirect=/account");
    }
  };

  return (
    <>
      <nav
        className={`navbar${bannerActive ? " banner-active" : ""}${
          isAdminRoute ? " admin-navbar-mode" : ""
        }`}
      >
        {!isAdminRoute && (
          <div className="navbar-top">
            <div className="navbar-inner">
              <Link to="/" className="navbar-logo navbar-outline" onClick={handleNavClick}>
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
                <span
                  className="navbar-location-icon"
                  aria-hidden="true"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                >
                  <MapPin size={18} className="lucide-icon" />
                </span>
                <span className="navbar-location-text">
                  <span className="navbar-location-label">{deliveryLine1}</span>
                  <span className="navbar-location-value">{deliveryLine2}</span>
                </span>
              </button>

              <form className="navbar-search-wrap" onSubmit={handleSearchSubmit}>
                <input
                  ref={searchInputRef}
                  className="navbar-search"
                  placeholder="Search products, courses, and topics"
                  aria-label="Search products, courses, and topics"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery ? (
                  <button
                    type="button"
                    className="navbar-search-clear-btn"
                    aria-label="Clear search"
                    title="Clear search"
                    onClick={() => {
                      setSearchQuery("");
                      if (location.pathname === "/search") {
                        navigate("/collection");
                      } else if (searchInputRef.current) {
                        searchInputRef.current.focus();
                      }
                    }}
                  >
                    <X size={16} />
                  </button>
                ) : null}
                <button type="submit" className="navbar-search-btn" aria-label="Search">
                  <span className="navbar-search-btn-icon" aria-hidden="true">
                    {renderIcon("search", storeIcons.search)}
                  </span>
                </button>
              </form>

              <div className="navbar-right">
                {user ? (
                  <Link
                    className="navbar-account navbar-outline"
                    to="/account"
                    onClick={handleNavClick}
                  >
                    <span className="navbar-account-line1">Hello, {user.name}</span>
                    <span className="navbar-account-line2">Your Account</span>
                  </Link>
                ) : (
                  <Link
                    className="navbar-account navbar-outline"
                    to="/login"
                    onClick={handleNavClick}
                  >
                    <span className="navbar-account-line1">Hello, Sign in</span>
                    <span className="navbar-account-line2">Account & Lists</span>
                  </Link>
                )}

                <Link
                  className="navbar-orders navbar-outline"
                  to="/my-orders"
                  onClick={handleNavClick}
                >
                  <span className="navbar-account-line1">Returns</span>
                  <span className="navbar-account-line2">& Orders</span>
                </Link>

                <Link
                  className="navbar-orders navbar-outline"
                  to="/faq"
                  onClick={handleNavClick}
                >
                  <span className="navbar-account-line1">Help</span>
                  <span className="navbar-account-line2">& FAQs</span>
                </Link>

                <Link
                  className="navbar-cart navbar-outline"
                  to="/cart"
                  onClick={handleNavClick}
                >
                  <span className="navbar-cart-icon" aria-hidden="true">
                    {renderIcon("cart", storeIcons.cart)}
                  </span>
                  <span className="navbar-cart-label">Cart</span>
                  <span className="navbar-badge">{totalCartCount}</span>
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
                    {isMenuOpen ? (
                      <X size={20} className="lucide-icon" />
                    ) : (
                      <Menu size={20} className="lucide-icon" />
                    )}
                  </span>
                  <span className="navbar-menu-text">{isMenuOpen ? "Close" : "Menu"}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        <div
          className={`navbar-attached-bar ${
            !showAttachedBar && !isAdminRoute ? "navbar-attached-bar-hidden" : ""
          }`}
        >
          <div className="navbar-inner navbar-attached-bar-inner">
            <div className="navbar-attached-bar-start">
              {isAdminRoute ? (
                <>
                  <Link
                    to="/"
                    className="navbar-quick-nav-btn"
                    style={{ fontWeight: 700, color: "#f59e0b" }}
                  >
                    ← Storefront
                  </Link>
                  <NavLink
                    to="/admin"
                    end
                    className={({ isActive }) =>
                      `navbar-quick-nav-btn${isActive ? " active" : ""}`
                    }
                  >
                    Dashboard
                  </NavLink>
                  <NavLink
                    to="/admin/sales-dashboard"
                    className={({ isActive }) =>
                      `navbar-quick-nav-btn${isActive ? " active" : ""}`
                    }
                  >
                    Sales Analytics
                  </NavLink>
                  <NavLink
                    to="/admin/orders"
                    className={({ isActive }) =>
                      `navbar-quick-nav-btn${isActive ? " active" : ""}`
                    }
                  >
                    Orders
                  </NavLink>
                  <NavLink
                    to="/admin/products"
                    className={({ isActive }) =>
                      `navbar-quick-nav-btn${isActive ? " active" : ""}`
                    }
                  >
                    Warehouse
                  </NavLink>
                  <NavLink
                    to="/admin/users"
                    className={({ isActive }) =>
                      `navbar-quick-nav-btn${isActive ? " active" : ""}`
                    }
                  >
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
                      setSearchQuery("");
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

        {/* Saved Delivery Addresses Modal */}
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
                <div>
                  <h3 id="navbar-address-modal-title">
                    <span className="navbar-address-modal-head-icon" aria-hidden="true">
                      📍
                    </span>
                    Select Delivery Address
                  </h3>
                  <p className="navbar-address-modal-subtitle">
                    Choose a location to see product availability & delivery charges
                  </p>
                </div>
                <button
                  type="button"
                  className="navbar-address-modal-close-btn"
                  onClick={() => setIsAddressModalOpen(false)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              {enableCurrentLocation && (
                <div className="navbar-address-current-location">
                  <button
                    type="button"
                    className="navbar-address-current-location-btn"
                    onClick={handleUseCurrentLocationRedirect}
                  >
                    <span className="navbar-location-gps-icon">🎯</span>
                    <div className="navbar-location-btn-text">
                      <strong>Use Current Location</strong>
                      <span>Detect automatically using device GPS</span>
                    </div>
                  </button>
                </div>
              )}

              {addresses.length > 0 ? (
                <div className="navbar-address-options">
                  {addresses.map((item, index) => {
                    const isSelected = selectedIndex === index;
                    return (
                      <article
                        key={`${item.name}-${item.pincode}-${index}`}
                        className={`navbar-address-option ${isSelected ? "active" : ""}`}
                        onClick={() => {
                          selectAddress(index);
                        }}
                      >
                        <div className="navbar-address-option-top">
                          <div className="navbar-address-radio">
                            <span
                              className={`navbar-address-custom-radio ${
                                isSelected ? "checked" : ""
                              }`}
                            >
                              {isSelected ? "✓" : ""}
                            </span>
                            <strong className="navbar-address-user-name">
                              {item.name || "Address"}
                            </strong>
                          </div>
                          <div className="navbar-address-tags">
                            {item.isDefault ? (
                              <span className="navbar-address-badge default">Default</span>
                            ) : null}
                            <span className="navbar-address-badge label">
                              {item.label === "Work"
                                ? "🏢 Work"
                                : item.label === "Other"
                                ? "📌 Other"
                                : "🏠 Home"}
                            </span>
                          </div>
                        </div>

                        {item.phone ? (
                          <div className="navbar-address-phone">
                            <span>📞 {item.phone}</span>
                          </div>
                        ) : null}

                        <p className="navbar-address-text">{item.address}</p>
                        <p className="navbar-address-subtext">
                          {getAddressLocationText(item) || "Location details not available"}
                        </p>

                        <div
                          className="navbar-address-option-footer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="navbar-address-select-status">
                            {isSelected ? (
                              <span className="navbar-address-selected-badge">
                                ✓ Delivering to this address
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="navbar-address-deliver-btn"
                                onClick={() => {
                                  selectAddress(index);
                                  setIsAddressModalOpen(false);
                                }}
                              >
                                Deliver here
                              </button>
                            )}
                          </div>

                          <div className="navbar-address-meta-actions">
                            <button
                              type="button"
                              className="navbar-address-btn-text"
                              onClick={() => handleOpenEditAddressForm(index)}
                            >
                              Edit
                            </button>

                            {!item.isDefault ? (
                              <button
                                type="button"
                                className="navbar-address-btn-text"
                                onClick={() => setDefaultAddress(index)}
                              >
                                Set as default
                              </button>
                            ) : null}

                            <button
                              type="button"
                              className="navbar-address-btn-text danger"
                              onClick={() => setAddressToDelete({ index, address: item })}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="navbar-address-empty">
                  <div className="navbar-address-empty-icon">📍</div>
                  <p>No saved addresses yet.</p>
                  <span>Add a delivery address to enable quick location selection.</span>
                </div>
              )}

              <div className="navbar-address-modal-actions">
                <button
                  type="button"
                  className="navbar-address-add-btn"
                  onClick={handleAddNewAddressRedirect}
                >
                  <span>＋</span> Add a New Address
                </button>
                <button
                  type="button"
                  className="navbar-address-manage-btn"
                  onClick={handleManageAddressesRedirect}
                >
                  <span>⚙️</span> Manage Addresses
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Address Confirmation Popup Modal */}
        {addressToDelete !== null && (
          <div
            className="address-delete-modal-backdrop"
            onClick={() => setAddressToDelete(null)}
          >
            <div
              className="address-delete-modal-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="address-delete-modal-icon-wrap">
                <span>🗑️</span>
              </div>
              <h3 className="address-delete-modal-title">Delete Address?</h3>
              <p className="address-delete-modal-desc">
                Are you sure you want to delete this delivery address? This action cannot be undone.
              </p>

              {addressToDelete.address && (
                <div className="address-delete-preview-box">
                  <div style={{ fontWeight: 700, marginBottom: "3px" }}>
                    {addressToDelete.address.name}{" "}
                    {addressToDelete.address.phone ? `(${addressToDelete.address.phone})` : ""}
                  </div>
                  <div>{addressToDelete.address.address}</div>
                  <div>{getAddressLocationText(addressToDelete.address)}</div>
                </div>
              )}

              <div className="address-delete-modal-actions">
                <button
                  type="button"
                  className="address-delete-btn-cancel"
                  onClick={() => setAddressToDelete(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="address-delete-btn-confirm"
                  onClick={() => {
                    removeAddress(addressToDelete.index);
                    setAddressToDelete(null);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Mobile Bottom Navigation Bar */}
      <div className="navbar-mobile-bottom-bar">
        <NavLink
          to="/"
          className={({ isActive }) => `mobile-bottom-item${isActive ? " active" : ""}`}
          end
          onClick={handleNavClick}
        >
          <span className="mobile-bottom-icon">{renderIcon("home", storeIcons.home)}</span>
          <span className="mobile-bottom-label">Home</span>
        </NavLink>
        <button
          type="button"
          className={`mobile-bottom-item${isCollectionFilterMenuOpen ? " active" : ""}`}
          onClick={() => {
            setIsCollectionFilterMenuOpen((prev) => !prev);
            setSearchQuery("");
            if (location.pathname !== "/collection") {
              navigate("/collection");
            }
          }}
        >
          <span className="mobile-bottom-icon">
            {renderIcon("categories", storeIcons.categories)}
          </span>
          <span className="mobile-bottom-label">Categories</span>
        </button>
        <NavLink
          to="/wishlist"
          className={({ isActive }) => `mobile-bottom-item${isActive ? " active" : ""}`}
          onClick={handleNavClick}
        >
          <div className="mobile-bottom-cart-wrap">
            <span className="mobile-bottom-icon">
              {renderIcon("wishlist", storeIcons.wishlist)}
            </span>
            {wishlist.length > 0 ? (
              <span className="mobile-bottom-badge">{wishlist.length}</span>
            ) : null}
          </div>
          <span className="mobile-bottom-label">Wishlist</span>
        </NavLink>
        <NavLink
          to={user ? "/account" : "/login"}
          className={({ isActive }) => `mobile-bottom-item${isActive ? " active" : ""}`}
          onClick={handleNavClick}
        >
          <span className="mobile-bottom-icon">{renderIcon("profile", storeIcons.profile)}</span>
          <span className="mobile-bottom-label">{user ? "Profile" : "Login"}</span>
        </NavLink>
      </div>

      {/* Mobile Menu Backdrop */}
      {isMenuOpen && (
        <button
          type="button"
          className="navbar-menu-backdrop"
          aria-label="Close navigation menu"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* Mobile Slide-Out Drawer Subbar */}
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

          <NavLink className={linkClassName} to="/" end onClick={handleNavClick}>
            <House size={18} className="navbar-link-icon" />
            <span>Home</span>
          </NavLink>
          <NavLink className={linkClassName} to="/about" onClick={handleNavClick}>
            <Info size={18} className="navbar-link-icon" />
            <span>About Us</span>
          </NavLink>
          <NavLink className={linkClassName} to="/wishlist" onClick={handleNavClick}>
            <Heart size={18} className="navbar-link-icon" />
            <span>Wishlist</span>
            <span className="navbar-inline-count">{wishlist.length}</span>
          </NavLink>
          {user && (
            <>
              <NavLink className={linkClassName} to="/my-orders" onClick={handleNavClick}>
                <Package size={18} className="navbar-link-icon" />
                <span>My Orders</span>
              </NavLink>
              <NavLink className={linkClassName} to="/my-library" onClick={handleNavClick}>
                <BookOpen size={18} className="navbar-link-icon" />
                <span>My Digital Library</span>
              </NavLink>
              <NavLink className={linkClassName} to="/account" onClick={handleNavClick}>
                <User size={18} className="navbar-link-icon" />
                <span>My Account</span>
              </NavLink>
            </>
          )}
          <NavLink className={linkClassName} to="/faq" onClick={handleNavClick}>
            <HelpCircle size={18} className="navbar-link-icon" />
            <span>FAQ</span>
          </NavLink>
          <NavLink className={linkClassName} to="/contact" onClick={handleNavClick}>
            <Mail size={18} className="navbar-link-icon" />
            <span>Contact Us</span>
          </NavLink>
          {user?.isAdmin && (
            <NavLink className={linkClassName} to="/admin" onClick={handleNavClick}>
              <ShieldCheck size={18} className="navbar-link-icon" />
              <span>Admin Dashboard</span>
            </NavLink>
          )}
          {user ? (
            <button
              type="button"
              className="navbar-link navbar-logout navbar-outline"
              onClick={() => {
                handleNavClick();
                logout();
              }}
            >
              <LogOut size={18} className="navbar-link-icon" />
              <span>Sign Out</span>
            </button>
          ) : (
            <>
              <NavLink className={linkClassName} to="/login" onClick={handleNavClick}>
                <LogIn size={18} className="navbar-link-icon" />
                <span>Login</span>
              </NavLink>
              <NavLink className={linkClassName} to="/register" onClick={handleNavClick}>
                <UserPlus size={18} className="navbar-link-icon" />
                <span>New Customer? Register</span>
              </NavLink>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default Navbar;
