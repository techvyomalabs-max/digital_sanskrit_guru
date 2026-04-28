import { createContext, useEffect, useRef, useState } from "react";
import axios from "axios";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem("user");
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const lastActivityTickRef = useRef(Date.now());
  const normalizeUser = (value) => {
    if (!value) return null;
    return {
      ...value,
      isAdmin: Boolean(value.isAdmin)
    };
  };

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
        localStorage.setItem("user", JSON.stringify(profile));
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setToken(null);
        localStorage.removeItem("user");
        localStorage.removeItem("token");
      });

    return () => {
      active = false;
    };
  }, [token]);

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

    // Mark session as active immediately.
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
      // Avoid counting hidden time.
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

  const register = async (name, email, password) => {
    const res = await axios.post(
      "/api/auth/register",
      { name, email, password }
    );
    const nextUser = normalizeUser(res.data);

    setUser(nextUser);
    setToken(res.data.token);

    localStorage.setItem("user", JSON.stringify(nextUser));
    localStorage.setItem("token", res.data.token);
  };

  const login = async (email, password) => {
    const res = await axios.post(
      "/api/auth/login",
      { email, password }
    );
    const nextUser = normalizeUser(res.data);

    setUser(nextUser);
    setToken(res.data.token);

    localStorage.setItem("user", JSON.stringify(nextUser));
    localStorage.setItem("token", res.data.token);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("user");
    localStorage.removeItem("token");
  };

  return (
    <AuthContext.Provider
      value={{ user, token, register, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export { AuthContext };

