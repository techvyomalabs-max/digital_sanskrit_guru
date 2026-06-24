import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import "../../pages/AdminShared.css";

const adminNavItems = [
  { to: "/admin", label: "Dashboard" },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/orders", label: "Orders" },
  { to: "/admin/products", label: "Warehouse" },
  { to: "/admin/add-products", label: "Add Products" },
  { to: "/admin/coupons", label: "Coupons" },
  { to: "/admin/marketing", label: "Marketing" },
  { to: "/", label: "Store" }
];

function AdminSidebar() {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

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
          <h2>Admin</h2>
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={() => setIsMobileNavOpen(false)}
            aria-label="Close admin navigation"
          >
            {"\u00D7"}
          </button>
        </div>
        <nav>
          {adminNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/admin"}
              className={({ isActive }) => (isActive ? "active" : undefined)}
              onClick={() => setIsMobileNavOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}

export default AdminSidebar;
