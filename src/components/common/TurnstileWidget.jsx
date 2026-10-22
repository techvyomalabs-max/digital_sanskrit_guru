import { useEffect, useRef, useState, useCallback } from "react";
import { apiBaseUrl } from "../../lib/api";

// Cloudflare Turnstile official always-pass testing key for development
const CLOUDFLARE_TEST_SITE_KEY = "1x00000000000000000000AA";

/**
 * Cloudflare Turnstile CAPTCHA & Bot Protection Widget
 *
 * @param {Object} props
 * @param {Function} props.onVerify - Callback function receiving the verification token (string)
 * @param {Function} [props.onExpire] - Optional callback when token expires
 * @param {Function} [props.onError] - Optional callback on challenge failure
 * @param {string} [props.theme] - "light" | "dark" | "auto" (default: "auto")
 */
export default function TurnstileWidget({ onVerify, onExpire, onError, theme = "auto" }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const stuckTimerRef = useRef(null);
  const hasTokenRef = useRef(false);

  const [showStuckMessage, setShowStuckMessage] = useState(false);

  // Check .env master switch first
  const envEnabled = import.meta.env.VITE_TURNSTILE_ENABLED !== "false";

  const [isEnabled, setIsEnabled] = useState(() => {
    if (!envEnabled) return false;
    try {
      const cached = localStorage.getItem("dsg-turnstile-enabled");
      if (cached !== null) return cached === "true";
    } catch {
      // Ignore localStorage errors
    }
    return true;
  });

  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onVerifyRef.current = onVerify;
    onExpireRef.current = onExpire;
    onErrorRef.current = onError;
  });

  // Check if Turnstile is enabled by admin in Store Settings with retries
  useEffect(() => {
    if (!envEnabled) {
      if (onVerifyRef.current) {
        onVerifyRef.current("bypass");
      }
      return;
    }

    let isMounted = true;
    let timerId = null;
    let retryCount = 0;
    const retryDelays = [2000, 4000, 8000];

    const fetchSettings = () => {
      fetch(`${apiBaseUrl || ""}/api/settings/public`)
        .then(async (res) => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          return res.json();
        })
        .then((data) => {
          if (!isMounted) return;
          const enabled = data?.turnstileEnabled !== false;
          try {
            localStorage.setItem("dsg-turnstile-enabled", String(enabled));
          } catch {
            // Ignore localStorage errors
          }
          setIsEnabled(enabled);
          if (!enabled && onVerifyRef.current) {
            onVerifyRef.current("bypass");
          }
        })
        .catch(() => {
          if (!isMounted) return;
          if (retryCount < retryDelays.length) {
            const delay = retryDelays[retryCount];
            retryCount += 1;
            timerId = setTimeout(() => {
              if (isMounted) {
                fetchSettings();
              }
            }, delay);
          }
        });
    };

    fetchSettings();

    return () => {
      isMounted = false;
      if (timerId) {
        clearTimeout(timerId);
      }
    };
  }, [envEnabled]);

  const siteKey =
    import.meta.env.VITE_TURNSTILE_SITE_KEY || CLOUDFLARE_TEST_SITE_KEY;

  // Stuck protection timer
  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    hasTokenRef.current = false;

    stuckTimerRef.current = setTimeout(() => {
      if (!hasTokenRef.current) {
        setShowStuckMessage(true);
      }
    }, 15000);

    return () => {
      if (stuckTimerRef.current) {
        clearTimeout(stuckTimerRef.current);
        stuckTimerRef.current = null;
      }
    };
  }, [isEnabled]);

  const renderWidget = useCallback(() => {
    if (!window.turnstile || !containerRef.current || widgetIdRef.current !== null) {
      return;
    }

    try {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme,
        callback: (token) => {
          hasTokenRef.current = true;
          if (stuckTimerRef.current) {
            clearTimeout(stuckTimerRef.current);
            stuckTimerRef.current = null;
          }
          setShowStuckMessage(false);
          if (onVerifyRef.current) {
            onVerifyRef.current(token);
          }
        },
        "expired-callback": () => {
          hasTokenRef.current = false;
          if (onExpireRef.current) {
            onExpireRef.current();
          }
        },
        "error-callback": () => {
          hasTokenRef.current = true;
          if (stuckTimerRef.current) {
            clearTimeout(stuckTimerRef.current);
            stuckTimerRef.current = null;
          }
          setShowStuckMessage(false);
          // Fallback for dev / unconfigured keys so users aren't locked out
          if (onVerifyRef.current) onVerifyRef.current(CLOUDFLARE_TEST_SITE_KEY);
          if (onErrorRef.current) onErrorRef.current();
        }
      });
    } catch (err) {
      console.warn("[Turnstile] Render error:", err);
    }
  }, [siteKey, theme]);

  const handleTryAgain = () => {
    setShowStuckMessage(false);
    hasTokenRef.current = false;
    if (stuckTimerRef.current) {
      clearTimeout(stuckTimerRef.current);
    }
    stuckTimerRef.current = setTimeout(() => {
      if (!hasTokenRef.current) {
        setShowStuckMessage(true);
      }
    }, 15000);

    if (widgetIdRef.current !== null && window.turnstile?.reset) {
      try {
        window.turnstile.reset(widgetIdRef.current);
        return;
      } catch {
        // Fallback to remove and render again
      }
    }

    if (widgetIdRef.current !== null && window.turnstile?.remove) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch {
        // Ignore removal errors
      }
      widgetIdRef.current = null;
    }

    renderWidget();
  };

  useEffect(() => {
    if (!isEnabled) {
      if (onVerifyRef.current) {
        onVerifyRef.current("bypass");
      }
      return;
    }
    let isMounted = true;
    let scriptToCleanup = null;
    let loadHandler = null;

    const onScriptLoaded = () => {
      if (isMounted) {
        renderWidget();
      }
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      // Check if script tag already exists on the page
      const existingScript = document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]');
      if (!existingScript) {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        // script.defer is removed

        loadHandler = onScriptLoaded;
        script.onload = loadHandler;
        script.addEventListener("load", loadHandler);

        script.onerror = () => {
          hasTokenRef.current = true;
          if (stuckTimerRef.current) {
            clearTimeout(stuckTimerRef.current);
            stuckTimerRef.current = null;
          }
          setShowStuckMessage(false);
          // Graceful fallback if Cloudflare is blocked or offline
          if (isMounted && onVerifyRef.current) {
            onVerifyRef.current(CLOUDFLARE_TEST_SITE_KEY);
          }
        };

        scriptToCleanup = script;
        document.head.appendChild(script);
      } else {
        if (window.turnstile) {
          renderWidget();
        } else {
          loadHandler = onScriptLoaded;
          existingScript.addEventListener("load", loadHandler);
          scriptToCleanup = existingScript;
        }
      }
    }

    return () => {
      isMounted = false;
      if (scriptToCleanup && loadHandler) {
        if (scriptToCleanup.onload === loadHandler) {
          scriptToCleanup.onload = null;
        }
        scriptToCleanup.removeEventListener("load", loadHandler);
      }
      if (widgetIdRef.current !== null && window.turnstile?.remove) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Ignore removal errors
        }
        widgetIdRef.current = null;
      }
    };
  }, [isEnabled, renderWidget]);

  if (!isEnabled) {
    return null;
  }

  return (
    <div style={{ margin: "14px 0", minHeight: "65px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div ref={containerRef} />
      {showStuckMessage && (
        <div style={{ marginTop: "8px", textAlign: "center", fontSize: "13px", color: "var(--site-muted, #64748b)" }}>
          <span>The security check is taking longer than usual. </span>
          <button
            type="button"
            onClick={handleTryAgain}
            style={{
              background: "none",
              border: "none",
              color: "var(--site-link, #d97706)",
              fontWeight: 600,
              textDecoration: "underline",
              cursor: "pointer",
              padding: 0,
              fontSize: "inherit",
              fontFamily: "inherit"
            }}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
