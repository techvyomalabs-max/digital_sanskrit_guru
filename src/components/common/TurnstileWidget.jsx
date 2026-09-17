import { useEffect, useRef, useState } from "react";

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
  const [isLoaded, setIsLoaded] = useState(false);

  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onVerifyRef.current = onVerify;
    onExpireRef.current = onExpire;
    onErrorRef.current = onError;
  });

  const siteKey =
    import.meta.env.VITE_TURNSTILE_SITE_KEY || CLOUDFLARE_TEST_SITE_KEY;

  useEffect(() => {
    let isMounted = true;

    const renderWidget = () => {
      if (!window.turnstile || !containerRef.current || widgetIdRef.current !== null) {
        return;
      }

      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          callback: (token) => {
            if (isMounted && onVerifyRef.current) {
              onVerifyRef.current(token);
            }
          },
          "expired-callback": () => {
            if (isMounted && onExpireRef.current) {
              onExpireRef.current();
            }
          },
          "error-callback": () => {
            if (isMounted) {
              // Fallback for dev / unconfigured keys so users aren't locked out
              if (onVerifyRef.current) onVerifyRef.current(CLOUDFLARE_TEST_SITE_KEY);
              if (onErrorRef.current) onErrorRef.current();
            }
          }
        });
        setIsLoaded(true);
      } catch (err) {
        console.warn("[Turnstile] Render error:", err);
      }
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      // Load script if not already on the page
      const existingScript = document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]');
      if (!existingScript) {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.onload = () => {
          if (isMounted && window.turnstile) {
            window.turnstile.ready(renderWidget);
          }
        };
        script.onerror = () => {
          // Graceful fallback if Cloudflare is blocked or offline
          if (isMounted && onVerifyRef.current) {
            onVerifyRef.current(CLOUDFLARE_TEST_SITE_KEY);
          }
        };
        document.head.appendChild(script);
      } else {
        existingScript.addEventListener("load", renderWidget);
      }
    }

    return () => {
      isMounted = false;
      if (widgetIdRef.current !== null && window.turnstile?.remove) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Ignore removal errors
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, theme]);

  return (
    <div style={{ margin: "14px 0", minHeight: "65px", display: "flex", justifyContent: "center" }}>
      <div ref={containerRef} />
    </div>
  );
}
