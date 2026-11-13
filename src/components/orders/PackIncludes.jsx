import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import "./PackIncludes.css";

const COLLAPSE_FROM = 6; // packs with more items than this start collapsed
const PREVIEW = 4;

// "Pack Includes" list for a combo in My Orders: big packs show the first few items
// and a button to show the rest, so the order card stays short.
export default function PackIncludes({ items, multiplier = 1 }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const list = Array.isArray(items) ? items : [];
  const canCollapse = list.length > COLLAPSE_FROM;
  const shown = canCollapse && !open ? list.slice(0, PREVIEW) : list;
  const hidden = list.length - PREVIEW;

  return (
    <div className="my-order-item-bundle-details pack-includes">
      <p className="pack-includes-title">
        Pack Includes <span className="pack-includes-count">{list.length} items</span>
      </p>
      <ul id={listId} className={`pack-includes-list ${canCollapse && !open ? "is-collapsed" : ""}`}>
        {shown.map((bi, idx) => (
          <li key={bi.bundleItemId || bi._id || idx}>
            <span className="pack-includes-bullet" aria-hidden="true">•</span>
            <span className="pack-includes-name">{bi.name}</span>
            <span className="pack-includes-qty">(Qty: {Number(bi.quantity || 1) * (Number(multiplier) || 1)})</span>
          </li>
        ))}
      </ul>
      {canCollapse && (
        <button
          type="button"
          className={`pack-includes-toggle ${open ? "is-open" : ""}`}
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Show less" : `Show all ${list.length} items (+${hidden} more)`}
          <ChevronDown size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
