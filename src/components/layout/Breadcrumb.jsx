import { useState, useMemo, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import "./Breadcrumb.css";

/**
 * Route dictionary for static segment labels & parent hierarchy
 */
const ROUTE_MAP = {
  // Store Pages
  collection: { label: "Store Catalog", path: "/collection" },
  search: { label: "Search Results", path: "/search", parent: { label: "Store Catalog", path: "/collection" } },
  cart: { label: "Shopping Cart", path: "/cart" },
  checkout: { label: "Checkout", path: "/checkout", parent: { label: "Shopping Cart", path: "/cart" } },
  wishlist: { label: "My Wishlist", path: "/wishlist", parent: { label: "My Account", path: "/account" } },
  account: { label: "My Account", path: "/account" },
  "my-orders": { label: "My Orders", path: "/my-orders", parent: { label: "My Account", path: "/account" } },
  "my-library": { label: "Digital Library", path: "/my-library", parent: { label: "My Account", path: "/account" } },
  "redeem-gift": { label: "Redeem Gift Card", path: "/redeem-gift", parent: { label: "My Account", path: "/account" } },
  login: { label: "Sign In", path: "/login" },
  register: { label: "Create Account", path: "/register" },
  "reset-password": { label: "Reset Password", path: "/reset-password", parent: { label: "Sign In", path: "/login" } },
  "guest-buy": { label: "Quick Checkout", path: "/collection" },
  buy: { label: "Quick Checkout", path: "/collection", parent: { label: "Store Catalog", path: "/collection" } },
  about: { label: "About Us", path: "/about" },
  faq: { label: "FAQs", path: "/faq" },
  contact: { label: "Contact Us", path: "/contact" },
  "shipping-policy": { label: "Shipping Policy", path: "/shipping-policy" },
  "shipping-refund-policy": { label: "Shipping & Refund Policy", path: "/shipping-refund-policy" },
  "refund-policy": { label: "Refund Policy", path: "/refund-policy" },

  // Admin Pages
  admin: { label: "Admin Console", path: "/admin" },
  "sales-dashboard": { label: "Sales Analytics", path: "/admin/sales-dashboard", parent: { label: "Admin Console", path: "/admin" } },
  sales: { label: "Sales Analytics", path: "/admin/sales-dashboard", parent: { label: "Admin Console", path: "/admin" } },
  "financial-dashboard": { label: "Finance & Taxes", path: "/admin/financial-dashboard", parent: { label: "Admin Console", path: "/admin" } },
  orders: { label: "Orders", path: "/admin/orders", parent: { label: "Admin Console", path: "/admin" } },
  products: { label: "Warehouse", path: "/admin/products", parent: { label: "Admin Console", path: "/admin" } },
  "add-products": { label: "Add & Edit Products", path: "/admin/add-products", parent: { label: "Admin Console", path: "/admin" } },
  coupons: { label: "Discount Coupons", path: "/admin/coupons", parent: { label: "Admin Console", path: "/admin" } },
  users: { label: "User Insights", path: "/admin/users", parent: { label: "Admin Console", path: "/admin" } },
  "admin-access": { label: "Admin Roles", path: "/admin/admin-access", parent: { label: "Admin Console", path: "/admin" } },
  "access-control": { label: "Admin Roles", path: "/admin/admin-access", parent: { label: "Admin Console", path: "/admin" } },
  theme: { label: "Site & Theme Settings", path: "/admin/theme", parent: { label: "Admin Console", path: "/admin" } },
  "theme-settings": { label: "Site & Theme Settings", path: "/admin/theme", parent: { label: "Admin Console", path: "/admin" } },
  marketing: { label: "Marketing Campaigns", path: "/admin/marketing", parent: { label: "Admin Console", path: "/admin" } },
  "security-logs": { label: "Security Logs", path: "/admin/security-logs", parent: { label: "Admin Console", path: "/admin" } },
  trash: { label: "Recycle Bin", path: "/admin/trash", parent: { label: "Admin Console", path: "/admin" } },
  "wp-archive": { label: "WP Archive Dashboard", path: "/admin/wp-archive", parent: { label: "Admin Console", path: "/admin" } }
};

export default function Breadcrumb() {
  const location = useLocation();
  const [currentTitle, setCurrentTitle] = useState(typeof document !== "undefined" ? document.title : "");
  const [lastRoute, setLastRoute] = useState(() => {
    try {
      return sessionStorage.getItem("dsg_last_nav_route") || "";
    } catch {
      return "";
    }
  });

  // Track previous route in session storage to support context-aware breadcrumbs
  useEffect(() => {
    try {
      const currentPath = location.pathname;
      const prevStored = sessionStorage.getItem("dsg_current_nav_route");
      if (prevStored && prevStored !== currentPath) {
        sessionStorage.setItem("dsg_last_nav_route", prevStored);
        setLastRoute(prevStored);
      }
      sessionStorage.setItem("dsg_current_nav_route", currentPath);
    } catch {}
  }, [location.pathname]);

  // Listen for dynamic page/document title changes (e.g., after product or async metadata loads)
  useEffect(() => {
    if (typeof document === "undefined") return;

    setCurrentTitle(document.title);

    const titleElement = document.querySelector("title");
    if (!titleElement) return;

    const observer = new MutationObserver(() => {
      setCurrentTitle(document.title);
    });

    observer.observe(titleElement, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [location.pathname]);

  const breadcrumbs = useMemo(() => {
    const path = location.pathname;

    // Do not show breadcrumbs on Home Page
    if (path === "/" || path === "") {
      return [];
    }

    const segments = path.split("/").filter(Boolean);
    const searchParams = new URLSearchParams(location.search);
    const items = [{ label: "Home", path: "/" }];

    const cameFromAccount =
      lastRoute.startsWith("/account") ||
      location.state?.from === "/account" ||
      location.state?.targetSection === "manage-address";

    // Handle Admin Routes
    if (segments[0] === "admin") {
      items.push({ label: "Admin Console", path: "/admin" });

      if (segments.length === 1) {
        items.push({ label: "Dashboard", path: "/admin" });
        return items;
      }

      const subSegment = segments[1];
      if (subSegment === "orders" && segments[2]) {
        items.push({ label: "Orders", path: "/admin/orders" });
        items.push({ label: `Order #${segments[2]}`, path: location.pathname });
        return items;
      }

      const mappedSub = ROUTE_MAP[subSegment];
      if (mappedSub) {
        items.push({ label: mappedSub.label, path: mappedSub.path });
      } else {
        const titleCase = subSegment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        items.push({ label: titleCase, path: `/admin/${subSegment}` });
      }
      return items;
    }

    // Handle Product Detail Route: /product/:id
    if (segments[0] === "product") {
      items.push({ label: "Store Catalog", path: "/collection" });
      
      // Clean product title from current document title if available
      let productTitle = "Product Details";
      if (currentTitle && !currentTitle.toLowerCase().includes("loading")) {
        const rawTitle = currentTitle.split("|")[0].split("—")[0].trim();
        const ignoredTitles = ["home", "collection", "digital sanskrit guru", "loading...", "store catalog"];
        if (rawTitle && !ignoredTitles.includes(rawTitle.toLowerCase())) {
          productTitle = rawTitle;
        }
      }
      items.push({ label: productTitle, path: location.pathname });
      return items;
    }

    // Handle Collection / Catalog Page: /collection
    if (segments[0] === "collection") {
      items.push({ label: "Store Catalog", path: "/collection" });
      const categoryParam = searchParams.get("category");
      if (categoryParam) {
        items.push({ label: categoryParam, path: `/collection?category=${encodeURIComponent(categoryParam)}` });
      }
      return items;
    }

    // Handle Search Page: /search
    if (segments[0] === "search") {
      items.push({ label: "Store Catalog", path: "/collection" });
      const queryParam = searchParams.get("q");
      if (queryParam) {
        items.push({ label: `Search: "${queryParam}"`, path: `/search?q=${encodeURIComponent(queryParam)}` });
      } else {
        items.push({ label: "Search Results", path: "/search" });
      }
      return items;
    }

    // Handle Quick / Guest Buy Route: /buy/:id
    if (segments[0] === "buy") {
      items.push({ label: "Store Catalog", path: "/collection" });
      items.push({ label: "Quick Checkout", path: location.pathname });
      return items;
    }

    // Handle Standard Routes
    const primarySegment = segments[0];
    const mapped = ROUTE_MAP[primarySegment];

    if (mapped) {
      // Dynamic origin injection for Cart & Checkout when arriving from My Account
      if ((primarySegment === "cart" || primarySegment === "checkout") && cameFromAccount) {
        items.push({ label: "My Account", path: "/account" });
      }

      if (mapped.parent) {
        items.push(mapped.parent);
      }
      items.push({ label: mapped.label, path: mapped.path });

      // Handle My Account Subsections (via Hash or Search Params)
      if (primarySegment === "account") {
        const hash = location.hash.toLowerCase();
        const sectionParam = searchParams.get("section");
        const isAddressSection =
          hash === "#manage-address" ||
          hash === "#addresses" ||
          hash === "#address" ||
          sectionParam === "address" ||
          searchParams.get("openAddressForm") === "1";

        const isProfileSection = hash === "#profile" || sectionParam === "profile";
        const isOrdersSection = hash === "#orders" || sectionParam === "orders";
        const isNotificationSection = hash === "#notifications" || hash === "#push";

        if (isAddressSection) {
          items.push({ label: "Manage Addresses", path: "/account#manage-address" });
        } else if (isProfileSection) {
          items.push({ label: "Profile Settings", path: "/account#profile" });
        } else if (isOrdersSection) {
          items.push({ label: "Recent Orders", path: "/account#orders" });
        } else if (isNotificationSection) {
          items.push({ label: "Notification Settings", path: "/account#notifications" });
        }
      }
    } else {
      const formattedLabel = primarySegment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      items.push({ label: formattedLabel, path: `/${primarySegment}` });
    }

    return items;
  }, [location.pathname, location.search, location.hash, currentTitle, lastRoute]);

  // Inject Structured Data (JSON-LD BreadcrumbList) for SEO
  useEffect(() => {
    if (breadcrumbs.length <= 1) return;

    const schema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbs.map((crumb, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        name: crumb.label,
        item: `${window.location.origin}/#${crumb.path}`
      }))
    };

    const scriptId = "dynamic-breadcrumb-jsonld";
    let scriptEl = document.getElementById(scriptId);
    if (!scriptEl) {
      scriptEl = document.createElement("script");
      scriptEl.id = scriptId;
      scriptEl.type = "application/ld+json";
      document.head.appendChild(scriptEl);
    }
    scriptEl.textContent = JSON.stringify(schema);
  }, [breadcrumbs]);

  if (breadcrumbs.length <= 1) {
    return null;
  }

  const isAdminRoute = location.pathname.startsWith("/admin");

  return (
    <nav className={`site-breadcrumb-nav ${isAdminRoute ? "admin-breadcrumb-nav" : ""}`} aria-label="Breadcrumb">
      <div className="site-breadcrumb-container">
        <ol className="site-breadcrumb-list">
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <li key={`${crumb.path}-${idx}`} className={`site-breadcrumb-item ${isLast ? "active" : ""}`}>
                {idx > 0 && <span className="site-breadcrumb-separator">/</span>}
                {isLast ? (
                  <span className="site-breadcrumb-current" aria-current="page">
                    {crumb.label}
                  </span>
                ) : (
                  <Link to={crumb.path} className="site-breadcrumb-link">
                    {crumb.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
