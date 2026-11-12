const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  cleanRazorpayOrderId,
  cleanRazorpayPaymentId,
  recordFailedPayment,
  findOwnedIntent,
  noteUnpaidCheckout,
  linkPaidCheckout,
  describePaymentAttempts
} = require("../utils/failedPayments");

const USER = "6730f1a2b3c4d5e6f7a8b9c1";
const OTHER_USER = "6730f1a2b3c4d5e6f7a8b9c2";
const ORDER = "6730f1a2b3c4d5e6f7a8b9d0";

// A small in-memory stand-in for the PaymentIntent model.
function fakeIntents(rows) {
  const docs = rows.map((r) => ({ ...r, saves: 0 }));
  const updates = [];
  const model = {
    docs,
    updates,
    async findOneAndUpdate(filter, update, opts) {
      updates.push({ filter, update, opts });
      const doc = docs.find((d) => d.razorpayOrderId === filter.razorpayOrderId);
      if (doc) {
        doc.failedAttempts = (doc.failedAttempts || 0) + (update.$inc?.failedAttempts || 0);
        doc.lastFailure = update.$set.lastFailure;
      }
      return doc || null;
    }
  };
  // findOne works both as `await findOne()` (a document with save) and `findOne().select().lean()`
  model.findOne = (filter) => {
    const doc = docs.find((d) => d.razorpayOrderId === filter.razorpayOrderId) || null;
    if (doc && !doc.save) {
      doc.save = async () => {
        doc.saves += 1;
        return doc;
      };
    }
    const promise = Promise.resolve(doc);
    promise.select = () => ({ lean: async () => doc });
    return promise;
  };
  return model;
}

const failedPayment = (overrides = {}) => ({
  id: "pay_FAILED001",
  order_id: "order_CHECKOUT01",
  status: "failed",
  amount: 59900,
  currency: "INR",
  method: "upi",
  error_description: "Payment was declined by the bank",
  error_reason: "payment_declined",
  created_at: 1793000000,
  ...overrides
});

describe("failed payments: ID checks", () => {
  it("accepts only real Razorpay order and payment IDs", () => {
    assert.equal(cleanRazorpayOrderId(" order_ABC123def "), "order_ABC123def");
    assert.equal(cleanRazorpayOrderId("pay_ABC123def"), "");
    assert.equal(cleanRazorpayOrderId("order_$where"), "");
    assert.equal(cleanRazorpayPaymentId("pay_ABC123def"), "pay_ABC123def");
    assert.equal(cleanRazorpayPaymentId({ $ne: "" }), "");
  });
});

describe("failed payments: recording", () => {
  it("records a failed payment on its checkout", async () => {
    const PaymentIntent = fakeIntents([{ razorpayOrderId: "order_CHECKOUT01", user: USER }]);
    const result = await recordFailedPayment(failedPayment(), { PaymentIntent });
    assert.equal(result.recorded, true);
    assert.equal(PaymentIntent.docs[0].failedAttempts, 1);
    assert.equal(PaymentIntent.docs[0].lastFailure.paymentId, "pay_FAILED001");
    assert.equal(PaymentIntent.docs[0].lastFailure.description, "Payment was declined by the bank");
  });

  it("counts the same payment once when both the webhook and the checkout page report it", async () => {
    const PaymentIntent = fakeIntents([{ razorpayOrderId: "order_CHECKOUT01", user: USER }]);
    await recordFailedPayment(failedPayment(), { PaymentIntent });
    const again = await recordFailedPayment(failedPayment(), { PaymentIntent });
    assert.equal(again.recorded, false);
    assert.equal(PaymentIntent.docs[0].failedAttempts, 1);
  });
});

describe("failed payments: customer's checkout", () => {
  it("trusts a Razorpay order ID only if it is this customer's checkout", async () => {
    const PaymentIntent = fakeIntents([{ razorpayOrderId: "order_CHECKOUT01", user: USER }]);
    assert.ok(await findOwnedIntent({ razorpayOrderId: "order_CHECKOUT01", userId: USER }, { PaymentIntent }));
    assert.equal(await findOwnedIntent({ razorpayOrderId: "order_CHECKOUT01", userId: OTHER_USER }, { PaymentIntent }), null);
    assert.equal(await findOwnedIntent({ razorpayOrderId: "order_UNKNOWN01", userId: USER }, { PaymentIntent }), null);
    assert.equal(await findOwnedIntent({ razorpayOrderId: "", userId: USER }, { PaymentIntent }), null);
  });

  it("refuses a checkout already tied to a different order", async () => {
    const PaymentIntent = fakeIntents([{ razorpayOrderId: "order_CHECKOUT01", user: USER, orderId: "6730f1a2b3c4d5e6f7a8b9ff" }]);
    assert.equal(await findOwnedIntent({ razorpayOrderId: "order_CHECKOUT01", userId: USER, orderId: ORDER }, { PaymentIntent }), null);
  });

  it("links the checkout to the saved order and records the failure after checking it with Razorpay", async () => {
    const PaymentIntent = fakeIntents([{ razorpayOrderId: "order_CHECKOUT01", user: USER, orderId: null }]);
    const fetched = [];
    const result = await noteUnpaidCheckout(
      { razorpayOrderId: "order_CHECKOUT01", failedPaymentId: "pay_FAILED001", userId: USER, orderId: ORDER },
      { PaymentIntent, fetchPayment: async (id) => (fetched.push(id), failedPayment()) }
    );
    assert.deepEqual(result, { linked: true, recorded: true });
    assert.equal(PaymentIntent.docs[0].orderId, ORDER);
    assert.deepEqual(fetched, ["pay_FAILED001"]);
    assert.equal(PaymentIntent.docs[0].lastFailure.paymentId, "pay_FAILED001");
  });

  it("ignores a payment ID that Razorpay says belongs to another checkout or did not fail", async () => {
    for (const payment of [failedPayment({ order_id: "order_SOMEONEELSE" }), failedPayment({ status: "captured" }), null]) {
      const PaymentIntent = fakeIntents([{ razorpayOrderId: "order_CHECKOUT01", user: USER, orderId: null }]);
      const result = await noteUnpaidCheckout(
        { razorpayOrderId: "order_CHECKOUT01", failedPaymentId: "pay_FAILED001", userId: USER, orderId: ORDER },
        { PaymentIntent, fetchPayment: async () => payment }
      );
      assert.equal(result.recorded, false);
      assert.equal(PaymentIntent.docs[0].failedAttempts, undefined);
    }
  });

  it("an abandoned checkout (window closed) is linked without any payment ID", async () => {
    const PaymentIntent = fakeIntents([{ razorpayOrderId: "order_CHECKOUT01", user: USER, orderId: null }]);
    let calledRazorpay = false;
    const result = await noteUnpaidCheckout(
      { razorpayOrderId: "order_CHECKOUT01", failedPaymentId: "", userId: USER, orderId: ORDER },
      { PaymentIntent, fetchPayment: async () => ((calledRazorpay = true), null) }
    );
    assert.deepEqual(result, { linked: true, recorded: false });
    assert.equal(calledRazorpay, false);
  });

  it("never throws, even if Razorpay is down", async () => {
    const PaymentIntent = fakeIntents([{ razorpayOrderId: "order_CHECKOUT01", user: USER, orderId: null }]);
    const result = await noteUnpaidCheckout(
      { razorpayOrderId: "order_CHECKOUT01", failedPaymentId: "pay_FAILED001", userId: USER, orderId: ORDER },
      { PaymentIntent, fetchPayment: async () => { throw new Error("timeout"); }, logger: { warn() {} } }
    );
    assert.equal(result.recorded, false);
  });
});

describe("failed payments: admin order page", () => {
  it("describes each checkout, newest first", () => {
    const attempts = describePaymentAttempts([
      { razorpayOrderId: "order_FIRST", mode: "checkout", status: "created", failedAttempts: 2, createdAt: new Date("2026-11-10T05:00:00Z"),
        lastFailure: { paymentId: "pay_F1", description: "Payment was declined by the bank", method: "card" } },
      { razorpayOrderId: "order_CLOSED", mode: "retry", status: "created", createdAt: new Date("2026-11-10T06:00:00Z") },
      { razorpayOrderId: "order_PAID", mode: "retry", status: "linked", razorpayPaymentId: "pay_OK", createdAt: new Date("2026-11-10T07:00:00Z") }
    ]);
    assert.deepEqual(attempts.map((a) => [a.razorpayOrderId, a.outcome]), [
      ["order_PAID", "paid"],
      ["order_CLOSED", "closed"],
      ["order_FIRST", "failed"]
    ]);
    assert.equal(attempts[0].razorpayPaymentId, "pay_OK");
    assert.equal(attempts[1].lastFailure, null);
    assert.equal(attempts[2].lastFailure.paymentId, "pay_F1");
    assert.equal(attempts[2].failedAttempts, 2);
  });
});

describe("paid checkouts", () => {
  it("marks the checkout paid and tied to the order (no webhook needed)", async () => {
    const calls = [];
    const PaymentIntent = { updateOne: async (filter, update) => (calls.push({ filter, update }), { modifiedCount: 1 }) };
    const ok = await linkPaidCheckout(
      { razorpayOrderId: "order_PAIDCHK01", razorpayPaymentId: "pay_PAIDCHK01", orderId: ORDER },
      { PaymentIntent }
    );
    assert.equal(ok, true);
    assert.deepEqual(calls[0].filter, { razorpayOrderId: "order_PAIDCHK01", status: { $in: ["created", "captured"] } });
    assert.deepEqual(calls[0].update, { $set: { status: "linked", razorpayPaymentId: "pay_PAIDCHK01", orderId: ORDER } });
  });

  it("ignores bad IDs and never throws", async () => {
    let called = false;
    const PaymentIntent = { updateOne: async () => { called = true; throw new Error("db down"); } };
    assert.equal(await linkPaidCheckout({ razorpayOrderId: "nope" }, { PaymentIntent }), false);
    assert.equal(called, false);
    assert.equal(await linkPaidCheckout({ razorpayOrderId: "order_PAIDCHK01" }, { PaymentIntent, logger: { warn() {} } }), false);
  });

  it("the admin page shows the order's own payment as paid even if the webhook never updated it", () => {
    const [attempt] = describePaymentAttempts(
      [{ razorpayOrderId: "order_LOCAL0001", mode: "checkout", status: "created", createdAt: new Date() }],
      { paidRazorpayOrderId: "order_LOCAL0001", paidRazorpayPaymentId: "pay_LOCAL0001" }
    );
    assert.equal(attempt.outcome, "paid");
    assert.equal(attempt.razorpayPaymentId, "pay_LOCAL0001");
  });

  it("another unpaid checkout on the same order still shows as not paid", () => {
    const attempts = describePaymentAttempts(
      [
        { razorpayOrderId: "order_PAIDONE01", status: "created", createdAt: new Date("2026-11-12T05:00:00Z") },
        { razorpayOrderId: "order_CLOSED001", status: "created", createdAt: new Date("2026-11-12T04:00:00Z") }
      ],
      { paidRazorpayOrderId: "order_PAIDONE01", paidRazorpayPaymentId: "pay_PAIDONE01" }
    );
    assert.deepEqual(attempts.map((a) => a.outcome), ["paid", "closed"]);
  });
});
