const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { buildAdvancesReport } = require("../utils/advancesReport");

const book = { name: "Gita", price: 450, quantity: 1 };
const web = { name: "Gita Web Version", isDigital: true, price: 300, quantity: 1 };
const now = new Date("2026-11-10T06:00:00Z");

describe("advances report", () => {
  it("lists paid, not-yet-invoiced orders oldest first, with what they wait for", () => {
    const report = buildAdvancesReport({
      now,
      awaiting: [
        { _id: "aaaaaaaa11111111", paymentStatus: "Paid", status: "Pending", totalInInr: 500, createdAt: new Date("2026-11-08T06:00:00Z"), items: [book], user: { name: "Asha" } },
        { _id: "bbbbbbbb22222222", paymentStatus: "Paid", status: "Pending", total: 300, createdAt: new Date("2026-11-01T06:00:00Z"), items: [{ ...web, accessManual: true }] },
        { _id: "cccccccc33333333", paymentStatus: "Paid", invoiceNumber: "DSG/2026-27/0001", items: [book] }
      ]
    });
    assert.equal(report.outstanding.count, 2);
    assert.equal(report.outstanding.amountInr, 800);
    assert.equal(report.outstanding.rows[0].orderRef, "22222222");
    assert.equal(report.outstanding.rows[0].waitingFor, "Digital access");
    assert.equal(report.outstanding.rows[0].ageDays, 9);
    assert.equal(report.outstanding.rows[1].waitingFor, "Dispatch");
    assert.equal(report.outstanding.rows[1].customer, "Asha");
    assert.equal(report.outstanding.oldestOrderDate.toISOString(), "2026-11-01T06:00:00.000Z");
  });

  it("counts advances refunded in the period only", () => {
    const report = buildAdvancesReport({
      from: new Date("2026-11-01T00:00:00Z"),
      to: new Date("2026-12-01T00:00:00Z"),
      refunded: [
        { _id: "1", paymentMeta: { refunds: [{ amountMinor: 45000, at: new Date("2026-11-05") }] } },
        { _id: "2", paymentMeta: { refunds: [{ amountMinor: 10000, at: new Date("2026-10-05") }] } }
      ]
    });
    assert.deepEqual(report.refundedInPeriod, { count: 1, amountInr: 450 });
  });

  it("lists old-rule invoices on physical orders that haven't shipped", () => {
    const report = buildAdvancesReport({
      legacy: [
        { _id: "dddddddd44444444", paymentStatus: "Paid", status: "Pending", invoiceNumber: "DSG/2026-27/0005", invoiceIssuedAt: new Date("2026-10-20"), totalInInr: 450, items: [book] },
        { _id: "eeeeeeee55555555", paymentStatus: "Paid", status: "Pending", invoiceNumber: "DSG/2026-27/0006", items: [web] },
        { _id: "ffffffff66666666", paymentStatus: "Paid", status: "Pending", invoiceNumber: "DSG/2026-27/0007", shippedAt: new Date(), items: [book] }
      ]
    });
    assert.equal(report.invoicedBeforeDispatch.count, 1, "digital-only and shipped orders are left out");
    assert.equal(report.invoicedBeforeDispatch.rows[0].invoiceNumber, "DSG/2026-27/0005");
    assert.equal(report.invoicedBeforeDispatch.amountInr, 450);
  });

  it("is empty when there is nothing", () => {
    const report = buildAdvancesReport();
    assert.equal(report.outstanding.count, 0);
    assert.equal(report.outstanding.oldestOrderDate, null);
  });
});
