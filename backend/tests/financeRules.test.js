// Finance's GST rules (November 2026): codes and rates per product type, combos taxed by
// component, delivery inside the taxable value, and payout summaries.
const { describe, it, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const Product = require("../models/Product");
const { computeOrderTotals } = require("../utils/orderTotals");
const { getItemHsnSac, lineGstRate, comboParts, comboTax, deliveryTax, splitByWeights } = require("../utils/tax");
const { normalizeOrderItem } = require("../utils/orderItems");
const { buildInvoice, buildCreditNote } = require("../utils/invoiceData");
const { buildFinanceReport, LINE_HEADERS, GST_HEADERS, SALES_HEADERS } = require("../utils/financeReports");
const { computeRefundQuote } = require("../utils/refundQuote");
const { generateInvoicePdfBuffer, generateCreditNotePdfBuffer } = require("../utils/invoicePdfGenerator");
const { payoutSummaryRows, PAYOUT_SUMMARY_HEADERS, payoutPeriod } = require("../utils/paymentReports");
const { productTaxRows, PRODUCT_TAX_HEADERS } = require("../utils/productTaxReport");

const round = (v) => Math.round(v * 100) / 100;

describe("codes and rates per product type", () => {
  it("follow finance's table", () => {
    const cases = [
      [{ name: "Bhagavad Gita (Paperback)", category: "Books" }, "4901", 0],
      [{ name: "Gita Web Version", category: "Web Version" }, "998433", 18],
      [{ name: "Amarakosha Flipbook", category: "Flipbook" }, "998433", 18],
      [{ name: "Sanskrit course", isDigital: true }, "998433", 18],
      [{ name: "Gita lectures USB drive", category: "Media" }, "8523", 18],
      [{ name: "Chanting speaker", category: "Devices" }, "8518", 18]
    ];
    for (const [item, code, rate] of cases) {
      assert.equal(getItemHsnSac(item), code, item.name);
      assert.equal(lineGstRate(item, { storeRate: 0 }), rate, item.name);
    }
  });

  it("a product's own settings win; exports are 0%; older orders keep the old rules", () => {
    assert.equal(lineGstRate({ name: "Gita Web Version", gstRate: 5 }), 5);
    assert.equal(getItemHsnSac({ name: "Gita Web Version", hsnSac: "998431" }), "998431");
    assert.equal(lineGstRate({ name: "Gita Web Version" }, { isInternational: true }), 0);
    assert.equal(lineGstRate({ name: "Gita Web Version" }, { storeRate: 0, codeRates: false }), 0);
  });
});

const products = [
  {
    _id: "combo1", name: "Gita Study Combo", price: 1180, productType: "bundle", stock: 5,
    bundleItems: [
      { product: { _id: "book1", name: "Bhagavad Gita (Paperback)", category: "Books", price: 600 }, quantity: 1 },
      { product: { _id: "web1", name: "Gita Web Version", isDigital: true, price: 500 }, quantity: 1 },
      { itemType: "custom", name: "Gita lectures USB drive", price: 300, quantity: 1 }
    ]
  },
  { _id: "book2", name: "Sanskrit Primer (Paperback)", category: "Books", price: 400, stock: 5 },
  { _id: "web2", name: "Amarakosha Flipbook", category: "Flipbook", isDigital: true, price: 590 },
  { _id: "usb2", name: "Vedic chanting USB drive", category: "Media", price: 236, stock: 5 }
];
const settings = {
  gstPercent: 0,
  deliveryCharge: 60,
  warehouseLocation: { state: "Karnataka" },
  businessDetails: { state: "Karnataka" },
  distancePricing: { enabled: false },
  internationalDelivery: { enabled: true, defaultFee: 600 },
  currencyConversionRates: { INR: 1, USD: 0.012 }
};
const seller = { legalName: "Vyoma", gstin: "29AAATV1234F1Z8", state: "Karnataka", stateCode: "29" };

async function checkout(items, state = "Karnataka", extra = {}) {
  mock.method(Product, "find", () => ({ populate: () => ({ lean: async () => products }) }));
  return computeOrderTotals({ items, shipping: { country: "India", state }, settings, ...extra });
}

function asOrder(t, state = "Karnataka", id = "6730f1a2b3c4d5e6f7a8b9c0") {
  return {
    _id: id, invoiceNumber: "DSG/2026-27/0001", invoiceIssuedAt: "2026-11-03T06:00:00Z", createdAt: "2026-11-03T06:00:00Z",
    paymentStatus: "Paid", items: t.normalizedItems, subtotal: t.subtotal, gstAmount: t.gstAmount,
    deliveryCharge: t.deliveryCharge, discount: t.discount, total: t.total, totalInInr: t.totalInInr, fxRateToInr: 1,
    taxDetails: t.taxDetails, currencyDisplay: { currency: "INR" }, sellerDetails: seller,
    shipping: { name: "A", address: "1 Road", city: "City", state, pincode: "560001", country: "India" }
  };
}

describe("combos are taxed by their components", () => {
  afterEach(() => mock.restoreAll());

  it("split the combo price by component value; each keeps its own code and rate", async () => {
    const t = await checkout([{ product: "combo1", quantity: 1 }]);
    const combo = t.normalizedItems[0];
    const parts = combo.tax.parts;
    assert.deepEqual(parts.map((p) => [p.hsnSac, p.rate]), [["4901", 0], ["998433", 18], ["8523", 18]]);
    assert.deepEqual(parts.map((p) => p.total), [505.71, 421.43, 252.86], "1180 shared 600 : 500 : 300");
    assert.equal(round(parts.reduce((a, p) => a + p.total, 0)), 1180);
    assert.equal(combo.tax.rate, null, "mixed rates");
    assert.equal(combo.tax.tax, round(parts.reduce((a, p) => a + p.tax, 0)));
    assert.equal(parts[0].tax, 0, "no GST on the book's share");
  });

  it("a component the customer already owns takes no share", () => {
    const item = normalizeOrderItem(products[0], { quantity: 1 });
    item.bundleItems[1].owned = true;
    const parts = comboParts(item);
    assert.deepEqual(parts.map((p) => p.name), ["Bhagavad Gita (Paperback)", "Gita lectures USB drive"]);
    const t = comboTax({ gross: 680, parts, isLocal: false });
    assert.deepEqual(t.parts.map((p) => p.total), [453.33, 226.67]);
  });

  it("the invoice, line register and GST summary show each component", async () => {
    const t = await checkout([{ product: "combo1", quantity: 1 }, { product: "web2", quantity: 1 }]);
    const order = asOrder(t);
    const inv = buildInvoice(order);
    assert.equal(inv.lines[0].parts.length, 3);
    assert.equal(inv.lines[0].hsnSac, "", "codes are on the component rows");

    const lines = buildFinanceReport("lines", { invoicedOrders: [order], period: {} });
    const col = (row, name) => row[LINE_HEADERS.indexOf(name)];
    const components = lines.rows.filter((r) => col(r, "Type") === "Combo component");
    assert.deepEqual(components.map((r) => col(r, "HSN/SAC")), ["4901", "998433", "8523"]);
    assert.ok(components.every((r) => col(r, "Part Of Combo") === "Gita Study Combo"));

    const gst = buildFinanceReport("gst", { invoicedOrders: [order], refundedOrders: [], period: {} });
    const g = (row, name) => row[GST_HEADERS.indexOf(name)];
    const byHsn = gst.rows.filter((r) => g(r, "Section").startsWith("Sales by HSN"));
    assert.deepEqual([...new Set(byHsn.map((r) => g(r, "HSN/SAC")))].sort(), ["4901", "8523", "998433"]);
  });

  it("returning a combo reverses each component at its own rate", async () => {
    const t = await checkout([{ product: "combo1", quantity: 1 }, { product: "book2", quantity: 1 }]);
    const order = asOrder(t);
    const cn = buildCreditNote(order, { amountMinor: 118000, itemIds: ["combo1"], creditNoteNumber: "CN/2026-27/0001", at: new Date() });
    assert.deepEqual(cn.lines.map((l) => l.name), ["Gita Study Combo"]);
    assert.equal(cn.totals.grandTotal, 1180);
    assert.equal(cn.totals.tax, round(64.29 + 38.57));
  });
});

describe("delivery is part of the taxable value", () => {
  afterEach(() => mock.restoreAll());

  it("base price + delivery + GST = total, with the fee the customer pays unchanged", async () => {
    for (const state of ["Karnataka", "Maharashtra"]) {
      const t = await checkout([{ product: "book2", quantity: 1 }, { product: "usb2", quantity: 1 }], state);
      const fee = t.deliveryFee;
      assert.ok(fee > 0);
      assert.equal(t.total, round(400 + 236 + fee), "the customer pays the same: items + the delivery fee");
      assert.equal(t.total, round(t.subtotal + t.deliveryCharge + t.gstAmount));
      const d = t.taxDetails.delivery;
      assert.equal(d.gross, fee);
      // The fee is split over the book and the USB drive by value (400 : 236)
      const [bookShare, usbShare] = splitByWeights(fee, [400, 236]);
      assert.deepEqual(d.parts.map((p) => [p.hsnSac, p.rate, p.total]), [["4901", 0, bookShare], ["8523", 18, usbShare]]);
      assert.equal(d.tax, round(usbShare - round(usbShare / 1.18)), "18% inside the USB share only");
      assert.equal(round(d.taxable + d.tax), fee);
      if (state === "Karnataka") assert.equal(round(t.taxDetails.cgstAmount + t.taxDetails.sgstAmount), t.gstAmount);
      else assert.equal(t.taxDetails.igstAmount, t.gstAmount);
    }
  });

  it("printed books only: delivery carries no GST", async () => {
    const t = await checkout([{ product: "book2", quantity: 2 }]);
    assert.ok(t.deliveryFee > 0);
    assert.equal(t.taxDetails.delivery.tax, 0);
    assert.equal(t.gstAmount, 0);
    assert.equal(t.deliveryCharge, t.deliveryFee);
  });

  it("digital-only orders have no delivery", async () => {
    const t = await checkout([{ product: "web2", quantity: 1 }]);
    assert.equal(t.deliveryFee, 0);
    assert.equal(t.taxDetails.delivery.gross, 0);
  });

  it("the invoice and master register show it the same way", async () => {
    const t = await checkout([{ product: "book2", quantity: 1 }, { product: "usb2", quantity: 1 }]);
    const order = asOrder(t);
    const inv = buildInvoice(order);
    assert.equal(inv.delivery.taxed, true);
    assert.equal(inv.totals.deliveryCharge, t.deliveryCharge);
    assert.equal(inv.totals.grandTotal, t.total);
    assert.equal(round(inv.totals.taxable + inv.totals.deliveryCharge + inv.totals.tax), t.total);
    assert.equal(round(inv.rates.reduce((a, r) => a + r.taxable, 0)), inv.totals.totalTaxable);

    const sales = buildFinanceReport("sales", { invoicedOrders: [order], periodOrders: [], period: {} });
    const col = (name) => sales.rows[0][SALES_HEADERS.indexOf(name)];
    assert.equal(col("Delivery (Taxable) INR"), t.deliveryCharge.toFixed(2));
    assert.equal(col("Check Difference INR"), "0.00");
    assert.equal(col("Total Tax INR"), t.gstAmount.toFixed(2));
  });

  it("a whole-order refund gives back the full fee and reverses its GST", async () => {
    const t = await checkout([{ product: "book2", quantity: 1 }, { product: "usb2", quantity: 1 }]);
    const order = asOrder(t);
    const quote = computeRefundQuote({ order, itemIds: [], reason: "store_fault", gatewayFeePaise: 0 });
    assert.equal(quote.refundable, t.total, "items + the delivery fee as paid (GST included)");
    const cn = buildCreditNote(order, { amountMinor: Math.round(t.total * 100), creditNoteNumber: "CN/2026-27/0002", at: new Date() });
    assert.equal(cn.totals.grandTotal, t.total);
    assert.equal(cn.totals.deliveryTax, t.taxDetails.delivery.tax);
    assert.equal(cn.totals.tax, t.gstAmount);
  });

  it("older orders keep untaxed delivery, as charged then", () => {
    const inv = buildInvoice({
      _id: "6730f1a2b3c4d5e6f7a8b9d1", invoiceNumber: "DSG/2026-27/0002", paymentStatus: "Paid", deliveryCharge: 60, total: 460,
      items: [{ name: "Book", category: "Books", price: 400, quantity: 1, tax: { gross: 400, discount: 0, taxable: 400, rate: 0, cgst: 0, sgst: 0, igst: 0, tax: 0, total: 400 } }],
      taxDetails: { isLocal: true }, sellerDetails: seller, shipping: { state: "Karnataka", country: "India" }
    });
    assert.equal(inv.delivery.taxed, false);
    assert.equal(inv.totals.deliveryCharge, 60);
    assert.equal(inv.totals.grandTotal, 460);
  });

  it("splits exactly", () => {
    assert.deepEqual(splitByWeights(100, [1, 1, 1]), [33.33, 33.33, 33.34]);
    assert.deepEqual(deliveryTax({ amount: 0, units: [] }).parts, []);
  });

  it("renders the invoice and credit note PDFs", async () => {
    const t = await checkout([{ product: "combo1", quantity: 1 }, { product: "usb2", quantity: 1 }]);
    const order = asOrder(t);
    assert.equal((await generateInvoicePdfBuffer(order)).subarray(0, 5).toString(), "%PDF-");
    const pdf = await generateCreditNotePdfBuffer(order, { amountMinor: Math.round(t.total * 100), creditNoteNumber: "CN/2026-27/0003", at: new Date() });
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  });
});

describe("payout summaries", () => {
  const ts = (iso) => Math.floor(new Date(iso).getTime() / 1000);
  const tx = (id, type, settledIso, { amount = 0, fee = 0, tax = 0, credit = 0, debit = 0, setl = "setl_A", utr = "UTR1", payment_id = null } = {}) => ({
    entity_id: id, type, payment_id, amount, fee, tax, credit, debit, currency: "INR",
    settled_at: ts(settledIso), created_at: ts(settledIso) - 86400, settlement_id: setl, settlement_utr: utr
  });
  const items = [
    tx("pay_1", "payment", "2026-11-02T06:00:00Z", { amount: 100000, fee: 2360, tax: 360, credit: 97640 }),
    tx("pay_2", "payment", "2026-11-02T06:00:00Z", { amount: 50000, fee: 1180, tax: 180, credit: 48820 }),
    tx("rfnd_1", "refund", "2026-11-02T06:00:00Z", { amount: 20000, debit: 20000, payment_id: "pay_1" }),
    tx("pay_3", "payment", "2026-11-10T06:00:00Z", { amount: 30000, fee: 708, tax: 108, credit: 29292, setl: "setl_B", utr: "UTR2" }),
    tx("adj_1", "adjustment", "2026-12-01T06:00:00Z", { amount: 500, credit: 500, setl: "setl_C", utr: "UTR3" })
  ];
  const orders = [{ _id: "6730f1a2b3c4d5e6f7a8b9c0", invoiceNumber: "DSG/2026-27/0001", paymentMeta: { razorpayPaymentId: "pay_1", refunds: [{ refundId: "rfnd_1", creditNoteNumber: "CN/2026-27/0001" }] } }];
  const col = (row, name) => row[PAYOUT_SUMMARY_HEADERS.indexOf(name)];
  const netOf = (rows) => round(rows.reduce((a, r) => a + Number(col(r, "Net To Bank")), 0));

  it("add up per settlement, day, week, month and financial year", () => {
    const perSettlement = payoutSummaryRows(items, orders, "settlement");
    assert.deepEqual(perSettlement.map((r) => col(r, "Period")), ["setl_A", "setl_B", "setl_C"]);
    const a = perSettlement[0];
    assert.equal(col(a, "Payments"), "2");
    assert.equal(col(a, "Payments Amount"), "1500.00");
    assert.equal(col(a, "Refunds Amount"), "200.00");
    assert.equal(col(a, "Fees (incl. GST)"), "35.40");
    assert.equal(col(a, "GST On Fees"), "5.40");
    assert.equal(col(a, "Net To Bank"), "1264.60");
    assert.equal(col(a, "Settlement UTRs"), "UTR1");
    assert.equal(col(a, "Unmatched"), "1", "pay_2 has no invoice here");

    assert.equal(payoutSummaryRows(items, orders, "day").length, 3);
    const weeks = payoutSummaryRows(items, orders, "week");
    assert.deepEqual(weeks.map((r) => col(r, "From")), ["2026-11-02", "2026-11-09", "2026-11-30"], "weeks start on Monday");
    const months = payoutSummaryRows(items, orders, "month");
    assert.deepEqual(months.map((r) => col(r, "Period")), ["Nov 2026", "Dec 2026"]);
    const years = payoutSummaryRows(items, orders, "year");
    assert.deepEqual(years.map((r) => col(r, "Period")), ["FY 2026-27"]);
    for (const g of ["settlement", "day", "week", "month", "year"]) {
      assert.equal(netOf(payoutSummaryRows(items, orders, g)), round(1264.60 + 292.92 + 5), g);
    }
  });

  it("financial years run April to March", () => {
    assert.equal(payoutPeriod({ settled_at: ts("2027-03-31T10:00:00Z") }, "year").label, "FY 2026-27");
    assert.equal(payoutPeriod({ settled_at: ts("2027-04-01T10:00:00Z") }, "year").label, "FY 2027-28");
  });
});

describe("product tax codes report", () => {
  it("lists each product's code and rate, and each combo component's share", () => {
    const rows = productTaxRows(products);
    const col = (row, name) => row[PRODUCT_TAX_HEADERS.indexOf(name)];
    const byName = (n) => rows.find((r) => col(r, "Product") === n);
    assert.equal(col(byName("Sanskrit Primer (Paperback)"), "HSN/SAC"), "4901");
    assert.equal(col(byName("Amarakosha Flipbook"), "GST Rate %"), "18");
    assert.equal(col(byName("Vedic chanting USB drive"), "Tax Category"), "USB device");
    assert.equal(col(byName("Gita Study Combo"), "Type"), "Combo");
    const parts = rows.filter((r) => col(r, "Component Of") === "Gita Study Combo");
    assert.deepEqual(parts.map((r) => col(r, "Share Of Combo Price (INR)")), ["505.71", "421.43", "252.86"]);
    assert.equal(col(parts[0], "Set On Product"), "No (guessed)");
  });
});
