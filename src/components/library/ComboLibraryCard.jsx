import { formatDate } from "../../utils/date";
import { Hourglass, Package, ExternalLink, Smartphone } from "lucide-react";
import { isExternalDelivery } from "../../utils/digitalDelivery";
import { isKindleProduct } from "../../utils/kindle";
import "./ComboLibraryCard.css";

export default function ComboLibraryCard({ combo, onOpenReader }) {
  if (!combo) return null;

  const components = Array.isArray(combo.components) ? combo.components : [];
  const itemCount = components.length;
  const isPending = Boolean(combo.accessPending);

  return (
    <div className="my-library-card my-library-combo-card">
      <div className="my-library-card-cover-container">
        <img
          src={combo.image || "https://placehold.co/300x400?text=Combo"}
          alt={combo.name}
          className="my-library-card-cover"
          onError={(e) => {
            e.currentTarget.src = "https://placehold.co/300x400?text=Sanskrit+Combo";
          }}
        />
        <span className={`my-library-format-badge ${isPending ? "pending" : ""}`}>
          {isPending ? (
            <><Hourglass size={13} className="ui-inline-icon" aria-hidden="true" />Access being set up</>
          ) : (
            <><Package size={13} className="ui-inline-icon" aria-hidden="true" />{`Combo · ${itemCount} ${itemCount === 1 ? "item" : "items"}`}</>
          )}
        </span>
      </div>

      <div className="my-library-card-body combo-card-body">
        <div className="combo-card-header">
          <h3 className="my-library-card-title combo-card-title">{combo.name}</h3>
          <span className="combo-count-tag">Combo · {itemCount} {itemCount === 1 ? "item" : "items"}</span>
        </div>

        <div className="my-library-card-meta combo-meta">
          <span>Purchased: {formatDate(combo.orderDate)}</span>
          {combo.copies > 1 && <span className="my-library-copies-badge">{combo.copies} Copies</span>}
        </div>

        {isPending ? (
          <div className="combo-pending-section">
            <p className="my-library-pending-note combo-pending-text">
              Our team is setting up your access. We&apos;ll email you when it&apos;s ready.
            </p>
            <div className="combo-pending-components">
              <span className="combo-components-heading">Included items:</span>
              <ul className="combo-pending-list">
                {components.map((comp, idx) => (
                  <li key={comp.bundleItemId || comp._id || idx} className="combo-pending-item">
                    <span className="combo-bullet">•</span>
                    <span className="combo-pending-name">{comp.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="combo-active-section">
            {Boolean(combo.externalAccessLink) && (
              <div className="combo-main-link-wrap">
                <a
                  href={combo.externalAccessLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="my-library-btn-primary combo-main-btn"
                >
                  {combo.externalAccessLabel?.replace(/↗/g, "").trim() || "View"}
                  <ExternalLink size={14} className="ui-inline-icon-end" aria-hidden="true" />
                </a>
              </div>
            )}

            <div className="combo-components-container">
              <span className="combo-components-heading">Pack items:</span>
              <div className="combo-component-rows">
                {components.map((comp, idx) => {
                  const isExternal = isExternalDelivery(comp);
                  const isKindle = isKindleProduct(comp);

                  return (
                    <div key={comp.bundleItemId || comp._id || idx} className="combo-component-row">
                      <div className="combo-component-meta">
                        <img
                          src={comp.image || "https://placehold.co/80x100?text=Item"}
                          alt={comp.name}
                          className="combo-component-thumb"
                          onError={(e) => {
                            e.currentTarget.src = "https://placehold.co/80x100?text=Item";
                          }}
                        />
                        <span className="combo-component-name" title={comp.name}>
                          {comp.name}
                        </span>
                      </div>

                      <div className="combo-component-action">
                        {isExternal ? (
                          comp.externalAccessLink ? (
                            <a
                              href={comp.externalAccessLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="my-library-btn-primary combo-action-btn"
                            >
                              {comp.externalAccessLabel?.replace(/↗/g, "").trim() || "View"}
                              <ExternalLink size={14} className="ui-inline-icon-end" aria-hidden="true" />
                            </a>
                          ) : (
                            <span className="combo-muted-text">
                              Access link not available yet
                            </span>
                          )
                        ) : isKindle ? (
                          <a
                            href={comp.kindleLink || "https://www.amazon.in/s?k=kindle+digital+sanskrit+guru"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="my-library-btn-kindle combo-action-btn"
                          >
                            <Smartphone size={14} className="ui-inline-icon" aria-hidden="true" />View on Amazon
                            <ExternalLink size={14} className="ui-inline-icon-end" aria-hidden="true" />
                          </a>
                        ) : (
                          <button
                            type="button"
                            className="my-library-btn-primary combo-action-btn"
                            onClick={() => onOpenReader(comp)}
                          >
                            Read
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {Boolean(combo.accessNote) && (
              <div className="my-library-access-note-box combo-note-box">
                <strong className="my-library-access-note-title">Note</strong>
                <div className="my-library-access-note-content" style={{ whiteSpace: "pre-wrap" }}>
                  {combo.accessNote}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
