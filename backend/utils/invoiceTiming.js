"use strict";

/**
 * When an order's GST tax invoice is issued (pure; no DB).
 *
 * - Until then the customer and admin get a printable "Order summary" (not a tax invoice).
 * - An order with any physical item (a combo with any physical part counts as physical):
 *   when it is shipped (or marked Delivered/Completed).
 * - A digital-only order: when every item's access is given. Items that need an admin to
 *   grant access wait for that; instant digital items are given at payment.
 * - The invoice is issued at dispatch but dated the day the order was placed (business
 *   decision), and numbered in the financial year of that date.
 * - Money received before dispatch is an advance, not a sale: the order is "awaiting" and stays
 *   out of the GST sales register until it is invoiced.
 * - A paid order cancelled (or refunded) before that point never gets an invoice, so its refund
 *   needs no credit note: there is no invoiced supply to reverse.
 *
 * Orders store their stage in `invoiceState`:
 *   "awaiting"      paid, invoice not due yet (shows as an order summary)
 *   "issued"        has its invoice number
 *   "not-required"  paid but cancelled/refunded before it was invoiced
 *   ""              older orders from before this rule (left exactly as they were)
 */

const { isDigitalLikeItem, allDigitalAccessGranted } = require("./accessFulfilment");

const SHIPPED_STATES = new Set(["Shipped", "Delivered", "Completed"]);

function hasPhysicalItem(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  return items.some((item) => !isDigitalLikeItem(item));
}

/** True when a paid order has reached the point where its tax invoice is issued. */
function isInvoiceDue(order) {
  if (!order || order.paymentStatus !== "Paid") return false;
  if (String(order.status || "") === "Cancelled") return false;
  const items = Array.isArray(order.items) ? order.items : [];
  if (items.length === 0) return true;
  if (hasPhysicalItem(order)) {
    return Boolean(order.shippedAt) || SHIPPED_STATES.has(String(order.status || ""));
  }
  return allDigitalAccessGranted(items);
}

/** The invoice stage an order should be in now. */
function invoiceStateFor(order) {
  if (order?.invoiceNumber) return "issued";
  const paid = order?.paymentStatus === "Paid" || order?.paymentStatus === "Refunded";
  if (!paid) return "";
  if (isInvoiceDue(order)) return "issued";
  const closed = String(order?.status || "") === "Cancelled" || order?.paymentStatus === "Refunded";
  return closed ? "not-required" : "awaiting";
}

/** The date printed on the invoice: the day the order was placed. */
function invoiceDateFor(order, now = new Date()) {
  const placed = order?.createdAt ? new Date(order.createdAt) : null;
  return placed && !Number.isNaN(placed.getTime()) ? placed : now;
}

/** True when the order has an invoice that refunds can be credited against. */
function canIssueCreditNote(order) {
  return Boolean(order?.invoiceNumber);
}

/** Orders that were never invoiced under this rule, so they belong in no GST register. */
const NOT_INVOICED_STATES = Object.freeze(["awaiting", "not-required"]);

/** What the customer-facing document is called before/after the invoice. */
function documentLabel(order) {
  if (order?.invoiceNumber) return "Tax invoice";
  return "Order summary";
}

/** Why there is no tax invoice yet, for the order summary PDF and the UI. */
function pendingInvoiceNote(order) {
  if (order?.invoiceNumber) return "";
  const paid = order?.paymentStatus === "Paid" || order?.paymentStatus === "Refunded";
  if (!paid) return "Not a tax invoice: payment not received";
  if (String(order?.status || "") === "Cancelled") return "Not a tax invoice: order cancelled before it was invoiced";
  return hasPhysicalItem(order)
    ? "Not a tax invoice: the tax invoice is issued when the order ships"
    : "Not a tax invoice: the tax invoice is issued when access is given";
}

module.exports = {
  hasPhysicalItem,
  isInvoiceDue,
  invoiceStateFor,
  invoiceDateFor,
  canIssueCreditNote,
  NOT_INVOICED_STATES,
  documentLabel,
  pendingInvoiceNote
};
