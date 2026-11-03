"use strict";

/**
 * Two finance reports about money movement (alongside financeReports.js):
 *
 *   attempts  Every checkout that opened Razorpay, and what happened: paid, failed (with
 *             Razorpay's reason), not completed, or paid without an order (orphan).
 *   payouts   What Razorpay settled to the bank: each payment and refund in each settlement,
 *             with Razorpay's fee and the GST on it, matched to our invoice or credit note.
 */

const { istDate } = require("./financeReports");

const money = (minor) => ((Number(minor) || 0) / 100).toFixed(2);
const unixDate = (sec) => (sec ? istDate(new Date(Number(sec) * 1000)) : "");
const orderRef = (order) => (order?._id ? String(order._id).slice(-8).toUpperCase() : "");

// ── Payment attempts ─────────────────────────────────────────────────────────

const ATTEMPT_HEADERS = [
  "Attempt Date", "Outcome", "Razorpay Order ID", "Payment ID", "Mode", "Customer Name", "Email",
  "Amount", "Currency", "Failed Tries", "Last Failure Date", "Failure Reason", "Failure Code",
  "Failure Source", "Failure Step", "Method", "Order Ref", "Order Payment Status", "Invoice No"
];

/**
 * What became of a checkout attempt.
 * intent: PaymentIntent; order: the order with the same Razorpay order id (if any).
 */
function attemptOutcome(intent, order) {
  if (order?.paymentStatus === "Paid" || order?.paymentStatus === "Refunded") return "Paid";
  if (intent.status === "orphan") return "Paid, no order (needs action)";
  if (intent.status === "refunding" || intent.status === "refunded") return "Paid, no order (refunded)";
  if (intent.status === "resolved") return "Paid, no order (resolved)";
  if (intent.status === "captured" || intent.status === "linked") return "Paid";
  if (Number(intent.failedAttempts) > 0) return "Failed";
  return "Not completed";
}

function attemptRows(intents = [], ordersByRzpOrder = new Map()) {
  return [...intents]
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((intent) => {
      const order = ordersByRzpOrder.get(String(intent.razorpayOrderId)) || null;
      const f = intent.lastFailure || {};
      const user = intent.user && typeof intent.user === "object" ? intent.user : {};
      return [
        istDate(intent.createdAt),
        attemptOutcome(intent, order),
        String(intent.razorpayOrderId || ""),
        String(intent.razorpayPaymentId || order?.paymentMeta?.razorpayPaymentId || f.paymentId || ""),
        String(intent.mode || "checkout"),
        String(user.name || order?.billing?.name || order?.shipping?.name || ""),
        String(user.email || order?.billing?.email || ""),
        money(intent.amountMinor),
        String(intent.currency || "INR"),
        String(Number(intent.failedAttempts) || 0),
        f.at ? istDate(f.at) : "",
        String(f.description || ""),
        String(f.code || ""),
        String(f.source || ""),
        String(f.step || ""),
        String(f.method || ""),
        orderRef(order),
        String(order?.paymentStatus || ""),
        String(order?.invoiceNumber || "")
      ];
    });
}

// ── Payouts (Razorpay settlements) ──────────────────────────────────────────

const PAYOUT_HEADERS = [
  "Settlement ID", "Settlement UTR", "Settled Date", "Type", "Transaction ID", "Payment ID",
  "Razorpay Order ID", "Method", "Transaction Date", "Currency", "Amount", "Fee (incl. GST)",
  "GST On Fee", "Credit", "Debit", "Net To Bank", "Order Ref", "Invoice No", "Credit Note No", "Matched"
];

/** "YYYY-MM" months from one India date to another, inclusive. */
function monthsBetween(fromStr, toStr) {
  const out = [];
  let y = Number(fromStr.slice(0, 4));
  let m = Number(fromStr.slice(5, 7));
  const endY = Number(toStr.slice(0, 4));
  const endM = Number(toStr.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/**
 * Every settled transaction for the months of the period, from Razorpay's settlement recon
 * (GET /v1/settlements/recon/combined, up to 1000 per call), kept only if settled in the period.
 */
async function fetchSettledTransactions(razorpay, { fromStr, toStr }) {
  const items = [];
  for (const { year, month } of monthsBetween(fromStr, toStr)) {
    for (let skip = 0; skip < 100000; skip += 1000) {
      const page = await razorpay.settlements.reports({ year, month, count: 1000, skip });
      const batch = Array.isArray(page?.items) ? page.items : [];
      items.push(...batch);
      if (batch.length < 1000) break;
    }
  }
  return items.filter((it) => {
    const day = unixDate(it.settled_at);
    return day && day >= fromStr && day <= toStr;
  });
}

/**
 * Rows for the payout report. orders: our orders whose Razorpay payment id appears in the
 * transactions (with paymentMeta.refunds for credit notes).
 */
function payoutRows(items = [], orders = []) {
  const byPayment = new Map();
  const byRefund = new Map();
  for (const o of orders) {
    const pid = String(o?.paymentMeta?.razorpayPaymentId || "");
    if (pid) byPayment.set(pid, o);
    for (const r of Array.isArray(o?.paymentMeta?.refunds) ? o.paymentMeta.refunds : []) {
      if (r?.refundId) byRefund.set(String(r.refundId), { order: o, refund: r });
    }
  }

  return [...items]
    .sort((a, b) => (Number(a.settled_at) - Number(b.settled_at)) || String(a.settlement_id).localeCompare(String(b.settlement_id)) || (Number(a.created_at) - Number(b.created_at)))
    .map((it) => {
      const type = String(it.type || "");
      const paymentId = type === "payment" ? String(it.entity_id || "") : String(it.payment_id || "");
      const refundHit = type === "refund" ? byRefund.get(String(it.entity_id || "")) : null;
      const order = refundHit?.order || byPayment.get(paymentId) || null;
      // Matched: a payment to one of our invoices, or a refund to one of our credit notes
      const matched = type === "payment" ? Boolean(order?.invoiceNumber) : type === "refund" ? Boolean(refundHit) : false;
      return [
        String(it.settlement_id || ""),
        String(it.settlement_utr || ""),
        unixDate(it.settled_at),
        type,
        String(it.entity_id || ""),
        paymentId,
        String(it.order_id || ""),
        String(it.method || ""),
        unixDate(it.created_at),
        String(it.currency || "INR"),
        money(it.amount),
        money(it.fee),
        money(it.tax),
        money(it.credit),
        money(it.debit),
        money((Number(it.credit) || 0) - (Number(it.debit) || 0)),
        orderRef(order),
        String(order?.invoiceNumber || ""),
        String(refundHit?.refund?.creditNoteNumber || ""),
        type === "payment" || type === "refund" ? (matched ? "Yes" : "No") : "n/a"
      ];
    });
}

module.exports = {
  ATTEMPT_HEADERS,
  PAYOUT_HEADERS,
  attemptOutcome,
  attemptRows,
  monthsBetween,
  fetchSettledTransactions,
  payoutRows
};
