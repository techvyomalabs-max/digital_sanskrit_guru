import { Suspense, lazy, useEffect, useState } from "react";
import { HashRouter, Routes, Route, useLocation } from "react-router-dom";
import axios from "axios";
import { apiBaseUrl } from "./lib/api";
import Navbar from "./components/layout/Navbar";
import Breadcrumb from "./components/layout/Breadcrumb";
import Footer from "./components/layout/Footer";
import WhatsAppButton from "./components/layout/WhatsAppButton";
import CookieConsent from "./components/layout/CookieConsent";
import ProtectedRoute from "./components/ProtectedRoute";
import CartPopup from "./components/ui/CartPopup";
import AdminRoute from "./components/AdminRoute";
import FestiveAnimation from "./components/FestiveAnimation";
import FestiveBanner from "./components/FestiveBanner";
import { requestLocationPermissionForCurrency } from "./utils/currency";
import { applySiteTheme, DEFAULT_SITE_THEME, readStoredSiteTheme } from "./utils/siteTheme";
import { storePricingConfig } from "./utils/productPricing";

const Home = lazy(() => import("./pages/Home"));
const Collection = lazy(() => import("./pages/Collection"));
const SearchResults = lazy(() => import("./pages/SearchResults"));
const Product = lazy(() => import("./pages/Product"));
const Wishlist = lazy(() => import("./pages/Wishlist"));
const Cart = lazy(() => import("./pages/Cart"));
const Checkout = lazy(() => import("./pages/Checkout"));
const MyAccount = lazy(() => import("./pages/MyAccount"));
const MyOrders = lazy(() => import("./pages/MyOrders"));
const Register = lazy(() => import("./pages/Register"));
const Login = lazy(() => import("./pages/Login"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const RedeemGift = lazy(() => import("./pages/RedeemGift"));
const MyLibrary = lazy(() => import("./pages/MyLibrary"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminSalesDashboard = lazy(() => import("./pages/AdminSalesDashboard"));
const AdminFinancialDashboard = lazy(() => import("./pages/AdminFinancialDashboard"));
const AdminOrders = lazy(() => import("./pages/AdminOrders"));
const AdminOrderDetails = lazy(() => import("./pages/AdminOrderDetails"));
const AdminProducts = lazy(() => import("./pages/AdminProducts"));
const AdminAddProducts = lazy(() => import("./pages/AdminAddProducts"));
const AdminCoupons = lazy(() => import("./pages/AdminCoupons"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminAccessControl = lazy(() => import("./pages/AdminAccessControl"));
const AdminThemeSettings = lazy(() => import("./pages/AdminThemeSettings"));
const AdminMarketing = lazy(() => import("./pages/AdminMarketing"));
const AdminSecurityLogs = lazy(() => import("./pages/AdminSecurityLogs"));
const AdminTrash = lazy(() => import("./pages/AdminTrash"));
const WpArchiveDashboard = lazy(() => import("./pages/admin/WpArchiveDashboard"));
const GuestBuy = lazy(() => import("./pages/GuestBuy"));
const About = lazy(() => import("./pages/About"));
const FAQ = lazy(() => import("./pages/FAQ"));
const Contact = lazy(() => import("./pages/Contact"));
const ShippingPolicy = lazy(() => import("./pages/ShippingPolicy"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsAndConditions = lazy(() => import("./pages/TermsAndConditions"));

function RouteLoadingFallback() {
  return (
    <div
      style={{
        minHeight: "40vh",
        display: "grid",
        placeItems: "center",
        padding: "32px 16px",
        color: "#1d2a57",
        fontSize: "1rem",
        fontWeight: 600
      }}
    >
      Loading page...
    </div>
  );
}

function AnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    // 1. PageView for GTM / Google Analytics
    if (window.dataLayer) {
      window.dataLayer.push({
        event: "pageview",
        page_path: location.pathname + location.search + location.hash,
        page_title: document.title
      });
    }

    // 2. PageView for Meta Pixel
    if (window.fbq && window.fbqInitialized) {
      window.fbq("track", "PageView");
    }
  }, [location]);

  return null;
}

function ScrollToTop() {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    // If navigating to home with a specific scrollTo query param (e.g. ?scrollTo=top-rated), don't force top scroll
    const params = new URLSearchParams(search);
    if (pathname === "/" && params.has("scrollTo")) {
      return;
    }

    // If navigating with a specific section hash (e.g. #manage-address), don't force top scroll
    if (hash && hash !== "#/") {
      return;
    }

    // Reset window scroll position back to top (0, 0) on route change
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, search, hash]);

  return null;
}

function App() {
  const [festiveAnimation, setFestiveAnimation] = useState({
    enabled: false, type: "diwali", intensity: "subtle", customColors: []
  });
  const [festiveBanner, setFestiveBanner] = useState({
    enabled: false, text: "", bgFrom: "#FF6B00", bgTo: "#FFD700",
    textColor: "#ffffff", linkUrl: "", linkText: "Shop Now"
  });
  const [isBannerDismissed, setIsBannerDismissed] = useState(() => {
    try {
      return sessionStorage.getItem("festiveBannerDismissed") === "1";
    } catch {
      return false;
    }
  });
  const [lastBannerText, setLastBannerText] = useState("");

  useEffect(() => {
    // Redirect shared product links without HashRouter fragment (e.g. /product/123 -> /#/product/123)
    const pathname = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);

    if (pathname.includes("/product/") && !window.location.hash) {
      const parts = pathname.split("/product/");
      const productId = parts[1];
      if (productId) {
        window.location.replace(`${window.location.origin}${parts[0]}/#/product/${productId}`);
      }
    } else if (searchParams.has("product") && !window.location.hash) {
      const productId = searchParams.get("product");
      if (productId) {
        window.location.replace(`${window.location.origin}/#/product/${productId}`);
      }
    }
  }, []);

  useEffect(() => {
    if (festiveBanner.text && festiveBanner.text !== lastBannerText) {
      if (lastBannerText !== "") {
        try {
          sessionStorage.removeItem("festiveBannerDismissed");
        } catch {}
        setIsBannerDismissed(false);
      }
      setLastBannerText(festiveBanner.text);
    }
  }, [festiveBanner.text, lastBannerText]);

  const isBannerActive = festiveBanner.enabled && !isBannerDismissed;

  useEffect(() => {
    requestLocationPermissionForCurrency();
  }, []);

  // Strip legacy query parameter ?v= from WooCommerce/plugins to prevent double pageviews in analytics
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has("v")) {
        urlParams.delete("v");
        const newSearch = urlParams.toString();
        const newPath =
          window.location.pathname +
          (newSearch ? `?${newSearch}` : "") +
          window.location.hash;
        window.history.replaceState({}, document.title, newPath);
      }
    } catch (e) {
      // Fail-silent
    }
  }, []);

  // Apply/remove html.banner-active so CSS can push navbar + content down by 40px
  useEffect(() => {
    if (isBannerActive) {
      document.documentElement.classList.add("banner-active");
    } else {
      document.documentElement.classList.remove("banner-active");
    }
    return () => document.documentElement.classList.remove("banner-active");
  }, [isBannerActive]);

  // Register service worker for push notifications & sync subscription
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .then(async (registration) => {
        // Only auto-subscribe if permission was already granted
        if (Notification.permission !== "granted") return;

        try {
          let sub = await registration.pushManager.getSubscription();

          if (!sub) {
            const keyRes = await fetch(`${apiBaseUrl || ""}/api/push/vapid-key`);
            if (!keyRes.ok) return;
            const { publicKey } = await keyRes.json();
            if (!publicKey) return;

            sub = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(publicKey)
            });
          }

          const token = sessionStorage.getItem("token") || localStorage.getItem("token");
          if (token && sub) {
            await fetch(`${apiBaseUrl || ""}/api/push/subscribe`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify(sub.toJSON())
            });
          }
        } catch {
          // Push subscription is optional — ignore errors
        }
      })
      .catch(() => {});
  }, []);

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  }

  useEffect(() => {
    let active = true;
    const storedThemeSettings = readStoredSiteTheme();

    const fetchSettings = () => {
      axios
        .get("/api/settings/public")
        .then((res) => {
          if (!active) return;
          applySiteTheme(res.data?.siteTheme || DEFAULT_SITE_THEME, res.data?.customThemes || []);
          storePricingConfig({
            pricingMarkets: res.data?.pricingMarkets || [],
            internationalPricingDefaults: res.data?.internationalPricingDefaults || {},
            currencyConversionRates: res.data?.currencyConversionRates || {}
          });
          if (res.data?.festiveAnimation) {
            setFestiveAnimation({
              enabled:          Boolean(res.data.festiveAnimation.enabled),
              type:             String(res.data.festiveAnimation.type      || "diwali"),
              intensity:        String(res.data.festiveAnimation.intensity || "subtle"),
              customColors:     Array.isArray(res.data.festiveAnimation.customColors)     ? res.data.festiveAnimation.customColors     : [],
              customAnimations: Array.isArray(res.data.festiveAnimation.customAnimations) ? res.data.festiveAnimation.customAnimations : []
            });
          }
          if (res.data?.festiveBanner) {
            setFestiveBanner({
              enabled:   Boolean(res.data.festiveBanner.enabled),
              text:      String(res.data.festiveBanner.text      || ""),
              bgFrom:    String(res.data.festiveBanner.bgFrom    || "#FF6B00"),
              bgTo:      String(res.data.festiveBanner.bgTo      || "#FFD700"),
              textColor: String(res.data.festiveBanner.textColor || "#ffffff"),
              linkUrl:   String(res.data.festiveBanner.linkUrl   || ""),
              linkText:  String(res.data.festiveBanner.linkText  || "Shop Now")
            });
          }
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
    };

    fetchSettings();

    const handleSettingsUpdate = () => {
      try {
        sessionStorage.removeItem("festiveBannerDismissed");
      } catch {}
      setIsBannerDismissed(false);
      fetchSettings();
    };

    window.addEventListener("siteSettingsUpdated", handleSettingsUpdate);

    return () => {
      active = false;
      window.removeEventListener("siteSettingsUpdated", handleSettingsUpdate);
    };
  }, []);

  return (
    <HashRouter>
      <AnalyticsTracker />
      <ScrollToTop />
      {isBannerActive && (
        <FestiveBanner
          text={festiveBanner.text}
          bgFrom={festiveBanner.bgFrom}
          bgTo={festiveBanner.bgTo}
          textColor={festiveBanner.textColor}
          linkUrl={festiveBanner.linkUrl}
          linkText={festiveBanner.linkText}
          onDismiss={() => {
            try {
              sessionStorage.setItem("festiveBannerDismissed", "1");
            } catch {}
            setIsBannerDismissed(true);
          }}
        />
      )}
      <FestiveAnimation
        enabled={festiveAnimation.enabled}
        type={festiveAnimation.type}
        intensity={festiveAnimation.intensity}
        customColors={festiveAnimation.customColors}
        customAnimations={festiveAnimation.customAnimations || []}
      />
      <Navbar bannerActive={isBannerActive} />
      <Breadcrumb />

      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/collection" element={<Collection />} />
          <Route path="/search" element={<SearchResults />} />
          <Route path="/product/:id" element={<Product />} />
          <Route path="/wishlist" element={<Wishlist />} />
          <Route path="/about" element={<About />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/redeem-gift" element={<RedeemGift />} />
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
            path="/my-library"
            element={
              <ProtectedRoute>
                <MyLibrary />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <AdminRoute requiredPage="dashboard">
                <AdminDashboard />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/sales-dashboard"
            element={
              <AdminRoute requiredPage="sales-dashboard">
                <AdminSalesDashboard />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/sales"
            element={
              <AdminRoute requiredPage="sales-dashboard">
                <AdminSalesDashboard />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/financial-dashboard"
            element={
              <AdminRoute requiredPage="financial-dashboard">
                <AdminFinancialDashboard />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/orders"
            element={
              <AdminRoute requiredPage="orders">
                <AdminOrders />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/orders/:id"
            element={
              <AdminRoute requiredPage="orders">
                <AdminOrderDetails />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/products"
            element={
              <AdminRoute requiredPage="products">
                <AdminProducts />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/add-products"
            element={
              <AdminRoute requiredPage="add-products">
                <AdminAddProducts />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/coupons"
            element={
              <AdminRoute requiredPage="coupons">
                <AdminCoupons />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <AdminRoute requiredPage="users">
                <AdminUsers />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/admin-access"
            element={
              <AdminRoute requiredPage="admin-access">
                <AdminAccessControl />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/theme"
            element={
              <AdminRoute requiredPage="theme">
                <AdminThemeSettings />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/marketing"
            element={
              <AdminRoute requiredPage="marketing">
                <AdminMarketing />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/security-logs"
            element={
              <AdminRoute requiredPage="security-logs">
                <AdminSecurityLogs />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/trash"
            element={
              <AdminRoute requiredPage="always">
                <AdminTrash />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/wp-archive"
            element={
              <AdminRoute requiredPage="orders">
                <WpArchiveDashboard />
              </AdminRoute>
            }
          />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/shipping-refund-policy" element={<ShippingPolicy />} />
          <Route path="/refund-policy" element={<ShippingPolicy />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
          <Route path="/terms-conditions" element={<TermsAndConditions />} />
          <Route path="/terms" element={<TermsAndConditions />} />
          <Route path="/buy/:id" element={<GuestBuy />} />
        </Routes>
      </Suspense>

      <Footer />
      <WhatsAppButton />
      <CookieConsent />
      <CartPopup />
    </HashRouter>
  );
}

export default App;
