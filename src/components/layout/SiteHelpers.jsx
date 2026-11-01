import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowUp, Wifi, WifiOff } from "lucide-react";

const BACK_TO_TOP_AFTER_PX = 900;

// Tells shoppers when the connection drops, and when it returns
export function NetworkNotice() {
  const [status, setStatus] = useState(() => (navigator.onLine === false ? "offline" : "online"));
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    let hideTimer = null;
    const handleOffline = () => {
      clearTimeout(hideTimer);
      setShowRestored(false);
      setStatus("offline");
    };
    const handleOnline = () => {
      setStatus("online");
      setShowRestored(true);
      hideTimer = setTimeout(() => setShowRestored(false), 3500);
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      clearTimeout(hideTimer);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (status === "offline") {
    return (
      <div className="ux-network-notice" role="status">
        <WifiOff size={17} aria-hidden="true" />
        You're offline. Some things may not load.
      </div>
    );
  }
  if (showRestored) {
    return (
      <div className="ux-network-notice is-online" role="status">
        <Wifi size={17} aria-hidden="true" />
        Back online
      </div>
    );
  }
  return null;
}

export function BackToTop() {
  const { pathname } = useLocation();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setIsVisible(window.scrollY > BACK_TO_TOP_AFTER_PX);
    };
    const handleScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  if (!isVisible || pathname.startsWith("/admin")) return null;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <button
      type="button"
      className="ux-back-to-top"
      aria-label="Back to top"
      title="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" })}
    >
      <ArrowUp size={20} aria-hidden="true" />
    </button>
  );
}

// Fades the page content in on each route change, without remounting the page
export function PageContent({ children }) {
  const { pathname } = useLocation();
  const contentRef = useRef(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    contentRef.current?.animate?.([{ opacity: 0.35 }, { opacity: 1 }], { duration: 240, easing: "ease-out" });
  }, [pathname]);

  return (
    <div id="main-content" tabIndex={-1} ref={contentRef}>
      {children}
    </div>
  );
}
