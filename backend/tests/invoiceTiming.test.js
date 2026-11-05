const { describe, it, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const { isInvoiceDue, invoiceStateFor, invoiceDateFor, pendingInvoiceNote } = require("../utils/invoiceTiming");
const { cancellationRefundEligibility } = require("../utils/refunds");
const { damageClaimPlan, checkRefundReceipt, DAMAGE_KEEP_LIMIT_INR } = require("../utils/returnPolicy");

const Counter = mongoose.model("Counter");
const runPreSave = (doc) => Order.schema.s.hooks.execPre("save", doc, []);

const book = { _id: "b1", name: "Gita", category: "Books", price: 450, quantity: 1 };
const webVersion = { _id: "w1", name: "Gita Web Version", isDigital: true, price: 300, quantity: 1 };
const manualKindle = { _id: "k1", name: "Gita Kindle", isDigital: true, accessManual: true, price: 250, quantity: 1 };

describe("when the tax invoice is issued", () => {
  it("physical orders: only once shipped", () => {
    const order = { paymentStatus: "Paid", status: "Pending", items: [book] };
    assert.equal(isInvoiceDue(order), false);
    assert.equal(invoiceStateFor(order), "awaiting");
    assert.equal(isInvoiceDue({ ...order, shippedAt: new Date() }), true);
    assert.equal(isInvoiceDue({ ...order, status: "Delivered" }), true);
  });

  it("a combo with any physical item waits for shipping", () => {
    assert.equal(isInvoiceDue({ paymentStatus: "Paid", status: "Pending", items: [webVersion, book] }), false);
  });

  it("digital-only orders: at payment when access is instant, after the grant when manual", () => {
    assert.equal(isInvoiceDue({ paymentStatus: "Paid", status: "Pending", items: [webVersion] }), true);
    const manual = { paymentStatus: "Paid", status: "Pending", items: [webVersion, manualKindle] };
    assert.equal(isInvoiceDue(manual), false);
    assert.equal(isInvoiceDue({ ...manual, items: [webVersion, { ...manualKindle, accessGrantedAt: new Date() }] }), true);
  });

  it("never for unpaid or cancelled-before-dispatch orders", () => {
    assert.equal(isInvoiceDue({ paymentStatus: "Pending", status: "Pending", items: [webVersion] }), false);
    const cancelled = { paymentStatus: "Paid", status: "Cancelled", items: [book] };
    assert.equal(isInvoiceDue(cancelled), false);
    assert.equal(invoiceStateFor(cancelled), "not-required");
  });

  it("is dated the day the order was placed, even though it is issued at dispatch", () => {
    const placed = new Date("2026-11-02T06:00:00Z");
    assert.equal(invoiceDateFor({ items: [book], createdAt: placed, shippedAt: new Date("2026-11-06") }).toISOString(), placed.toISOString());
    assert.equal(invoiceDateFor({ items: [webVersion], createdAt: placed }).toISOString(), placed.toISOString());
  });

  it("the order summary says why it isn't a tax invoice yet", () => {
    assert.match(pendingInvoiceNote({ paymentStatus: "Paid", status: "Pending", items: [book] }), /when the order ships/);
    assert.match(pendingInvoiceNote({ paymentStatus: "Paid", status: "Pending", items: [manualKindle] }), /when access is given/);
    assert.match(pendingInvoiceNote({ paymentStatus: "Pending", items: [book] }), /payment not received/);
    assert.equal(pendingInvoiceNote({ invoiceNumber: "DSG/2026-27/0001" }), "");
  });
});

describe("Order save hook: invoice and credit note numbers", () => {
  afterEach(() => mock.restoreAll());

  function mockCounters() {
    const seqs = new Map();
    const asked = [];
    mock.method(Counter, "findByIdAndUpdate", (filter) => {
      asked.push(filter._id);
      const seq = (seqs.get(filter._id) || 0) + 1;
      seqs.set(filter._id, seq);
      return Promise.resolve({ _id: filter._id, seq });
    });
    return asked;
  }

  const loaded = (fields) =>
    Order.hydrate({ _id: new mongoose.Types.ObjectId(), total: 450, totalInInr: 450, createdAt: new Date("2026-11-02T06:00:00Z"), ...fields });

  it("a paid physical order gets no invoice until it ships; then it is dated the order date", async () => {
    const asked = mockCounters();
    const order = loaded({ paymentStatus: "Paid", status: "Pending", items: [book] });
    await runPreSave(order);
    assert.equal(order.invoiceNumber, undefined);
    assert.equal(order.invoiceState, "awaiting");

    order.status = "Shipped";
    order.shippedAt = new Date("2026-11-04T08:00:00Z");
    await runPreSave(order);
    assert.equal(order.invoiceNumber, "DSG/2026-27/0001");
    assert.equal(order.invoiceState, "issued");
    assert.equal(new Date(order.invoiceIssuedAt).toISOString(), "2026-11-02T06:00:00.000Z", "invoice date = order date");
    assert.ok(order.invoiceGeneratedAt instanceof Date);
    assert.deepEqual(asked, ["orderInvoice-2026-27"]);
  });

  it("a March order shipped in April is numbered in March's financial year (its invoice date)", async () => {
    mockCounters();
    const order = loaded({ paymentStatus: "Paid", status: "Shipped", shippedAt: new Date("2027-04-02T06:00:00Z"), createdAt: new Date("2027-03-30T06:00:00Z"), items: [book] });
    await runPreSave(order);
    assert.match(order.invoiceNumber, /^DSG\/2026-27\//);
  });

  it("a refund before the invoice gets no credit note; a refund after it does", async () => {
    mockCounters();
    const cancelled = loaded({ paymentStatus: "Paid", status: "Cancelled", items: [book] });
    cancelled.paymentMeta.refunds.push({ refundId: "rfnd_1", amountMinor: 45000, currency: "INR", at: new Date() });
    await runPreSave(cancelled);
    assert.equal(cancelled.invoiceNumber, undefined);
    assert.equal(cancelled.invoiceState, "not-required");
    assert.equal(cancelled.paymentMeta.refunds[0].creditNoteNumber, undefined);

    const shipped = loaded({ paymentStatus: "Paid", status: "Delivered", shippedAt: new Date(), items: [book] });
    shipped.paymentMeta.refunds.push({ refundId: "rfnd_2", amountMinor: 10000, currency: "INR", at: new Date("2026-11-08T06:00:00Z") });
    await runPreSave(shipped);
    assert.ok(shipped.invoiceNumber);
    assert.equal(shipped.paymentMeta.refunds[0].creditNoteNumber, "CN/2026-27/0001");
  });

  it("an older order keeps its invoice and state on an unrelated save", async () => {
    mockCounters();
    const old = loaded({ paymentStatus: "Paid", status: "Pending", items: [book], invoiceNumber: "DSG/2026-27/0003", invoiceIssuedAt: new Date("2026-10-01") });
    await runPreSave(old);
    assert.equal(old.invoiceNumber, "DSG/2026-27/0003");
    assert.equal(old.invoiceState, "");
  });
});

describe("full refund for a cancellation before dispatch", () => {
  const base = { status: "Cancelled", paymentStatus: "Paid", total: 600, totalInInr: 600, refundedAmountInInr: 0, refundStatus: "Pending" };

  it("is the whole amount still unrefunded", () => {
    assert.deepEqual(cancellationRefundEligibility(base), { ok: true, amount: 600 });
    assert.deepEqual(cancellationRefundEligibility({ ...base, refundedAmountInInr: 100 }), { ok: true, amount: 500 });
  });

  it("only for paid, cancelled, never-shipped orders not already refunded", () => {
    assert.equal(cancellationRefundEligibility({ ...base, status: "Pending" }).ok, false);
    assert.equal(cancellationRefundEligibility({ ...base, paymentStatus: "Pending" }).ok, false);
    assert.match(cancellationRefundEligibility({ ...base, shippedAt: new Date() }).message, /shipped/);
    assert.equal(cancellationRefundEligibility({ ...base, refundStatus: "Refunded" }).ok, false);
    assert.equal(cancellationRefundEligibility(null).ok, false);
  });
});

describe("damaged items", () => {
  it(`up to ₹${DAMAGE_KEEP_LIMIT_INR} the customer keeps it; above that it comes back`, () => {
    assert.deepEqual(damageClaimPlan({ price: 250, quantity: 1 }, "Damaged or defective product received"), { damaged: true, valueInInr: 250, keepItem: true });
    assert.equal(damageClaimPlan({ price: 150, quantity: 2 }, "Damaged or defective product received").keepItem, true, "₹300 exactly is kept (up to ₹300)");
    assert.equal(damageClaimPlan({ price: 301, quantity: 1 }, "Item arrived damaged").keepItem, false);
    assert.deepEqual(damageClaimPlan({ price: 100, quantity: 1 }, "Wrong item received"), { damaged: false, valueInInr: 100, keepItem: false });
  });

  it("a kept damaged item can be refunded without being received back", () => {
    const order = {
      status: "Delivered",
      items: [
        { _id: "a", price: 250, quantity: 1, returnRequest: { status: "Approved", keepItem: true } },
        { _id: "b", price: 900, quantity: 1, returnRequest: { status: "Approved", keepItem: false } }
      ]
    };
    assert.equal(checkRefundReceipt({ order, itemIds: ["a"] }).ok, true);
    assert.equal(checkRefundReceipt({ order, itemIds: ["b"] }).ok, false, "the ₹900 item must come back first");
  });
});

describe("replacements for damaged items", () => {
  const { replacementEligibility, deriveOrderRefundStatus } = require("../utils/returnPolicy");
  const order = { status: "Delivered" };

  it("up to ₹300: can be replaced straight away (item kept)", () => {
    const item = { price: 250, quantity: 1, returnRequest: { status: "Approved", damaged: true, keepItem: true } };
    assert.equal(replacementEligibility(order, item).ok, true);
  });

  it("above ₹300: only once the damaged item is received back", () => {
    const item = { price: 900, quantity: 1, returnRequest: { status: "Approved", damaged: true, keepItem: false } };
    assert.match(replacementEligibility(order, item).message, /received back/);
    assert.equal(replacementEligibility(order, { ...item, returnRequest: { ...item.returnRequest, status: "Received" } }).ok, true);
  });

  it("not for non-damage returns, settled claims or digital items", () => {
    assert.equal(replacementEligibility(order, { returnRequest: { status: "Received", damaged: false } }).ok, false);
    assert.equal(replacementEligibility(order, { returnRequest: { status: "Refunded", damaged: true, keepItem: true } }).ok, false);
    assert.equal(replacementEligibility(order, { isDigital: true, returnRequest: { damaged: true, keepItem: true } }).ok, false);
  });

  it("an order whose claims were all replaced owes no refund", () => {
    const replaced = { refundStatus: "Pending", items: [{ returnRequest: { status: "Replaced" } }, { returnRequest: { status: "Not Requested" } }] };
    assert.equal(deriveOrderRefundStatus(replaced), "Not Applicable");
  });
});

describe("return photo storage keys", () => {
  const { isReturnEvidenceKey, buildObjectKey } = require("../utils/mediaPresign");
  const config = { prefix: "dsg" };
  it("photos go to the private folder and only those keys are accepted", () => {
    const key = buildObjectKey({ prefix: "dsg", kind: "return-evidence", contentType: "image/jpeg" });
    assert.match(key, /^dsg\/private\/return-evidence\/[0-9a-f-]{36}\.jpg$/);
    assert.equal(isReturnEvidenceKey(key, config), true);
    assert.equal(isReturnEvidenceKey("dsg/product/123e4567-e89b-12d3-a456-426614174000.jpg", config), false);
    assert.equal(isReturnEvidenceKey("dsg/private/return-evidence/../x.jpg", config), false);
    assert.equal(isReturnEvidenceKey("https://cdn.example.com/dsg/private/return-evidence/123e4567-e89b-12d3-a456-426614174000.jpg", config), false);
    assert.equal(isReturnEvidenceKey(null, config), false);
  });
  it("product images keep their public folder", () => {
    assert.match(buildObjectKey({ prefix: "dsg", kind: "product", contentType: "image/png" }), /^dsg\/product\//);
  });
});
