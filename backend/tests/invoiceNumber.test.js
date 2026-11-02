const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { financialYearOf, invoiceCounterId, formatInvoiceNumber } = require("../utils/invoiceNumber");

describe("invoiceNumber", () => {
  it("formats DSG/2026-27/0001 for the financial year", () => {
    assert.equal(formatInvoiceNumber(new Date("2026-11-01T10:00:00+05:30"), 1), "DSG/2026-27/0001");
    assert.equal(formatInvoiceNumber(new Date("2026-11-01T10:00:00+05:30"), 412), "DSG/2026-27/0412");
    assert.equal(formatInvoiceNumber(new Date("2026-11-01T10:00:00+05:30"), 1).length, 16);
  });

  it("January to March belong to the financial year that started the April before", () => {
    assert.equal(financialYearOf(new Date("2027-02-15T12:00:00+05:30")).label, "2026-27");
    assert.equal(financialYearOf(new Date("2027-03-31T23:59:00+05:30")).label, "2026-27");
    assert.equal(financialYearOf(new Date("2027-04-01T00:00:00+05:30")).label, "2027-28");
  });

  it("uses India time at the 1 April boundary, not the server's UTC clock", () => {
    // 1 April 2027, 00:30 in India is still 31 March in UTC
    const justAfterMidnightIst = new Date("2027-03-31T19:00:00Z");
    assert.equal(financialYearOf(justAfterMidnightIst).label, "2027-28");
    assert.equal(invoiceCounterId(justAfterMidnightIst), "orderInvoice-2027-28");
    // 31 March 2027, 23:00 in India
    assert.equal(financialYearOf(new Date("2027-03-31T17:30:00Z")).label, "2026-27");
  });

  it("handles the century turn and bad sequence values", () => {
    assert.equal(financialYearOf(new Date("2099-06-01T00:00:00+05:30")).label, "2099-00");
    assert.equal(formatInvoiceNumber(new Date("2026-11-01T10:00:00+05:30"), 0), "DSG/2026-27/0001");
  });

  it("uses only characters GST allows and stays within 16 up to 9,999 invoices", () => {
    const n = formatInvoiceNumber(new Date("2026-11-01T10:00:00+05:30"), 9999);
    assert.match(n, /^[A-Za-z0-9/-]+$/);
    assert.ok(n.length <= 16);
  });
});

describe("Order invoice number on save", () => {
  it("gives a new order DSG/<FY>/<n> from that year's own counter", async () => {
    const { mock } = require("node:test");
    const mongoose = require("mongoose");
    const Order = require("../models/Order");
    const Counter = mongoose.model("Counter");
    const seen = [];
    mock.method(Counter, "findByIdAndUpdate", (filter) => {
      seen.push(filter._id);
      return Promise.resolve({ _id: filter._id, seq: 7 });
    });
    const order = new Order({ items: [], total: 100, paymentStatus: "Paid" });
    await Order.schema.s.hooks.execPre("save", order, []);
    assert.match(order.invoiceNumber, /^DSG\/\d{4}-\d{2}\/0007$/);
    assert.ok(order.invoiceIssuedAt instanceof Date);
    assert.equal(seen[0], `orderInvoice-${financialYearOf(new Date()).label}`);

    // Unpaid or failed checkouts never take a number, so paid invoices run without gaps
    for (const paymentStatus of ["Pending", "Failed"]) {
      const unpaid = new Order({ items: [], total: 100, paymentStatus });
      await Order.schema.s.hooks.execPre("save", unpaid, []);
      assert.equal(unpaid.invoiceNumber, undefined);
      assert.equal(unpaid.invoiceIssuedAt, null);
    }
    assert.equal(seen.length, 1, "the counter is only used for the paid order");

    // An order marked paid later gets its number then
    const later = new Order({ items: [], total: 100, paymentStatus: "Pending" });
    await Order.schema.s.hooks.execPre("save", later, []);
    later.paymentStatus = "Paid";
    await Order.schema.s.hooks.execPre("save", later, []);
    assert.match(later.invoiceNumber, /^DSG\/\d{4}-\d{2}\/0007$/);

    // An order that already has a number keeps it
    const old = new Order({ items: [], total: 100, paymentStatus: "Paid", invoiceNumber: "DSG-2026-0412" });
    await Order.schema.s.hooks.execPre("save", old, []);
    assert.equal(old.invoiceNumber, "DSG-2026-0412");
    mock.restoreAll();
  });
});

describe("Finance dashboard financial-year periods (frontend helper)", () => {
  it("works out financial years and quarters", async () => {
    const fy = await import("../../src/utils/financialYear.js");
    assert.equal(fy.fyStartYearOf("2026-11-01"), 2026);
    assert.equal(fy.fyStartYearOf("2027-03-31"), 2026);
    assert.equal(fy.fyStartYearOf("2027-04-01"), 2027);
    assert.equal(fy.fyLabel(2026), "FY 2026-27");
    assert.deepEqual(fy.fyRange(2026), { from: "2026-04-01", to: "2027-03-31" });
    assert.deepEqual(fy.quarterRange(2026, 1), { from: "2026-04-01", to: "2026-06-30" });
    assert.deepEqual(fy.quarterRange(2026, 3), { from: "2026-10-01", to: "2026-12-31" });
    assert.deepEqual(fy.quarterRange(2026, 4), { from: "2027-01-01", to: "2027-03-31" });
    assert.deepEqual(fy.quarterRange(2027, 4), { from: "2028-01-01", to: "2028-03-31" });
    assert.equal(fy.quarterLabel(2026, 3), "Q3 FY 2026-27 (Oct–Dec 2026)");
    assert.equal(fy.quarterOf("2026-11-01"), 3);
    assert.equal(fy.quarterOf("2027-02-10"), 4);
    assert.equal(fy.quarterOf("2026-04-01"), 1);
  });

  it("lists recent years and only quarters that have started", async () => {
    const fy = await import("../../src/utils/financialYear.js");
    assert.deepEqual(fy.recentFinancialYears("2026-11-01", 3), [2026, 2025, 2024]);
    const qs = fy.recentQuarters("2026-11-01", 2).map((q) => q.value);
    assert.deepEqual(qs, ["2026-3", "2026-2", "2026-1", "2025-4", "2025-3", "2025-2", "2025-1"]);
  });
});

describe("Finance report invoice date", () => {
  it("uses the date payment succeeded, and the order date for older orders", () => {
    const { buildInvoiceRow } = require("../utils/financeLedger");
    const settings = { warehouseLocation: { state: "Karnataka" } };
    const paidLater = buildInvoiceRow(
      { _id: "o1", invoiceNumber: "DSG/2026-27/0003", createdAt: new Date("2026-10-30T10:00:00Z"), invoiceIssuedAt: new Date("2026-11-02T10:00:00Z"), total: 100 },
      settings
    );
    assert.deepEqual(paidLater.invoiceDate, new Date("2026-11-02T10:00:00Z"));
    const older = buildInvoiceRow({ _id: "o2", invoiceNumber: "DSG-2026-0412", createdAt: new Date("2026-10-30T10:00:00Z"), total: 100 }, settings);
    assert.deepEqual(older.invoiceDate, new Date("2026-10-30T10:00:00Z"));
  });
});
