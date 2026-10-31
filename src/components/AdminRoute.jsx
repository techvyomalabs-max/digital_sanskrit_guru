import { Link, Navigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

function AdminRoute({ children, requiredPage }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!user.isAdmin) {
    return (
      <div style={{ padding: "40px 24px", maxWidth: "600px", margin: "40px auto", textAlign: "center" }}>
        <h2>Admin Access Denied</h2>
        <p>This account does not have admin permissions.</p>
        <Link to="/" style={{ color: "#3b82f6", fontWeight: 600 }}>Return to Store</Link>
      </div>
    );
  }

  const adminLevel = Number(user.adminLevel || 1);

  if (requiredPage && adminLevel === 2) {
    const allowedPages = Array.isArray(user.allowedPages) ? user.allowedPages : [];
    if (!allowedPages.includes(requiredPage)) {
      const firstAllowedPage = allowedPages[0];
      const pageToRouteMap = {
        orders: "/admin/orders",
        products: "/admin/products",
        "add-products": "/admin/add-products",
        coupons: "/admin/coupons",
        marketing: "/admin/marketing",
        users: "/admin/users",
        theme: "/admin/theme"
      };

      if (requiredPage === "dashboard" && firstAllowedPage && pageToRouteMap[firstAllowedPage]) {
        return <Navigate to={pageToRouteMap[firstAllowedPage]} replace />;
      }

      return (
        <div style={{ padding: "60px 24px", maxWidth: "600px", margin: "40px auto", textAlign: "center", backgroundColor: "var(--admin-surface, #fff)", border: "1px solid var(--admin-border, #e5e7eb)", borderRadius: "12px" }}>
          <div style={{ marginBottom: "12px" }}><ShieldAlert size={48} strokeWidth={1.6} aria-hidden="true" /></div>
          <h2 style={{ margin: "0 0 8px" }}>Page Access Restricted</h2>
          <p style={{ color: "#6b7280", margin: "0 0 20px" }}>
            You are logged in as a <strong>Level 2 Sub-Admin</strong>, but access to this particular page (<code>{requiredPage}</code>) has not been assigned to your account.
          </p>
          <p style={{ fontSize: "13px", color: "#9ca3af", margin: "0 0 24px" }}>
            Contact a 1st Level Super Admin to update your page permissions.
          </p>
          {firstAllowedPage && pageToRouteMap[firstAllowedPage] ? (
            <Link to={pageToRouteMap[firstAllowedPage]} style={{ display: "inline-block", padding: "10px 20px", backgroundColor: "#3b82f6", color: "#fff", borderRadius: "8px", textDecoration: "none", fontWeight: 600 }}>
              Go to {firstAllowedPage}
            </Link>
          ) : (
            <Link to="/" style={{ display: "inline-block", padding: "10px 20px", backgroundColor: "#3b82f6", color: "#fff", borderRadius: "8px", textDecoration: "none", fontWeight: 600 }}>
              Return to Store
            </Link>
          )}
        </div>
      );
    }
  }

  return children;
}

export default AdminRoute;
