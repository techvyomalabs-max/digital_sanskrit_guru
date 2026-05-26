import { useEffect } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import axios from "axios";
import Navbar from "./components/layout/Navbar";
import Footer from "./components/layout/Footer";
import Home from "./pages/Home";
import Collection from "./pages/Collection";
import SearchResults from "./pages/SearchResults";
import Product from "./pages/Product";
import Cart from "./pages/Cart";
import Register from "./pages/Register";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import Checkout from "./pages/Checkout";
import AdminDashboard from "./pages/AdminDashboard";
import AdminRoute from "./components/AdminRoute";
import AdminOrders from "./pages/AdminOrders";
import AdminOrderDetails from "./pages/AdminOrderDetails";
import MyOrders from "./pages/MyOrders";
import MyAccount from "./pages/MyAccount";
import Wishlist from "./pages/Wishlist";
import AdminProducts from "./pages/AdminProducts";
import AdminAddProducts from "./pages/AdminAddProducts";
import { requestLocationPermissionForCurrency } from "./utils/currency";
import AdminCoupons from "./pages/AdminCoupons";
import AdminUsers from "./pages/AdminUsers";
import AdminThemeSettings from "./pages/AdminThemeSettings";
import { applySiteTheme, DEFAULT_SITE_THEME, readStoredSiteTheme } from "./utils/siteTheme";
import { storePricingConfig } from "./utils/productPricing";

function App() {
  useEffect(() => {
    requestLocationPermissionForCurrency();
  }, []);

  useEffect(() => {
    let active = true;
    const storedThemeSettings = readStoredSiteTheme();

    axios
      .get("/api/settings")
      .then((res) => {
        if (!active) return;
        applySiteTheme(res.data?.siteTheme || DEFAULT_SITE_THEME, res.data?.customThemes || []);
        storePricingConfig({
          pricingMarkets: res.data?.pricingMarkets || [],
          internationalPricingDefaults: res.data?.internationalPricingDefaults || {},
          currencyConversionRates: res.data?.currencyConversionRates || {}
        });
      })
      .catch(() => {
        if (!active) return;
        if (storedThemeSettings) {
          applySiteTheme(
            storedThemeSettings.siteTheme || DEFAULT_SITE_THEME,
            storedThemeSettings.customThemes || []
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <HashRouter>
      <Navbar />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/collection" element={<Collection />} />
        <Route path="/search" element={<SearchResults />} />
        <Route path="/product/:id" element={<Product />} />
        <Route path="/wishlist" element={<Wishlist />} />
        <Route path="/cart" element={<Cart />} />
        <Route
          path="/checkout"
          element={
            <ProtectedRoute>
              <Checkout />
            </ProtectedRoute>
          }
        />
        <Route
          path="/account"
          element={
            <ProtectedRoute>
              <MyAccount />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-orders"
          element={
            <ProtectedRoute>
              <MyOrders />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/orders"
          element={
            <AdminRoute>
              <AdminOrders />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/orders/:id"
          element={
            <AdminRoute>
              <AdminOrderDetails />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/products"
          element={
            <AdminRoute>
              <AdminProducts />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/add-products"
          element={
            <AdminRoute>
              <AdminAddProducts />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/coupons"
          element={
            <AdminRoute>
              <AdminCoupons />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <AdminRoute>
              <AdminUsers />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/theme"
          element={
            <AdminRoute>
              <AdminThemeSettings />
            </AdminRoute>
          }
        />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
      </Routes>

      <Footer />
    </HashRouter>
  );
}

export default App;
