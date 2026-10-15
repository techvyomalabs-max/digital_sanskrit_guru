import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { useDialog } from "../../hooks/useDialog";

export default function AdminRefundModal({
  order,
  isOpen,
  onClose,
  token,
  onSuccess,
  preselectedItemId = null
}) {
  const { confirm } = useDialog();
  const [reason, setReason] = useState("customer_choice");
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [restock, setRestock] = useState(false);
  const [quote, setQuote] = useState(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const items = useMemo(() => (Array.isArray(order?.items) ? order.items : []), [order?.items]);

  // Initialize selected items and defaults on open
  useEffect(() => {
    if (!isOpen || !order) return;

    setReason("customer_choice");
    setRestock(false);
    setSubmitError("");
    setQuoteError("");

    if (preselectedItemId) {
      setSelectedItemIds([String(preselectedItemId)]);
    } else {
      const returnEligible = items.filter(
        (it) => it.returnRequest?.status === "Requested" || it.returnRequest?.status === "Approved"
      ).map((it) => String(it._id || it.id || it.product || ""));

      if (returnEligible.length > 0) {
        setSelectedItemIds(returnEligible);
      } else {
        setSelectedItemIds(items.map((it) => String(it._id || it.id || it.product || "")));
      }
    }
  }, [isOpen, order, preselectedItemId, items]);

  // Fetch refund quote when reason or selectedItemIds change
  const fetchQuote = useCallback(async () => {
    if (!order?._id || !token) return;

    setIsLoadingQuote(true);
    setQuoteError("");
    try {
      const res = await axios.get(
        `/api/orders/${order._id}/refund-quote`,
        {
          params: {
            reason,
            itemIds: selectedItemIds.join(",")
          },
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      setQuote(res.data);
      setRefundAmount(String(res.data?.refundable ?? 0));
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to calculate refund quote.";
      setQuoteError(msg);
      setQuote(null);
    } finally {
      setIsLoadingQuote(false);
    }
  }, [order?._id, token, reason, selectedItemIds]);

  useEffect(() => {
    if (isOpen && order?._id) {
      fetchQuote();
    }
  }, [isOpen, order?._id, fetchQuote]);

  if (!isOpen || !order) return null;

  const handleItemToggle = (itemId) => {
    setSelectedItemIds((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId]
    );
  };

  const handleSelectAll = () => {
    if (selectedItemIds.length === items.length) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(items.map((it) => String(it._id || it.id || it.product || "")));
    }
  };

  const handleRefundSubmit = async (e, forceManual = false) => {
    if (e) e.preventDefault();

    const numericAmount = Number(refundAmount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setSubmitError("Please enter a valid refund amount greater than ₹0.");
      return;
    }

    const remainingLimit = Number(quote?.remainingBefore ?? order.totalInInr ?? order.total ?? 0);
    if (numericAmount > remainingLimit + 0.01) {
      setSubmitError(`Refund amount cannot exceed remaining balance of ₹${remainingLimit.toFixed(2)}.`);
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      const res = await axios.put(
        `/api/orders/${order._id}/refund-status`,
        {
          refundStatus: "Refunded",
          refundAmount: numericAmount,
          reason,
          itemIds: selectedItemIds,
          restock,
          forceManual
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      onSuccess(res.data);
      onClose();
    } catch (err) {
      const errMsg = err?.response?.data?.message || "Failed to process refund.";
      const canForce = Boolean(err?.response?.data?.canForceManual);
      let shouldForce = false;

      if (canForce) {
        shouldForce = await confirm({
          title: "Mark as Refunded?",
          message: `${errMsg}\n\nDo you want to mark this order as "Refunded" manually in the store?`,
          tone: "danger",
          confirmText: "Mark Refunded"
        });
      }

      if (shouldForce) {
        return handleRefundSubmit(null, true);
      }

      setSubmitError(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasRazorpay = Boolean(
    String(order.paymentMeta?.razorpayPaymentId || order.razorpayPaymentId || "").trim()
  );
  const isManualOnly = order.paymentMeta?.refundMethod === "manual" || !hasRazorpay;
  const buttonVerb = isManualOnly ? "Refund (Manual)" : "Refund via Razorpay";
  const displayAmount = Number(refundAmount) > 0 ? `₹${Number(refundAmount).toFixed(2)}` : "";

  return (
    <div className="admin-action-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="admin-action-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "560px", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
      >
        <div className="admin-action-modal-header">
          <h3>
            💳 Refund Order {order.orderNumber ? `#${order.orderNumber}` : `#${String(order._id).slice(-6)}`}
          </h3>
          <button
            type="button"
            className="admin-action-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form
          onSubmit={(e) => handleRefundSubmit(e, false)}
          style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1 }}
        >
          <div className="admin-action-modal-body" style={{ overflowY: "auto", padding: "16px 20px" }}>
            {submitError && (
              <p className="admin-action-modal-error">⚠️ {submitError}</p>
            )}
            {quoteError && (
              <p className="admin-action-modal-error">⚠️ {quoteError}</p>
            )}

            {/* Reason selector */}
            <div className="admin-action-modal-field">
              <label>Refund Reason</label>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "normal", textTransform: "none", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="refundReason"
                    value="customer_choice"
                    checked={reason === "customer_choice"}
                    onChange={(e) => setReason(e.target.value)}
                    style={{ width: "auto" }}
                  />
                  <span>Customer's choice (cancelled / changed mind)</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "normal", textTransform: "none", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="refundReason"
                    value="store_fault"
                    checked={reason === "store_fault"}
                    onChange={(e) => setReason(e.target.value)}
                    style={{ width: "auto" }}
                  />
                  <span>Store's fault (damaged / wrong / out of stock / we cancelled)</span>
                </label>
              </div>
            </div>

            {/* Items selector */}
            <div className="admin-action-modal-field">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label>Items to Refund</label>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  style={{ background: "none", border: "none", color: "#2563eb", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}
                >
                  {selectedItemIds.length === items.length ? "Deselect All" : "Select All"}
                </button>
              </div>
              <div style={{ maxHeight: "160px", overflowY: "auto", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "8px", background: "#f8fafc" }}>
                {items.length === 0 ? (
                  <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>No items found</p>
                ) : (
                  items.map((it) => {
                    const id = String(it._id || it.id || it.product || "");
                    const isChecked = selectedItemIds.includes(id);
                    const returnStatus = it.returnRequest?.status;
                    return (
                      <label
                        key={id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "6px 8px",
                          borderRadius: "6px",
                          background: isChecked ? "#eff6ff" : "transparent",
                          cursor: "pointer",
                          fontWeight: "normal",
                          textTransform: "none",
                          fontSize: "13px"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1 }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleItemToggle(id)}
                            style={{ width: "auto" }}
                          />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {it.name || "Item"}
                            {it.quantity > 1 ? ` (×${it.quantity})` : ""}
                            {it.isDigital ? " [Digital]" : ""}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                          {returnStatus && returnStatus !== "Not Requested" && (
                            <span style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "4px", background: "#e0e7ff", color: "#3730a3", fontWeight: 600 }}>
                              {returnStatus}
                            </span>
                          )}
                          <span style={{ fontWeight: 600, color: "#0f172a" }}>
                            ₹{(Number(it.price || 0) * Number(it.quantity || 1)).toFixed(2)}
                          </span>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* Restock checkbox */}
            <div className="admin-action-modal-field">
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "normal", textTransform: "none", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={restock}
                  onChange={(e) => setRestock(e.target.checked)}
                  style={{ width: "auto" }}
                />
                <span>Add returned physical items back to stock</span>
              </label>
            </div>

            {/* Calculation Breakdown & Quote */}
            <div className="admin-action-modal-field">
              <label>Calculation Breakdown</label>
              {isLoadingQuote ? (
                <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", color: "#64748b" }}>
                  Calculating refund quote...
                </div>
              ) : quote ? (
                <div style={{ background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", padding: "10px 12px" }}>
                  {quote.feeUnknown && (
                    <div style={{ background: "#fffbeb", border: "1px solid #fef3c7", color: "#92400e", padding: "6px 10px", borderRadius: "6px", fontSize: "12px", marginBottom: "8px", fontWeight: 600 }}>
                      ⚠️ Gateway fee unavailable; no fee deducted.
                    </div>
                  )}
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                    <tbody>
                      {quote.lines?.map((line, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid #e2e8f0" }}>
                          <td style={{ padding: "4px 0", color: "#475569" }}>{line.label}</td>
                          <td style={{ padding: "4px 0", textAlign: "right", fontWeight: 600, color: line.amount < 0 ? "#dc2626" : "#0f172a" }}>
                            {line.amount < 0 ? "-" : ""}₹{Math.abs(line.amount).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td style={{ padding: "6px 0 0", fontWeight: 700, color: "#0f172a" }}>Maximum Refundable:</td>
                        <td style={{ padding: "6px 0 0", textAlign: "right", fontWeight: 800, color: "#166534" }}>
                          ₹{Number(quote.refundable).toFixed(2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>

            {/* Editable refund amount */}
            <div className="admin-action-modal-field">
              <label htmlFor="modal-refund-amount">
                Refund Amount (₹) {quote ? `(Max: ₹${quote.remainingBefore.toFixed(2)})` : ""}
              </label>
              <input
                id="modal-refund-amount"
                type="number"
                step="0.01"
                min="0.01"
                max={quote?.remainingBefore || 999999}
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
          </div>

          <div className="admin-action-modal-footer">
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
              disabled={isSubmitting || isLoadingQuote || !Number(refundAmount)}
              style={{ background: "#16a34a" }}
            >
              {isSubmitting
                ? "Processing..."
                : displayAmount
                ? `${buttonVerb} (${displayAmount})`
                : buttonVerb}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
