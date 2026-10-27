/**
 * Pure analytics helpers.
 *
 * Rules:
 * - Wrap everything in try/catch; never throw.
 * - NEVER send name, email, phone, user id or any personal data.
 */

export function trackSignUp(method) {
  try {
    if (typeof window === "undefined") {
      return;
    }

    if (window.dataLayer) {
      window.dataLayer.push({
        event: "sign_up",
        method
      });
    }

    if (window.fbq && window.fbqInitialized) {
      window.fbq("track", "CompleteRegistration", { method });
    }
  } catch {
    // Analytics failures must never throw or break application flows
  }
}
