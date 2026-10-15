import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  TrendingUp,
  CreditCard,
  Package,
  Users,
  ShieldCheck,
  Trash2,
  Warehouse,
  PackagePlus,
  Ticket,
  Megaphone,
  Palette,
  KeyRound,
  Zap,
  Crown,
  ShieldAlert,
  Globe,
  ExternalLink,
  X
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import "../../pages/AdminShared.css";

const adminNavSections = [
  {
    title: "OVERVIEW",
    items: [
      { to: "/admin", label: "Dashboard", icon: <LayoutDashboard size={17} />, pageKey: "dashboard" },
      { to: "/admin/sales-dashboard", label: "Sales Analytics", icon: <TrendingUp size={17} />, pageKey: "sales-dashboard" },
      { to: "/admin/financial-dashboard", label: "Finance & Taxes", icon: <CreditCard size={17} />, pageKey: "financial-dashboard" }
    ]
  },
  {
    title: "MANAGEMENT",
    items: [
      { to: "/admin/orders", label: "Orders", icon: <Package size={17} />, pageKey: "orders" },
      { to: "/admin/unmatched-payments", label: "Unmatched Payments", icon: <CreditCard size={17} />, pageKey: "orders" },
      { to: "/admin/wp-archive", label: "WP Archive", icon: <Globe size={17} />, pageKey: "orders" },
      { to: "/admin/users", label: "User Insights", icon: <Users size={17} />, pageKey: "users" },
      { to: "/admin/admin-access", label: "Admin Roles", icon: <ShieldCheck size={17} />, pageKey: "admin-access" },
      { to: "/admin/trash", label: "Recycle Bin", icon: <Trash2 size={17} />, pageKey: "always" }
    ]
  },
  {
    title: "CATALOG",
    items: [
      { to: "/admin/products", label: "Warehouse", icon: <Warehouse size={17} />, pageKey: "products" },
      { to: "/admin/add-products", label: "Add Products", icon: <PackagePlus size={17} />, pageKey: "add-products" }
    ]
  },
  {
    title: "ENGAGEMENT & SITE",
    items: [
      { to: "/admin/coupons", label: "Coupons", icon: <Ticket size={17} />, pageKey: "coupons" },
      { to: "/admin/marketing", label: "Marketing", icon: <Megaphone size={17} />, pageKey: "marketing" },
      { to: "/admin/theme", label: "Theme & Site", icon: <Palette size={17} />, pageKey: "theme" },
      { to: "/admin/security-logs", label: "Security Logs", icon: <KeyRound size={17} />, pageKey: "security-logs" }
    ]
  }
];

function AdminSidebar() {
  const { user } = useAuth();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const adminLevel = Number(user?.adminLevel || 1);
  const allowedPages = Array.isArray(user?.allowedPages) ? user.allowedPages : ["dashboard"];

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 1024) {
        setIsMobileNavOpen(false);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const filteredSections = useMemo(() => {
    return adminNavSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          if (item.pageKey === "always") return true;
          if (adminLevel === 1) return true; // Super Admin gets all pages
          return allowedPages.includes(item.pageKey);
        })
      }))
      .filter((section) => section.items.length > 0);
  }, [adminLevel, allowedPages]);

  return (
    <>
      <button
        type="button"
        className={isMobileNavOpen ? "admin-mobile-nav-toggle active" : "admin-mobile-nav-toggle"}
        onClick={() => setIsMobileNavOpen((current) => !current)}
        aria-label={isMobileNavOpen ? "Close admin navigation" : "Open admin navigation"}
        aria-expanded={isMobileNavOpen}
      >
        <span />
        <span />
        <span />
      </button>

      <button
        type="button"
        className={isMobileNavOpen ? "admin-mobile-nav-backdrop active" : "admin-mobile-nav-backdrop"}
        aria-label="Close admin navigation"
        onClick={() => setIsMobileNavOpen(false)}
      />

      <aside className={isMobileNavOpen ? "sidebar mobile-open" : "sidebar"}>
        <div className="sidebar-head">
          <div className="sidebar-brand-box">
            <div className="sidebar-brand-icon"><Zap size={20} /></div>
            <div className="sidebar-brand-info">
              <h2>Admin Console</h2>
              <span className={`sidebar-role-badge ${adminLevel === 1 ? "super" : "level"}`}>
                {adminLevel === 1
                  ? <><Crown size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />Super Admin</>
                  : <><ShieldAlert size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />Sub-Admin</>
                }
              </span>
            </div>
          </div>
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={() => setIsMobileNavOpen(false)}
            aria-label="Close admin navigation"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {filteredSections.map((section) => (
            <div key={section.title} className="sidebar-nav-section">
              <span className="sidebar-section-title">{section.title}</span>
              <div className="sidebar-section-items">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/admin"}
                    className={({ isActive }) => (isActive ? "sidebar-link active" : "sidebar-link")}
                    onClick={() => setIsMobileNavOpen(false)}
                  >
                    <span className="sidebar-link-icon">{item.icon}</span>
                    <span className="sidebar-link-label">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer-box">
          <NavLink to="/" className="sidebar-storefront-btn" onClick={() => setIsMobileNavOpen(false)}>
            <Globe size={15} style={{ marginRight: 6 }} />
            <span>Open Store Front</span>
            <ExternalLink size={13} className="external-arrow" />
          </NavLink>
        </div>
      </aside>
    </>
  );
}

export default AdminSidebar;
