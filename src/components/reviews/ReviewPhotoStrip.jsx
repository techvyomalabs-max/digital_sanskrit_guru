import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import "./ReviewPhotos.css";

/** A review's photos as small tiles; tapping one opens a full-screen viewer. */
export default function ReviewPhotoStrip({ photos, reviewerName = "Customer" }) {
  const list = Array.isArray(photos) ? photos.filter(Boolean) : [];
  const [openIndex, setOpenIndex] = useState(-1);
  const isOpen = openIndex >= 0;

  const close = useCallback(() => setOpenIndex(-1), []);
  const step = useCallback(
    (delta) => setOpenIndex((i) => (i < 0 ? i : (i + delta + list.length) % list.length)),
    [list.length]
  );

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, close, step]);

  if (list.length === 0) return null;

  return (
    <>
      <div className="review-photo-strip">
        {list.map((url, i) => (
          <button
            key={url}
            type="button"
            className="review-photo-tile"
            onClick={() => setOpenIndex(i)}
            aria-label={`Open photo ${i + 1} of ${list.length} from ${reviewerName}`}
          >
            <img src={url} alt="" loading="lazy" />
          </button>
        ))}
      </div>

      {isOpen && createPortal(
        <div className="review-photo-viewer" role="dialog" aria-modal="true" aria-label={`Photos from ${reviewerName}`} onClick={close}>
          <button type="button" className="review-photo-viewer-close" onClick={close} aria-label="Close photos">
            <X size={22} aria-hidden="true" />
          </button>
          {list.length > 1 && (
            <button
              type="button"
              className="review-photo-viewer-nav is-prev"
              onClick={(e) => {
                e.stopPropagation();
                step(-1);
              }}
              aria-label="Previous photo"
            >
              <ChevronLeft size={26} aria-hidden="true" />
            </button>
          )}
          <figure className="review-photo-viewer-figure" onClick={(e) => e.stopPropagation()}>
            <img src={list[openIndex]} alt={`Photo ${openIndex + 1} from ${reviewerName}`} />
            <figcaption>
              {reviewerName} · {openIndex + 1} / {list.length}
            </figcaption>
          </figure>
          {list.length > 1 && (
            <button
              type="button"
              className="review-photo-viewer-nav is-next"
              onClick={(e) => {
                e.stopPropagation();
                step(1);
              }}
              aria-label="Next photo"
            >
              <ChevronRight size={26} aria-hidden="true" />
            </button>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
