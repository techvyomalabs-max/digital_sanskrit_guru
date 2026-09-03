import React, { useState, useEffect } from "react";
import axios from "axios";
import "./WhatsAppWidget.css";

function WhatsAppWidget() {
  const [whatsappSettings, setWhatsappSettings] = useState(null);

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

  // Respect Admin mode toggle: if mode is "disabled" or settings not loaded yet, hide widget
  if (!whatsappSettings || whatsappSettings.mode === "disabled") {
    return null;
  }

  const rawPhone = String(whatsappSettings.phoneNumber || "919999999999").replace(/\D/g, "");
  const welcomeText = encodeURIComponent(
    whatsappSettings.welcomeMessage ||
      "Hello! I am interested in learning more about your products on Digital Sanskrit Guru."
  );

  const whatsappUrl = `https://wa.me/${rawPhone}?text=${welcomeText}`;

  return (
    <div className="whatsapp-widget-container">
      <span className="whatsapp-widget-tooltip">Need Help? Chat with us on WhatsApp</span>
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="whatsapp-widget-button"
        aria-label="Chat with us on WhatsApp"
      >
        <span className="whatsapp-widget-pulse" />
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414-.074-.124-.272-.198-.57-.347zM12.004 2C6.48 2 2 6.48 2 12c0 2.17.695 4.18 1.88 5.82L2 22l4.31-1.83C7.89 21.25 9.87 22 12.004 22c5.52 0 10-4.48 10-10s-4.48-10-10-10z" />
        </svg>
      </a>
    </div>
  );
}

export default WhatsAppWidget;
