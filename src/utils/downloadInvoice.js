import axios from "axios";

/**
 * Downloads a file from the API (with the admin's or customer's sign-in) and saves it under
 * the name the server gives. Throws an Error with the server's message when it can't.
 */
export async function downloadFromApi(path, token, fallbackName = "download") {
  try {
    const res = await axios.get(path, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: "blob"
    });
    const disposition = String(res.headers?.["content-disposition"] || "");
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] || fallbackName;
    const url = URL.createObjectURL(res.data instanceof Blob ? res.data : new Blob([res.data]));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return { filename, rows: Number(res.headers?.["x-report-rows"] ?? NaN) };
  } catch (err) {
    let message = "";
    const data = err?.response?.data;
    if (data instanceof Blob) {
      try {
        message = JSON.parse(await data.text())?.message || "";
      } catch {
        message = "";
      }
    }
    throw new Error(message || "Unable to download right now.");
  }
}

/** The GST tax invoice PDF built by the server (the same one that is emailed). */
export function downloadInvoice(orderId, token) {
  return downloadFromApi(`/api/orders/${orderId}/invoice`, token, `invoice-${String(orderId).slice(-8)}.pdf`)
    .catch((err) => {
      throw new Error(err.message === "Unable to download right now." ? "Unable to download the invoice right now." : err.message);
    });
}

/**
 * Refunds on an order that have a GST credit note, oldest first, each with the position (n)
 * the server uses for its download. Same order as backend creditNoteRefunds().
 */
export function creditNoteList(order) {
  const refunds = Array.isArray(order?.paymentMeta?.refunds) ? order.paymentMeta.refunds : [];
  return refunds
    .filter((r) => r && r.creditNoteNumber)
    .sort((a, b) => new Date(a.creditNoteIssuedAt || a.at || 0) - new Date(b.creditNoteIssuedAt || b.at || 0))
    .map((r, i) => ({ ...r, n: i + 1 }));
}

/** The GST credit note PDF for the order's n-th refund. */
export function downloadCreditNote(orderId, n, token) {
  return downloadFromApi(`/api/orders/${orderId}/credit-notes/${n}`, token, `credit-note-${n}.pdf`)
    .catch((err) => {
      throw new Error(err.message === "Unable to download right now." ? "Unable to download the credit note right now." : err.message);
    });
}
