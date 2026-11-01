// Browser side of push notifications, shared by the site, My Account and Admin → Marketing.
// "Allowed" in the browser is not enough on its own: this device's subscription must also be
// saved on the server under the signed-in account, and made with the server's current key.
import axios from "axios";
import { apiBaseUrl } from "../lib/api";

/** Why push can't work on this page/browser, or "" if it can. */
export function pushUnsupportedReason() {
  if (typeof window === "undefined") return "Not available here.";
  if (!window.isSecureContext) {
    return "Notifications only work on the secure (https://) website address. This page was opened without https, so the browser blocks them.";
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "This browser doesn't support notifications. On iPhone or iPad, first add the site to your Home Screen (Share → Add to Home Screen), then open it from there.";
  }
  return "";
}

export function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function sameKey(existing, wanted) {
  if (!existing) return true; // browser doesn't tell us; assume it matches
  const a = new Uint8Array(existing);
  if (a.length !== wanted.length) return false;
  return a.every((byte, i) => byte === wanted[i]);
}

export async function fetchPushPublicKey() {
  const res = await fetch(`${apiBaseUrl || ""}/api/push/vapid-key`);
  if (!res.ok) throw new Error("Notifications are switched off on the server right now.");
  const data = await res.json();
  if (!data?.publicKey) throw new Error("Notifications are switched off on the server right now.");
  return data.publicKey;
}

async function getRegistration() {
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

/**
 * Makes sure this device is subscribed with the server's current key and saved under the
 * signed-in account. Call only when permission is already "granted". Returns the subscription.
 */
export async function syncPushSubscription(token) {
  if (!token) throw new Error("Please sign in first.");
  const reason = pushUnsupportedReason();
  if (reason) throw new Error(reason);

  const keyBytes = urlBase64ToUint8Array(await fetchPushPublicKey());
  const registration = await getRegistration();
  let sub = await registration.pushManager.getSubscription();

  // A subscription made with an older server key can never receive pushes: replace it.
  if (sub && !sameKey(sub.options?.applicationServerKey, keyBytes)) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) {
    sub = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes });
  }

  await axios.post("/api/push/subscribe", sub.toJSON(), { headers: { Authorization: `Bearer ${token}` } });
  return sub;
}

/** Asks for permission (must be called from a click), then syncs. */
export async function enablePushNotifications(token) {
  const reason = pushUnsupportedReason();
  if (reason) throw new Error(reason);
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked for this site. Click the lock icon next to the address, allow Notifications, then try again."
        : "Notifications were not allowed."
    );
  }
  return syncPushSubscription(token);
}
