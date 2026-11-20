// import { StrictMode } from 'react'
// import { createRoot } from 'react-dom/client'
// import './index.css'
// import App from './App.jsx'
// import { CartProvider } from "./context/CartContext";

// createRoot(document.getElementById('root')).render(
//   <StrictMode>
//     <CartProvider>
//       <App />
//       </CartProvider>
//   </StrictMode>,
// )
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./fonts"; // self-hosted fonts (were Google Fonts)
import "./index.css";
import "./styles/sky-background.css";
import "./responsive-overrides.css"; // global responsive fixes for all pages/devices
import "./ux-foundation.css"; // focus, touch, motion and state rules for every page
import "./lib/api";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { WishlistProvider } from "./context/WishlistContext";
import { ToastProvider } from "./context/ToastContext";
import { DialogProvider } from "./context/DialogContext";
import { DeliveryLocationProvider } from "./context/DeliveryLocationContext";
import { applySiteTheme, readStoredSiteTheme, DEFAULT_SITE_THEME, applySiteBackground, readStoredSiteBackground } from "./utils/siteTheme";
import { legacyHashToPath, legacyQueryToPath } from "./utils/legacyHash";
import { captureAttribution } from "./utils/attribution";
import ErrorBoundary from "./components/common/ErrorBoundary";

captureAttribution();

const target =
  legacyHashToPath(window.location.hash, window.location.search) ||
  (window.location.pathname === "/" ? legacyQueryToPath(window.location.search) : null);
if (target) {
  window.history.replaceState(null, "", target);
}

// The last site background seen (saved settings replace it once they load), so the page
// doesn't flash the plain colour first
applySiteBackground(readStoredSiteBackground(), false);

const storedThemeSettings = readStoredSiteTheme();
if (storedThemeSettings) {
  applySiteTheme(storedThemeSettings.siteTheme, storedThemeSettings.customThemes, true);
} else {
  applySiteTheme(DEFAULT_SITE_THEME, [], false);
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <ToastProvider>
        <DialogProvider>
          <CartProvider>
            <DeliveryLocationProvider>
              <WishlistProvider>
                <ErrorBoundary>
                  <App />
                </ErrorBoundary>
              </WishlistProvider>
            </DeliveryLocationProvider>
          </CartProvider>
        </DialogProvider>
      </ToastProvider>
    </AuthProvider>
  </React.StrictMode>
);
