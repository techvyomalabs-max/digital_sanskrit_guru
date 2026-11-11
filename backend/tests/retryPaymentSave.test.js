const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const { applyPaidPaymentMeta } = require("../utils/paidPaymentMeta");

// An unpaid order as it comes back from the database (like one whose first payment failed).
function failedOrder(extraMeta = {}) {
  return Order.hydrate({
    _id: new mongoose.Types.ObjectId(),
    user: new mongoose.Types.ObjectId(),
    createdAt: new Date("2026-11-09T08:00:00Z"),
    items: [{ product: new mongoose.Types.ObjectId(), name: "Shabdarupa Sangraha – Paperback", price: 179, quantity: 2, image: "x" }],
    subtotal: 358,
    deliveryCharge: 44.84,
    total: 402.84,
    status: "Pending",
    paymentStatus: "Failed",
    shipping: { name: "S", phone: "9876543210", address: "84 NGEF", city: "Bengaluru", state: "Karnataka", pincode: "560038", country: "India" },
    paymentMeta: { razorpayOrderId: "order_FIRSTTRY01", razorpayPaymentId: "", razorpaySignature: "", paidAt: null, ...extraMeta },
    invoiceNumber: ""
  });
}

const verifiedPayment = { id: "pay_RETRYOK001", amount: 40284, currency: "inr" };

describe("Continue Payment: saving a paid retry", () => {
  before(() => {
    // The save hooks may look up invoice numbers; no database in tests.
    Order.exists = async () => null;
  });

  it("the old spread copy fails validation (the bug)", async () => {
    const order = failedOrder();
    order.paymentStatus = "Paid";
    order.paymentMeta = { ...(order.paymentMeta || {}), razorpayPaymentId: "pay_RETRYOK001" };
    await assert.rejects(order.validate(), /manualOverride/);
  });

  it("a verified retry passes validation and records the payment", async () => {
    const order = failedOrder();
    order.paymentStatus = "Paid";
    applyPaidPaymentMeta(order, {
      razorpayOrderId: "order_RETRY0001",
      razorpayPaymentId: "pay_RETRYOK001",
      razorpaySignature: "sig",
      verifiedPayment,
      now: new Date("2026-11-11T12:00:00Z")
    });
    await order.validate();
    const meta = order.toObject().paymentMeta;
    assert.equal(meta.razorpayOrderId, "order_RETRY0001");
    assert.equal(meta.razorpayPaymentId, "pay_RETRYOK001");
    assert.equal(meta.paidAmountMinor, 40284);
    assert.equal(meta.paidCurrency, "INR");
    assert.equal(meta.paidAt.toISOString(), "2026-11-11T12:00:00.000Z");
    assert.equal(meta.manualOverride?.by || "", "", "a customer payment is not a manual override");
  });

  it("keeps refunds and other payment details already on the order", async () => {
    const order = failedOrder({ refunds: [{ amount: 10, refundId: "rfnd_1", at: new Date("2026-11-10T00:00:00Z") }] });
    order.paymentStatus = "Paid";
    applyPaidPaymentMeta(order, { razorpayPaymentId: "pay_RETRYOK001", verifiedPayment });
    await order.validate();
    const meta = order.toObject().paymentMeta;
    assert.equal(meta.refunds.length, 1);
    assert.equal(meta.razorpayOrderId, "order_FIRSTTRY01", "keeps the earlier Razorpay order ID when none is sent");
  });

  it("an admin marking it paid records who did it and why", async () => {
    const order = failedOrder();
    order.paymentStatus = "Paid";
    applyPaidPaymentMeta(order, {
      manualOverride: { by: "admin@example.com", reason: "Paid by bank transfer, checked statement", paymentReference: "UTR123" },
      now: new Date("2026-11-11T12:00:00Z")
    });
    await order.validate();
    const override = order.toObject().paymentMeta.manualOverride;
    assert.equal(override.by, "admin@example.com");
    assert.equal(override.paymentReference, "UTR123");
    assert.equal(override.at.toISOString(), "2026-11-11T12:00:00.000Z");
  });
});
