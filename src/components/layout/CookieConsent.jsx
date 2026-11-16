import React, { useState, useEffect } from "react";
import { Cookie } from "lucide-react";
import { Link } from "react-router-dom";
import "./CookieConsent.css";
import {
  COOKIE_CONSENT_KEY,
  COOKIE_POLICY_VERSION,
  OPEN_COOKIE_SETTINGS_EVENT,
  readCookieConsent
} from "../../utils/cookieConsent";

export default function CookieConsent() {
  // No choice yet, or it was made under an older cookie policy: ask (again)
  const [isVisible, setIsVisible] = useState(() => !readCookieConsent());
  const [showPreferences, setShowPreferences] = useState(false);
  const [preferences, setPreferences] = useState({
    necessary: true,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    // "Cookie settings" links: change or withdraw consent as easily as it was given
    const openSettings = () => {
      const saved = readCookieConsent();
      if (saved) setPreferences(saved);
      setShowPreferences(true);
      setIsVisible(true);
    };
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, openSettings);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, openSettings);
  }, []);

  const saveConsent = (consentData) => {
    try {
      localStorage.setItem(
        COOKIE_CONSENT_KEY,
        JSON.stringify({ ...consentData, version: COOKIE_POLICY_VERSION, savedAt: new Date().toISOString() })
      );
    } catch {
      // Storage blocked: the choice still applies for this visit
    }

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
    if (window.fbq && window.fbqInitialized) {
      window.fbq("consent", consentData.marketing ? "grant" : "revoke");
    }

    setIsVisible(false);
    setShowPreferences(false);
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
    <div
      className="cookie-banner-overlay"
      id="dsg-cookie-consent-banner"
      role="dialog"
      aria-labelledby="dsg-cookie-title"
      aria-describedby="dsg-cookie-text"
    >
      <div className="cookie-card">
        <div className="cookie-header">
          <div className="cookie-icon"><Cookie size={26} aria-hidden="true" /></div>
          <div className="cookie-title-group">
            <h3 id="dsg-cookie-title">Cookie Consent & Privacy</h3>
            <p className="cookie-compliance-badge">
              Information Technology Act, 2000 (and applicable Rules thereunder), DPDP Act 2023, Consumer
              Protection Act, 2019 (and Dark Patterns Guidelines, 2023) compliant.
            </p>
          </div>
        </div>

        <div className="cookie-body">
          <p id="dsg-cookie-text">
            We use cookies to enhance your browsing experience, serve personalized content, and analyze our
            traffic. In compliance with India&apos;s Information Technology Act, 2000 (and applicable Rules
            thereunder) and India&apos;s Digital Personal Data Protection (DPDP) Act, 2023, please select your
            preferences below. You can change your choice at any time from &quot;Cookie settings&quot; at the
            bottom of every page. Read our{" "}
            <Link to="/privacy-policy" style={{ color: "var(--site-link, #2563eb)", fontWeight: 700, textDecoration: "underline" }}>
              Privacy Policy
            </Link>.
          </p>
        </div>

        {showPreferences && (
          <div className="cookie-preferences-panel">
            <div className="cookie-pref-item">
              <div className="cookie-pref-meta">
                <strong>Necessary Cookies</strong>
                <span>Required for core site security, currency localization, and shopping checkout functionalities. Cannot be turned off.</span>
              </div>
              <input type="checkbox" checked disabled className="cookie-pref-checkbox" aria-label="Necessary cookies (always on)" />
            </div>

            <div className="cookie-pref-item">
              <div className="cookie-pref-meta">
                <strong>Analytics Cookies</strong>
                <span>Allows us to track page visits and loading performance, helping us optimize the Sanskrit learning catalogue.</span>
              </div>
              <input
                type="checkbox"
                checked={preferences.analytics}
                onChange={(e) => setPreferences({ ...preferences, analytics: e.target.checked })}
                className="cookie-pref-checkbox"
                aria-label="Analytics cookies"
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
                aria-label="Marketing cookies"
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
                {/* Same size and style as Accept All: neither choice is pushed over the other */}
                <button type="button" className="cookie-btn primary-btn" onClick={handleRejectAll}>
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
