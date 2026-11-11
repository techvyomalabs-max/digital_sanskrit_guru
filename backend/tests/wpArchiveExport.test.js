"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  EXPORT_LIMITS,
  istDayBoundary,
  parseExportFilters,
  describeFilters,
  checkExportSize,
  WP_CSV_HEADERS,
  buildWpOrderQuery,
  cleanText,
  istDate,
  buildWpOrdersCsv,
  totalsByCurrency,
  buildWpInvoice
} = require("../utils/wpArchiveExport");

const sampleOrder = {
  wpOrderId: 12175,
  billingName: "Jayanthi Bhaskaran",
  billingEmail: "jb@example.com",
  billingPhone: "+91 98765 43210",
  billing: { name: "Jayanthi Bhaskaran", phone: "+91 98765 43210", address: "12, 3rd Main", city: "Bengaluru", state: "Karnataka", pincode: "560072", country: "IN" },
  shipping: { name: "", address: "" },
  items: [
    { name: "Shabdarupasangraha <br> Level 1 to 5", price: 150, quantity: 2, isDigital: false },
    { name: "Tarka &amp; Logic", price: 29, quantity: 1, isDigital: true }
  ],
  subtotal: 329,
  discount: 10,
  couponCode: "SAVE10",
  deliveryCharge: 10,
  gstAmount: 0,
  total: 329,
  status: "Delivered",
  paymentStatus: "Paid",
  paymentMethod: "Razorpay",
  transactionId: "pay_ABC",
  currencyDisplay: { currency: "INR" },
  wpCreatedAt: new Date("2026-08-10T20:00:00Z"), // 11 Aug in India
  wpPaidAt: null
};

test("buildWpOrderQuery: same rules as the on-screen search", () => {
  assert.deepEqual(buildWpOrderQuery({}), {});
  assert.deepEqual(buildWpOrderQuery({ status: "Delivered" }), { status: "Delivered" });
  // unknown statuses are ignored rather than passed to Mongo
  assert.deepEqual(buildWpOrderQuery({ status: "Hacked" }), {});

  const byNumber = buildWpOrderQuery({ search: "#12175" });
  assert.deepEqual(byNumber.$or[0], { wpOrderId: 12175 });

  const byText = buildWpOrderQuery({ search: "a.b+c" });
  assert.equal(byText.$or[0].billingEmail.$regex, "a\\.b\\+c");
  assert.ok(byText.$or.some((c) => c.transactionId));
});

test("cleanText strips WooCommerce HTML and entities", () => {
  assert.equal(cleanText("Shabdarupasangraha <br> Level 1"), "Shabdarupasangraha Level 1");
  assert.equal(cleanText("A &amp; B<br/>C"), "A & B C");
  assert.equal(cleanText(null), "");
});

test("istDate uses India time", () => {
  assert.equal(istDate(new Date("2026-08-10T20:00:00Z")), "11-08-2026");
  assert.equal(istDate(null), "");
  assert.equal(istDate("not a date"), "");
});

test("buildWpOrdersCsv: header, one row per order, BOM, clean values", () => {
  const csv = buildWpOrdersCsv([sampleOrder]);
  assert.ok(csv.startsWith("﻿"));
  const lines = csv.slice(1).trim().split("\r\n");
  assert.equal(lines.length, 2);
  assert.equal(lines[0].split(",").length, WP_CSV_HEADERS.length);
  assert.match(lines[1], /"Shabdarupasangraha Level 1 to 5 x 2 \| Tarka & Logic x 1"/);
  assert.match(lines[1], /"11-08-2026"/);
  assert.match(lines[1], /"\+91 98765 43210"/); // phone kept readable
  assert.match(lines[1], /"329\.00"$/);
  // shipping falls back to billing when the WP order had none
  assert.equal((lines[1].match(/12, 3rd Main/g) || []).length, 2);
});

test("buildWpOrdersCsv blocks spreadsheet formulas", () => {
  const csv = buildWpOrdersCsv([{ ...sampleOrder, billingName: "=HYPERLINK(\"x\")", billing: { name: "=HYPERLINK(\"x\")" } }]);
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
});

test("totalsByCurrency skips cancelled orders and groups by currency", () => {
  const totals = totalsByCurrency([
    sampleOrder,
    { ...sampleOrder, total: 100.555, status: "Cancelled" },
    { ...sampleOrder, total: 20, currencyDisplay: { currency: "usd" } }
  ]);
  assert.deepEqual(totals, { INR: 329, USD: 20 });
});

test("buildWpInvoice: labelled as an archived copy, never a DSG invoice number", () => {
  const inv = buildWpInvoice(sampleOrder, { legalName: "Vyoma Linguistic Labs Foundation", gstin: "29ABCDE1234F1Z5" });
  assert.equal(inv.documentNumber, "WP-12175");
  assert.doesNotMatch(inv.documentNumber, /^DSG\//);
  assert.match(inv.documentTitle, /archived/i);
  assert.equal(inv.items[0].name, "Shabdarupasangraha Level 1 to 5");
  assert.equal(inv.items[0].amount, 300);
  assert.equal(inv.shipTo.address, inv.billTo.address);
  assert.equal(inv.seller.gstin, "29ABCDE1234F1Z5");
  assert.equal(inv.total, 329);
});

test("PDF renderers produce valid PDF files", async () => {
  const { renderWpOrdersReportPdf, renderWpInvoicePdf } = require("../utils/wpArchivePdf");
  const many = Array.from({ length: 60 }, (_, i) => ({ ...sampleOrder, wpOrderId: 12000 + i }));
  const report = await renderWpOrdersReportPdf(many, { totalMatched: 60, totals: totalsByCurrency(many) });
  assert.equal(report.subarray(0, 5).toString(), "%PDF-");
  // page footers must not spill onto extra blank pages (60 rows fit on 4 pages)
  const pageCount = (report.toString("latin1").match(/\/Type \/Page\b/g) || []).length;
  assert.ok(pageCount >= 1 && pageCount <= 4, `expected at most 4 pages, got ${pageCount}`);
  const invoice = await renderWpInvoicePdf(buildWpInvoice(sampleOrder));
  assert.equal(invoice.subarray(0, 5).toString(), "%PDF-");
});

test("istDayBoundary: whole days in India time, rejects impossible dates", () => {
  assert.equal(istDayBoundary("2026-08-11").toISOString(), "2026-08-10T18:30:00.000Z");
  assert.equal(istDayBoundary("2026-08-11", true).toISOString(), "2026-08-11T18:29:59.999Z");
  assert.equal(istDayBoundary("2026-02-30"), null);
  assert.equal(istDayBoundary("11-08-2026"), null);
  assert.equal(istDayBoundary(""), null);
});

test("buildWpOrderQuery: date range, payment status and currency filters", () => {
  const q = buildWpOrderQuery({ from: "2026-04-01", to: "2026-04-30", paymentStatus: "Paid", currency: "usd" });
  assert.deepEqual(q.wpCreatedAt, {
    $gte: new Date("2026-03-31T18:30:00.000Z"),
    $lte: new Date("2026-04-30T18:29:59.999Z")
  });
  assert.equal(q.paymentStatus, "Paid");
  assert.equal(q["currencyDisplay.currency"], "USD");
  // INR also matches orders imported without a currency
  assert.deepEqual(buildWpOrderQuery({ currency: "INR" })["currencyDisplay.currency"], { $in: ["INR", null, ""] });
  // open-ended ranges
  assert.deepEqual(Object.keys(buildWpOrderQuery({ from: "2026-04-01" }).wpCreatedAt), ["$gte"]);
  assert.deepEqual(Object.keys(buildWpOrderQuery({ to: "2026-04-01" }).wpCreatedAt), ["$lte"]);
});

test("parseExportFilters validates every filter", () => {
  assert.equal(parseExportFilters({}).error, null);
  assert.deepEqual(parseExportFilters({}).filters, { search: "", status: "All", paymentStatus: "All", currency: "All", from: "", to: "" });
  assert.match(parseExportFilters({ status: "Shipped" }).error, /status/);
  assert.match(parseExportFilters({ paymentStatus: "Maybe" }).error, /payment/);
  assert.match(parseExportFilters({ currency: "RUPEES" }).error, /currency/);
  assert.match(parseExportFilters({ from: "2026-13-01" }).error, /from/);
  assert.match(parseExportFilters({ from: "2026-05-02", to: "2026-05-01" }).error, /on or before/);
  assert.equal(parseExportFilters({ from: "2026-05-01", to: "2026-05-01" }).error, null);
  assert.equal(parseExportFilters({ search: "x".repeat(500) }).filters.search.length, 200);
});

test("checkExportSize refuses empty and oversized exports", () => {
  assert.equal(checkExportSize("csv", 10).ok, true);
  assert.equal(checkExportSize("csv", EXPORT_LIMITS.csv).ok, true);
  const tooBig = checkExportSize("csv", EXPORT_LIMITS.csv + 1);
  assert.equal(tooBig.ok, false);
  assert.match(tooBig.message, /at most 10,000/);
  assert.equal(checkExportSize("pdf", EXPORT_LIMITS.pdf + 1).ok, false);
  assert.match(checkExportSize("pdf", 0).message, /No orders/);
  assert.equal(checkExportSize("xlsx", 5).ok, false);
});

test("describeFilters gives a readable summary", () => {
  assert.equal(describeFilters({}), "All orders");
  assert.equal(
    describeFilters({ from: "2026-04-01", to: "2026-04-30", status: "Delivered", currency: "INR", search: "gita" }),
    'Dates: 2026-04-01 to 2026-04-30, Status: Delivered, Currency: INR, Search: "gita"'
  );
});
