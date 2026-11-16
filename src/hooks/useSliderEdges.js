import { useEffect } from "react";

const ROW_SELECTOR = ".home-spotlight-row, .home-catalog-preview-row";

/**
 * Marks every horizontal product row inside `rootSelector` with whether it can scroll back
 * or forward, as data attributes on its slider wrapper:
 *   data-can-prev / data-can-next = "true" | "false"
 * CSS uses them to hide an arrow at the start or end of a row and to fade only the edge that
 * has more cards behind it. Covers rows that render later (lazy sections) too.
 */
export function useSliderEdges(rootSelector = ".home-page") {
  useEffect(() => {
    const root = document.querySelector(rootSelector);
    if (!root) return undefined;

    let frame = 0;
    const update = () => {
      frame = 0;
      root.querySelectorAll(ROW_SELECTOR).forEach((row) => {
        const holder = row.closest(".home-slider-wrapper") || row.parentElement;
        if (!holder) return;
        const maxScroll = row.scrollWidth - row.clientWidth;
        const canPrev = row.scrollLeft > 4;
        const canNext = maxScroll - row.scrollLeft > 4;
        if (holder.dataset.canPrev !== String(canPrev)) holder.dataset.canPrev = String(canPrev);
        if (holder.dataset.canNext !== String(canNext)) holder.dataset.canNext = String(canNext);
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    // Scroll doesn't bubble, so listen in the capture phase for any row's scroll
    root.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    // New rows (lazy sections, loaded products) change what can scroll
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true });
    schedule();

    return () => {
      root.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [rootSelector]);
}
