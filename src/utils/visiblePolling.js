// Refreshes data on a timer only while the page is visible.
// A tab left in the background sends nothing; when it becomes visible again and
// the last refresh is older than the interval, it refreshes straight away.
// Returns a cleanup function for useEffect.
export function startVisiblePolling(refresh, intervalMs = 60000) {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  let lastRun = Date.now();
  const isVisible = () => document.visibilityState !== "hidden";

  const tick = () => {
    if (!isVisible()) return;
    lastRun = Date.now();
    refresh();
  };

  const onVisibilityChange = () => {
    if (isVisible() && Date.now() - lastRun >= intervalMs) tick();
  };

  const intervalId = window.setInterval(tick, intervalMs);
  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    window.clearInterval(intervalId);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
