const { describe, it, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const PaymentIntent = require("../models/PaymentIntent");
const {
  ATTEMPT_HEADERS, PAYOUT_HEADERS, attemptOutcome, attemptRows, monthsBetween, fetchSettledTransactions, payoutRows
} = require("../utils/paymentReports");
const { recordFailedPayment } = require("../routes/paymentWebhook");

const col = (headers, row, name) => row[headers.indexOf(name)];
const ts = (iso) => Math.floor(new Date(iso).getTime() / 1000);

describe("failed payments from the Razorpay webhook", () => {
  afterEach(() => mock.restoreAll());

  it("are kept on the checkout's payment intent without changing its status", async () => {
    const calls = [];
    mock.method(PaymentIntent, "findOneAndUpdate", async (filter, update, opts) => {
      calls.push({ filter, update, opts });
      return null;
    });
    await recordFailedPayment({
      id: "pay_F1", order_id: "order_A", amount: 59900, currency: "INR", method: "upi",
      error_code: "BAD_REQUEST_ERROR", error_description: "Payment was declined by the bank", error_reason: "payment_declined",
      error_source: "bank", error_step: "payment_authorization", created_at: ts("2026-11-03T05:00:00Z")
    });
    const { filter, update, opts } = calls[0];
    assert.deepEqual(filter, { razorpayOrderId: "order_A" });
    assert.deepEqual(update.$inc, { failedAttempts: 1 });
    assert.equal(update.$set.lastFailure.description, "Payment was declined by the bank");
    assert.equal(update.$set.lastFailure.method, "upi");
    assert.equal(update.$set.lastFailure.at.toISOString(), "2026-11-03T05:00:00.000Z");
    assert.equal(update.$setOnInsert.status, "created", "a failure never marks it paid or orphaned");
    assert.equal(opts.upsert, true);
  });
});

describe("payment attempts report", () => {
  const intents = [
    { razorpayOrderId: "order_paid", razorpayPaymentId: "pay_1", status: "linked", amountMinor: 59900, currency: "INR", createdAt: new Date("2026-11-02T06:00:00Z"), user: { name: "Asha", email: "a@example.com" } },
    { razorpayOrderId: "order_fail", status: "created", failedAttempts: 2, lastFailure: { description: "Payment was declined by the bank", code: "BAD_REQUEST_ERROR", source: "bank", step: "payment_authorization", method: "upi", at: new Date("2026-11-03T05:00:00Z"), paymentId: "pay_F1" }, amountMinor: 29900, currency: "INR", createdAt: new Date("2026-11-03T04:59:00Z") },
    { razorpayOrderId: "order_quit", status: "created", amountMinor: 1999, currency: "USD", createdAt: new Date("2026-11-04T06:00:00Z") },
    { razorpayOrderId: "order_orphan", razorpayPaymentId: "pay_9", status: "orphan", amountMinor: 45000, currency: "INR", createdAt: new Date("2026-11-01T06:00:00Z") }
  ];
  const orders = new Map([["order_paid", { _id: "6730f1a2b3c4d5e6f7a8b9c0", invoiceNumber: "DSG/2026-27/0001", paymentStatus: "Paid", paymentMeta: { razorpayPaymentId: "pay_1" } }]]);

  it("says what happened to each checkout, oldest first", () => {
    const rows = attemptRows(intents, orders);
    const h = ATTEMPT_HEADERS;
    assert.deepEqual(rows.map((r) => col(h, r, "Outcome")), ["Paid, no order (needs action)", "Paid", "Failed", "Not completed"]);
    const paid = rows[1];
    assert.equal(col(h, paid, "Invoice No"), "DSG/2026-27/0001");
    assert.equal(col(h, paid, "Order Ref"), "F7A8B9C0");
    assert.equal(col(h, paid, "Customer Name"), "Asha");
    const failed = rows[2];
    assert.equal(col(h, failed, "Failure Reason"), "Payment was declined by the bank");
    assert.equal(col(h, failed, "Failed Tries"), "2");
    assert.equal(col(h, failed, "Payment ID"), "pay_F1");
    assert.equal(col(h, failed, "Amount"), "299.00");
    assert.equal(col(h, rows[3], "Currency"), "USD");
  });

  it("a checkout that failed and then succeeded counts as paid", () => {
    assert.equal(attemptOutcome({ status: "captured", failedAttempts: 1 }, null), "Paid");
    assert.equal(attemptOutcome({ status: "created", failedAttempts: 1 }, { paymentStatus: "Paid" }), "Paid");
  });
});

describe("Razorpay payouts report", () => {
  it("lists the months of a period", () => {
    assert.deepEqual(monthsBetween("2026-11-01", "2026-11-30"), [{ year: 2026, month: 11 }]);
    assert.deepEqual(monthsBetween("2026-12-15", "2027-02-01").map((m) => `${m.year}-${m.month}`), ["2026-12", "2027-1", "2027-2"]);
  });

  it("fetches every page for each month and keeps only what settled in the period", async () => {
    const asked = [];
    const page = (n, settled) => Array.from({ length: n }, (_, i) => ({ entity_id: `pay_${settled}_${i}`, type: "payment", settled_at: ts(settled) }));
    const razorpay = {
      settlements: {
        reports: async (params) => {
          asked.push(params);
          if (params.month === 11 && params.skip === 0) return { items: page(1000, "2026-11-10T06:00:00Z") };
          if (params.month === 11 && params.skip === 1000) return { items: [...page(3, "2026-11-20T06:00:00Z"), ...page(2, "2026-12-01T06:00:00Z")] };
          return { items: [] };
        }
      }
    };
    const items = await fetchSettledTransactions(razorpay, { fromStr: "2026-11-01", toStr: "2026-11-30" });
    assert.equal(items.length, 1003);
    assert.deepEqual(asked, [{ year: 2026, month: 11, count: 1000, skip: 0 }, { year: 2026, month: 11, count: 1000, skip: 1000 }]);
  });

  it("matches payments to invoices and refunds to credit notes, with fees and net", () => {
    const items = [
      { entity_id: "pay_1", type: "payment", amount: 100000, fee: 2360, tax: 360, credit: 97640, debit: 0, currency: "INR", settled_at: ts("2026-11-04T06:00:00Z"), created_at: ts("2026-11-02T06:00:00Z"), settlement_id: "setl_A", settlement_utr: "UTR1", order_id: "order_paid", method: "upi" },
      { entity_id: "rfnd_1", type: "refund", payment_id: "pay_1", amount: 45000, fee: 0, tax: 0, credit: 0, debit: 45000, currency: "INR", settled_at: ts("2026-11-04T06:00:00Z"), created_at: ts("2026-11-03T06:00:00Z"), settlement_id: "setl_A", settlement_utr: "UTR1" },
      { entity_id: "pay_x", type: "payment", amount: 5000, fee: 118, tax: 18, credit: 4882, debit: 0, currency: "INR", settled_at: ts("2026-11-04T06:00:00Z"), created_at: ts("2026-11-01T06:00:00Z"), settlement_id: "setl_A", settlement_utr: "UTR1" },
      { entity_id: "adj_1", type: "adjustment", amount: 100, credit: 0, debit: 100, currency: "INR", settled_at: ts("2026-11-04T06:00:00Z"), settlement_id: "setl_A" }
    ];
    const orders = [{
      _id: "6730f1a2b3c4d5e6f7a8b9c0", invoiceNumber: "DSG/2026-27/0001",
      paymentMeta: { razorpayPaymentId: "pay_1", refunds: [{ refundId: "rfnd_1", creditNoteNumber: "CN/2026-27/0001" }] }
    }];
    const rows = payoutRows(items, orders);
    const h = PAYOUT_HEADERS;
    const byId = (id) => rows.find((r) => col(h, r, "Transaction ID") === id);

    const pay = byId("pay_1");
    assert.equal(col(h, pay, "Invoice No"), "DSG/2026-27/0001");
    assert.equal(col(h, pay, "Fee (incl. GST)"), "23.60");
    assert.equal(col(h, pay, "GST On Fee"), "3.60");
    assert.equal(col(h, pay, "Net To Bank"), "976.40");
    assert.equal(col(h, pay, "Settled Date"), "2026-11-04");
    assert.equal(col(h, pay, "Matched"), "Yes");

    const refund = byId("rfnd_1");
    assert.equal(col(h, refund, "Payment ID"), "pay_1");
    assert.equal(col(h, refund, "Credit Note No"), "CN/2026-27/0001");
    assert.equal(col(h, refund, "Invoice No"), "DSG/2026-27/0001");
    assert.equal(col(h, refund, "Net To Bank"), "-450.00");

    assert.equal(col(h, byId("pay_x"), "Matched"), "No", "a payment Razorpay settled that has no invoice here");
    assert.equal(col(h, byId("adj_1"), "Matched"), "n/a");

    const net = rows.reduce((a, r) => a + Number(col(h, r, "Net To Bank")), 0);
    assert.equal(Math.round(net * 100) / 100, 976.40 - 450 + 48.82 - 1);
  });
});

describe("GET /api/orders/analytics/finance/export (payment reports)", () => {
  const express = require("express");
  const jwt = require("jsonwebtoken");
  const http = require("node:http");
  const Order = require("../models/Order");
  const User = require("../models/User");
  const AdminAuditLog = require("../models/AdminAuditLog");

  afterEach(() => mock.restoreAll());

  const admin = { _id: "6730f1a2b3c4d5e6f7a8b9e1", isAdmin: true, adminLevel: 1, email: "a@example.com" };
  const chain = (v) => ({ select: () => chain(v), lean: async () => v, populate: () => chain(v) });

  async function call(query) {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
    mock.method(User, "findById", () => chain(admin));
    mock.method(AdminAuditLog, "create", async (d) => d);
    mock.method(PaymentIntent, "find", () => chain([{ razorpayOrderId: "order_fail", status: "created", failedAttempts: 1, lastFailure: { description: "Declined" }, amountMinor: 100, currency: "INR", createdAt: new Date("2026-11-03T05:00:00Z") }]));
    mock.method(Order, "find", () => chain([]));
    const app = express();
    app.use("/api/orders", require("../routes/orderRoutes"));
    const server = app.listen(0);
    try {
      const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, { algorithm: "HS256" });
      return await new Promise((resolve, reject) => {
        http.get({ port: server.address().port, path: `/api/orders/analytics/finance/export?${query}`, headers: { Authorization: `Bearer ${token}` } }, (r) => {
          let body = "";
          r.setEncoding("utf8");
          r.on("data", (c) => { body += c; });
          r.on("end", () => resolve({ status: r.statusCode, headers: r.headers, body }));
        }).on("error", reject);
      });
    } finally {
      server.close();
    }
  }

  it("downloads payment attempts", async () => {
    const res = await call("report=attempts&from=2026-11-01&to=2026-11-30");
    assert.equal(res.status, 200);
    assert.match(res.headers["content-disposition"], /DSG_payment_attempts_2026-11-01_to_2026-11-30\.csv/);
    assert.match(res.body, /Failed/);
    assert.match(res.body, /Declined/);
  });

  it("says plainly when Razorpay isn't set up for payouts", async () => {
    const saved = [process.env.RAZORPAY_KEY_ID, process.env.RAZORPAY_KEY_SECRET, process.env.RAZORPAY_SECRET];
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_SECRET;
    try {
      const res = await call("report=payouts&from=2026-11-01&to=2026-11-30");
      assert.equal(res.status, 503);
      assert.match(res.body, /not set up/);
    } finally {
      [process.env.RAZORPAY_KEY_ID, process.env.RAZORPAY_KEY_SECRET, process.env.RAZORPAY_SECRET] = saved;
      for (const k of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_SECRET"]) if (process.env[k] === "undefined") delete process.env[k];
    }
  });
});
