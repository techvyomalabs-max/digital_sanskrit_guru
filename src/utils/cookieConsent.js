/**
 * Cookie consent: where the visitor's choice is kept and when to ask again.
 *
 * COOKIE_POLICY_VERSION: raise it whenever the cookie categories or what we collect change
 * (a new tracker, a new purpose). Visitors who chose under an older version see the banner
 * again, and until they choose, analytics and marketing stay off. index.html has the same
 * number for the pre-render defaults: change both together.
 */
export const COOKIE_CONSENT_KEY = "dsg-cookie-consent";
export const COOKIE_POLICY_VERSION = 2;
export const OPEN_COOKIE_SETTINGS_EVENT = "dsg:open-cookie-settings";

/** The saved choice if it was made under the current policy version, else null. */
export function readCookieConsent() {
  try {
    const stored = JSON.parse(localStorage.getItem(COOKIE_CONSENT_KEY) || "null");
    if (!stored || typeof stored !== "object") return null;
    if (Number(stored.version) !== COOKIE_POLICY_VERSION) return null;
    return { necessary: true, analytics: stored.analytics === true, marketing: stored.marketing === true };
  } catch {
    return null;
  }
}

/** Opens the cookie preferences (footer and Privacy Policy links), to change or withdraw consent. */
export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT));
}
