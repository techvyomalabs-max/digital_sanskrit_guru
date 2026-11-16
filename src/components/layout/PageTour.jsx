import { useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import {
  PAGE_TOURS,
  START_TOUR_EVENT,
  getTourKeyForPath,
  markTourSeen,
  shouldAutoStartTour,
  turnOffTours
} from "../../utils/pageTours";
import "./PageTour.css";

// Wait this long after a page opens before showing its tour, so the page can settle.
const START_DELAY_MS = 1500;
// Keep checking for this long for the page to finish loading and other popups to close.
const READY_TIMEOUT_MS = 60000;
const POLL_MS = 400;

// While any of these are open, the tour waits instead of covering them.
const BLOCKING_SELECTORS = [
  "#dsg-cookie-consent-banner",
  ".cart-popup-overlay",
  ".navbar-address-modal-backdrop",
  ".category-sidebar-root",
  "[aria-modal='true']"
];

function isVisible(element) {
  if (!element || !element.isConnected) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(element);
  return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) !== 0;
}

function findVisible(selectors = []) {
  for (const selector of selectors) {
    let matches = [];
    try {
      matches = document.querySelectorAll(selector);
    } catch {
      continue;
    }
    for (const element of matches) {
      if (isVisible(element)) return element;
    }
  }
  return null;
}

function somethingIsInTheWay() {
  if (BLOCKING_SELECTORS.some((selector) => findVisible([selector]))) return true;
  // Don't interrupt someone who is typing (for example in the search box).
  const active = document.activeElement;
  return Boolean(active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName));
}

function pageIsReady(tour) {
  if (!tour.requires) return true;
  return Boolean(findVisible(tour.requires));
}

// Turn the tour config into driver.js steps, keeping only steps that are on screen.
function buildSteps(tour) {
  const steps = [];
  for (const step of tour.steps) {
    const popover = { title: step.title, description: step.description };
    if (!step.selectors) {
      steps.push({ popover }); // No element: shown in the middle of the screen.
      continue;
    }
    if (step.skipIfVisible && findVisible(step.skipIfVisible)) continue;
    const element = findVisible(step.selectors);
    if (element) steps.push({ element, popover });
  }
  // A tour made only of the welcome card isn't worth showing.
  return steps.some((step) => step.element) ? steps : [];
}

// Fixed bars at the top (navbar) and bottom (phone tab bar) can hide part of the
// page. If the highlighted part is under one of them, scroll it to the middle first.
function bringIntoClearView(element) {
  if (!element || typeof element.getBoundingClientRect !== "function") return;
  // Navbar items are always on screen.
  if (element.closest(".navbar, .navbar-mobile-bottom-bar")) return;
  const rect = element.getBoundingClientRect();
  const topBar = document.querySelector(".navbar")?.getBoundingClientRect().bottom || 0;
  const bottomBar = document.querySelector(".navbar-mobile-bottom-bar");
  const bottomLimit = bottomBar && isVisible(bottomBar) ? bottomBar.getBoundingClientRect().top : window.innerHeight;
  if (rect.top < topBar + 8 || rect.bottom > bottomLimit - 8) {
    element.scrollIntoView({ block: "center", behavior: "instant" });
  }
}

function track(tourKey, action, stepNumber) {
  try {
    window.dataLayer?.push({ event: "page_tour", tour: tourKey, tour_action: action, tour_step: stepNumber });
  } catch {
    // Analytics is optional.
  }
}

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export default function PageTour() {
  const { pathname } = useLocation();
  const driverRef = useRef(null);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const stopTour = useCallback(() => {
    const active = driverRef.current;
    driverRef.current = null;
    try {
      if (active?.isActive()) active.destroy();
    } catch {
      // Already gone.
    }
  }, []);

  const runTour = useCallback(
    async (tourKey, { replay = false } = {}) => {
      const tour = PAGE_TOURS[tourKey];
      if (!tour) return false;
      const steps = buildSteps(tour);
      if (!steps.length) return false;

      let driverModule;
      try {
        [driverModule] = await Promise.all([import("driver.js"), import("driver.js/dist/driver.css")]);
      } catch {
        return false; // Could not load the tour script (offline etc.). Try again next visit.
      }
      // The visitor may have moved to another page while the script loaded.
      if (getTourKeyForPath(pathnameRef.current) !== tourKey) return false;

      stopTour();
      const reducedMotion = prefersReducedMotion();
      let lastIndex = 0;

      const tourDriver = driverModule.driver({
        steps,
        animate: !reducedMotion,
        smoothScroll: !reducedMotion,
        showProgress: steps.length > 1,
        progressText: "{{current}} of {{total}}",
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Got it",
        closeBtnLabel: "Close tips",
        popoverClass: "dsg-tour-popover",
        overlayOpacity: 0.55,
        stagePadding: 6,
        stageRadius: 10,
        allowClose: true,
        overlayClickBehavior: "close",
        disableActiveInteraction: true,
        onHighlightStarted: (element) => bringIntoClearView(element),
        onHighlighted: (_element, _step, { state }) => {
          lastIndex = state.activeIndex ?? lastIndex;
        },
        onPopoverRender: (popover, { driver: activeDriver }) => {
          if (replay) return;
          const optOut = document.createElement("button");
          optOut.type = "button";
          optOut.className = "dsg-tour-optout";
          optOut.textContent = "Don't show tips again";
          optOut.addEventListener("click", () => {
            turnOffTours();
            markTourSeen(tourKey);
            track(tourKey, "turned_off", lastIndex + 1);
            activeDriver.destroy();
          });
          popover.wrapper.insertBefore(optOut, popover.footer);
        },
        onDestroyed: (_element, _step, { reason }) => {
          if (driverRef.current === tourDriver) driverRef.current = null;
          // "api" means we closed it ourselves (page changed); show it again next time.
          if (reason === "api") return;
          markTourSeen(tourKey);
          track(tourKey, reason === "done" ? "completed" : "skipped", lastIndex + 1);
        }
      });

      driverRef.current = tourDriver;
      track(tourKey, replay ? "replayed" : "started", 1);
      tourDriver.drive();
      return true;
    },
    [stopTour]
  );

  // First visit to a page: wait for it to load and for other popups to close, then show its tour.
  useEffect(() => {
    stopTour();
    const tourKey = getTourKeyForPath(pathname);
    if (!shouldAutoStartTour(tourKey)) return undefined;

    const tour = PAGE_TOURS[tourKey];
    const startedAt = Date.now();
    let timer = null;
    let cancelled = false;

    const check = () => {
      if (cancelled) return;
      if (Date.now() - startedAt > READY_TIMEOUT_MS) return;
      if (document.visibilityState === "hidden" || somethingIsInTheWay() || !pageIsReady(tour)) {
        timer = window.setTimeout(check, POLL_MS);
        return;
      }
      runTour(tourKey);
    };

    timer = window.setTimeout(check, START_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pathname, runTour, stopTour]);

  // "Show me around this page" (footer link) replays the tour for the current page.
  useEffect(() => {
    const handleStart = () => {
      const tourKey = getTourKeyForPath(pathnameRef.current);
      if (!tourKey) return;
      if (document.activeElement && typeof document.activeElement.blur === "function") {
        document.activeElement.blur();
      }
      runTour(tourKey, { replay: true });
    };
    window.addEventListener(START_TOUR_EVENT, handleStart);
    return () => window.removeEventListener(START_TOUR_EVENT, handleStart);
  }, [runTour]);

  useEffect(() => stopTour, [stopTour]);

  return null;
}
