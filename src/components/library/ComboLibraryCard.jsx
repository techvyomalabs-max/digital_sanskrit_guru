import { Link } from "react-router-dom";
import { formatDate } from "../../utils/date";
import { Hourglass, Package, ChevronRight } from "lucide-react";
import { comboPackPath } from "./comboPack";
import "./ComboLibraryCard.css";

const PREVIEW_COUNT = 4;

// Compact card: cover, name, a strip of item thumbnails and one button.
// The full item list (with Read buttons) lives on the pack page.
export default function ComboLibraryCard({ combo }) {
  if (!combo) return null;

  const components = Array.isArray(combo.components) ? combo.components : [];
  const itemCount = components.length;
  const isPending = Boolean(combo.accessPending);
  const preview = components.slice(0, PREVIEW_COUNT);
  const extra = itemCount - preview.length;
  const packPath = comboPackPath(combo);
  const countText = `${itemCount} ${itemCount === 1 ? "item" : "items"}`;

  return (
    <div className="my-library-card my-library-combo-card">
      <Link to={packPath} className="my-library-card-cover-container combo-card-cover-link" tabIndex={-1} aria-hidden="true">
        <img
          src={combo.image || "https://placehold.co/300x400?text=Combo"}
          alt=""
          className="my-library-card-cover"
          onError={(e) => {
            e.currentTarget.src = "https://placehold.co/300x400?text=Sanskrit+Combo";
          }}
        />
        <span className={`my-library-format-badge ${isPending ? "pending" : ""}`}>
          {isPending ? (
            <><Hourglass size={13} className="ui-inline-icon" aria-hidden="true" />Access being set up</>
          ) : (
            <><Package size={13} className="ui-inline-icon" aria-hidden="true" />Combo · {countText}</>
          )}
        </span>
      </Link>

      <div className="my-library-card-body combo-card-body">
        <h3 className="my-library-card-title combo-card-title">
          <Link to={packPath} className="combo-card-title-link">{combo.name}</Link>
        </h3>

        <div className="my-library-card-meta combo-meta">
          <span>Purchased: {formatDate(combo.orderDate)}</span>
          {combo.copies > 1 && <span className="my-library-copies-badge">{combo.copies} Copies</span>}
        </div>

        {itemCount > 0 && (
          <div className="combo-card-stack" aria-label={`Includes ${countText}`}>
            {preview.map((comp, idx) => (
              <img
                key={comp.bundleItemId || comp._id || idx}
                src={comp.image || "https://placehold.co/80x100?text=Item"}
                alt=""
                title={comp.name}
                className="combo-card-stack-thumb"
                style={{ zIndex: PREVIEW_COUNT - idx }}
                onError={(e) => {
                  e.currentTarget.src = "https://placehold.co/80x100?text=Item";
                }}
              />
            ))}
            {extra > 0 && <span className="combo-card-stack-more">+{extra}</span>}
            <span className="combo-card-stack-text">
              {isPending ? "Setting up your access" : `${countText} ready to read`}
            </span>
          </div>
        )}

        <Link to={packPath} className={`combo-card-open-btn ${isPending ? "is-pending" : ""}`}>
          {isPending ? "View pack items" : "Open pack"}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
