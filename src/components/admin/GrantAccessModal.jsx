import { useState, useEffect, useRef, useMemo } from "react";
import { KeyRound, X, AlertTriangle, RefreshCw, Copy } from "lucide-react";
import axios from "axios";
import { useToast } from "../../hooks/useToast";
import { pendingAccessItems } from "../../utils/accessStatus";
import "./AdminActionModal.css";

const DEFAULT_LOGIN_URL = "https://www.sanskritfromhome.org/";
const PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/** 10 random characters, no look-alikes (0/O, 1/l/I) */
function generatePassword() {
  const bytes = new Uint32Array(10);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => PASSWORD_CHARS[n % PASSWORD_CHARS.length]).join("");
}

/** The gift recipient's email when every pending line is for the same recipient, else the buyer's. */
function defaultLoginEmail(order, pendingList) {
  const recipients = [...new Set(pendingList.map(({ item }) => item?.giftRecipient?.email).filter(Boolean))];
  if (recipients.length === 1 && pendingList.every(({ item }) => item?.giftRecipient?.email)) return recipients[0];
  return String(order?.user?.email || order?.billing?.email || order?.shipping?.email || "");
}

/** The other website's address from the pending item's link, else Sanskrit From Home. */
function defaultLoginUrl(pendingList) {
  for (const { item } of pendingList) {
    const links = [item?.externalAccessLink, ...(item?.bundleItems || []).map((bi) => bi?.externalAccessLink)];
    for (const link of links) {
      try {
        if (link) return new URL(link).origin + "/";
      } catch {
        // not a full address, try the next one
      }
    }
  }
  return DEFAULT_LOGIN_URL;
}

function siteName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "our learning portal";
  }
}

/** The note text for a template (no password: that goes in the email only). */
function buildTemplateNote(template, { loginEmail, loginUrl }) {
  const site = siteName(loginUrl || DEFAULT_LOGIN_URL);
  const email = loginEmail || "your email address";
  if (template === "new") {
    return (
      `We have created your account on ${site}.\n` +
      `Log in at ${loginUrl || DEFAULT_LOGIN_URL} with ${email}. ` +
      `Your password was sent in the "access is ready" email. Please change it after you first log in.`
    );
  }
  if (template === "existing") {
    return (
      `Your access has been added to your existing account on ${site}.\n` +
      `Log in at ${loginUrl || DEFAULT_LOGIN_URL} with ${email}. ` +
      `Forgot your password? Use "Forgot password" on the login page.`
    );
  }
  return "";
}

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

  // Message templates: a new account the admin created on the other website, an account the
  // customer already has, or a free note
  const [template, setTemplate] = useState("new");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginUrl, setLoginUrl] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [noteEdited, setNoteEdited] = useState(false);

  const hasMultiplePending = pendingList.length > 1;

  // Initialize selected indexes and reset state when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setNote("");
    setNoteEdited(false);
    setTemplate("new");
    setTempPassword("");
    setLoginEmail(defaultLoginEmail(order, pendingList));
    setLoginUrl(defaultLoginUrl(pendingList));
    setSubmitError("");
    setIsSubmitting(false);
    setSelectedIndexes(pendingList.map((p) => p.index));
  }, [isOpen, pendingList, order]);

  // The note follows the template until the admin edits it by hand
  useEffect(() => {
    if (!isOpen || noteEdited) return;
    setNote(buildTemplateNote(template, { loginEmail, loginUrl }));
  }, [isOpen, noteEdited, template, loginEmail, loginUrl]);

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

    if (template !== "custom" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail.trim())) {
      setSubmitError("Enter the email the customer logs in with.");
      setIsSubmitting(false);
      return;
    }
    if (template === "new" && !tempPassword.trim()) {
      setSubmitError("Enter the password you set for the new account (or press Generate).");
      setIsSubmitting(false);
      return;
    }

    const payload = {};
    if (note.trim()) {
      payload.note = note.trim();
    }
    if (template !== "custom") {
      // Emailed once, never saved
      payload.credentials = {
        loginEmail: loginEmail.trim(),
        loginUrl: loginUrl.trim(),
        tempPassword: template === "new" ? tempPassword.trim() : ""
      };
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
                          {item.giftRecipient ? ` — gift for ${item.giftRecipient.name}` : ""}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {pendingList.some(({ item }) => item.giftRecipient) && (
              <div className="admin-grant-gift-hint">
                <strong>Gift:</strong> set up access for{" "}
                {[...new Map(pendingList.filter(({ item }) => item.giftRecipient).map(({ item }) => [item.giftRecipient.email || item.giftRecipient.name, item.giftRecipient])).values()]
                  .map((r) => `${r.name}${r.email ? ` (${r.email})` : ""}`)
                  .join(", ")}
                . The &quot;access is ready&quot; email goes to them, not the buyer.
              </div>
            )}

            <div className="admin-action-modal-field">
              <label>Message</label>
              <div className="grant-template-tabs" role="radiogroup" aria-label="Message template">
                {[
                  ["new", "New account"],
                  ["existing", "Existing account"],
                  ["custom", "Custom note"]
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={template === value}
                    className={template === value ? "is-active" : ""}
                    onClick={() => {
                      setTemplate(value);
                      setNoteEdited(false);
                      if (value === "custom") setNote("");
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="grant-template-help">
                {template === "new"
                  ? "You created an account for them on the other website. Their login details are emailed once and never saved."
                  : template === "existing"
                    ? "They already have an account there: the email just tells them to log in."
                    : "Write your own note."}
              </p>
            </div>

            {template !== "custom" && (
              <div className="grant-login-fields">
                <div className="admin-action-modal-field">
                  <label htmlFor="grant-login-email">Login email</label>
                  <input
                    id="grant-login-email"
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    autoComplete="off"
                    required
                  />
                </div>
                {template === "new" && (
                  <div className="admin-action-modal-field">
                    <label htmlFor="grant-temp-password">Password you set</label>
                    <div className="grant-password-row">
                      <input
                        id="grant-temp-password"
                        type="text"
                        value={tempPassword}
                        onChange={(e) => setTempPassword(e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={100}
                        required
                      />
                      <button type="button" onClick={() => setTempPassword(generatePassword())} title="Make a strong password">
                        <RefreshCw size={14} aria-hidden="true" /> Generate
                      </button>
                      <button
                        type="button"
                        disabled={!tempPassword}
                        onClick={() => {
                          navigator.clipboard?.writeText(tempPassword);
                          showToast("Password copied", "success");
                        }}
                        title="Copy, to paste on the other website"
                      >
                        <Copy size={14} aria-hidden="true" /> Copy
                      </button>
                    </div>
                  </div>
                )}
                <div className="admin-action-modal-field">
                  <label htmlFor="grant-login-url">Login page</label>
                  <input
                    id="grant-login-url"
                    type="url"
                    value={loginUrl}
                    onChange={(e) => setLoginUrl(e.target.value)}
                    placeholder="https://"
                  />
                </div>
              </div>
            )}

            {/* Optional note for customer */}
            <div className="admin-action-modal-field">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label htmlFor="grant-access-note">
                  {template === "custom" ? "Note for the customer (optional)" : "Note (filled in for you, you can edit it)"}
                </label>
                <span style={{ fontSize: "11.5px", color: "var(--admin-muted, #64748b)" }}>
                  {note.length}/500
                </span>
              </div>
              <textarea
                id="grant-access-note"
                ref={initialFocusRef}
                rows={5}
                maxLength={500}
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  setNoteEdited(true);
                }}
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
                Shown to the customer in their email and in My Library. Never put a password here: use the
                password box above, which goes in the email only.
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
