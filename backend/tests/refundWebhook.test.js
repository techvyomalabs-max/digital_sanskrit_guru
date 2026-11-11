const { describe, it, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const WebhookEvent = require("../models/WebhookEvent");
const { planWebhookRefund, recordWebhookRefund } = require("../utils/refunds");

const Counter = mongoose.model("Counter");
const runPreSave = (doc) => Order.schema.s.hooks.execPre("save", doc, []);

const paidOrder = (extra = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  paymentStatus: "Paid",
  total: 1000,
  totalInInr: 1000,
  refundedAmountInInr: 0,
  invoiceNumber: "DSG/2026-27/0007",
  invoiceIssuedAt: new Date("2026-11-01T06:00:00Z"),
  paymentMeta: { razorpayPaymentId: "pay_TEST1", refunds: [] },
  items: [],
  ...extra
});

const refundEntity = (extra = {}) => ({
  id: "rfnd_TEST1",
  entity: "refund",
  amount: 40000,
  currency: "INR",
  payment_id: "pay_TEST1",
  status: "processed",
  notes: { reason: "Customer changed mind" },
  created_at: Math.floor(new Date("2026-11-04T10:00:00Z").getTime() / 1000),
  ...extra
});

describe("planWebhookRefund (pure)", () => {
  it("records a new INR refund as a partial refund", () => {
    const plan = planWebhookRefund(paidOrder(), refundEntity());
    assert.equal(plan.action, "record");
    assert.equal(plan.refundedAmountInInr, 400);
    assert.equal(plan.refundStatus, "Partially Refunded");
    assert.equal(plan.entry.refundId, "rfnd_TEST1");
    assert.equal(plan.entry.amountMinor, 40000);
    assert.equal(plan.entry.method, "razorpay");
    assert.equal(plan.entry.reason, "Refunded outside DSG (Razorpay dashboard): Customer changed mind");
    assert.equal(plan.entry.at.toISOString(), "2026-11-04T10:00:00.000Z");
  });

  it("marks the order fully refunded when the rest is refunded", () => {
    const plan = planWebhookRefund(paidOrder({ refundedAmountInInr: 600 }), refundEntity());
    assert.equal(plan.refundStatus, "Refunded");
    assert.equal(plan.refundedAmountInInr, 1000);
  });

  it("skips a refund that is already recorded (e.g. made from our refund screen)", () => {
    const order = paidOrder({ paymentMeta: { razorpayPaymentId: "pay_TEST1", refunds: [{ refundId: "rfnd_TEST1", amountMinor: 40000 }] } });
    assert.deepEqual(planWebhookRefund(order, refundEntity()), { action: "ignore", reason: "already-recorded" });
  });

  it("leaves non-INR, unpaid and over-refunds for an admin", () => {
    assert.equal(planWebhookRefund(paidOrder(), refundEntity({ currency: "USD" })).reason, "non-inr-currency");
    assert.equal(planWebhookRefund(paidOrder({ paymentStatus: "Pending" }), refundEntity()).reason, "order-not-paid");
    const over = planWebhookRefund(paidOrder({ refundedAmountInInr: 700 }), refundEntity());
    assert.deepEqual(over, { action: "review", reason: "exceeds-order-total" });
  });

  it("ignores malformed refunds and unknown orders", () => {
    assert.equal(planWebhookRefund(paidOrder(), refundEntity({ id: "" })).reason, "invalid-refund");
    assert.equal(planWebhookRefund(paidOrder(), refundEntity({ amount: 0 })).reason, "invalid-refund");
    assert.equal(planWebhookRefund(paidOrder(), refundEntity({ amount: 10.5 })).reason, "invalid-refund");
    assert.equal(planWebhookRefund(null, refundEntity()).reason, "no-order");
  });

  it("marks it as made outside DSG when Razorpay sends no reason", () => {
    assert.equal(planWebhookRefund(paidOrder(), refundEntity({ notes: [] })).entry.reason, "Refunded outside DSG (Razorpay dashboard)");
  });
});

describe("recordWebhookRefund", () => {
  afterEach(() => mock.restoreAll());

  function setup(orderFields = {}, { locked = false } = {}) {
    const doc = Order.hydrate(paidOrder(orderFields));
    const calls = { lock: 0, release: 0, saved: 0 };
    mock.method(Order, "findOne", () => ({ select: () => ({ lean: async () => ({ _id: doc._id }) }) }));
    mock.method(Order, "findOneAndUpdate", async () => {
      calls.lock += 1;
      return locked ? null : doc;
    });
    mock.method(Order, "exists", async () => true);
    mock.method(Order, "updateOne", async () => {
      calls.release += 1;
      return { acknowledged: true };
    });
    const seqs = new Map();
    mock.method(Counter, "findByIdAndUpdate", (filter) => {
      const seq = (seqs.get(filter._id) || 0) + 1;
      seqs.set(filter._id, seq);
      return Promise.resolve({ _id: filter._id, seq });
    });
    doc.save = async function save() {
      await runPreSave(this);
      calls.saved += 1;
      return this;
    };
    return { doc, calls };
  }

  it("records the refund under the refund lock and issues a credit note", async () => {
    const { doc, calls } = setup();
    const result = await recordWebhookRefund(refundEntity());
    assert.equal(result.action, "recorded");
    assert.equal(result.creditNoteNumber, "CN/2026-27/0001");
    assert.equal(doc.refundedAmountInInr, 400);
    assert.equal(doc.refundStatus, "Partially Refunded");
    assert.equal(doc.paymentMeta.refunds.length, 1);
    assert.equal(doc.paymentMeta.razorpayRefundId, "rfnd_TEST1");
    assert.deepEqual(calls, { lock: 1, release: 1, saved: 1 });
  });

  it("a second delivery of the same refund changes nothing", async () => {
    const { doc, calls } = setup({ paymentMeta: { razorpayPaymentId: "pay_TEST1", refunds: [{ refundId: "rfnd_TEST1", amountMinor: 40000, creditNoteNumber: "CN/2026-27/0001" }] }, refundedAmountInInr: 400 });
    const result = await recordWebhookRefund(refundEntity());
    assert.equal(result.action, "ignore");
    assert.equal(result.reason, "already-recorded");
    assert.equal(doc.refundedAmountInInr, 400);
    assert.equal(calls.saved, 0);
    assert.equal(calls.release, 1);
  });

  it("backs off (409) while an admin refund holds the lock, so Razorpay retries", async () => {
    const { calls } = setup({}, { locked: true });
    await assert.rejects(recordWebhookRefund(refundEntity()), (err) => err.statusCode === 409);
    assert.equal(calls.saved, 0);
  });

  it("ignores refunds for payments that aren't store orders", async () => {
    mock.method(Order, "findOne", () => ({ select: () => ({ lean: async () => null }) }));
    assert.deepEqual(await recordWebhookRefund(refundEntity()), { action: "ignore", reason: "no-order" });
  });
});

describe("POST /api/payment/webhook refund.processed", () => {
  afterEach(() => {
    mock.restoreAll();
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
  });

  function signedRequest(body, secret) {
    const raw = Buffer.from(JSON.stringify(body));
    const signature = crypto.createHmac("sha256", secret).update(raw).digest("hex");
    return { body: raw, headers: { "x-razorpay-signature": signature, "x-razorpay-event-id": "evt_TEST1" } };
  }

  function fakeRes() {
    return {
      statusCode: 200,
      payload: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.payload = payload;
        return this;
      }
    };
  }

  it("verifies the signature, records the refund, and retries cleanly when busy", async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret";
    const { paymentWebhookHandler } = require("../routes/paymentWebhook");
    const body = { event: "refund.processed", payload: { refund: { entity: refundEntity() } } };

    // Bad signature is refused
    const bad = fakeRes();
    await paymentWebhookHandler({ body: Buffer.from(JSON.stringify(body)), headers: { "x-razorpay-signature": "00" } }, bad);
    assert.equal(bad.statusCode, 400);

    // Busy order: 500 so Razorpay retries, and the event record is removed so the retry is processed
    let deleted = 0;
    mock.method(WebhookEvent, "findOne", () => ({ lean: async () => null }));
    mock.method(WebhookEvent, "create", async () => ({}));
    mock.method(WebhookEvent, "deleteOne", async () => {
      deleted += 1;
    });
    mock.method(Order, "findOne", () => ({ select: () => ({ lean: async () => ({ _id: new mongoose.Types.ObjectId() }) }) }));
    mock.method(Order, "findOneAndUpdate", async () => null);
    mock.method(Order, "exists", async () => true);
    const busy = fakeRes();
    await paymentWebhookHandler(signedRequest(body, "test_webhook_secret"), busy);
    assert.equal(busy.statusCode, 500);
    assert.equal(deleted, 1);

    // Unknown payment: acknowledged, nothing recorded
    mock.method(Order, "findOne", () => ({ select: () => ({ lean: async () => null }) }));
    const unknown = fakeRes();
    await paymentWebhookHandler(signedRequest(body, "test_webhook_secret"), unknown);
    assert.equal(unknown.statusCode, 200);
    assert.deepEqual(unknown.payload, { ok: true, refund: "ignore", reason: "no-order" });
  });
});
