const STORAGE_KEY = "dsgAttribution";

function cap(str, maxLen) {
  if (typeof str !== "string") return "";
  return str.trim().slice(0, maxLen);
}

/**
 * Captures first-touch signup attribution parameters from the current URL and referrer.
 * Stores in localStorage under key "dsgAttribution". First touch wins (does not overwrite).
 */
export function captureAttribution() {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }

    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) {
      return; // first touch wins
    }

    const searchParams = new URLSearchParams(window.location.search || "");
    const utmSource = (searchParams.get("utm_source") || "").trim();
    const utmMedium = (searchParams.get("utm_medium") || "").trim();
    const utmCampaign = (searchParams.get("utm_campaign") || "").trim();
    const utmTerm = (searchParams.get("utm_term") || "").trim();
    const utmContent = (searchParams.get("utm_content") || "").trim();

    let referrerHost = "";
    if (typeof document !== "undefined" && document.referrer) {
      try {
        const refUrl = new URL(document.referrer);
        const currentHost = window.location.hostname;
        if (refUrl.hostname && refUrl.hostname !== currentHost) {
          referrerHost = refUrl.hostname.trim();
        }
      } catch {
        referrerHost = "";
      }
    }

    const landingPath = (window.location.pathname || "/").trim();

    let source = utmSource;
    let medium = utmMedium;

    if (!source) {
      if (referrerHost) {
        source = referrerHost;
        medium = "referral";
      } else {
        source = "direct";
        medium = "none";
      }
    }

    const attribution = {
      source: cap(source, 100),
      medium: cap(medium, 100),
      campaign: cap(utmCampaign, 150),
      term: cap(utmTerm, 150),
      content: cap(utmContent, 150),
      referrerHost: cap(referrerHost, 255),
      landingPath: cap(landingPath, 255),
      firstSeenAt: new Date().toISOString()
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // Storage blocked or unavailable - never throw
  }
}

/**
 * Retrieves the stored attribution object from localStorage.
 * @returns {object|null} Stored attribution object, or null if missing/invalid/blocked
 */
export function getAttribution() {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Removes the stored attribution object from localStorage.
 */
export function clearAttribution() {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage blocked or unavailable - never throw
  }
}
