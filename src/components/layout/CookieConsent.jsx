import React, { useState, useEffect } from "react";
import "./CookieConsent.css";

export default function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [preferences, setPreferences] = useState({
    necessary: true,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem("dsg-cookie-consent");
      if (!stored) {
        setIsVisible(true);
      }
    } catch {
      setIsVisible(true);
    }
  }, []);

  const saveConsent = (consentData) => {
    try {
      localStorage.setItem("dsg-cookie-consent", JSON.stringify(consentData));
    } catch (e) {}

    // Signal GTM Consent Mode of the updated choices
    if (window.gtag) {
      window.gtag("consent", "update", {
        analytics_storage: consentData.analytics ? "granted" : "denied",
        ad_storage: consentData.marketing ? "granted" : "denied",
        ad_user_data: consentData.marketing ? "granted" : "denied",
        ad_personalization: consentData.marketing ? "granted" : "denied",
      });
    }

    // Signal Meta Pixel of the updated choices
    if (window.fbq) {
      window.fbq("consent", consentData.marketing ? "grant" : "revoke");
    }

    setIsVisible(false);
  };

  const handleAcceptAll = () => {
    const allAccepted = { necessary: true, analytics: true, marketing: true };
    setPreferences(allAccepted);
    saveConsent(allAccepted);
  };

  const handleRejectAll = () => {
    const allRejected = { necessary: true, analytics: false, marketing: false };
    setPreferences(allRejected);
    saveConsent(allRejected);
  };

  const handleSavePreferences = () => {
    saveConsent(preferences);
  };

  if (!isVisible) return null;

  return (
    <div className="cookie-banner-overlay" id="dsg-cookie-consent-banner">
      <div className="cookie-card">
        <div className="cookie-header">
          <div className="cookie-icon">🍪</div>
          <div className="cookie-title-group">
            <h3>Cookie Consent & Privacy</h3>
            <p className="cookie-compliance-badge">DPDP Act 2023 & GDPR Compliant</p>
          </div>
        </div>

        <div className="cookie-body">
          <p>
            We use cookies to enhance your browsing experience, serve personalized content, and analyze our traffic. In compliance with the EU GDPR and India's Digital Personal Data Protection (DPDP) Act, 2023, please select your preferences below.
          </p>
        </div>

        {showPreferences && (
          <div className="cookie-preferences-panel">
            <div className="cookie-pref-item">
              <div className="cookie-pref-meta">
                <strong>Necessary Cookies</strong>
                <span>Required for core site security, currency localization, and shopping checkout functionalities. Cannot be turned off.</span>
              </div>
              <input type="checkbox" checked disabled className="cookie-pref-checkbox" />
            </div>

            <div className="cookie-pref-item">
              <div className="cookie-pref-meta">
                <strong>Analytics Cookies</strong>
                <span>Allows us to track page visits and loading performance, helping us optimize the Sanskrit learning catalog.</span>
              </div>
              <input
                type="checkbox"
                checked={preferences.analytics}
                onChange={(e) => setPreferences({ ...preferences, analytics: e.target.checked })}
                className="cookie-pref-checkbox"
              />
            </div>

            <div className="cookie-pref-item">
              <div className="cookie-pref-meta">
                <strong>Marketing Cookies</strong>
                <span>Used to deliver relevant offers and measure campaign performance. We never sell your personal data.</span>
              </div>
              <input
                type="checkbox"
                checked={preferences.marketing}
                onChange={(e) => setPreferences({ ...preferences, marketing: e.target.checked })}
                className="cookie-pref-checkbox"
              />
            </div>
          </div>
        )}

        <div className="cookie-footer">
          <button type="button" className="cookie-btn link-btn" onClick={() => setShowPreferences(!showPreferences)}>
            {showPreferences ? "Hide Preferences" : "Customize Settings"}
          </button>
          
          <div className="cookie-btn-group">
            {showPreferences ? (
              <button type="button" className="cookie-btn primary-btn" onClick={handleSavePreferences}>
                Save Preferences
              </button>
            ) : (
              <>
                <button type="button" className="cookie-btn secondary-btn" onClick={handleRejectAll}>
                  Reject Non-Essential
                </button>
                <button type="button" className="cookie-btn primary-btn" onClick={handleAcceptAll}>
                  Accept All
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
