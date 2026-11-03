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

// ── Payout summaries ─────────────────────────────────────────────────────────

const PAYOUT_GROUPS = {
  settlement: "Per settlement",
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
  year: "Yearly (financial year)"
};

const PAYOUT_SUMMARY_HEADERS = [
  "Period", "From", "To", "Settlements", "Settlement UTRs", "Payments", "Payments Amount", "Refunds",
  "Refunds Amount", "Other Adjustments", "Fees (incl. GST)", "GST On Fees", "Net To Bank", "Currency", "Unmatched"
];

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The group a settled transaction falls in: { key, label, from, to } (India dates). */
function payoutPeriod(it, group) {
  const day = unixDate(it.settled_at);
  if (group === "settlement") {
    return { key: String(it.settlement_id || "(no settlement)"), label: String(it.settlement_id || "(no settlement)"), from: day, to: day };
  }
  if (group === "day") return { key: day, label: day, from: day, to: day };
  if (group === "week") {
    // Weeks run Monday to Sunday
    const d = new Date(`${day}T00:00:00Z`);
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
    const sunday = new Date(new Date(`${monday}T00:00:00Z`).getTime() + 6 * DAY_MS).toISOString().slice(0, 10);
    return { key: monday, label: `Week of ${monday}`, from: monday, to: sunday };
  }
  if (group === "month") {
    const [y, m] = day.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { key: day.slice(0, 7), label: `${MONTHS[m - 1]} ${y}`, from: `${day.slice(0, 7)}-01`, to: `${day.slice(0, 7)}-${String(last).padStart(2, "0")}` };
  }
  // Financial year, 1 April to 31 March
  const y = Number(day.slice(0, 4));
  const start = Number(day.slice(5, 7)) >= 4 ? y : y - 1;
  return { key: String(start), label: `FY ${start}-${String((start + 1) % 100).padStart(2, "0")}`, from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

/**
 * Settled transactions added up per settlement, day, week, month or financial year.
 * Net to bank = payments − refunds ± adjustments − fees. Amounts in currency units (₹).
 */
function payoutSummaryRows(items = [], orders = [], group = "settlement") {
  const detail = payoutRows(items, orders);
  const col = (row, name) => row[PAYOUT_HEADERS.indexOf(name)];
  const sorted = [...items].sort((a, b) => (Number(a.settled_at) - Number(b.settled_at)) || String(a.settlement_id).localeCompare(String(b.settlement_id)) || (Number(a.created_at) - Number(b.created_at)));
  const groups = new Map();
  sorted.forEach((it, i) => {
    const row = detail[i];
    const period = payoutPeriod(it, group);
    const g = groups.get(period.key) || {
      ...period, settlements: new Set(), utrs: new Set(), payments: 0, paymentsAmount: 0, refunds: 0,
      refundsAmount: 0, other: 0, fees: 0, feeTax: 0, net: 0, currencies: new Set(), unmatched: 0
    };
    if (it.settlement_id) g.settlements.add(String(it.settlement_id));
    if (it.settlement_utr) g.utrs.add(String(it.settlement_utr));
    g.currencies.add(String(it.currency || "INR"));
    const amount = (Number(it.amount) || 0) / 100;
    if (it.type === "payment") {
      g.payments += 1;
      g.paymentsAmount += amount;
    } else if (it.type === "refund") {
      g.refunds += 1;
      g.refundsAmount += amount;
    } else {
      g.other += ((Number(it.credit) || 0) - (Number(it.debit) || 0)) / 100;
    }
    g.fees += (Number(it.fee) || 0) / 100;
    g.feeTax += (Number(it.tax) || 0) / 100;
    g.net += ((Number(it.credit) || 0) - (Number(it.debit) || 0)) / 100;
    if (col(row, "Matched") === "No") g.unmatched += 1;
    groups.set(period.key, g);
  });
  const two = (v) => (Math.round(v * 100) / 100).toFixed(2);
  return [...groups.values()]
    .sort((a, b) => a.from.localeCompare(b.from) || a.key.localeCompare(b.key))
    .map((g) => [
      g.label, g.from, g.to, String(g.settlements.size), [...g.utrs].join(" "), String(g.payments), two(g.paymentsAmount),
      String(g.refunds), two(g.refundsAmount), two(g.other), two(g.fees), two(g.feeTax), two(g.net),
      [...g.currencies].join(" "), String(g.unmatched)
    ]);
}

module.exports = {
  PAYOUT_GROUPS,
  PAYOUT_SUMMARY_HEADERS,
  payoutPeriod,
  payoutSummaryRows,
  ATTEMPT_HEADERS,
  PAYOUT_HEADERS,
  attemptOutcome,
  attemptRows,
  monthsBetween,
  fetchSettledTransactions,
  payoutRows
};
