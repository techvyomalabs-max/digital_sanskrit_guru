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
import "./lib/api";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { WishlistProvider } from "./context/WishlistContext";
import { ToastProvider } from "./context/ToastContext";
import { DeliveryLocationProvider } from "./context/DeliveryLocationContext";
import { applySiteTheme, readStoredSiteTheme, DEFAULT_SITE_THEME } from "./utils/siteTheme";

const storedThemeSettings = readStoredSiteTheme();
applySiteTheme(
  storedThemeSettings?.siteTheme || DEFAULT_SITE_THEME,
  storedThemeSettings?.customThemes || []
);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <ToastProvider>
        <CartProvider>
          <DeliveryLocationProvider>
            <WishlistProvider>
              <App />
            </WishlistProvider>
          </DeliveryLocationProvider>
        </CartProvider>
      </ToastProvider>
    </AuthProvider>
  </React.StrictMode>
);
