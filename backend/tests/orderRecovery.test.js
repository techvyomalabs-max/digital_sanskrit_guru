// Order recovery: when a customer pays but their browser never creates the order, the
// server creates it from the details saved at payment start (services/orderRecovery.js).
const { describe, it, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const mongoose = require("mongoose");

// ── Stand-ins for Razorpay and the price calculation, set before the routes load ──
let razorpayPayment = null;
let fetchCalls = 0;
const razorpayPath = require.resolve("../utils/razorpay");
require.cache[razorpayPath] = {
  id: razorpayPath,
  filename: razorpayPath,
  loaded: true,
  exports: () => ({
    payments: {
      fetch: async (id) => {
        fetchCalls += 1;
        return razorpayPayment && razorpayPayment.id === id ? { ...razorpayPayment } : null;
      },
      capture: async () => razorpayPayment
    }
  })
};
const orderTotals = require("../utils/orderTotals");
let totalsResult = null;
orderTotals.computeOrderTotals = async () => JSON.parse(JSON.stringify(totalsResult));
const stock = require("../utils/stock");
stock.reserveStockForOrder = async () => ({ ok: true });

const Order = require("../models/Order");
const User = require("../models/User");
const StoreSettings = require("../models/StoreSettings");
const PaymentIntent = require("../models/PaymentIntent");
const { placeOrder } = require("../routes/orderRoutes");
const { cleanOrderDraft } = require("../utils/orderDraft");
const { recoverOrderForIntent, recoverPaidCheckouts } = require("../services/orderRecovery");

function res() {
  return {
    statusCode: 200,
    body: null,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    }
  };
}
const chain = (value) => ({ lean: async () => value, select: () => chain(value) });

const userId = new mongoose.Types.ObjectId().toString();
const draft = {
  items: [{ product: "p1", name: "Gita Flipbook", price: 999, quantity: 1, isDigital: true }],
  total: 999,
  shipping: { name: "Asha", phone: "9999999999", address: "1 Road", city: "Mysuru", state: "Karnataka", pincode: "570001", country: "IN" },
  billing: { name: "Asha", email: "asha@example.com" },
  couponCode: "",
  isGift: false,
  currencyDisplay: { currency: "INR", amount: 999, detectedCountry: "IN" }
};

describe("cleanOrderDraft", () => {
  it("keeps only the order fields, never payment fields, and rejects junk", () => {
    const clean = cleanOrderDraft({ ...draft, paymentStatus: "Paid", razorpaySignature: "x", user: "someone-else" });
    assert.deepEqual(Object.keys(clean).sort(), Object.keys(draft).sort());
    assert.equal(cleanOrderDraft(null), null);
    assert.equal(cleanOrderDraft({ items: [] }), null);
    assert.equal(cleanOrderDraft({ ...draft, shipping: { $where: "1" } }), null, "no Mongo operators");
    assert.equal(cleanOrderDraft({ ...draft, billing: { note: "x".repeat(200 * 1024) } }), null, "size capped");
  });
});

describe("placeOrder for a recovered payment", () => {
  let created;
  beforeEach(() => {
    created = null;
    fetchCalls = 0;
    totalsResult = {
      normalizedItems: [{ product: new mongoose.Types.ObjectId(), name: "Gita Flipbook", price: 999, quantity: 1, isDigital: true, accessManual: true }],
      subtotal: 999, gstPercent: 0, gstAmount: 0, appliedCouponCode: "", discount: 0, deliveryCharge: 0,
      total: 999, fxRateToInr: 1, totalInInr: 999, taxDetails: {}, orderCurrency: "INR",
      chargeAmount: 999, chargeCurrency: "INR"
    };
    razorpayPayment = { id: "pay_1", order_id: "order_1", amount: 99900, currency: "INR", status: "captured", amount_refunded: 0 };
    mock.method(StoreSettings, "findOne", () => chain({}));
    mock.method(Order, "exists", async () => null);
    mock.method(Order, "create", async (doc) => {
      created = { ...doc, _id: new mongoose.Types.ObjectId(), items: doc.items };
      return created;
    });
    mock.method(Order, "updateOne", async () => ({}));
    mock.method(PaymentIntent, "updateOne", async () => ({ modifiedCount: 1 }));
    mock.method(User, "findById", () => chain(null));
  });
  afterEach(() => mock.restoreAll());

  const recoveryReq = (extra = {}) => ({
    serverRecovery: true,
    user: userId,
    headers: {},
    body: { ...draft, paymentStatus: "Paid", razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", ...extra }
  });

  it("creates the paid order after checking the payment with Razorpay (no browser signature)", async () => {
    const r = res();
    await placeOrder(recoveryReq(), r);
    assert.equal(r.statusCode, 201, JSON.stringify(r.body));
    assert.equal(fetchCalls, 1, "looked up at Razorpay");
    assert.equal(created.paymentStatus, "Paid");
    assert.equal(created.paymentMeta.razorpayPaymentId, "pay_1");
    assert.equal(created.paymentMeta.paidAmountMinor, 99900);
    assert.equal(String(created.user), userId);
  });

  it("refuses when Razorpay says a different amount was paid", async () => {
    razorpayPayment.amount = 50000;
    const r = res();
    await placeOrder(recoveryReq(), r);
    assert.equal(r.statusCode, 400);
    assert.equal(created, null);
  });

  it("refuses a payment that belongs to another checkout", async () => {
    razorpayPayment.order_id = "order_other";
    const r = res();
    await placeOrder(recoveryReq(), r);
    assert.equal(r.statusCode, 400);
    assert.equal(created, null);
  });

  it("a normal request can't skip the signature by claiming to be recovery", async () => {
    const req = recoveryReq();
    delete req.serverRecovery;
    req.body.serverRecovery = true; // anything in the body is ignored
    const r = res();
    await placeOrder(req, r);
    assert.equal(r.statusCode, 400);
    assert.match(r.body.message, /Payment reference is required/);
    assert.equal(fetchCalls, 0);
    assert.equal(created, null);
  });
});

describe("recoverOrderForIntent", () => {
  function fakeIntents(initial) {
    const rows = new Map(initial.map((r) => [String(r._id), { ...r, recovery: { attempts: 0, ...(r.recovery || {}) } }]));
    const matches = (row, q) =>
      Object.entries(q).every(([k, v]) => {
        if (k === "_id") return String(row._id) === String(v);
        if (k === "status") return row.status === v;
        if (k === "recovery.attempts") return row.recovery.attempts < v.$lt;
        return true;
      });
    const apply = (row, upd) => {
      for (const [k, v] of Object.entries(upd.$set || {})) {
        if (k.startsWith("recovery.")) row.recovery[k.slice(9)] = v;
        else row[k] = v;
      }
      for (const [k, v] of Object.entries(upd.$inc || {})) row.recovery[k.slice(9)] += v;
    };
    return {
      rows,
      findOneAndUpdate: async (q, upd) => {
        const row = [...rows.values()].find((r) => matches(r, q));
        if (!row) return null;
        apply(row, upd);
        return { ...row };
      },
      updateOne: async (q, upd) => {
        const row = [...rows.values()].find((r) => matches(r, q));
        if (row) apply(row, upd);
        return { modifiedCount: row ? 1 : 0 };
      }
    };
  }
  const intent = { _id: "i1", status: "captured", user: userId, razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", orderDraft: draft };
  const noOrder = { findOne: () => chain(null) };

  it("creates the order and links the payment to it", async () => {
    const PI = fakeIntents([intent]);
    let seen;
    const placeOrder = async (req, r) => {
      seen = req;
      r.status(201).json({ _id: "ord_new" });
    };
    const out = await recoverOrderForIntent(intent, { PaymentIntent: PI, Order: noOrder, placeOrder, logger: { info() {} } });
    assert.equal(out.action, "recovered");
    assert.equal(seen.serverRecovery, true);
    assert.equal(seen.body.paymentStatus, "Paid");
    assert.equal(seen.body.razorpayPaymentId, "pay_1");
    assert.equal(PI.rows.get("i1").status, "linked");
    assert.equal(PI.rows.get("i1").orderId, "ord_new");
  });

  it("if it can't, leaves the payment for the admin orphan alert and never tries again", async () => {
    const PI = fakeIntents([intent]);
    const placeOrder = async (_req, r) => r.status(400).json({ message: "Paid amount does not match the order total." });
    const out = await recoverOrderForIntent(intent, { PaymentIntent: PI, Order: noOrder, placeOrder, logger: { warn() {} } });
    assert.equal(out.action, "failed");
    const row = PI.rows.get("i1");
    assert.equal(row.status, "captured", "back to captured, so the 15-minute orphan check alerts the admins");
    assert.match(row.recovery.lastError, /does not match/);
    assert.equal(row.recovery.attempts, 1);
    const again = await recoverOrderForIntent(intent, { PaymentIntent: PI, Order: noOrder, placeOrder, logger: { warn() {} } });
    assert.equal(again.action, "skipped");
  });

  it("if the browser created the order meanwhile, just links it", async () => {
    const PI = fakeIntents([intent]);
    const withOrder = { findOne: () => chain({ _id: "ord_browser" }) };
    let called = false;
    const out = await recoverOrderForIntent(intent, {
      PaymentIntent: PI,
      Order: withOrder,
      placeOrder: async () => {
        called = true;
      }
    });
    assert.equal(out.action, "already-linked");
    assert.equal(called, false);
    assert.equal(PI.rows.get("i1").orderId, "ord_browser");
  });

  it("two workers at once: only one gets to try", async () => {
    const PI = fakeIntents([intent]);
    let tries = 0;
    const placeOrder = async (_req, r) => {
      tries += 1;
      await new Promise((ok) => setTimeout(ok, 10));
      r.status(201).json({ _id: "ord_x" });
    };
    const deps = { PaymentIntent: PI, Order: noOrder, placeOrder, logger: { info() {} } };
    const [a, b] = await Promise.all([recoverOrderForIntent(intent, deps), recoverOrderForIntent(intent, deps)]);
    assert.equal(tries, 1);
    assert.deepEqual([a.action, b.action].sort(), ["recovered", "skipped"]);
  });

  it("only looks at signed-in checkouts paid more than 3 minutes ago that have saved details", async () => {
    let query;
    const PI = {
      find: (q) => {
        query = q;
        return { sort: () => ({ limit: () => ({ lean: async () => [] }) }) };
      }
    };
    const now = new Date("2026-11-17T10:00:00Z");
    await recoverPaidCheckouts({ PaymentIntent: PI, Order: noOrder, placeOrder: async () => {}, now });
    assert.equal(query.status, "captured");
    assert.equal(query.mode, "checkout");
    assert.deepEqual(query.user, { $ne: null });
    assert.deepEqual(query.orderDraft, { $ne: null });
    assert.equal(query.capturedAt.$lte.toISOString(), "2026-11-17T09:57:00.000Z");
  });
});
