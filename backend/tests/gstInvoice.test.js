const { describe, it, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const Product = require("../models/Product");
const { computeOrderTotals } = require("../utils/orderTotals");
const { lineGstRate, lineTax } = require("../utils/tax");
const { normalizeProductTax } = require("../utils/productTax");
const { billingGstFields, customerGstinError } = require("../utils/gstin");
const { normalizeOrderItem } = require("../utils/orderItems");
const { buildInvoice, amountInWords } = require("../utils/invoiceData");
const { generateInvoicePdfBuffer } = require("../utils/invoicePdfGenerator");

const round = (v) => Math.round(v * 100) / 100;

describe("GST per line", () => {
  it("picks the line's GST rate", () => {
    assert.equal(lineGstRate({ name: "Gita Web Version", category: "Web Version" }, { storeRate: 18 }), 18);
    assert.equal(lineGstRate({ name: "Gita (Paperback)", category: "Books" }, { storeRate: 18 }), 0, "printed books are 0%");
    assert.equal(lineGstRate({ name: "Audio CD", gstRate: 12 }, { storeRate: 18 }), 12, "the product's own rate wins");
    assert.equal(lineGstRate({ name: "Book", category: "Books", gstRate: 5 }, { storeRate: 18 }), 5);
    assert.equal(lineGstRate({ name: "Audio CD", gstRate: 12 }, { isInternational: true, storeRate: 18 }), 0, "exports are 0%");
    assert.equal(lineGstRate({ name: "Audio CD", gstRate: null }, { storeRate: 18 }), 18, "blank = automatic");
  });

  it("splits a GST-inclusive price into taxable value and tax that add up exactly", () => {
    const local = lineTax({ gross: 599, discount: 34.25, rate: 18, isLocal: true });
    assert.equal(local.total, 564.75);
    assert.equal(round(local.taxable + local.tax), local.total);
    assert.equal(round(local.cgst + local.sgst), local.tax);
    assert.equal(local.igst, 0);
    assert.equal(local.cgstRate, 9);

    const other = lineTax({ gross: 3897, rate: 18, isLocal: false });
    assert.equal(other.taxable, 3302.54);
    assert.equal(other.igst, 594.46);
    assert.equal(other.cgst + other.sgst, 0);

    const zero = lineTax({ gross: 900, discount: 51.46, rate: 0, isLocal: true });
    assert.deepEqual([zero.taxable, zero.tax], [848.54, 0]);
  });
});

describe("product tax settings", () => {
  it("accepts blank or valid values only", () => {
    assert.deepEqual(normalizeProductTax({}), { hsnSac: "", gstRate: null });
    assert.deepEqual(normalizeProductTax({ hsnSac: " 4901 ", gstRate: "" }), { hsnSac: "4901", gstRate: null });
    assert.deepEqual(normalizeProductTax({ hsnSac: "998431", gstRate: "18" }), { hsnSac: "998431", gstRate: 18 });
    assert.ok(normalizeProductTax({ hsnSac: "49A1" }).error);
    assert.ok(normalizeProductTax({ hsnSac: "123" }).error);
    assert.ok(normalizeProductTax({ gstRate: 15 }).error);
    assert.ok(normalizeProductTax({ gstRate: "abc" }).error);
  });

  it("copies the product's tax settings onto the order line", () => {
    const item = normalizeOrderItem({ _id: "p1", name: "CD", price: 250, hsnSac: "8523", gstRate: 12 }, { quantity: 1 });
    assert.equal(item.hsnSac, "8523");
    assert.equal(item.gstRate, 12);
    const plain = normalizeOrderItem({ _id: "p2", name: "Book", price: 100 }, { quantity: 1 });
    assert.equal(plain.hsnSac, "");
    assert.equal(plain.gstRate, null);
  });
});

describe("customer GSTIN", () => {
  it("is optional and checked with its check character", () => {
    assert.deepEqual(billingGstFields({}), { gstin: "", businessName: "" });
    assert.deepEqual(billingGstFields({ gstin: " 27aapfu0939f1zv ", businessName: " Acme LLP " }), { gstin: "27AAPFU0939F1ZV", businessName: "Acme LLP" });
    assert.match(billingGstFields({ gstin: "27AAPFU0939F1ZX" }).error, /doesn't look right/);
    assert.match(billingGstFields({ gstin: "99AAPFU0939F1ZV" }).error, /15 characters/);
    assert.match(billingGstFields({ gstin: "12345" }).error, /15 characters/);
    assert.equal(billingGstFields({ businessName: "Acme" }).businessName, "", "no business name without a GSTIN");
  });

  it("gives the same answer in the browser", async () => {
    const fe = await import("../../src/utils/gstin.js");
    for (const g of ["", "27AAPFU0939F1ZV", "27AAPFU0939F1ZX", "99AAPFU0939F1ZV", "29ABCDE1234F1ZW", "abc"]) {
      assert.equal(fe.gstinError(g), customerGstinError(g), g);
    }
  });
});

describe("checkout saves each line's tax", () => {
  afterEach(() => mock.restoreAll());

  const settings = {
    gstPercent: 18,
    deliveryCharge: 60,
    warehouseLocation: { state: "Karnataka" },
    businessDetails: { state: "Karnataka" },
    distancePricing: { enabled: false },
    internationalDelivery: { enabled: true, domesticCountry: "India", defaultFee: 600 },
    currencyConversionRates: { INR: 1, USD: 0.012 }
  };
  const products = [
    { _id: "book1", name: "Gita (Paperback)", category: "Books", price: 450, stock: 10 },
    { _id: "web1", name: "Vyakarana Web Version", category: "Web Version", price: 599, isDigital: true, digitalType: "Web Version" },
    { _id: "cd1", name: "Chanting Audio CD", category: "Audio", price: 250, stock: 5, gstRate: 12, hsnSac: "852349" }
  ];
  const mockProducts = () =>
    mock.method(Product, "find", () => ({ populate: () => ({ lean: async () => products }) }));

  it("line amounts add up to the order totals, and the invoice matches what was charged", async () => {
    mockProducts();
    const items = [
      { product: "book1", quantity: 2 },
      { product: "web1", quantity: 1 },
      { product: "cd1", quantity: 1 }
    ];
    for (const state of ["Karnataka", "Maharashtra"]) {
      const res = await computeOrderTotals({ items, shipping: { country: "India", state }, settings });
      const lines = res.normalizedItems;
      const sum = (k) => round(lines.reduce((a, it) => a + it.tax[k], 0));

      assert.deepEqual(lines.map((it) => it.tax.rate), [0, 18, 12]);
      assert.deepEqual(lines.map((it) => it.hsnSac), ["4901", "998433", "852349"]);
      assert.equal(res.subtotal, sum("taxable"));
      // GST on the items plus GST on delivery (delivery is part of the taxable value)
      assert.equal(res.gstAmount, round(sum("tax") + res.taxDetails.delivery.tax));
      assert.ok(res.taxDetails.delivery.tax > 0, "delivery of the 12% CD carries GST");
      // Base price + delivery + GST = total; the delivery fee (GST included) is unchanged
      assert.equal(res.total, round(sum("total") + res.deliveryFee));
      assert.equal(res.total, round(res.subtotal + res.deliveryCharge + res.gstAmount));
      assert.equal(res.taxDetails.isLocal, state === "Karnataka");
      assert.equal(res.taxDetails.mixedRates, true);
      assert.equal(res.taxDetails.cgstAmount + res.taxDetails.sgstAmount > 0, state === "Karnataka");
      assert.equal(res.taxDetails.igstAmount > 0, state !== "Karnataka");

      const inv = buildInvoice({
        _id: "6730f1a2b3c4d5e6f7a8b9c0",
        invoiceNumber: "DSG/2026-27/0001",
        paymentStatus: "Paid",
        items: lines,
        deliveryCharge: res.deliveryCharge,
        taxDetails: res.taxDetails,
        currencyDisplay: { currency: "INR" },
        sellerDetails: { legalName: "Vyoma", gstin: "29AAATV1234F1Z8", state: "Karnataka", stateCode: "29" },
        shipping: { name: "A", address: "1 Road", city: "X", state, pincode: "400001", country: "India" },
        billing: { name: "A", address: "1 Road", city: "X", state, pincode: "400001", country: "India" }
      });
      assert.equal(inv.totals.grandTotal, res.total, "invoice total = amount charged");
      assert.equal(inv.totals.tax, res.gstAmount);
      assert.equal(inv.isLocal, state === "Karnataka");
      assert.equal(inv.placeOfSupply.stateCode, state === "Karnataka" ? "29" : "27");
      assert.equal(round(inv.rates.reduce((a, r) => a + r.tax, 0)), inv.totals.tax);
    }
  });

  it("charges no GST outside India", async () => {
    mockProducts();
    const res = await computeOrderTotals({
      items: [{ product: "web1", quantity: 1 }],
      shipping: { country: "United States", state: "California" },
      settings
    });
    assert.equal(res.gstAmount, 0);
    assert.equal(res.normalizedItems[0].tax.rate, 0);
  });
});

describe("invoice", () => {
  const base = {
    _id: "6730f1a2b3c4d5e6f7a8b9c0",
    invoiceNumber: "DSG/2026-27/0007",
    paymentStatus: "Paid",
    createdAt: "2026-11-02T09:15:00Z",
    invoiceIssuedAt: "2026-11-02T09:16:00Z",
    currencyDisplay: { currency: "INR" },
    sellerDetails: { legalName: "Vyoma Linguistic Labs Foundation", gstin: "29AAATV1234F1Z8", state: "Karnataka" }
  };

  it("uses the place of supply rules", () => {
    const digital = buildInvoice({
      ...base,
      items: [],
      shipping: { address: "Digital Delivery", city: "Digital", state: "Digital", country: "India" },
      billing: { state: "Maharashtra", country: "India" }
    });
    assert.deepEqual(digital.placeOfSupply, { state: "Maharashtra", stateCode: "27", isExport: false });
    assert.equal(digital.shipTo, null, "no ship-to for digital orders");

    const byGstin = buildInvoice({
      ...base,
      items: [],
      shipping: { state: "Digital", country: "India" },
      billing: { gstin: "27AAPFU0939F1ZV", businessName: "Acme" }
    });
    assert.equal(byGstin.placeOfSupply.stateCode, "27");
    assert.equal(byGstin.isB2B, true);
    assert.equal(byGstin.buyer.businessName, "Acme");

    const exportOrder = buildInvoice({ ...base, items: [], shipping: { state: "California", country: "United States" } });
    assert.deepEqual(exportOrder.placeOfSupply, { state: "Outside India (United States)", stateCode: "96", isExport: true });
    assert.equal(exportOrder.isLocal, false);
  });

  it("works out older orders that have no saved line tax", () => {
    const inv = buildInvoice({
      ...base,
      gstPercent: 18,
      gstAmount: 50,
      items: [{ name: "Gita ebook", category: "ebook", price: 327.78, quantity: 1 }],
      shipping: { address: "1 Road", city: "Bengaluru", state: "Karnataka", country: "India" }
    });
    assert.equal(inv.lines[0].rate, 18);
    assert.equal(inv.lines[0].hsnSac, "998433");
    assert.equal(inv.totals.grandTotal, 327.78);
    assert.equal(inv.isLocal, true);
  });

  it("writes the amount in words", () => {
    assert.equal(amountInWords(1709, "INR"), "Rupees One Thousand Seven Hundred Nine Only");
    assert.equal(amountInWords(12345678.09, "INR"), "Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Nine Paise Only");
    assert.equal(amountInWords(19.99, "USD"), "US Dollars Nineteen and Ninety Nine Cents Only");
    assert.equal(amountInWords(0), "Rupees Zero Only");
  });

  it("renders a PDF, and an unpaid order is not called a tax invoice", async () => {
    const order = {
      ...base,
      items: [{ name: "Bhagavad Gītā – Śāṅkara Bhāṣya", category: "Books", price: 450, quantity: 1, tax: lineTax({ gross: 450, rate: 0, isLocal: true }) }],
      shipping: { name: "A", address: "1 Road", city: "Bengaluru", state: "Karnataka", country: "India" }
    };
    const pdf = await generateInvoicePdfBuffer(order);
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");

    const unpaid = buildInvoice({ ...order, paymentStatus: "Pending", invoiceNumber: undefined });
    assert.equal(unpaid.isPaid, false);
    const unpaidPdf = await generateInvoicePdfBuffer({ ...order, paymentStatus: "Pending", invoiceNumber: undefined });
    assert.ok(unpaidPdf.length > 1000);
  });
});

describe("GET /api/orders/:id/invoice", () => {
  const express = require("express");
  const jwt = require("jsonwebtoken");
  const http = require("node:http");
  const Order = require("../models/Order");
  const User = require("../models/User");
  const StoreSettings = require("../models/StoreSettings");

  afterEach(() => mock.restoreAll());

  const ids = { order: "6730f1a2b3c4d5e6f7a8b9c0", owner: "6730f1a2b3c4d5e6f7a8b9c1", other: "6730f1a2b3c4d5e6f7a8b9c2", admin: "6730f1a2b3c4d5e6f7a8b9c3", staff: "6730f1a2b3c4d5e6f7a8b9c4" };
  const users = {
    [ids.owner]: { _id: ids.owner, name: "Owner", email: "o@example.com" },
    [ids.other]: { _id: ids.other, name: "Other" },
    [ids.admin]: { _id: ids.admin, isAdmin: true, adminLevel: 1 },
    [ids.staff]: { _id: ids.staff, isAdmin: true, adminLevel: 2, allowedPages: ["products"] }
  };
  const chain = (v) => ({ select: () => chain(v), lean: async () => v, populate: () => chain(v) });

  async function call(viewer, order) {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
    mock.method(User, "findById", (id) => chain(users[String(id)] || null));
    mock.method(Order, "findById", () => chain(order));
    mock.method(StoreSettings, "findOne", () => chain({ businessDetails: { legalName: "Vyoma", state: "Karnataka" } }));
    const app = express();
    app.use("/api/orders", require("../routes/orderRoutes"));
    const server = app.listen(0);
    try {
      const token = jwt.sign({ id: viewer }, process.env.JWT_SECRET, { algorithm: "HS256" });
      return await new Promise((resolve, reject) => {
        http.get({ port: server.address().port, path: `/api/orders/${ids.order}/invoice`, headers: { Authorization: `Bearer ${token}` } }, (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => resolve({ status: res.statusCode, type: res.headers["content-type"], disposition: res.headers["content-disposition"], body: Buffer.concat(chunks) }));
        }).on("error", reject);
      });
    } finally {
      server.close();
    }
  }

  const paid = {
    _id: ids.order, user: ids.owner, invoiceNumber: "DSG/2026-27/0007", paymentStatus: "Paid",
    items: [{ name: "Gita", category: "Books", price: 450, quantity: 1, tax: lineTax({ gross: 450, rate: 0, isLocal: true }) }],
    shipping: { name: "Owner", address: "1 Road", city: "Bengaluru", state: "Karnataka", country: "India" }
  };

  it("gives the customer their paid invoice as a PDF", async () => {
    const res = await call(ids.owner, paid);
    assert.equal(res.status, 200);
    assert.equal(res.type, "application/pdf");
    assert.match(res.disposition, /DSG-2026-27-0007\.pdf/);
    assert.equal(res.body.subarray(0, 5).toString(), "%PDF-");
  });

  it("waits for payment, and hides other people's orders", async () => {
    assert.equal((await call(ids.owner, { ...paid, paymentStatus: "Pending", invoiceNumber: undefined })).status, 409);
    assert.equal((await call(ids.other, paid)).status, 404);
    assert.equal((await call(ids.staff, paid)).status, 404, "staff without the Orders page");
  });

  it("lets admins with the Orders page download any order", async () => {
    assert.equal((await call(ids.admin, paid)).status, 200);
    const unpaid = await call(ids.admin, { ...paid, paymentStatus: "Pending", invoiceNumber: undefined });
    assert.equal(unpaid.status, 200, "admins get the order summary");
    assert.match(unpaid.disposition, /order-/);
  });
});
