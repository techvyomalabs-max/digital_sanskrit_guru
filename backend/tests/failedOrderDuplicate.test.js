// One checkout, a failed try then a successful retry in the Razorpay window: only the paid
// order may remain, and a leftover "Failed" order must not hide the payment from recovery.
const { describe, it, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

let razorpayPayment = null;
const razorpayPath = require.resolve("../utils/razorpay");
require.cache[razorpayPath] = {
  id: razorpayPath,
  filename: razorpayPath,
  loaded: true,
  exports: () => ({
    payments: {
      fetch: async (id) => (razorpayPayment && razorpayPayment.id === id ? { ...razorpayPayment } : null),
      capture: async () => razorpayPayment
    }
  })
};
const crypto = require("crypto");
process.env.RAZORPAY_KEY_SECRET = "test_secret";
process.env.RAZORPAY_KEY_ID = "rzp_test";
const orderTotals = require("../utils/orderTotals");
orderTotals.computeOrderTotals = async () => ({
  normalizedItems: [{ product: new mongoose.Types.ObjectId(), name: "Book", price: 179, quantity: 1, isDigital: false }],
  subtotal: 179, gstPercent: 0, gstAmount: 0, appliedCouponCode: "", discount: 0, deliveryCharge: 33.04,
  total: 212.04, fxRateToInr: 1, totalInInr: 212.04, taxDetails: {}, orderCurrency: "INR",
  chargeAmount: 212.04, chargeCurrency: "INR"
});
require("../utils/stock").reserveStockForOrder = async () => ({ ok: true });

const Order = require("../models/Order");
const User = require("../models/User");
const StoreSettings = require("../models/StoreSettings");
const PaymentIntent = require("../models/PaymentIntent");
const GiftPass = require("../models/GiftPass");
const { placeOrder } = require("../routes/orderRoutes");

const chain = (v) => ({ lean: async () => v, select: () => chain(v) });
const res = () => ({
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
});
const userId = new mongoose.Types.ObjectId().toString();
const body = {
  items: [{ product: "p1", quantity: 1 }],
  shipping: { name: "S", address: "x", city: "Mysuru", country: "IN" },
  billing: { name: "S" }
};

describe("failed try, then a successful retry in the same Razorpay window", () => {
  let created, deleted, intent;
  beforeEach(() => {
    created = [];
    deleted = null;
    intent = { razorpayOrderId: "order_PqR123456789AB", user: userId, status: "created", razorpayPaymentId: "", orderId: null, save: async () => {} };
    razorpayPayment = { id: "pay_PqR123456789AB", order_id: "order_PqR123456789AB", amount: 21204, currency: "INR", status: "captured", amount_refunded: 0 };
    mock.method(StoreSettings, "findOne", () => chain({}));
    mock.method(PaymentIntent, "findOne", async () => intent);
    mock.method(PaymentIntent, "updateOne", async () => ({ modifiedCount: 1 }));
    mock.method(User, "findById", () => chain(null));
    // Past orders, for the "already own this digital item" check: none
    const none = { select: () => none, lean: async () => [], populate: () => none, sort: () => none, then: (ok) => ok([]) };
    mock.method(Order, "find", () => none);
    mock.method(GiftPass, "find", () => none);
    mock.method(Order, "updateOne", async () => ({}));
    mock.method(Order, "create", async (doc) => {
      const o = { ...doc, _id: new mongoose.Types.ObjectId() };
      created.push(o);
      return o;
    });
    mock.method(Order, "deleteMany", async (q) => {
      deleted = q;
      return { deletedCount: 1 };
    });
  });
  afterEach(() => mock.restoreAll());

  it("no Failed order once the checkout is paid", async () => {
    intent.status = "captured";
    intent.razorpayPaymentId = "pay_PqR123456789AB";
    mock.method(Order, "exists", async () => null);
    const r = res();
    await placeOrder({ user: userId, headers: {}, body: { ...body, paymentStatus: "Failed", razorpayOrderId: "order_PqR123456789AB" } }, r);
    assert.equal(r.statusCode, 409);
    assert.equal(r.body.code, "CHECKOUT_ALREADY_PAID");
    assert.equal(created.length, 0);
  });

  it("no Failed order when a paid order already exists for the checkout (webhook not in yet)", async () => {
    mock.method(Order, "exists", async (q) => (q.paymentStatus === "Paid" ? { _id: "paid" } : null));
    const r = res();
    await placeOrder({ user: userId, headers: {}, body: { ...body, paymentStatus: "Failed", razorpayOrderId: "order_PqR123456789AB" } }, r);
    assert.equal(r.statusCode, 409);
    assert.equal(created.length, 0);
  });

  it("a Failed order is still saved when the checkout really wasn't paid", async () => {
    mock.method(Order, "exists", async () => null);
    const r = res();
    await placeOrder({ user: userId, headers: {}, body: { ...body, paymentStatus: "Failed", razorpayOrderId: "order_PqR123456789AB" } }, r);
    assert.equal(r.statusCode, 201);
    assert.equal(created[0].paymentStatus, "Failed");
  });

  it("the paid order removes the leftover Failed order of the same checkout, and nothing else", async () => {
    mock.method(Order, "exists", async () => null);
    const sig = crypto.createHmac("sha256", "test_secret").update("order_PqR123456789AB|pay_PqR123456789AB").digest("hex");
    const r = res();
    await placeOrder(
      { user: userId, headers: {}, body: { ...body, paymentStatus: "Paid", razorpayOrderId: "order_PqR123456789AB", razorpayPaymentId: "pay_PqR123456789AB", razorpaySignature: sig } },
      r
    );
    assert.equal(r.statusCode, 201, JSON.stringify(r.body));
    await new Promise((ok) => setImmediate(ok));
    assert.ok(deleted, "cleanup ran");
    assert.equal(deleted.user, userId);
    assert.equal(deleted["paymentMeta.razorpayOrderId"], "order_PqR123456789AB");
    assert.deepEqual(deleted.paymentStatus, { $in: ["Failed", "Pending"] });
    assert.equal(String(deleted._id.$ne), String(created[0]._id), "never the paid order itself");
    assert.ok(JSON.stringify(deleted.$or).includes("razorpayPaymentId"), "only orders without a payment");
  });
});

describe("a leftover Failed order doesn't hide a paid checkout", () => {
  afterEach(() => mock.restoreAll());

  it("the orphan check only counts a PAID order for the checkout", async () => {
    const queries = [];
    mock.method(PaymentIntent, "find", async () => [
      { _id: "i1", status: "captured", razorpayOrderId: "order_PqR123456789AB", razorpayPaymentId: "pay_PqR123456789AB", capturedAt: new Date(0) }
    ]);
    mock.method(Order, "findOne", (q) => {
      queries.push(q);
      return chain(null);
    });
    mock.method(PaymentIntent, "updateMany", async () => ({}));
    mock.method(PaymentIntent, "findOneAndUpdate", async () => null);
    const reconcilerPath = require.resolve("../services/orderRecovery");
    require.cache[reconcilerPath] = { id: reconcilerPath, filename: reconcilerPath, loaded: true, exports: { recoverPaidCheckouts: async () => [] } };
    const { runPaymentReconciliation } = require("../services/paymentReconciler");
    await runPaymentReconciliation();
    const byCheckout = queries.flatMap((q) => q.$or || []).find((c) => c["paymentMeta.razorpayOrderId"]);
    assert.ok(byCheckout);
    assert.equal(byCheckout.paymentStatus, "Paid");
  });
});
