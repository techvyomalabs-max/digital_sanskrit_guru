"use strict";

/**
 * WordPress (WooCommerce) archive: shared search filter, CSV export and the invoice-copy model.
 * Pure functions only (no DB, no HTTP), so they are covered by node:test.
 *
 * Archived orders were invoiced by WooCommerce, not by this store, so they never got one of our
 * GST invoice numbers. The invoice copy is labelled as reproduced from the WooCommerce record and
 * uses the WP order number; it never takes a number from the DSG invoice series.
 */

const WP_STATUSES = ["Delivered", "Pending", "Cancelled"];
const WP_PAYMENT_STATUSES = ["Paid", "Pending", "Failed"];

/**
 * Most orders one export may contain. Larger requests are refused (not silently cut off),
 * and the admin is asked to narrow the filters, e.g. by date range.
 * A CSV row is small; a PDF row is laid out page by page, so its limit is lower.
 */
const EXPORT_LIMITS = Object.freeze({ csv: 10000, pdf: 500 });
const MAX_CSV_ROWS = EXPORT_LIMITS.csv;
const MAX_PDF_ROWS = EXPORT_LIMITS.pdf;

function escapeRegex(str) {
  return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const IST_OFFSET_MINUTES = 330;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" as the start (or end) of that day in India time, or null if not a real date. */
function istDayBoundary(value, endOfDay = false) {
  const match = DATE_RE.exec(String(value || "").trim());
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  const check = new Date(utcMidnight);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  const start = utcMidnight - IST_OFFSET_MINUTES * 60 * 1000;
  return new Date(endOfDay ? start + 24 * 60 * 60 * 1000 - 1 : start);
}

/**
 * Reads export filters from a request query and validates them.
 * Returns { filters, error }; error is a message for the admin when something is invalid.
 */
function parseExportFilters(raw = {}) {
  const filters = {
    search: String(raw.search || "").trim().slice(0, 200),
    status: String(raw.status || "All").trim() || "All",
    paymentStatus: String(raw.paymentStatus || "All").trim() || "All",
    currency: String(raw.currency || "All").trim().toUpperCase() || "ALL",
    from: String(raw.from || "").trim(),
    to: String(raw.to || "").trim()
  };
  if (filters.currency === "ALL") filters.currency = "All";

  if (filters.status !== "All" && !WP_STATUSES.includes(filters.status)) {
    return { filters, error: "Choose a valid order status." };
  }
  if (filters.paymentStatus !== "All" && !WP_PAYMENT_STATUSES.includes(filters.paymentStatus)) {
    return { filters, error: "Choose a valid payment status." };
  }
  if (filters.currency !== "All" && !/^[A-Z]{3}$/.test(filters.currency)) {
    return { filters, error: "Choose a valid currency." };
  }
  if (filters.from && !istDayBoundary(filters.from)) {
    return { filters, error: "The 'from' date is not a valid date." };
  }
  if (filters.to && !istDayBoundary(filters.to)) {
    return { filters, error: "The 'to' date is not a valid date." };
  }
  if (filters.from && filters.to && istDayBoundary(filters.from) > istDayBoundary(filters.to)) {
    return { filters, error: "The 'from' date must be on or before the 'to' date." };
  }
  return { filters, error: null };
}

/** Short human description of the filters, for file headers and the audit log. */
function describeFilters(filters = {}) {
  const parts = [];
  if (filters.from || filters.to) parts.push(`Dates: ${filters.from || "start"} to ${filters.to || "today"}`);
  if (filters.status && filters.status !== "All") parts.push(`Status: ${filters.status}`);
  if (filters.paymentStatus && filters.paymentStatus !== "All") parts.push(`Payment: ${filters.paymentStatus}`);
  if (filters.currency && filters.currency !== "All") parts.push(`Currency: ${filters.currency}`);
  if (filters.search) parts.push(`Search: "${filters.search}"`);
  return parts.join(", ") || "All orders";
}

/**
 * Mongo filter for the archive list and its exports (same rules as the on-screen search).
 * from/to are "YYYY-MM-DD" order dates in India time, both days included.
 */
function buildWpOrderQuery({ search = "", status = "All", paymentStatus = "All", currency = "All", from = "", to = "" } = {}) {
  const query = {};
  const statusFilter = String(status || "All").trim();
  if (statusFilter !== "All" && WP_STATUSES.includes(statusFilter)) {
    query.status = statusFilter;
  }
  const paymentFilter = String(paymentStatus || "All").trim();
  if (paymentFilter !== "All" && WP_PAYMENT_STATUSES.includes(paymentFilter)) {
    query.paymentStatus = paymentFilter;
  }
  const currencyFilter = String(currency || "All").trim().toUpperCase();
  if (currencyFilter !== "ALL" && /^[A-Z]{3}$/.test(currencyFilter)) {
    // Orders imported without a currency are INR
    query["currencyDisplay.currency"] = currencyFilter === "INR" ? { $in: ["INR", null, ""] } : currencyFilter;
  }
  const fromDate = istDayBoundary(from);
  const toDate = istDayBoundary(to, true);
  if (fromDate || toDate) {
    query.wpCreatedAt = {};
    if (fromDate) query.wpCreatedAt.$gte = fromDate;
    if (toDate) query.wpCreatedAt.$lte = toDate;
  }

  const cleanSearch = String(search || "").trim().replace(/^#/g, "").trim();
  if (cleanSearch) {
    const safeSearch = escapeRegex(cleanSearch);
    const numId = Number(cleanSearch);
    const textMatches = [
      { billingEmail: { $regex: safeSearch, $options: "i" } },
      { billingName: { $regex: safeSearch, $options: "i" } },
      { billingPhone: { $regex: safeSearch, $options: "i" } }
    ];
    if (!Number.isNaN(numId) && cleanSearch.length < 10) {
      query.$or = [{ wpOrderId: numId }, ...textMatches];
    } else {
      query.$or = [
        ...textMatches,
        { couponCode: { $regex: safeSearch, $options: "i" } },
        { transactionId: { $regex: safeSearch, $options: "i" } }
      ];
    }
  }
  return query;
}

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#039;": "'", "&nbsp;": " " };

/** WooCommerce item names can carry HTML such as "<br>"; returns plain one-line text. */
function cleanText(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|nbsp|#39|#039);/g, (m) => ENTITIES[m] || m)
    .replace(/\s+/g, " ")
    .trim();
}

function currencyOf(order) {
  return String(order?.currencyDisplay?.currency || "INR").toUpperCase();
}

const IST_OFFSET_MS = 330 * 60 * 1000;

/** "DD-MM-YYYY" in India time, or "" when there is no valid date. */
function istDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  const dd = String(ist.getUTCDate()).padStart(2, "0");
  const mm = String(ist.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${ist.getUTCFullYear()}`;
}

function moneyCell(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

/** Stops spreadsheet formula injection while leaving phone numbers like "+91 98…" readable. */
function sanitizeTextCell(value) {
  const str = String(value ?? "");
  if (/^\+?[\d\s().-]{6,}$/.test(str)) return str;
  if (/^\s*[=+\-@\t\r]/.test(str)) return `'${str}`;
  return str;
}

function csvCell(value, { numeric = false } = {}) {
  if (value === null || value === undefined) return '""';
  const str = numeric ? String(value) : sanitizeTextCell(value);
  return `"${str.replaceAll('"', '""')}"`;
}

function addressLine(addr = {}) {
  return cleanText([addr.address, addr.city, addr.state, addr.pincode, addr.country].filter(Boolean).join(", "));
}

const WP_CSV_HEADERS = [
  "WP Order #",
  "Order Date",
  "Paid Date",
  "Status",
  "Payment Status",
  "Payment Method",
  "Transaction ID",
  "Customer Name",
  "Email",
  "Phone",
  "Billing Address",
  "Shipping Address",
  "Items",
  "Item Count",
  "Currency",
  "Subtotal",
  "Discount",
  "Coupon",
  "Shipping",
  "GST",
  "Total"
];

/** One row per order; the items column lists "name × qty" separated by " | ". */
function wpOrderCsvRow(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const itemText = items
    .map((item) => `${cleanText(item?.name) || "Item"} x ${Math.max(1, Number(item?.quantity) || 1)}`)
    .join(" | ");
  const itemCount = items.reduce((sum, item) => sum + Math.max(1, Number(item?.quantity) || 1), 0);
  const shipping = order?.shipping?.address ? order.shipping : order?.billing;

  return [
    csvCell(order?.wpOrderId, { numeric: true }),
    csvCell(istDate(order?.wpCreatedAt)),
    csvCell(istDate(order?.wpPaidAt)),
    csvCell(order?.status || ""),
    csvCell(order?.paymentStatus || ""),
    csvCell(order?.paymentMethod || ""),
    csvCell(order?.transactionId || ""),
    csvCell(cleanText(order?.billing?.name || order?.billingName)),
    csvCell(order?.billingEmail || order?.billing?.email || ""),
    csvCell(order?.billing?.phone || order?.billingPhone || ""),
    csvCell(addressLine(order?.billing)),
    csvCell(addressLine(shipping)),
    csvCell(itemText),
    csvCell(itemCount, { numeric: true }),
    csvCell(currencyOf(order)),
    csvCell(moneyCell(order?.subtotal), { numeric: true }),
    csvCell(moneyCell(order?.discount), { numeric: true }),
    csvCell(order?.couponCode || ""),
    csvCell(moneyCell(order?.deliveryCharge), { numeric: true }),
    csvCell(moneyCell(order?.gstAmount), { numeric: true }),
    csvCell(moneyCell(order?.total), { numeric: true })
  ].join(",");
}

/** Full CSV text, starting with a UTF-8 BOM so Excel shows ₹ and Sanskrit names correctly. */
function buildWpOrdersCsv(orders = []) {
  const lines = [WP_CSV_HEADERS.map((h) => csvCell(h)).join(",")];
  for (const order of orders) lines.push(wpOrderCsvRow(order));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Totals per currency for the PDF report footer, e.g. { INR: 12345.5, USD: 20 }. */
function totalsByCurrency(orders = []) {
  const totals = {};
  for (const order of orders) {
    if (String(order?.status || "") === "Cancelled") continue;
    const cur = currencyOf(order);
    totals[cur] = Math.round(((totals[cur] || 0) + (Number(order?.total) || 0)) * 100) / 100;
  }
  return totals;
}

/** Model for the archived-order invoice copy PDF. */
function buildWpInvoice(order, seller = null) {
  const items = (Array.isArray(order?.items) ? order.items : []).map((item) => {
    const quantity = Math.max(1, Number(item?.quantity) || 1);
    const unitPrice = Number(item?.price) || 0;
    return {
      name: cleanText(item?.name) || "Item",
      quantity,
      unitPrice,
      amount: Math.round(unitPrice * quantity * 100) / 100,
      isDigital: Boolean(item?.isDigital)
    };
  });
  const billing = order?.billing || {};
  const shipping = order?.shipping?.address ? order.shipping : billing;

  return {
    documentTitle: "Invoice copy - archived order",
    wpOrderId: order?.wpOrderId,
    documentNumber: `WP-${order?.wpOrderId ?? ""}`,
    orderDate: order?.wpCreatedAt || null,
    paidDate: order?.wpPaidAt || null,
    status: order?.status || "",
    paymentStatus: order?.paymentStatus || "",
    paymentMethod: order?.paymentMethod || "",
    transactionId: order?.transactionId || "",
    currency: currencyOf(order),
    seller: {
      name: cleanText(seller?.legalName) || "Vyoma Linguistic Labs Foundation",
      address: cleanText(seller?.address),
      state: cleanText(seller?.state),
      gstin: cleanText(seller?.gstin),
      email: cleanText(seller?.email)
    },
    billTo: {
      name: cleanText(billing.name || order?.billingName) || "Customer",
      address: addressLine(billing),
      phone: cleanText(billing.phone || order?.billingPhone),
      email: cleanText(order?.billingEmail || billing.email)
    },
    shipTo: {
      name: cleanText(shipping.name || billing.name || order?.billingName) || "Customer",
      address: addressLine(shipping),
      phone: cleanText(shipping.phone || billing.phone || order?.billingPhone)
    },
    items,
    subtotal: Number(order?.subtotal) || 0,
    discount: Number(order?.discount) || 0,
    couponCode: cleanText(order?.couponCode),
    shippingCharge: Number(order?.deliveryCharge) || 0,
    gstAmount: Number(order?.gstAmount) || 0,
    total: Number(order?.total) || 0,
    note:
      "This copy is reproduced from the WooCommerce order record imported into Digital Sanskrit Guru. " +
      "Amounts are as recorded at the time of the original purchase."
  };
}

/** Whether an export of `count` orders in `format` is allowed, with the reason when it isn't. */
function checkExportSize(format, count) {
  const limit = EXPORT_LIMITS[format];
  if (!limit) return { ok: false, limit: 0, message: "Unknown export format." };
  if (count <= 0) return { ok: false, limit, message: "No orders match these filters." };
  if (count > limit) {
    return {
      ok: false,
      limit,
      message: `${count.toLocaleString("en-IN")} orders match, but a ${format.toUpperCase()} export can include at most ${limit.toLocaleString("en-IN")}. Narrow the filters, for example with a shorter date range.`
    };
  }
  return { ok: true, limit, message: "" };
}

module.exports = {
  WP_STATUSES,
  WP_PAYMENT_STATUSES,
  EXPORT_LIMITS,
  MAX_CSV_ROWS,
  MAX_PDF_ROWS,
  istDayBoundary,
  parseExportFilters,
  describeFilters,
  checkExportSize,
  WP_CSV_HEADERS,
  buildWpOrderQuery,
  cleanText,
  istDate,
  sanitizeTextCell,
  buildWpOrdersCsv,
  wpOrderCsvRow,
  totalsByCurrency,
  buildWpInvoice
};
