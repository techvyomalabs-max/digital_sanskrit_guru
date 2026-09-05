import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";
import "./WhatsAppButton.css";

function WhatsAppButton() {
  const [showTooltip, setShowTooltip] = useState(false);
  const [whatsappSettings, setWhatsappSettings] = useState(null);
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith("/admin");

  useEffect(() => {
    let active = true;

    const fetchWhatsappSettings = () => {
      axios
        .get("/api/settings/public")
        .then((res) => {
          if (active && res.data?.whatsappSettings) {
            setWhatsappSettings(res.data.whatsappSettings);
          }
        })
        .catch(() => {});
    };

    fetchWhatsappSettings();
    window.addEventListener("siteSettingsUpdated", fetchWhatsappSettings);

    return () => {
      active = false;
      window.removeEventListener("siteSettingsUpdated", fetchWhatsappSettings);
    };
  }, []);

  useEffect(() => {
    if (isAdminRoute) return undefined;

    // Show tooltip 2 seconds after page load
    const timer = setTimeout(() => {
      setShowTooltip(true);
    }, 2000);

    // Hide tooltip after 10 seconds
    const hideTimer = setTimeout(() => {
      setShowTooltip(false);
    }, 10000);

    return () => {
      clearTimeout(timer);
      clearTimeout(hideTimer);
    };
  }, [isAdminRoute]);

  // Hide widget if on admin route OR if mode is explicitly set to "disabled"
  if (isAdminRoute || whatsappSettings?.mode === "disabled") {
    return null;
  }

  const rawPhone = String(
    whatsappSettings?.phoneNumber || "919480865623"
  ).replace(/\D/g, "");
  const welcomeText = encodeURIComponent(
    whatsappSettings?.welcomeMessage ||
      "Hello Digital Sanskrit Guru Support, I have a question."
  );

  const whatsappUrl = `https://wa.me/${rawPhone}?text=${welcomeText}`;

  return (
    <div className="whatsapp-float-container">
      {showTooltip && (
        <div className="whatsapp-tooltip">
          <span>Need Help? Chat with us!</span>
          <button
            className="whatsapp-tooltip-close"
            onClick={() => setShowTooltip(false)}
            aria-label="Close tooltip"
          >
            ×
          </button>
        </div>
      )}

      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="whatsapp-float-button"
        aria-label="Chat on WhatsApp"
        onMouseEnter={() => setShowTooltip(true)}
      >
        {/* Pulsing ripple effects */}
        <span className="whatsapp-ripple"></span>
        <span className="whatsapp-ripple ripple-2"></span>

        {/* WhatsApp SVG Icon */}
        <svg
          viewBox="0 0 24 24"
          width="30"
          height="30"
          fill="currentColor"
          className="whatsapp-svg"
        >
          <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.424 2.5 1.134 3.473l-.744 2.715 2.78-.727c.931.508 2.002.8 3.142.8.007 0 .013 0 .02 0 3.181 0 5.767-2.586 5.768-5.766.002-3.18-2.585-5.762-5.768-5.762zm3.844 8.232c-.173.486-.856.883-1.196.938-.29.047-.655.08-1.748-.363-1.4-.567-2.28-2.003-2.35-2.097-.07-.094-.57-.756-.57-1.442 0-.687.362-1.025.492-1.162.13-.137.283-.172.378-.172h.27c.084 0 .198-.033.31.238.113.272.387.944.421 1.012.034.07.057.15.01.242-.047.094-.07.153-.142.235-.07.083-.15.185-.213.25-.07.07-.143.147-.061.288.082.141.365.602.782.972.538.479.99.628 1.13.7.142.07.225.06.31-.038.084-.099.362-.423.458-.567.095-.143.19-.118.318-.07.13.047.818.386.96.453.142.07.236.104.272.165.035.061.035.358-.138.844z" />
        </svg>
      </a>
    </div>
  );
}

export default WhatsAppButton;
