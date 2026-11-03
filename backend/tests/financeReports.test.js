const { describe, it, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { lineTax } = require("../utils/tax");
const {
  buildFinanceReport, csvCell, toCsv, SALES_HEADERS, LINE_HEADERS, GST_HEADERS, CREDIT_NOTE_HEADERS
} = require("../utils/financeReports");

const seller = { legalName: "Vyoma", gstin: "29AAATV1234F1Z8", state: "Karnataka", stateCode: "29" };
const addr = (state, country = "India") => ({ name: "Buyer", email: "b@example.com", phone: "9876543210", address: "1 Road", city: "City", state, pincode: "560001", country });

/** An order as checkout saves it: each line with its own tax. */
function order(id, { lines, isLocal = true, state = "Karnataka", country = "India", currency = "INR", fx = 1, delivery = 0, status = "Paid", billing, refunds, refundedInr = 0, invoiceNumber, at = "2026-11-02T06:00:00Z" }) {
  const items = lines.map(([name, category, price, quantity, rate, discount = 0]) => ({
    name, category, price, quantity, tax: lineTax({ gross: price * quantity, discount, rate, isLocal })
  }));
  const sum = (k) => Math.round(items.reduce((a, it) => a + it.tax[k], 0) * 100) / 100;
  const total = Math.round((sum("total") + delivery) * 100) / 100;
  const paid = status === "Paid" || status === "Refunded";
  return {
    _id: `6730f1a2b3c4d5e6f7a8b9${id}`,
    invoiceNumber: paid ? invoiceNumber || `DSG/2026-27/00${id}` : undefined,
    invoiceIssuedAt: paid ? at : null,
    createdAt: at,
    paymentStatus: status,
    status: "Pending",
    paymentMeta: { razorpayPaymentId: paid ? `pay_${id}` : "", refunds },
    refundedAmountInInr: refundedInr,
    refundStatus: refundedInr ? "Refunded" : "Not Applicable",
    items,
    deliveryCharge: delivery,
    total,
    totalInInr: Math.round(total * fx * 100) / 100,
    fxRateToInr: fx,
    currencyDisplay: { currency },
    taxDetails: { isLocal },
    sellerDetails: seller,
    shipping: addr(state, country),
    billing: billing || addr(state, country)
  };
}

const col = (headers, row, name) => row[headers.indexOf(name)];
const period = { fromStr: "2026-11-01", toStr: "2026-11-30", from: new Date("2026-10-31T18:30:00Z"), to: new Date("2026-11-30T18:30:00Z") };

const local = order("01", { lines: [["Gita (Paperback)", "Books", 450, 2, 0, 51.46], ["Vyakarana Web Version", "Web Version", 599, 1, 18, 34.25], ["Audio CD", "Audio", 250, 1, 12, 14.29]], delivery: 60 });
const b2b = order("02", { isLocal: false, state: "Maharashtra", lines: [["Flipbook", "Flipbook", 1299, 3, 18]], billing: { ...addr("Maharashtra"), gstin: "27AAPFU0939F1ZV", businessName: "Acme LLP" } });
const usd = order("03", { isLocal: false, state: "California", country: "United States", currency: "USD", fx: 83.5, lines: [["Web Version", "Web Version", 19.99, 1, 0]] });
const failed = order("04", { status: "Failed", lines: [["Web Version", "Web Version", 599, 1, 18]] });
const refunded = order("05", {
  status: "Refunded", isLocal: false, state: "Kerala",
  lines: [["Web Version", "Web Version", 1180, 1, 18], ["Book", "Books", 500, 1, 0]],
  refundedInr: 840,
  refunds: [{ refundId: "rfnd_1", amountMinor: 84000, currency: "INR", method: "razorpay", reason: "Damaged", at: new Date("2026-11-05T06:00:00Z") }]
});

describe("finance reports", () => {
  it("master sales register: one row per order, figures that add up, failed orders not counted", () => {
    const r = buildFinanceReport("sales", { invoicedOrders: [local, b2b, usd, refunded], periodOrders: [failed], period });
    assert.equal(r.filename, "DSG_master_sales_2026-11-01_to_2026-11-30.csv");
    assert.deepEqual(r.headers, SALES_HEADERS);
    assert.equal(r.rows.length, 5);
    const h = r.headers;
    for (const row of r.rows) assert.equal(col(h, row, "Check Difference INR"), "0.00", row[2]);

    const [l, b, u, ref, f] = [local, b2b, usd, refunded, failed].map((o) => r.rows.find((row) => col(h, row, "Order ID") === o._id));
    assert.equal(col(h, l, "Supply Type"), "B2C");
    assert.equal(col(h, l, "Tax Type"), "CGST + SGST");
    assert.equal(col(h, l, "Invoice Total INR"), "1709.00");
    assert.equal(col(h, l, "Delivery (Taxable) INR"), "60.00", "older orders: delivery untaxed, as charged then");
    assert.equal(col(h, l, "Discount INR"), "100.00");
    assert.equal(col(h, b, "Supply Type"), "B2B");
    assert.equal(col(h, b, "Customer GSTIN"), "27AAPFU0939F1ZV");
    assert.equal(col(h, b, "POS Code"), "27");
    assert.equal(col(h, b, "IGST INR"), "594.46");
    assert.equal(col(h, u, "Supply Type"), "Export");
    assert.equal(col(h, u, "Invoice Total INR"), "1669.17", "19.99 USD at 83.5");
    assert.equal(col(h, u, "Order Total (Currency)"), "19.99");
    assert.equal(col(h, ref, "Net Received INR"), "840.00", "1680 less the 840 refund");
    assert.equal(col(h, f, "Counts As Sale"), "No");
    assert.equal(col(h, f, "Invoice No"), "");
    assert.equal(col(h, f, "Net Received INR"), "0.00");
  });

  it("invoice line register: one row per item with its HSN/SAC and rate", () => {
    const r = buildFinanceReport("lines", { invoicedOrders: [local], period });
    const h = LINE_HEADERS;
    assert.equal(r.rows.length, 3);
    assert.deepEqual(r.rows.map((row) => col(h, row, "HSN/SAC")), ["4901", "998433", "8523"]);
    assert.deepEqual(r.rows.map((row) => col(h, row, "GST Rate %")), ["0", "18", "12"]);
    assert.equal(col(h, r.rows[1], "CGST Rate %"), "9");
    assert.equal(col(h, r.rows[1], "CGST INR"), "43.08");
    const total = r.rows.reduce((a, row) => a + Number(col(h, row, "Line Total INR")), 0);
    assert.equal(Math.round(total * 100) / 100, 1649, "lines total = invoice total less delivery");
  });

  it("credit notes reverse tax line by line in proportion to the refund", () => {
    const r = buildFinanceReport("credit-notes", { refundedOrders: [refunded], period });
    const h = CREDIT_NOTE_HEADERS;
    assert.equal(r.rows.length, 1);
    const row = r.rows[0];
    assert.equal(col(h, row, "Original Invoice No"), "DSG/2026-27/0005");
    assert.equal(col(h, row, "Refund INR"), "840.00");
    assert.equal(col(h, row, "IGST INR"), "90.00", "half of the 180 IGST");
    assert.equal(col(h, row, "Taxable Value INR"), "750.00");
    assert.equal(col(h, row, "Refund ID"), "rfnd_1");

    const outside = buildFinanceReport("credit-notes", { refundedOrders: [refunded], period: { ...period, from: new Date("2026-12-01"), to: new Date("2026-12-31") } });
    assert.equal(outside.rows.length, 0, "refunds outside the period are left out");
  });

  it("GST summary: sales by state and rate, by HSN/SAC, credit notes, and net", () => {
    const r = buildFinanceReport("gst", { invoicedOrders: [local, b2b, usd, refunded], refundedOrders: [refunded], period });
    const h = GST_HEADERS;
    const section = (name) => r.rows.filter((row) => col(h, row, "Section").startsWith(name));
    const sum = (rows, key) => Math.round(rows.reduce((a, row) => a + Number(col(h, row, key)), 0) * 100) / 100;

    const byState = section("Sales by place of supply");
    const byHsn = section("Sales by HSN/SAC");
    const cns = section("Credit notes");
    const net = section("Net");
    assert.equal(sum(byState, "Total Tax INR"), sum(byHsn, "Total Tax INR"));
    assert.equal(sum(byState, "Taxable Value INR"), sum(byHsn, "Taxable Value INR"));
    assert.ok(byState.some((row) => col(h, row, "Supply Type") === "Export" && col(h, row, "POS Code") === "96"));
    assert.ok(byState.some((row) => col(h, row, "Supply Type") === "B2B" && col(h, row, "GST Rate %") === "18"));
    assert.equal(sum(cns, "IGST INR"), 90);
    assert.equal(sum(net, "Total Tax INR"), Math.round((sum(byState, "Total Tax INR") - 90) * 100) / 100);
  });

  it("writes safe CSV", () => {
    assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
    assert.equal(csvCell("-12.50"), "-12.50", "negative numbers stay numbers");
    assert.equal(csvCell("@sum"), "'@sum");
    assert.equal(csvCell('Acme, "LLP"'), '"Acme, ""LLP"""');
    const csv = toCsv(["A", "B"], [["1", "x,y"]]);
    assert.equal(csv, '﻿A,B\r\n1,"x,y"\r\n');
    assert.equal(buildFinanceReport("nope", {}), null);
  });
});

describe("GET /api/orders/analytics/finance/export", () => {
  const express = require("express");
  const jwt = require("jsonwebtoken");
  const http = require("node:http");
  const Order = require("../models/Order");
  const User = require("../models/User");
  const StoreSettings = require("../models/StoreSettings");
  const AdminAuditLog = require("../models/AdminAuditLog");

  afterEach(() => mock.restoreAll());

  const admin = { _id: "6730f1a2b3c4d5e6f7a8b9e1", isAdmin: true, adminLevel: 1, name: "Admin", email: "a@example.com" };
  const staff = { _id: "6730f1a2b3c4d5e6f7a8b9e2", isAdmin: true, adminLevel: 2, allowedPages: ["products"] };
  const chain = (v) => ({ select: () => chain(v), lean: async () => v, populate: () => chain(v) });

  async function call(viewer, query) {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
    const users = { [admin._id]: admin, [staff._id]: staff };
    const audit = [];
    const filters = [];
    mock.method(User, "findById", (id) => chain(users[String(id)] || null));
    mock.method(Order, "find", (filter) => {
      filters.push(filter);
      const inList = filter?.paymentStatus?.$in || [];
      return chain(inList.includes("Failed") ? [failed] : filter?.refundedAmountInInr ? [refunded] : [local, refunded]);
    });
    mock.method(StoreSettings, "findOne", () => chain({ businessDetails: seller }));
    mock.method(AdminAuditLog, "create", async (doc) => { audit.push(doc); return doc; });
    const app = express();
    app.use("/api/orders", require("../routes/orderRoutes"));
    const server = app.listen(0);
    try {
      const token = jwt.sign({ id: viewer._id }, process.env.JWT_SECRET, { algorithm: "HS256" });
      const res = await new Promise((resolve, reject) => {
        http.get({ port: server.address().port, path: `/api/orders/analytics/finance/export?${query}`, headers: { Authorization: `Bearer ${token}` } }, (r) => {
          let body = "";
          r.setEncoding("utf8");
          r.on("data", (c) => { body += c; });
          r.on("end", () => resolve({ status: r.statusCode, headers: r.headers, body }));
        }).on("error", reject);
      });
      return { ...res, audit, filters };
    } finally {
      server.close();
    }
  }

  it("downloads the master sales register as CSV and records who downloaded it", async () => {
    const res = await call(admin, "report=sales&from=2026-11-01&to=2026-11-30");
    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"], /text\/csv/);
    assert.match(res.headers["content-disposition"], /DSG_master_sales_2026-11-01_to_2026-11-30\.csv/);
    assert.equal(res.headers["x-report-rows"], "3");
    const lines = res.body.replace(/^﻿/, "").trim().split("\r\n");
    assert.equal(lines[0], SALES_HEADERS.join(","));
    assert.equal(lines.length, 4);
    assert.equal(res.audit.length, 1);
    assert.equal(res.audit[0].action, "finance-report-exported");
    assert.equal(res.audit[0].actorEmail, "a@example.com");
    assert.equal(res.audit[0].details.rows, 3);
  });

  it("rejects unknown reports, bad dates and admins without the Orders page", async () => {
    assert.equal((await call(admin, "report=everything")).status, 400);
    assert.equal((await call(admin, "report=gst&from=2026-12-01&to=2026-11-01")).status, 400);
    assert.equal((await call(staff, "report=gst")).status, 403);
  });
});
