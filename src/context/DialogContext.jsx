/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, HelpCircle, Info, Edit3 } from "lucide-react";
import "../components/common/Dialog.css";

export const DialogContext = createContext({
  confirm: async () => false,
  alert: async () => {},
  prompt: async () => null
});

function DialogModal({ dialog, onClose }) {
  const {
    type,
    title,
    message,
    confirmText,
    cancelText = "Cancel",
    okText = "OK",
    tone = "default",
    label,
    placeholder,
    defaultValue = "",
    required = false,
    minLength = 0,
    maxLength,
    multiline = false
  } = dialog;

  const [promptValue, setPromptValue] = useState(defaultValue);
  const [touched, setTouched] = useState(false);
  const inputRef = useRef(null);
  const confirmBtnRef = useRef(null);
  const prevActiveElementRef = useRef(null);

  // Determine prompt validation state
  const trimmed = String(promptValue || "").trim();
  let validationError = "";
  if (required && trimmed.length === 0) {
    validationError = "This field is required.";
  } else if (minLength > 0 && trimmed.length < minLength) {
    validationError = `At least ${minLength} characters required (${trimmed.length}/${minLength}).`;
  } else if (maxLength > 0 && trimmed.length > maxLength) {
    validationError = `Maximum ${maxLength} characters allowed (${trimmed.length}/${maxLength}).`;
  }
  const isPromptValid = !validationError;

  // Manage focus
  useEffect(() => {
    prevActiveElementRef.current = document.activeElement;
    if (type === "prompt" && inputRef.current) {
      inputRef.current.focus();
      if (typeof inputRef.current.select === "function") {
        inputRef.current.select();
      }
    } else if (confirmBtnRef.current) {
      confirmBtnRef.current.focus();
    }

    return () => {
      if (prevActiveElementRef.current?.focus) {
        try {
          prevActiveElementRef.current.focus();
        } catch {
          // ignore
        }
      }
    };
  }, [type]);

  const handleConfirm = useCallback(() => {
    if (type === "prompt") {
      if (!isPromptValid) {
        setTouched(true);
        return;
      }
      onClose(trimmed);
    } else if (type === "confirm") {
      onClose(true);
    } else {
      onClose();
    }
  }, [type, isPromptValid, onClose, trimmed]);

  const handleCancel = useCallback(() => {
    if (type === "confirm") {
      onClose(false);
    } else if (type === "prompt") {
      onClose(null);
    } else {
      onClose();
    }
  }, [type, onClose]);

  // Keyboard events: Escape to cancel, Enter to confirm
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      } else if (e.key === "Enter") {
        if (e.target.tagName === "BUTTON") {
          return;
        }
        if (e.target.tagName === "TEXTAREA") {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleConfirm();
          }
          return;
        }
        e.preventDefault();
        handleConfirm();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleCancel, handleConfirm]);

  const isDanger = tone === "danger";

  return createPortal(
    <div
      className="site-dialog-backdrop"
      onClick={type === "prompt" ? undefined : handleCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="site-dialog-title"
    >
      <div className="site-dialog-card" onClick={(e) => e.stopPropagation()}>
        <div className={`site-dialog-icon-wrap ${isDanger ? "danger" : "default"}`}>
          {isDanger ? (
            <AlertTriangle size={26} />
          ) : type === "prompt" ? (
            <Edit3 size={24} />
          ) : type === "alert" ? (
            <Info size={26} />
          ) : (
            <HelpCircle size={26} />
          )}
        </div>

        {title && (
          <h3 id="site-dialog-title" className="site-dialog-title">
            {title}
          </h3>
        )}

        {message && <p className="site-dialog-message">{message}</p>}

        {type === "prompt" && (
          <div className="site-dialog-prompt-field">
            {label && <label className="site-dialog-prompt-label">{label}</label>}
            {multiline ? (
              <textarea
                ref={inputRef}
                className="site-dialog-textarea"
                value={promptValue}
                placeholder={placeholder}
                onChange={(e) => {
                  setPromptValue(e.target.value);
                  setTouched(true);
                }}
              />
            ) : (
              <input
                ref={inputRef}
                type="text"
                className="site-dialog-input"
                value={promptValue}
                placeholder={placeholder}
                onChange={(e) => {
                  setPromptValue(e.target.value);
                  setTouched(true);
                }}
              />
            )}
            {validationError && (touched || Boolean(defaultValue)) && (
              <div className="site-dialog-error">{validationError}</div>
            )}
          </div>
        )}

        <div className="site-dialog-actions">
          {type !== "alert" && (
            <button
              type="button"
              className="site-dialog-btn-cancel"
              onClick={handleCancel}
            >
              {cancelText}
            </button>
          )}
          <button
            ref={confirmBtnRef}
            type="button"
            className={`site-dialog-btn-confirm ${isDanger ? "danger" : "default"}`}
            disabled={type === "prompt" && !isPromptValid}
            onClick={handleConfirm}
          >
            {type === "alert" ? okText : (confirmText || (type === "prompt" ? "Submit" : "Confirm"))}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function DialogProvider({ children }) {
  const [queue, setQueue] = useState([]);
  const currentDialog = queue[0] || null;

  // Lock background scroll when a dialog is active
  useEffect(() => {
    if (!currentDialog || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [currentDialog]);

  const enqueue = useCallback((dialog) => {
    return new Promise((resolve) => {
      setQueue((prev) => [...prev, { ...dialog, resolve }]);
    });
  }, []);

  const confirm = useCallback(
    (options = {}) => {
      const opts = typeof options === "string" ? { message: options } : options;
      return enqueue({
        type: "confirm",
        title: opts.title || "Please Confirm",
        message: opts.message || "",
        confirmText: opts.confirmText || "Confirm",
        cancelText: opts.cancelText || "Cancel",
        tone: opts.tone || "default"
      });
    },
    [enqueue]
  );

  const alert = useCallback(
    (options = {}) => {
      const opts = typeof options === "string" ? { message: options } : options;
      return enqueue({
        type: "alert",
        title: opts.title || "Notice",
        message: opts.message || "",
        okText: opts.okText || "OK",
        tone: opts.tone || "default"
      });
    },
    [enqueue]
  );

  const prompt = useCallback(
    (options = {}) => {
      const opts = typeof options === "string" ? { message: options } : options;
      return enqueue({
        type: "prompt",
        title: opts.title || "Input Required",
        message: opts.message || "",
        label: opts.label || "",
        placeholder: opts.placeholder || "",
        defaultValue: opts.defaultValue ?? "",
        required: Boolean(opts.required),
        minLength: Number(opts.minLength || 0),
        maxLength: opts.maxLength ? Number(opts.maxLength) : undefined,
        multiline: Boolean(opts.multiline),
        confirmText: opts.confirmText || "Submit",
        cancelText: opts.cancelText || "Cancel"
      });
    },
    [enqueue]
  );

  const handleClose = useCallback((value) => {
    setQueue((prev) => {
      const active = prev[0];
      if (active?.resolve) {
        active.resolve(value);
      }
      return prev.slice(1);
    });
  }, []);

  return (
    <DialogContext.Provider value={{ confirm, alert, prompt }}>
      {children}
      {currentDialog && (
        <DialogModal dialog={currentDialog} onClose={handleClose} />
      )}
    </DialogContext.Provider>
  );
}
