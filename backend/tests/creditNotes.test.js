const { describe, it, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const { lineTax } = require("../utils/tax");
const { formatCreditNoteNumber, creditNoteCounterId } = require("../utils/invoiceNumber");
const { buildCreditNote, creditNoteRefunds } = require("../utils/invoiceData");
const { generateCreditNotePdfBuffer } = require("../utils/invoicePdfGenerator");
const { buildFinanceReport, CREDIT_NOTE_HEADERS } = require("../utils/financeReports");

const Counter = mongoose.model("Counter");
const runPreSave = (doc) => Order.schema.s.hooks.execPre("save", doc, []);

/** Counter mock: each id counts up from 1, and the ids asked for are recorded. */
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

/** An order as if loaded from the database (so the save hook knows what it was). */
function loaded(fields) {
  const doc = Order.hydrate({ _id: new mongoose.Types.ObjectId(), items: [], total: 100, ...fields });
  return doc;
}

describe("credit note numbers", () => {
  afterEach(() => mock.restoreAll());

  it("use their own series per financial year, within the 16-character GST limit", () => {
    const n = formatCreditNoteNumber(new Date("2026-11-03T10:00:00+05:30"), 1);
    assert.equal(n, "CN/2026-27/0001");
    assert.ok(n.length <= 16);
    assert.equal(formatCreditNoteNumber(new Date("2027-04-01T00:30:00+05:30"), 12), "CN/2027-28/0012");
    assert.equal(creditNoteCounterId(new Date("2027-03-31T23:00:00+05:30")), "creditNote-2026-27");
  });

  it("are given to each new refund, oldest first, dated by the refund", async () => {
    const asked = mockCounters();
    const order = loaded({ paymentStatus: "Paid", invoiceNumber: "DSG/2026-27/0001", invoiceIssuedAt: new Date("2026-11-01") });
    order.paymentMeta.refunds.push(
      { refundId: "rfnd_b", amountMinor: 5000, currency: "INR", at: new Date("2026-11-05T10:00:00Z") },
      { refundId: "rfnd_a", amountMinor: 2000, currency: "INR", at: new Date("2026-11-04T10:00:00Z") }
    );
    await runPreSave(order);
    const [b, a] = order.paymentMeta.refunds;
    assert.equal(a.creditNoteNumber, "CN/2026-27/0001");
    assert.equal(b.creditNoteNumber, "CN/2026-27/0002");
    assert.equal(new Date(a.creditNoteIssuedAt).toISOString(), "2026-11-04T10:00:00.000Z");
    assert.deepEqual(asked, ["creditNote-2026-27", "creditNote-2026-27"]);

    // Saving again doesn't renumber
    order.paymentMeta.refunds.push({ refundId: "rfnd_c", amountMinor: 100, currency: "INR", at: new Date("2026-11-06T10:00:00Z") });
    await runPreSave(order);
    assert.equal(order.paymentMeta.refunds[0].creditNoteNumber, "CN/2026-27/0002");
    assert.equal(order.paymentMeta.refunds[2].creditNoteNumber, "CN/2026-27/0003");
  });
});

describe("payment lock and history", () => {
  afterEach(() => mock.restoreAll());

  it("a paid order can't go back to Pending or Failed", async () => {
    mockCounters();
    for (const status of ["Paid", "Refunded"]) {
      for (const next of ["Pending", "Failed"]) {
        const order = loaded({ paymentStatus: status, invoiceNumber: "DSG/2026-27/0001", invoiceIssuedAt: new Date("2026-11-01") });
        order.paymentStatus = next;
        await assert.rejects(runPreSave(order), (err) => err.statusCode === 409 && /issue a refund/.test(err.message), `${status} -> ${next}`);
      }
    }
    // Paid -> Refunded is allowed
    const refunded = loaded({ paymentStatus: "Paid", invoiceNumber: "DSG/2026-27/0001", invoiceIssuedAt: new Date("2026-11-01") });
    refunded.paymentStatus = "Refunded";
    await runPreSave(refunded);
  });

  it("an issued invoice number or date can't change", async () => {
    mockCounters();
    const order = loaded({ paymentStatus: "Paid", invoiceNumber: "DSG/2026-27/0001", invoiceIssuedAt: new Date("2026-11-01") });
    order.invoiceNumber = "DSG/2026-27/0099";
    await assert.rejects(runPreSave(order), /invoice number/);
    const dated = loaded({ paymentStatus: "Paid", invoiceNumber: "DSG/2026-27/0001", invoiceIssuedAt: new Date("2026-11-01") });
    dated.invoiceIssuedAt = new Date("2026-12-01");
    await assert.rejects(runPreSave(dated), /invoice date/);
  });

  it("records every payment status change with who and how", async () => {
    mockCounters();
    const fresh = new Order({ items: [], total: 100, paymentStatus: "Failed" });
    await runPreSave(fresh);
    assert.equal(fresh.paymentHistory.length, 1);
    assert.equal(fresh.paymentHistory[0].to, "Failed");
    assert.equal(fresh.paymentHistory[0].source, "checkout");

    const order = loaded({ paymentStatus: "Pending" });
    order.paymentStatus = "Paid";
    order.$locals.paymentChange = { by: "admin@example.com", source: "manual-override", reference: "UPI-123", note: "Paid by UPI at the event" };
    await runPreSave(order);
    const h = order.paymentHistory[0];
    assert.deepEqual([h.from, h.to, h.by, h.source, h.reference, h.note], ["Pending", "Paid", "admin@example.com", "manual-override", "UPI-123", "Paid by UPI at the event"]);
    assert.ok(order.invoiceNumber, "marking paid issues the invoice");

    // No change, no entry
    const same = loaded({ paymentStatus: "Pending" });
    same.status = "Shipped";
    await runPreSave(same);
    assert.equal(same.paymentHistory.length, 0);
  });
});

describe("credit note document", () => {
  const seller = { legalName: "Vyoma", gstin: "29AAATV1234F1Z8", state: "Karnataka", stateCode: "29" };
  const items = [
    { name: "Web Version", category: "Web Version", price: 1180, quantity: 1, tax: lineTax({ gross: 1180, rate: 18, isLocal: true }) },
    { name: "Book", category: "Books", price: 500, quantity: 1, tax: lineTax({ gross: 500, rate: 0, isLocal: true }) }
  ];
  const order = {
    _id: "6730f1a2b3c4d5e6f7a8b9c0",
    invoiceNumber: "DSG/2026-27/0005",
    invoiceIssuedAt: "2026-11-02T06:00:00Z",
    paymentStatus: "Paid",
    items,
    deliveryCharge: 60,
    total: 1740,
    totalInInr: 1740,
    currencyDisplay: { currency: "INR" },
    taxDetails: { isLocal: true },
    sellerDetails: seller,
    shipping: { name: "A", address: "1 Road", city: "Bengaluru", state: "Karnataka", pincode: "560001", country: "India" },
    paymentMeta: {
      razorpayPaymentId: "pay_1",
      refunds: [
        { refundId: "rfnd_2", amountMinor: 104000, currency: "INR", method: "razorpay", reason: "Rest", at: new Date("2026-11-06"), creditNoteNumber: "CN/2026-27/0002", creditNoteIssuedAt: new Date("2026-11-06") },
        { refundId: "", amountMinor: 70000, currency: "INR", method: "manual", reference: "manual", reason: "Book damaged", at: new Date("2026-11-05"), creditNoteNumber: "CN/2026-27/0001", creditNoteIssuedAt: new Date("2026-11-05") },
        { refundId: "", amountMinor: 100, currency: "INR", at: new Date("2026-11-01") }
      ]
    }
  };

  it("lists refunds with a credit note, oldest first", () => {
    assert.deepEqual(creditNoteRefunds(order).map((r) => r.creditNoteNumber), ["CN/2026-27/0001", "CN/2026-27/0002"]);
  });

  it("spreads the refund over the lines so it adds up exactly", () => {
    const [first, second] = creditNoteRefunds(order);
    const a = buildCreditNote(order, first);
    assert.equal(a.creditNote.number, "CN/2026-27/0001");
    assert.equal(a.totals.grandTotal, 700);
    assert.equal(Math.round((a.totals.taxable + a.totals.tax + a.totals.deliveryCharge) * 100) / 100, 700);
    assert.equal(Math.round((a.totals.cgst + a.totals.sgst) * 100) / 100, a.totals.tax);
    assert.equal(a.creditNote.isFull, false);
    assert.equal(a.creditNote.method, "Refunded outside Razorpay");
    assert.equal(a.creditNote.reference, "");
    assert.equal(a.amountInWords, "Rupees Seven Hundred Only");

    const b = buildCreditNote(order, second);
    assert.equal(b.totals.grandTotal, 1040);
    assert.equal(b.creditNote.reference, "rfnd_2");

    const full = buildCreditNote(order, { ...first, amountMinor: 174000 });
    assert.equal(full.creditNote.isFull, true);
    assert.equal(full.totals.tax, 180);
    assert.equal(full.totals.deliveryCharge, 60);
  });

  it("renders a PDF", async () => {
    const pdf = await generateCreditNotePdfBuffer(order, creditNoteRefunds(order)[0]);
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  });

  it("the credit notes report shows the credit note number", () => {
    const r = buildFinanceReport("credit-notes", {
      refundedOrders: [{ ...order, refundedAmountInInr: 1741 }],
      period: { fromStr: "2026-11-01", toStr: "2026-11-30", from: new Date("2026-10-31T18:30:00Z"), to: new Date("2026-11-30T18:30:00Z") }
    });
    const numbers = r.rows.map((row) => row[CREDIT_NOTE_HEADERS.indexOf("Credit Note No")]);
    assert.ok(numbers.includes("CN/2026-27/0001"));
    assert.ok(numbers.includes("CN/2026-27/0002"));
  });
});

describe("GET /api/orders/:id/credit-notes/:n", () => {
  const express = require("express");
  const jwt = require("jsonwebtoken");
  const http = require("node:http");
  const User = require("../models/User");
  const StoreSettings = require("../models/StoreSettings");

  afterEach(() => mock.restoreAll());

  const owner = "6730f1a2b3c4d5e6f7a8b9c1";
  const other = "6730f1a2b3c4d5e6f7a8b9c2";
  const chain = (v) => ({ select: () => chain(v), lean: async () => v, populate: () => chain(v) });
  const order = {
    _id: "6730f1a2b3c4d5e6f7a8b9c0",
    user: owner,
    invoiceNumber: "DSG/2026-27/0005",
    paymentStatus: "Paid",
    items: [{ name: "Book", category: "Books", price: 500, quantity: 1, tax: lineTax({ gross: 500, rate: 0, isLocal: true }) }],
    total: 500,
    totalInInr: 500,
    sellerDetails: { legalName: "Vyoma", gstin: "29AAATV1234F1Z8", state: "Karnataka" },
    shipping: { name: "A", address: "1 Road", city: "Bengaluru", state: "Karnataka", country: "India" },
    paymentMeta: { refunds: [{ refundId: "rfnd_1", amountMinor: 20000, currency: "INR", at: new Date("2026-11-05"), creditNoteNumber: "CN/2026-27/0001" }] }
  };

  async function call(viewer, n) {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
    const users = { [owner]: { _id: owner, name: "Owner" }, [other]: { _id: other } };
    mock.method(User, "findById", (id) => chain(users[String(id)] || null));
    mock.method(Order, "findById", () => chain(order));
    mock.method(StoreSettings, "findOne", () => chain({}));
    const app = express();
    app.use("/api/orders", require("../routes/orderRoutes"));
    const server = app.listen(0);
    try {
      const token = jwt.sign({ id: viewer }, process.env.JWT_SECRET, { algorithm: "HS256" });
      return await new Promise((resolve, reject) => {
        http.get({ port: server.address().port, path: `/api/orders/${order._id}/credit-notes/${n}`, headers: { Authorization: `Bearer ${token}` } }, (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => resolve({ status: res.statusCode, disposition: res.headers["content-disposition"], body: Buffer.concat(chunks) }));
        }).on("error", reject);
      });
    } finally {
      server.close();
    }
  }

  it("gives the customer their credit note, and nobody else's", async () => {
    const res = await call(owner, 1);
    assert.equal(res.status, 200);
    assert.match(res.disposition, /CN-2026-27-0001\.pdf/);
    assert.equal(res.body.subarray(0, 5).toString(), "%PDF-");
    assert.equal((await call(owner, 2)).status, 404);
    assert.equal((await call(owner, "x")).status, 404);
    assert.equal((await call(other, 1)).status, 404);
  });
});

describe("item returns", () => {
  const { buildInvoice, allocateRefund } = require("../utils/invoiceData");
  const items = [
    { product: "web1", name: "Web Version", category: "Web Version", price: 1180, quantity: 1, tax: lineTax({ gross: 1180, rate: 18, isLocal: false }) },
    { product: "book1", name: "Book", category: "Books", price: 500, quantity: 1, tax: lineTax({ gross: 500, rate: 0, isLocal: false }) }
  ];
  const order = {
    _id: "6730f1a2b3c4d5e6f7a8b9d0",
    invoiceNumber: "DSG/2026-27/0009",
    paymentStatus: "Paid",
    items,
    deliveryCharge: 60,
    total: 1740,
    totalInInr: 1740,
    refundedAmountInInr: 450,
    currencyDisplay: { currency: "INR" },
    taxDetails: { isLocal: false },
    sellerDetails: { legalName: "Vyoma", gstin: "29AAATV1234F1Z8", state: "Karnataka" },
    shipping: { name: "A", address: "1 Road", city: "Kochi", state: "Kerala", pincode: "682001", country: "India" },
    paymentMeta: {
      refunds: [
        // The book came back; Rs 50 return shipping was kept
        { refundId: "rfnd_book", amountMinor: 45000, currency: "INR", method: "razorpay", reason: "Customer choice return: 1 item(s)", at: new Date("2026-11-07"), creditNoteNumber: "CN/2026-27/0003", itemIds: ["book1"] }
      ]
    }
  };

  it("reverse tax only on the returned items", () => {
    const inv = buildInvoice(order);
    const a = allocateRefund(order, inv, 450, ["book1"]);
    assert.equal(a.itemLevel, true);
    assert.deepEqual(a.lines.map((l) => l.total), [0, 450]);
    assert.equal(a.lines[0].tax, 0, "the 18% item is untouched");
    assert.equal(a.delivery.gross, 0);

    // Item and its delivery refunded together: the rest goes to delivery
    const withDelivery = allocateRefund(order, inv, 560, ["book1"]);
    assert.deepEqual(withDelivery.lines.map((l) => l.total), [0, 500]);
    assert.equal(withDelivery.delivery.gross, 60);

    // No items named: spread over the whole invoice as before
    const whole = allocateRefund(order, inv, 870, []);
    assert.equal(whole.itemLevel, false);
    assert.equal(whole.lines[0].tax, 90);
  });

  it("the credit note lists only the returned items, with no GST reversed on a 0% book", () => {
    const cn = buildCreditNote(order, order.paymentMeta.refunds[0]);
    assert.equal(cn.creditNote.itemLevel, true);
    assert.deepEqual(cn.lines.map((l) => l.name), ["Book"]);
    assert.equal(cn.totals.tax, 0);
    assert.equal(cn.totals.grandTotal, 450);
  });

  it("the GST summary reverses only the book's 0% line", () => {
    const r = buildFinanceReport("credit-notes", {
      refundedOrders: [order],
      period: { fromStr: "2026-11-01", toStr: "2026-11-30", from: new Date("2026-10-31T18:30:00Z"), to: new Date("2026-11-30T18:30:00Z") }
    });
    const row = r.rows[0];
    const col = (name) => row[CREDIT_NOTE_HEADERS.indexOf(name)];
    assert.equal(col("Credit Note No"), "CN/2026-27/0003");
    assert.equal(col("IGST INR"), "0.00");
    assert.equal(col("Taxable Value INR"), "450.00");
  });
});
