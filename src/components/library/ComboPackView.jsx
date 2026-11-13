import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Hourglass, Package, ExternalLink, Smartphone, BookOpen, Search, Mail } from "lucide-react";
import { formatDate } from "../../utils/date";
import { isExternalDelivery } from "../../utils/digitalDelivery";
import { isKindleProduct } from "../../utils/kindle";
import "./ComboLibraryCard.css";

const SEARCH_FROM = 8; // show the item search for packs bigger than this

function ItemAction({ comp, isPending, onOpenReader }) {
  if (isPending) {
    return <span className="combo-pack-item-status"><Hourglass size={13} aria-hidden="true" />Being set up</span>;
  }
  if (isExternalDelivery(comp)) {
    return comp.externalAccessLink ? (
      <a href={comp.externalAccessLink} target="_blank" rel="noopener noreferrer" className="my-library-btn-primary combo-action-btn">
        {comp.externalAccessLabel?.replace(/↗/g, "").trim() || "View"}
        <ExternalLink size={14} className="ui-inline-icon-end" aria-hidden="true" />
      </a>
    ) : (
      <span className="combo-muted-text">Access link not available yet</span>
    );
  }
  if (isKindleProduct(comp)) {
    return (
      <a
        href={comp.kindleLink || "https://www.amazon.in/s?k=kindle+digital+sanskrit+guru"}
        target="_blank"
        rel="noopener noreferrer"
        className="my-library-btn-kindle combo-action-btn"
      >
        <Smartphone size={14} className="ui-inline-icon" aria-hidden="true" />View on Amazon
        <ExternalLink size={14} className="ui-inline-icon-end" aria-hidden="true" />
      </a>
    );
  }
  return (
    <button type="button" className="my-library-btn-primary combo-action-btn" onClick={() => onOpenReader(comp)}>
      <BookOpen size={14} className="ui-inline-icon" aria-hidden="true" />Read
    </button>
  );
}

export default function ComboPackView({ combo, isLoading, onOpenReader }) {
  const [query, setQuery] = useState("");
  const components = useMemo(() => (Array.isArray(combo?.components) ? combo.components : []), [combo]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? components.filter((c) => String(c.name || "").toLowerCase().includes(q)) : components;
  }, [components, query]);

  const backLink = (
    <Link to="/my-library" className="combo-pack-back">
      <ArrowLeft size={16} aria-hidden="true" />Back to Digital Library
    </Link>
  );

  if (isLoading) {
    return (
      <div className="combo-pack-page">
        {backLink}
        <div className="my-library-loading">
          <div className="my-library-spinner" />
          <p>Loading your pack...</p>
        </div>
      </div>
    );
  }

  if (!combo) {
    return (
      <div className="combo-pack-page">
        {backLink}
        <div className="my-library-empty-card">
          <h2>Pack not found</h2>
          <p>We couldn&apos;t find this pack in your library. It may have been refunded or belongs to another account.</p>
        </div>
      </div>
    );
  }

  const isPending = Boolean(combo.accessPending);
  const itemCount = components.length;
  const countText = `${itemCount} ${itemCount === 1 ? "item" : "items"}`;

  return (
    <div className="combo-pack-page">
      {backLink}

      <section className="combo-pack-hero">
        <img
          src={combo.image || "https://placehold.co/300x400?text=Combo"}
          alt={combo.name}
          className="combo-pack-hero-cover"
          onError={(e) => {
            e.currentTarget.src = "https://placehold.co/300x400?text=Sanskrit+Combo";
          }}
        />
        <div className="combo-pack-hero-body">
          <span className={`combo-pack-kicker ${isPending ? "is-pending" : ""}`}>
            {isPending ? <Hourglass size={13} aria-hidden="true" /> : <Package size={13} aria-hidden="true" />}
            {isPending ? "Access being set up" : `Combo · ${countText}`}
          </span>
          <h1 className="combo-pack-title">{combo.name}</h1>
          <p className="combo-pack-meta">
            Purchased {formatDate(combo.orderDate)}
            {combo.copies > 1 ? ` · ${combo.copies} copies` : ""}
          </p>

          {isPending ? (
            <p className="combo-pack-pending">
              <Mail size={15} aria-hidden="true" />
              Our team is setting up your access. We&apos;ll email you when it&apos;s ready — the Read buttons will appear here.
            </p>
          ) : null}

          {!isPending && combo.externalAccessLink ? (
            <a href={combo.externalAccessLink} target="_blank" rel="noopener noreferrer" className="my-library-btn-primary combo-pack-main-btn">
              {combo.externalAccessLabel?.replace(/↗/g, "").trim() || "View"}
              <ExternalLink size={14} className="ui-inline-icon-end" aria-hidden="true" />
            </a>
          ) : null}

          {!isPending && combo.accessNote ? (
            <div className="my-library-access-note-box combo-note-box">
              <strong className="my-library-access-note-title">Note</strong>
              <div className="my-library-access-note-content" style={{ whiteSpace: "pre-wrap" }}>{combo.accessNote}</div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="combo-pack-items">
        <div className="combo-pack-items-head">
          <h2>What&apos;s in this pack</h2>
          {itemCount > SEARCH_FROM ? (
            <label className="combo-pack-search">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                placeholder={`Search ${countText}`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search items in this pack"
              />
            </label>
          ) : null}
        </div>

        {shown.length === 0 ? (
          <p className="combo-muted-text">No items match &quot;{query}&quot;.</p>
        ) : (
          <ul className="combo-pack-list">
            {shown.map((comp, idx) => (
              <li key={comp.bundleItemId || comp._id || idx} className="combo-pack-item">
                <img
                  src={comp.image || "https://placehold.co/80x100?text=Item"}
                  alt=""
                  className="combo-pack-item-thumb"
                  onError={(e) => {
                    e.currentTarget.src = "https://placehold.co/80x100?text=Item";
                  }}
                />
                <span className="combo-pack-item-name">{comp.name}</span>
                <div className="combo-pack-item-action">
                  <ItemAction comp={comp} isPending={isPending} onOpenReader={onOpenReader} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
