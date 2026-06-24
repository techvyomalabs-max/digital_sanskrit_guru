import { createContext, useEffect, useRef, useState } from "react";
import axios from "axios";

const AuthContext = createContext();

const AUTH_STORAGE_KEY = "authSession";
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const REMEMBER_ME_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeUser(value) {
  if (!value) return null;
  return {
    ...value,
    isAdmin: Boolean(value.isAdmin)
  };
}

function parseJwtPayload(token) {
  try {
    const payload = String(token || "").split(".")[1];
    if (!payload) return null;
    const normalizedBase64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = window.atob(normalizedBase64);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function getTokenExpiryMs(token, fallbackMsFromNow) {
  const payload = parseJwtPayload(token);
  const expMs = Number(payload?.exp || 0) * 1000;
  if (Number.isFinite(expMs) && expMs > Date.now()) {
    return expMs;
  }
  return Date.now() + fallbackMsFromNow;
}

function readStoredAuth() {
  if (typeof window === "undefined") {
    return { token: null, user: null, rememberMe: false };
  }

  const storages = [window.sessionStorage, window.localStorage];

  for (const storage of storages) {
    try {
      const raw = storage.getItem(AUTH_STORAGE_KEY);
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      const token = String(parsed?.token || "").trim();
      const expiresAt = Number(parsed?.expiresAt || 0);
      const rememberMe = parsed?.rememberMe === true;
      const user = normalizeUser(parsed?.user || null);

      if (!token || !expiresAt || expiresAt <= Date.now()) {
        storage.removeItem(AUTH_STORAGE_KEY);
        continue;
      }

      return { token, user, rememberMe };
    } catch {
      storage.removeItem(AUTH_STORAGE_KEY);
    }
  }

  return { token: null, user: null, rememberMe: false };
}

function clearStoredAuth() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
  window.localStorage.removeItem("user");
  window.localStorage.removeItem("token");
  window.sessionStorage.removeItem("user");
  window.sessionStorage.removeItem("token");
}

function persistAuth({ token, user, rememberMe }) {
  if (typeof window === "undefined" || !token) return;

  const storage = rememberMe ? window.localStorage : window.sessionStorage;
  const fallbackDuration = rememberMe ? REMEMBER_ME_DURATION_MS : SESSION_DURATION_MS;
  const payload = {
    token,
    user: normalizeUser(user),
    rememberMe,
    expiresAt: getTokenExpiryMs(token, fallbackDuration)
  };

  clearStoredAuth();
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));

  if (rememberMe) {
    window.localStorage.setItem("user", JSON.stringify(payload.user));
    window.localStorage.setItem("token", token);
  } else {
    window.sessionStorage.setItem("user", JSON.stringify(payload.user));
    window.sessionStorage.setItem("token", token);
  }
}

export function AuthProvider({ children }) {
  const initialAuth = readStoredAuth();
  const [user, setUser] = useState(initialAuth.user);
  const [token, setToken] = useState(initialAuth.token);
  const [rememberMe, setRememberMe] = useState(initialAuth.rememberMe);
  const lastActivityTickRef = useRef(Date.now());

  useEffect(() => {
    if (!token) return;
    let active = true;

    axios
      .get("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then((res) => {
        if (!active) return;
        const profile = normalizeUser(res.data || null);
        setUser(profile);
        persistAuth({ token, user: profile, rememberMe });
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setToken(null);
        setRememberMe(false);
        clearStoredAuth();
      });

    return () => {
      active = false;
    };
  }, [rememberMe, token]);

  useEffect(() => {
    if (!token) return undefined;

    let isMounted = true;
    lastActivityTickRef.current = Date.now();

    const sendActivity = async (timeSpentSec) => {
      if (!isMounted) return;
      try {
        await axios.post(
          "/api/auth/activity",
          { timeSpentSec },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch {
        // Ignore heartbeat errors to avoid interrupting user flow.
      }
    };

    sendActivity(0);

    const intervalId = window.setInterval(() => {
      const now = Date.now();
      const deltaSec = Math.max(0, Math.round((now - lastActivityTickRef.current) / 1000));
      lastActivityTickRef.current = now;

      if (document.visibilityState !== "visible") return;
      if (deltaSec <= 0) return;
      sendActivity(deltaSec);
    }, 30000);

    const handleVisibilityChange = () => {
      lastActivityTickRef.current = Date.now();
      if (document.visibilityState === "visible") {
        sendActivity(0);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [token]);

  const register = async (name, email, password, nextRememberMe = false) => {
    const res = await axios.post("/api/auth/register", { name, email, password, rememberMe: nextRememberMe });
    const nextUser = normalizeUser(res.data);

    setUser(nextUser);
    setToken(res.data.token);
    setRememberMe(nextRememberMe);
    persistAuth({ token: res.data.token, user: nextUser, rememberMe: nextRememberMe });
  };

  const login = async (email, password, nextRememberMe = false) => {
    const res = await axios.post("/api/auth/login", { email, password, rememberMe: nextRememberMe });
    const nextUser = normalizeUser(res.data);

    setUser(nextUser);
    setToken(res.data.token);
    setRememberMe(nextRememberMe);
    persistAuth({ token: res.data.token, user: nextUser, rememberMe: nextRememberMe });
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setRememberMe(false);
    clearStoredAuth();
    try {
      sessionStorage.removeItem("festiveBannerDismissed");
    } catch (e) {}
    window.location.hash = "/login";
    window.location.reload();
  };

  return (
    <AuthContext.Provider value={{ user, token, rememberMe, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export { AuthContext };
