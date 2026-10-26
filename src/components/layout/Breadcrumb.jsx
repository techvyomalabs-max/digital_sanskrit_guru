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
  "shipping-refund-policy": { label: "Shipping & Refund Policy", path: "/shipping-refund-policy" },
  "refund-policy": { label: "Refund Policy", path: "/refund-policy" },
  "privacy-policy": { label: "Privacy Policy", path: "/privacy-policy" },
  privacy: { label: "Privacy Policy", path: "/privacy-policy" },
  "terms-and-conditions": { label: "Terms & Conditions", path: "/terms-and-conditions" },
  "terms-conditions": { label: "Terms & Conditions", path: "/terms-and-conditions" },
  terms: { label: "Terms & Conditions", path: "/terms-and-conditions" },

  // Admin Pages
  admin: { label: "Admin Console", path: "/admin" },
  "sales-dashboard": { label: "Sales Analytics", path: "/admin/sales-dashboard", parent: { label: "Admin Console", path: "/admin" } },
  sales: { label: "Sales Analytics", path: "/admin/sales-dashboard", parent: { label: "Admin Console", path: "/admin" } },
  "financial-dashboard": { label: "Finance & Taxes", path: "/admin/financial-dashboard", parent: { label: "Admin Console", path: "/admin" } },
  orders: { label: "Orders", path: "/admin/orders", parent: { label: "Admin Console", path: "/admin" } },
  "unmatched-payments": { label: "Unmatched Payments", path: "/admin/unmatched-payments", parent: { label: "Admin Console", path: "/admin" } },
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

const EXCLUDED_JSONLD_PATHS = [
  "/admin",
  "/account",
  "/my-orders",
  "/my-library",
  "/checkout",
  "/cart",
  "/wishlist",
  "/redeem-gift"
];

function shouldExcludeJsonLd(pathname) {
  return EXCLUDED_JSONLD_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function removeJsonLdScript() {
  if (typeof document === "undefined") return;
  const scriptEl = document.getElementById("dynamic-breadcrumb-jsonld");
  if (scriptEl) {
    scriptEl.remove();
  }
}

export default function Breadcrumb() {
  const location = useLocation();
  const [productMeta, setProductMeta] = useState({ name: "", category: "" });
  const [prevPath, setPrevPath] = useState(location.pathname);
  const [lastRoute, setLastRoute] = useState(() => {
    try {
      return sessionStorage.getItem("dsg_last_nav_route") || "";
    } catch {
      return "";
    }
  });

  // Track previous route in session storage to support context-aware breadcrumbs
  if (prevPath !== location.pathname) {
    setPrevPath(location.pathname);
    setLastRoute(prevPath);
    setProductMeta({ name: "", category: "" });
    try {
      sessionStorage.setItem("dsg_last_nav_route", prevPath);
      sessionStorage.setItem("dsg_current_nav_route", location.pathname);
    } catch {
      // ignore storage errors
    }
  }

  // Subscribe to product breadcrumb publication events
  useEffect(() => {
    const handleProductBreadcrumb = (event) => {
      const detail = event?.detail || {};
      setProductMeta({
        name: typeof detail.name === "string" ? detail.name : "",
        category: typeof detail.category === "string" ? detail.category : ""
      });
    };

    window.addEventListener("dsg:breadcrumb", handleProductBreadcrumb);
    return () => {
      window.removeEventListener("dsg:breadcrumb", handleProductBreadcrumb);
    };
  }, []);

  const breadcrumbs = useMemo(() => {
    const path = location.pathname;

    // Do not show breadcrumbs on Home Page
    if (path === "/" || path === "") {
      return [];
    }

    const segments = path.split("/").filter(Boolean);
    if (segments.length === 0) {
      return [];
    }

    const primarySegment = segments[0];

    // Unknown routes: only build a breadcrumb for paths whose first segment is in ROUTE_MAP or is product / collection / search / buy / admin; otherwise render nothing.
    const isKnownRoot =
      Boolean(ROUTE_MAP[primarySegment]) ||
      primarySegment === "product" ||
      primarySegment === "collection" ||
      primarySegment === "search" ||
      primarySegment === "buy" ||
      primarySegment === "admin";

    if (!isKnownRoot) {
      return [];
    }

    const searchParams = new URLSearchParams(location.search);
    const items = [{ label: "Home", path: "/" }];

    const cameFromAccount =
      lastRoute.startsWith("/account") ||
      location.state?.from === "/account" ||
      location.state?.targetSection === "manage-address";

    // Handle Admin Routes
    if (primarySegment === "admin") {
      items.push({ label: "Admin Console", path: "/admin" });

      if (segments.length === 1) {
        return items;
      }

      const subSegment = segments[1];
      if (subSegment === "orders" && segments[2]) {
        items.push({ label: "Orders", path: "/admin/orders" });
        const shortCode = String(segments[2] || "").slice(-6).toUpperCase();
        items.push({ label: `Order #${shortCode}`, path: location.pathname });
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
    if (primarySegment === "product") {
      items.push({ label: "Store Catalog", path: "/collection" });

      const category = typeof productMeta?.category === "string" ? productMeta.category.trim() : "";
      if (category && category.toLowerCase() !== "general") {
        items.push({
          label: category,
          path: `/collection?category=${encodeURIComponent(category)}`
        });
      }

      const rawName = typeof productMeta?.name === "string" ? productMeta.name.trim() : "";
      const productTitle = rawName || "Product Details";
      items.push({ label: productTitle, path: location.pathname });
      return items;
    }

    // Handle Collection / Catalog Page: /collection
    if (primarySegment === "collection") {
      items.push({ label: "Store Catalog", path: "/collection" });
      const categoryParam = searchParams.get("category");
      if (categoryParam) {
        items.push({ label: categoryParam, path: `/collection?category=${encodeURIComponent(categoryParam)}` });
      }
      return items;
    }

    // Handle Search Page: /search
    if (primarySegment === "search") {
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
    if (primarySegment === "buy") {
      items.push({ label: "Store Catalog", path: "/collection" });
      items.push({ label: "Quick Checkout", path: location.pathname });
      return items;
    }

    // Handle Standard Routes
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
    }

    return items;
  }, [
    location.pathname,
    location.search,
    location.hash,
    location.state?.from,
    location.state?.targetSection,
    lastRoute,
    productMeta
  ]);

  // Inject Structured Data (JSON-LD BreadcrumbList) for SEO
  useEffect(() => {
    if (typeof document === "undefined") return;

    if (breadcrumbs.length <= 1 || shouldExcludeJsonLd(location.pathname)) {
      removeJsonLdScript();
      return;
    }

    const schema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbs.map((crumb, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        name: crumb.label,
        item: `${window.location.origin}${crumb.path}`
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

    return () => {
      removeJsonLdScript();
    };
  }, [breadcrumbs, location.pathname]);

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
