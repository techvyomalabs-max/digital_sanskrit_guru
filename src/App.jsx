import { Suspense, lazy, useEffect, useState } from "react";
import { HashRouter, Routes, Route, useLocation } from "react-router-dom";
import axios from "axios";
import { apiBaseUrl } from "./lib/api";
import Navbar from "./components/layout/Navbar";
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
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminOrders = lazy(() => import("./pages/AdminOrders"));
const AdminOrderDetails = lazy(() => import("./pages/AdminOrderDetails"));
const AdminProducts = lazy(() => import("./pages/AdminProducts"));
const AdminAddProducts = lazy(() => import("./pages/AdminAddProducts"));
const AdminCoupons = lazy(() => import("./pages/AdminCoupons"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminThemeSettings = lazy(() => import("./pages/AdminThemeSettings"));
const AdminMarketing = lazy(() => import("./pages/AdminMarketing"));
const About = lazy(() => import("./pages/About"));

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

  // Register service worker for push notifications
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .then(async (registration) => {
        // Only auto-subscribe if permission was already granted
        if (Notification.permission !== "granted") return;

        try {
          const existing = await registration.pushManager.getSubscription();
          if (existing) return; // Already subscribed

          const keyRes = await fetch(`${apiBaseUrl || ""}/api/push/vapid-key`);
          if (!keyRes.ok) return;
          const { publicKey } = await keyRes.json();
          if (!publicKey) return;

          const sub = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
          });

          const token = sessionStorage.getItem("token") || localStorage.getItem("token");
          if (token) {
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

      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/collection" element={<Collection />} />
          <Route path="/search" element={<SearchResults />} />
          <Route path="/product/:id" element={<Product />} />
          <Route path="/wishlist" element={<Wishlist />} />
          <Route path="/about" element={<About />} />
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
          <Route
            path="/admin/marketing"
            element={
              <AdminRoute>
                <AdminMarketing />
              </AdminRoute>
            }
          />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
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
