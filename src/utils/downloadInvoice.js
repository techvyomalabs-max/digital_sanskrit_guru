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
