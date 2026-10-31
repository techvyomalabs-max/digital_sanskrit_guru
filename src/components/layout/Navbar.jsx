import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  MapPin,
  ChevronRight,
  LocateFixed,
  Check,
  Building2,
  Pin,
  Phone,
  Settings,
  Trash2,
  Globe,
  Tablet,
  Usb,
  BookOpenText,
  Route,
  GraduationCap,
  Headphones,
  Boxes,
  Sparkles,
  CalendarDays,
  Tag,
  LayoutGrid,
  ArrowRight
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useCart } from "../../hooks/useCart";
import { useWishlist } from "../../hooks/useWishlist";
import { useDeliveryLocation } from "../../hooks/useDeliveryLocation";
import { useToast } from "../../hooks/useToast";
import { scoreProduct, getSearchSuggestion } from "../../utils/searchText";
import { recordSearchQuery } from "../../utils/recommendationEngine";
import "./Navbar.css";

// Icon for a category in the "Browse by category" menu, picked from its name
// because categories are typed freely by admins
const CATEGORY_ICON_RULES = [
  [/kindle/i, Tablet],
  [/flipbook/i, BookOpenText],
  [/web/i, Globe],
  [/usb|pen ?drive/i, Usb],
  [/audio|device/i, Headphones],
  [/learning path|path/i, Route],
  [/course/i, GraduationCap],
  [/bulk/i, Boxes],
  [/festiv|festival|offer/i, Sparkles],
  [/calendar/i, CalendarDays],
  [/bundle|combo|pack/i, Package],
  [/book|paperback/i, BookOpen]
];

function getCategoryIcon(category) {
  const match = CATEGORY_ICON_RULES.find(([pattern]) => pattern.test(String(category || "")));
  return match ? match[1] : Tag;
}

const DEFAULT_COLLECTION_CATEGORIES = [
  "All",
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
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef(null);
  const searchContainerRef = useRef(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const hasLoadedCatalog = useRef(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [addressToDelete, setAddressToDelete] = useState(null);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [isCollectionFilterMenuOpen, setIsCollectionFilterMenuOpen] = useState(false);
  const [collectionCategories, setCollectionCategories] = useState(DEFAULT_COLLECTION_CATEGORIES);
  const [collectionCategoryCounts, setCollectionCategoryCounts] = useState({});
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

  // Prevent background page scrolling when modal or mobile drawer is open
  useEffect(() => {
    const isAnyModalOpen = Boolean(isAddressModalOpen || addressToDelete !== null || showSignOutModal || isMenuOpen);
    if (!isAnyModalOpen) return;

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsAddressModalOpen(false);
        setAddressToDelete(null);
        setShowSignOutModal(false);
        setIsMenuOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isAddressModalOpen, addressToDelete, showSignOutModal, isMenuOpen]);

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
        if (res.data?.categoryCounts && typeof res.data.categoryCounts === "object") {
          setCollectionCategoryCounts(res.data.categoryCounts);
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

  const loadCatalog = useCallback(() => {
    if (hasLoadedCatalog.current || isAdminRoute) return;
    hasLoadedCatalog.current = true;
    axios
      .get("/api/products")
      .then((res) => {
        if (Array.isArray(res.data)) {
          setCatalogProducts(res.data);
        }
      })
      .catch(() => {});
  }, [isAdminRoute]);

  const handleSearchFocus = () => {
    setIsSearchFocused(true);
    loadCatalog();
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { liveMatches, totalMatchedCount, liveSuggestion } = useMemo(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed || trimmed.length < 2 || catalogProducts.length === 0) {
      return { liveMatches: [], totalMatchedCount: 0, liveSuggestion: null };
    }

    const scored = [];
    for (const p of catalogProducts) {
      const score = scoreProduct(p, trimmed);
      if (score > 0) {
        scored.push({ ...p, _score: score });
      }
    }

    scored.sort((a, b) => (b._score || 0) - (a._score || 0));

    const suggestion = getSearchSuggestion(trimmed, catalogProducts);

    return {
      liveMatches: scored.slice(0, 5),
      totalMatchedCount: scored.length,
      liveSuggestion: suggestion
    };
  }, [searchQuery, catalogProducts]);

  const handleSearchKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (liveMatches.length > 0) {
        setActiveSuggestionIndex((prev) => (prev + 1) % liveMatches.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (liveMatches.length > 0) {
        setActiveSuggestionIndex((prev) => (prev <= 0 ? liveMatches.length - 1 : prev - 1));
      }
    } else if (e.key === "Escape") {
      setIsSearchFocused(false);
      setActiveSuggestionIndex(-1);
    }
  };

  const handleSearchSubmit = (e) => {
    e?.preventDefault?.();
    setIsSearchFocused(false);
    if (activeSuggestionIndex >= 0 && liveMatches[activeSuggestionIndex]) {
      navigate(`/product/${liveMatches[activeSuggestionIndex]._id}`);
      setActiveSuggestionIndex(-1);
      return;
    }
    const query = searchQuery.trim();
    if (query) {
      recordSearchQuery(query);
    }
    navigate(query ? `/search?q=${encodeURIComponent(query)}` : "/collection");
  };

  const activeCollectionCategory =
    location.pathname === "/collection"
      ? String(new URLSearchParams(location.search).get("category") || "").trim()
      : "";

  const openCollectionCategory = (category) => {
    setIsCollectionFilterMenuOpen(false);
    setSearchQuery("");
    navigate(
      category === "All"
        ? "/collection"
        : `/collection?category=${encodeURIComponent(category)}`
    );
  };

  // Escape closes the "Browse by category" menu
  useEffect(() => {
    if (!isCollectionFilterMenuOpen) return undefined;
    const handleEscape = (event) => {
      if (event.key === "Escape") setIsCollectionFilterMenuOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    // Lets CSS hide the floating chat/WhatsApp buttons over the menu on phones
    document.body.classList.add("category-menu-open");
    return () => {
      window.removeEventListener("keydown", handleEscape);
      document.body.classList.remove("category-menu-open");
    };
  }, [isCollectionFilterMenuOpen]);

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
        className={`navbar${bannerActive ? " banner-active" : ""}${isAdminRoute ? " admin-navbar-mode" : ""
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

              <div className="navbar-search-outer" ref={searchContainerRef}>
                <form className="navbar-search-wrap" onSubmit={handleSearchSubmit}>
                  <input
                    ref={searchInputRef}
                    className="navbar-search"
                    placeholder="Search products, courses, and topics"
                    aria-label="Search products, courses, and topics"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      if (!hasLoadedCatalog.current) loadCatalog();
                      setIsSearchFocused(true);
                      setActiveSuggestionIndex(-1);
                    }}
                    onFocus={handleSearchFocus}
                    onKeyDown={handleSearchKeyDown}
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      className="navbar-search-clear-btn"
                      aria-label="Clear search"
                      title="Clear search"
                      onClick={() => {
                        setSearchQuery("");
                        setIsSearchFocused(false);
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

                {isSearchFocused && searchQuery.trim().length >= 2 && (
                  <div className="navbar-search-dropdown" role="listbox">
                    {liveSuggestion && (
                      <div className="navbar-search-dropdown-suggestion">
                        <span className="navbar-search-suggestion-badge">Did you mean:</span>
                        <button
                          type="button"
                          className="navbar-search-suggestion-btn"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setSearchQuery(liveSuggestion);
                            navigate(`/search?q=${encodeURIComponent(liveSuggestion)}`);
                            setIsSearchFocused(false);
                          }}
                        >
                          {liveSuggestion}
                        </button>
                      </div>
                    )}

                    {liveMatches.length > 0 ? (
                      <div className="navbar-search-dropdown-results">
                        {liveMatches.map((product, idx) => (
                          <div
                            key={product._id}
                            role="option"
                            aria-selected={activeSuggestionIndex === idx}
                            className={`navbar-search-dropdown-item ${activeSuggestionIndex === idx ? "active" : ""}`}
                            onMouseDown={() => {
                              navigate(`/product/${product._id}`);
                              setIsSearchFocused(false);
                            }}
                          >
                            <div className="navbar-search-item-thumb">
                              {product.image ? (
                                <img src={product.image} alt={product.name} />
                              ) : (
                                <span className="navbar-search-item-placeholder" aria-hidden="true"><BookOpen size={18} /></span>
                              )}
                            </div>
                            <div className="navbar-search-item-info">
                              <span className="navbar-search-item-title">{product.name}</span>
                              <div className="navbar-search-item-meta">
                                <span className="navbar-search-item-cat">{product.category || "General"}</span>
                                {product.price !== undefined && (
                                  <span className="navbar-search-item-price">₹{product.price}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                        <div
                          className="navbar-search-dropdown-footer"
                          onMouseDown={() => {
                            navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
                            setIsSearchFocused(false);
                          }}
                        >
                          <span>View all {totalMatchedCount} results for &ldquo;{searchQuery}&rdquo;</span>
                          <ChevronRight size={14} />
                        </div>
                      </div>
                    ) : (
                      <div className="navbar-search-dropdown-empty">
                        <p>No matching products found</p>
                        <button
                          type="button"
                          className="navbar-search-empty-btn"
                          onMouseDown={() => {
                            navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
                            setIsSearchFocused(false);
                          }}
                        >
                          Search catalog for &ldquo;{searchQuery}&rdquo; &rarr;
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

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
          className={`navbar-attached-bar ${!showAttachedBar && !isAdminRoute ? "navbar-attached-bar-hidden" : ""
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
            <div className="navbar-collection-filter-menu" role="dialog" aria-label="Browse by category">
              <div className="navbar-collection-filter-head">
                <strong className="navbar-collection-filter-title">
                  <LayoutGrid size={17} aria-hidden="true" />
                  Browse by category
                </strong>
                <button
                  type="button"
                  className="navbar-collection-filter-all"
                  onClick={() => openCollectionCategory("All")}
                >
                  View all
                  {collectionCategoryCounts.All ? ` (${collectionCategoryCounts.All})` : ""}
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
              </div>
              <div className="navbar-collection-filter-list">
                {collectionCategories
                  .filter((category) => category !== "All")
                  .map((category) => {
                    const CategoryIcon = getCategoryIcon(category);
                    const count = Number(collectionCategoryCounts[category] || 0);
                    const isCurrent = activeCollectionCategory === category;
                    return (
                      <button
                        key={category}
                        type="button"
                        className={`navbar-collection-filter-item${isCurrent ? " is-current" : ""}`}
                        aria-current={isCurrent ? "page" : undefined}
                        onClick={() => openCollectionCategory(category)}
                      >
                        <span className="navbar-collection-filter-icon" aria-hidden="true">
                          <CategoryIcon size={18} />
                        </span>
                        <span className="navbar-collection-filter-text">
                          <span className="navbar-collection-filter-name">{category}</span>
                          {count > 0 && (
                            <span className="navbar-collection-filter-count">
                              {count} {count === 1 ? "item" : "items"}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
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
        {isAddressModalOpen &&
          typeof document !== "undefined" &&
          createPortal(
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
                      <MapPin size={20} />
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
                  <X size={18} aria-hidden="true" />
                </button>
              </div>

              {enableCurrentLocation && (
                <div className="navbar-address-current-location">
                  <button
                    type="button"
                    className="navbar-address-current-location-btn"
                    onClick={handleUseCurrentLocationRedirect}
                  >
                    <span className="navbar-location-gps-icon"><LocateFixed size={20} aria-hidden="true" /></span>
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
                          setIsAddressModalOpen(false);
                        }}
                      >
                        <div className="navbar-address-option-top">
                          <div className="navbar-address-radio">
                            <span
                              className={`navbar-address-custom-radio ${isSelected ? "checked" : ""
                                }`}
                            >
                              {isSelected ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : ""}
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
                                ? <><Building2 size={12} className="ui-inline-icon" aria-hidden="true" />Work</>
                                : item.label === "Other"
                                  ? <><Pin size={12} className="ui-inline-icon" aria-hidden="true" />Other</>
                                  : <><House size={12} className="ui-inline-icon" aria-hidden="true" />Home</>}
                            </span>
                          </div>
                        </div>

                        {item.phone ? (
                          <div className="navbar-address-phone">
                            <span><Phone size={12} className="ui-inline-icon" aria-hidden="true" />{item.phone}</span>
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
                                <Check size={13} className="ui-inline-icon" aria-hidden="true" />Delivering to this address
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
                  <div className="navbar-address-empty-icon"><MapPin size={36} aria-hidden="true" /></div>
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
                  <Settings size={15} className="ui-inline-icon" aria-hidden="true" />Manage Addresses
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Delete Address Confirmation Popup Modal */}
        {addressToDelete !== null &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              className="address-delete-modal-backdrop"
              onClick={() => setAddressToDelete(null)}
              role="dialog"
              aria-modal="true"
              aria-labelledby="navbar-delete-address-modal-title"
            >
              <div
                className="address-delete-modal-card"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="address-delete-modal-icon-wrap">
                  <Trash2 size={24} aria-hidden="true" />
                </div>
                <h3 id="navbar-delete-address-modal-title" className="address-delete-modal-title">Delete Address?</h3>
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
                      if (showToast) {
                        showToast("Deleted", "success");
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {/* Sign Out Confirmation Popup Modal */}
        {showSignOutModal &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              className="address-delete-modal-backdrop"
              onClick={() => setShowSignOutModal(false)}
              role="dialog"
              aria-modal="true"
              aria-labelledby="navbar-signout-modal-title"
            >
              <div
                className="address-delete-modal-card"
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="address-delete-modal-icon-wrap"
                  style={{
                    backgroundColor: "rgba(239, 68, 68, 0.12)",
                    color: "#ef4444"
                  }}
                >
                  <LogOut size={26} />
                </div>
                <h3 id="navbar-signout-modal-title" className="address-delete-modal-title">
                  Sign Out?
                </h3>
                <p className="address-delete-modal-desc">
                  Are you sure you want to sign out of <strong>{user?.name || "your account"}</strong>?
                </p>

                <div className="address-delete-modal-actions">
                  <button
                    type="button"
                    className="address-delete-btn-cancel"
                    onClick={() => setShowSignOutModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="address-delete-btn-confirm"
                    style={{
                      backgroundColor: "#ef4444",
                      borderColor: "#ef4444",
                      boxShadow: "0 4px 14px rgba(239, 68, 68, 0.25)"
                    }}
                    onClick={() => {
                      setShowSignOutModal(false);
                      logout();
                      if (showToast) {
                        showToast("Signed out successfully", "info");
                      }
                    }}
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </div>,
            document.body
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
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            className="navbar-mobile-location-card"
            onClick={() => {
              setIsMenuOpen(false);
              setIsAddressModalOpen(true);
            }}
            aria-label="Change delivery location"
          >
            <div className="navbar-mobile-location-icon-badge" aria-hidden="true">
              <MapPin size={15} />
            </div>
            <div className="navbar-mobile-location-info">
              <span className="navbar-mobile-location-kicker">{deliveryLine1}</span>
              <strong className="navbar-mobile-location-address" title={deliveryLine2}>
                {deliveryLine2}
              </strong>
            </div>
            <ChevronRight size={15} className="navbar-mobile-location-arrow" aria-hidden="true" />
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
                setShowSignOutModal(true);
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
