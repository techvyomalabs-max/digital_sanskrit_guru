import { useState, useEffect, useRef, useMemo } from "react";
import { KeyRound, X, AlertTriangle } from "lucide-react";
import axios from "axios";
import { useToast } from "../../hooks/useToast";
import { pendingAccessItems } from "../../utils/accessStatus";
import "./AdminActionModal.css";

export default function GrantAccessModal({
  order,
  isOpen,
  onClose,
  token,
  onSuccess,
  onReload
}) {
  const { showToast } = useToast();
  const [note, setNote] = useState("");
  const [selectedIndexes, setSelectedIndexes] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const initialFocusRef = useRef(null);

  const pendingList = useMemo(() => {
    return pendingAccessItems(order);
  }, [order]);

  const hasMultiplePending = pendingList.length > 1;

  // Initialize selected indexes and reset state when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setNote("");
    setSubmitError("");
    setIsSubmitting(false);
    setSelectedIndexes(pendingList.map((p) => p.index));
  }, [isOpen, pendingList]);

  // Focus on open
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      if (initialFocusRef.current) {
        initialFocusRef.current.focus();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Close on Escape & trap background scroll
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !order) return null;

  const handleToggleItem = (index) => {
    setSelectedIndexes((prev) => {
      if (prev.includes(index)) {
        return prev.filter((i) => i !== index);
      }
      return [...prev, index];
    });
    setSubmitError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (hasMultiplePending && selectedIndexes.length === 0) {
      setSubmitError("Please select at least one item to grant access.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    const payload = {};
    if (note.trim()) {
      payload.note = note.trim();
    }

    // Send itemIndexes only when the admin unticked something; otherwise omit
    const allTicked = pendingList.length > 0 && pendingList.every((p) => selectedIndexes.includes(p.index));
    if (!allTicked) {
      payload.itemIndexes = selectedIndexes;
    }

    try {
      const res = await axios.put(
        `/api/orders/${order._id}/grant-access`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const updatedOrder = res.data?.order || res.data;
      if (onSuccess) {
        onSuccess(updatedOrder);
      }
      onClose();
      showToast("Access granted. The customer has been emailed.", "success");
    } catch (err) {
      const status = err?.response?.status;
      const message = err?.response?.data?.message || "Failed to grant access.";

      if (status === 409) {
        showToast("Access was already granted.", "error");
        if (onReload) {
          onReload();
        }
        onClose();
      } else {
        // 400 or other errors: show message inside the modal
        setSubmitError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isButtonDisabled = isSubmitting || (hasMultiplePending && selectedIndexes.length === 0);

  return (
    <div className="admin-action-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="admin-action-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="grant-access-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "520px" }}
      >
        <div className="admin-action-modal-header">
          <h3 id="grant-access-title">
            <KeyRound size={18} className="ui-inline-icon" aria-hidden="true" />Grant Access
          </h3>
          <button
            type="button"
            className="admin-action-modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column" }}>
          <div className="admin-action-modal-body">
            {submitError && (
              <div className="admin-action-modal-error">
                <AlertTriangle size={15} className="ui-inline-icon" aria-hidden="true" />{submitError}
              </div>
            )}

            {/* Checkboxes if multiple pending items */}
            {hasMultiplePending && (
              <div className="admin-action-modal-field">
                <label style={{ marginBottom: "4px" }}>Select Items to Grant Access</label>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    border: "1px solid var(--admin-border, #e2e8f0)",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    background: "var(--admin-surface-2, #f8fafc)"
                  }}
                >
                  {pendingList.map(({ index, item }) => {
                    const isChecked = selectedIndexes.includes(index);
                    return (
                      <label
                        key={index}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          cursor: "pointer",
                          fontSize: "13px",
                          fontWeight: 500,
                          textTransform: "none"
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleItem(index)}
                          style={{ width: "auto" }}
                        />
                        <span>
                          {item.name || "Item"}
                          {Number(item.quantity) > 1 ? ` (×${item.quantity})` : ""}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Optional note for customer */}
            <div className="admin-action-modal-field">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label htmlFor="grant-access-note">Note for the customer (optional)</label>
                <span style={{ fontSize: "11.5px", color: "var(--admin-muted, #64748b)" }}>
                  {note.length}/500
                </span>
              </div>
              <textarea
                id="grant-access-note"
                ref={initialFocusRef}
                rows={4}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. You have been added to our learning portal with your email address..."
                style={{ resize: "vertical" }}
              />
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: "12px",
                  color: "var(--admin-muted, #64748b)",
                  lineHeight: "1.4"
                }}
              >
                Shown to the customer in their email and in My Library, e.g. login instructions. Do not paste passwords.
              </p>
            </div>
          </div>

          <div className="admin-action-modal-footer" style={{ padding: "16px 20px", display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid var(--admin-border, #e2e8f0)" }}>
            <button
              type="button"
              className="admin-action-modal-btn secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="admin-action-modal-btn primary"
              disabled={isButtonDisabled}
            >
              {isSubmitting ? "Granting..." : "Grant access"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
