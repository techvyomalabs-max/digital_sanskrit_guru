"use strict";

/**
 * Advances and older invoices for the Finance dashboard (pure; no DB).
 *
 * - Advances: money received for orders that are not invoiced yet (goods not dispatched,
 *   digital access not given). Not a sale until the invoice is issued.
 * - Advances refunded: orders cancelled before they were invoiced and refunded. No credit note
 *   is needed because nothing was invoiced.
 * - Invoiced before dispatch (old rule): paid orders that took their invoice at payment, before
 *   invoicing moved to dispatch, and still haven't shipped. Their numbers stay (issued invoices
 *   can't change); this list is for the admin and CA to know about them.
 */

const { hasPhysicalItem } = require("./invoiceTiming");

const DAY_MS = 24 * 60 * 60 * 1000;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function amountInInr(order) {
  const inr = Number(order?.totalInInr);
  return round2(Number.isFinite(inr) && inr > 0 ? inr : order?.total);
}

function customerName(order) {
  return order?.user?.name || order?.shipping?.name || order?.billing?.name || "Customer";
}

function orderRef(order) {
  return String(order?._id || "").slice(-8).toUpperCase();
}

function refundsInPeriod(order, from, to) {
  const refunds = Array.isArray(order?.paymentMeta?.refunds) ? order.paymentMeta.refunds : [];
  return refunds.filter((r) => {
    const at = r?.at ? new Date(r.at) : null;
    if (!at || Number.isNaN(at.getTime())) return false;
    return (!from || at >= from) && (!to || at < to);
  });
}

/**
 * @param {object} input
 * @param {object[]} input.awaiting      paid orders with invoiceState "awaiting"
 * @param {object[]} input.refunded      orders with invoiceState "not-required"
 * @param {object[]} input.legacy        paid orders invoiced before dispatch (old rule)
 * @param {Date} input.from              period start (for refunded advances)
 * @param {Date} input.to                period end, exclusive
 * @param {Date} [input.now]
 */
function buildAdvancesReport({ awaiting = [], refunded = [], legacy = [], from = null, to = null, now = new Date() } = {}) {
  const rows = awaiting
    .filter((o) => o && o.paymentStatus === "Paid" && !o.invoiceNumber)
    .map((o) => {
      const placed = o.createdAt ? new Date(o.createdAt) : null;
      return {
        orderId: String(o._id || ""),
        orderRef: orderRef(o),
        orderDate: placed,
        customer: customerName(o),
        status: String(o.status || "Pending"),
        waitingFor: hasPhysicalItem(o) ? "Dispatch" : "Digital access",
        amountInr: amountInInr(o),
        ageDays: placed ? Math.max(0, Math.floor((now - placed) / DAY_MS)) : null
      };
    })
    .sort((a, b) => new Date(a.orderDate || 0) - new Date(b.orderDate || 0));

  let refundedCount = 0;
  let refundedAmount = 0;
  for (const o of refunded) {
    const inPeriod = refundsInPeriod(o, from, to);
    if (!inPeriod.length) continue;
    refundedCount += 1;
    refundedAmount += inPeriod.reduce((sum, r) => sum + (Number(r.amountMinor) || 0) / 100, 0);
  }

  const legacyRows = legacy
    .filter((o) => o && o.invoiceNumber && !o.shippedAt && String(o.status || "") === "Pending" && hasPhysicalItem(o))
    .map((o) => ({
      orderId: String(o._id || ""),
      orderRef: orderRef(o),
      invoiceNumber: String(o.invoiceNumber),
      invoiceDate: o.invoiceIssuedAt ? new Date(o.invoiceIssuedAt) : o.createdAt ? new Date(o.createdAt) : null,
      customer: customerName(o),
      amountInr: amountInInr(o)
    }))
    .sort((a, b) => String(a.invoiceNumber).localeCompare(String(b.invoiceNumber)));

  return {
    outstanding: {
      count: rows.length,
      amountInr: round2(rows.reduce((sum, r) => sum + r.amountInr, 0)),
      oldestOrderDate: rows.length ? rows[0].orderDate : null,
      rows
    },
    refundedInPeriod: { count: refundedCount, amountInr: round2(refundedAmount) },
    invoicedBeforeDispatch: {
      count: legacyRows.length,
      amountInr: round2(legacyRows.reduce((sum, r) => sum + r.amountInr, 0)),
      rows: legacyRows
    }
  };
}

const ADVANCES_CSV_HEADERS = ["Order ref", "Order date", "Customer", "Status", "Waiting for", "Amount (INR)", "Days waiting"];

module.exports = { buildAdvancesReport, ADVANCES_CSV_HEADERS };
