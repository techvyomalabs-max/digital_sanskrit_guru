/**
 * src/pages/admin/AdminGroupProducts.jsx
 * Admin → Add Products → Group Products: find existing products that are one title in several
 * types (Paperback, Web Version, Bulk...) and group them under one main product.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import axios from "axios";
import { useAuth } from "../../hooks/useAuth";
import AdminSidebar from "../../components/admin/AdminSidebar";
import FormatGroupingPanel from "../../components/admin/FormatGroupingPanel";
import { DEFAULT_PRODUCT_TYPES } from "../../utils/productTypeDefaults";
import "../AdminShared.css";
import "../AdminAddProducts.css";

function AdminGroupProducts() {
  const { token } = useAuth();
  const [productTypes, setProductTypes] = useState(DEFAULT_PRODUCT_TYPES);
  const [groupedCount, setGroupedCount] = useState(0);

  useEffect(() => {
    let active = true;
    axios
      .get("/api/settings", token ? { headers: { Authorization: `Bearer ${token}` } } : {})
      .then((res) => {
        if (active && Array.isArray(res.data?.productFormatTypes) && res.data.productFormatTypes.length > 0) {
          setProductTypes(res.data.productFormatTypes);
        }
      })
      .catch(() => {
        // Keep the default types; the panel still works
      });
    return () => {
      active = false;
    };
  }, [token]);

  const getAuthHeaders = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main">
        <div className="admin-header admin-header-flex">
          <div>
            <h1>Group Products</h1>
            <p className="admin-header-muted-desc">
              Group existing products that are one title in several types under one main product.
              {groupedCount > 0 ? ` ${groupedCount} grouped in this visit.` : ""}
            </p>
          </div>
          <Link to="/admin/add-products" className="admin-upload-template-btn">
            <ArrowLeft size={14} className="ui-inline-icon" aria-hidden="true" />Back to Add Products
          </Link>
        </div>

        <FormatGroupingPanel
          getAuthHeaders={getAuthHeaders}
          productTypes={productTypes}
          onGrouped={() => setGroupedCount((n) => n + 1)}
        />
      </div>
    </div>
  );
}

export default AdminGroupProducts;
