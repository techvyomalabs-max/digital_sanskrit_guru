import "./FestiveBanner.css";
import { PartyPopper, X } from "lucide-react";

export default function FestiveBanner({ text, bgFrom, bgTo, textColor, linkUrl, linkText, onDismiss }) {
  const style = {
    "--banner-from":  bgFrom  || "#FF6B00",
    "--banner-to":    bgTo    || "#FFD700",
    "--banner-color": textColor || "#ffffff"
  };

  return (
    <div className="festive-banner" style={style} role="banner" aria-label="Festive announcement">
      <span className="festive-banner-text">
        {text || (
          <>
            <PartyPopper size={16} className="ui-inline-icon" aria-hidden="true" />
            Festive Sale is Live!
          </>
        )}
        {linkUrl && (
          <a
            className="festive-banner-link"
            href={linkUrl}
            target={linkUrl.startsWith("http") ? "_blank" : "_self"}
            rel="noopener noreferrer"
          >
            {linkText || "Shop Now"} →
          </a>
        )}
      </span>
      <button
        className="festive-banner-close"
        onClick={onDismiss}
        aria-label="Dismiss festive banner"
        title="Dismiss"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
