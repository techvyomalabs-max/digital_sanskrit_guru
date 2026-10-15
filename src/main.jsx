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
import "./index.css";
import "./responsive-overrides.css"; // global responsive fixes for all pages/devices
import "./lib/api";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { WishlistProvider } from "./context/WishlistContext";
import { ToastProvider } from "./context/ToastContext";
import { DialogProvider } from "./context/DialogContext";
import { DeliveryLocationProvider } from "./context/DeliveryLocationContext";
import { applySiteTheme, readStoredSiteTheme, DEFAULT_SITE_THEME } from "./utils/siteTheme";

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
                <App />
              </WishlistProvider>
            </DeliveryLocationProvider>
          </CartProvider>
        </DialogProvider>
      </ToastProvider>
    </AuthProvider>
  </React.StrictMode>
);
