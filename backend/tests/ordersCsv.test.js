const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("ordersCsv utility (pure)", async () => {
  const {
    buildOrdersCsv,
    splitName,
    resolveStateCode,
    resolveCountryCode,
    resolveOrderStatus,
    escapeCsvCell,
    ORDER_CSV_HEADERS
  } = await import("../../src/utils/ordersCsv.js");

  it("prepends the UTF-8 BOM (\\uFEFF)", () => {
    const csv = buildOrdersCsv([]);
    assert.equal(csv.startsWith("\uFEFF"), true);
    assert.equal(csv.charCodeAt(0), 0xfeff);
  });

  it("splits names at first space and leaves last name blank for single word", () => {
    assert.deepEqual(splitName("Ram Sharma"), { firstName: "Ram", lastName: "Sharma" });
    assert.deepEqual(splitName("Vyoma"), { firstName: "Vyoma", lastName: "" });
    assert.deepEqual(splitName("Sri Ram Sharma"), { firstName: "Sri", lastName: "Ram Sharma" });
    assert.deepEqual(splitName(""), { firstName: "", lastName: "" });
    assert.deepEqual(splitName(null), { firstName: "", lastName: "" });
  });

  it("maps Indian state names to 2-letter codes and handles variations", () => {
    assert.equal(resolveStateCode("Karnataka"), "KA");
    assert.equal(resolveStateCode("maharashtra"), "MH");
    assert.equal(resolveStateCode("Tamil Nadu"), "TN");
    assert.equal(resolveStateCode("Telangana"), "TS");
    assert.equal(resolveStateCode("Delhi"), "DL");
    assert.equal(resolveStateCode("Odisha"), "OD");
    assert.equal(resolveStateCode("Orissa"), "OD");
    assert.equal(resolveStateCode("West Bengal"), "WB");
    assert.equal(resolveStateCode("KA"), "KA");
    assert.equal(resolveStateCode("ka"), "KA");
    // Unknown non-Indian/non-US states keep original text
    assert.equal(resolveStateCode("Ontario"), "Ontario");
    assert.equal(resolveStateCode("Bavaria"), "Bavaria");
    // Missing is blank
    assert.equal(resolveStateCode(""), "");
    assert.equal(resolveStateCode(null), "");
  });

  it("maps 50 US state names plus DC to 2-letter codes (checked after Indian states)", () => {
    assert.equal(resolveStateCode("California"), "CA");
    assert.equal(resolveStateCode("california"), "CA");
    assert.equal(resolveStateCode("Texas"), "TX");
    assert.equal(resolveStateCode("texas"), "TX");
    assert.equal(resolveStateCode("New York"), "NY");
    assert.equal(resolveStateCode("District of Columbia"), "DC");
    assert.equal(resolveStateCode("Washington DC"), "DC");
    assert.equal(resolveStateCode("Washington D.C."), "DC");
    assert.equal(resolveStateCode("Florida"), "FL");
    assert.equal(resolveStateCode("Illinois"), "IL");
    // 2-letter US code kept uppercase
    assert.equal(resolveStateCode("CA"), "CA");
    assert.equal(resolveStateCode("tx"), "TX");
    // Indian state takes precedence if matched
    assert.equal(resolveStateCode("Goa"), "GA");
  });

  it("maps country names from countryOptions.js to ISO 3166-1 alpha-2", () => {
    assert.equal(resolveCountryCode("India"), "IN");
    assert.equal(resolveCountryCode("United States"), "US");
    assert.equal(resolveCountryCode("USA"), "US");
    assert.equal(resolveCountryCode("United Kingdom"), "GB");
    assert.equal(resolveCountryCode("UK"), "GB");
    assert.equal(resolveCountryCode("Canada"), "CA");
    assert.equal(resolveCountryCode("Australia"), "AU");
    assert.equal(resolveCountryCode("Germany"), "DE");
    assert.equal(resolveCountryCode("IN"), "IN");
    assert.equal(resolveCountryCode("us"), "US");
    // Unknown keeps original
    assert.equal(resolveCountryCode("Wakanda"), "Wakanda");
    // Missing is blank
    assert.equal(resolveCountryCode(""), "");
    assert.equal(resolveCountryCode(null), "");
  });

  it("applies formula injection guard to text cells but skips phone numbers", () => {
    // Phone numbers matching /^\+?[\d\s().-]{6,}$/ are NOT prefixed
    assert.equal(escapeCsvCell("+919876543210", false), '"+919876543210"');
    assert.equal(escapeCsvCell("+1 (555) 123-4567", false), '"+1 (555) 123-4567"');
    assert.equal(escapeCsvCell("9876543210", false), '"9876543210"');
    assert.equal(escapeCsvCell("+91-9876-543210", false), '"+91-9876-543210"');

    // Formulas or dangerous leading characters starting with = + - @ tab or CR ARE prefixed
    assert.equal(escapeCsvCell("=1+1", false), "\"'=1+1\"");
    assert.equal(escapeCsvCell("-dangerous", false), "\"'-dangerous\"");
    assert.equal(escapeCsvCell("@admin", false), "\"'@admin\"");
    assert.equal(escapeCsvCell("+cmd", false), "\"'+cmd\"");
    assert.equal(escapeCsvCell("  =cmd", false), "\"'  =cmd\"");

    // Safe text is normal
    assert.equal(escapeCsvCell("Standard Text", false), "\"Standard Text\"");

    // Numeric cells (isNumeric = true) do NOT get formula guard
    assert.equal(escapeCsvCell("100.00", true), "\"100.00\"");
    assert.equal(escapeCsvCell("-50.00", true), "\"-50.00\"");
  });

  it("resolves order status applying rules a to f in order", () => {
    const getStatus = (o) => o?.status || "Pending";
    const getPaymentStatus = (o) => o?.paymentStatus || "Paid";

    // a) payment status "Failed" -> "Failed"
    const orderA = { paymentStatus: "Failed", refundStatus: "Refunded", status: "Cancelled" };
    assert.equal(resolveOrderStatus(orderA, { getStatus, getPaymentStatus }), "Failed");

    // b) refundStatus "Refunded" -> "Refunded"
    const orderB = { paymentStatus: "Paid", refundStatus: "Refunded", status: "Delivered" };
    assert.equal(resolveOrderStatus(orderB, { getStatus, getPaymentStatus }), "Refunded");

    // c) refundStatus "Partially Refunded" -> "Partially refunded"
    const orderC = { paymentStatus: "Paid", refundStatus: "Partially Refunded", status: "Delivered" };
    assert.equal(resolveOrderStatus(orderC, { getStatus, getPaymentStatus }), "Partially refunded");

    // d) order cancelled and refundStatus "Pending" or "Processing" -> "Cancelled (refund pending)"
    const orderD1 = { paymentStatus: "Paid", refundStatus: "Pending", status: "Cancelled" };
    assert.equal(resolveOrderStatus(orderD1, { getStatus, getPaymentStatus }), "Cancelled (refund pending)");
    const orderD2 = { paymentStatus: "Paid", refundStatus: "Processing", status: "Cancelled" };
    assert.equal(resolveOrderStatus(orderD2, { getStatus, getPaymentStatus }), "Cancelled (refund pending)");

    // e) payment status not "Paid" and order not cancelled -> "On hold (unpaid)"
    const orderE1 = { paymentStatus: "Pending", refundStatus: "Not Applicable", status: "Pending" };
    assert.equal(resolveOrderStatus(orderE1, { getStatus, getPaymentStatus }), "On hold (unpaid)");
    const orderE2 = { paymentStatus: "Unpaid", refundStatus: "Not Applicable", status: "Processing" };
    assert.equal(resolveOrderStatus(orderE2, { getStatus, getPaymentStatus }), "On hold (unpaid)");

    // f) otherwise getStatus(order) unchanged
    const orderF1 = { paymentStatus: "Paid", refundStatus: "Not Applicable", status: "Delivered" };
    assert.equal(resolveOrderStatus(orderF1, { getStatus, getPaymentStatus }), "Delivered");
    const orderF2 = { paymentStatus: "Paid", refundStatus: "Not Applicable", status: "Cancelled" };
    assert.equal(resolveOrderStatus(orderF2, { getStatus, getPaymentStatus }), "Cancelled");
  });

});

describe("orders CSV layout (matches the order page summary)", async () => {
  const { buildOrdersCsv, ORDER_CSV_HEADERS, orderSummary } = await import("../../src/utils/ordersCsv.js");
  const col = (name) => {
    const i = ORDER_CSV_HEADERS.indexOf(name);
    assert.ok(i >= 0, `column ${name}`);
    return i;
  };
  const rowsOf = (orders, opts) =>
    buildOrdersCsv(orders, opts).slice(1).split("\r\n").slice(1).map((l) => l.split(",").map((c) => c.replace(/^"|"$/g, "")));

  // The example from the order page: Subtotal 218.64 + GST 30.36 + Delivery 28.32 = 277.32
  const example = {
    _id: "6aec0ec4adba49d272a66a7b",
    invoiceNumber: "DSG/2026-27/0003",
    createdAt: "2026-11-05T05:06:00Z",
    status: "Pending",
    paymentStatus: "Paid",
    billing: { name: "Manjushree RJ", email: "m@example.com", phone: "8147682335", city: "Bengaluru", state: "Karnataka", country: "India" },
    currencyDisplay: { currency: "INR", amount: 277.32 },
    subtotal: 218.64, gstAmount: 30.36, deliveryCharge: 28.32, discount: 0, total: 277.32,
    items: [
      { name: "Saptaha Stotra Sangraha", category: "Book - Paperback", hsnSac: "4901", price: 99, quantity: 1,
        tax: { discount: 0, taxable: 99, rate: 0, tax: 0, total: 99 } },
      { name: "Web Version", category: "Web Version", hsnSac: "998433", price: 150, quantity: 1,
        tax: { discount: 0, taxable: 119.64, rate: 18, tax: 30.36, total: 150 } }
    ]
  };

  it("has clear, grouped column names", () => {
    assert.deepEqual(ORDER_CSV_HEADERS.slice(0, 5), ["Invoice No", "Order ID", "Order Date (IST)", "Order Status", "Payment Status"]);
    for (const h of ["Subtotal (Excl. GST)", "Discount", "Coupon Code", "GST", "Delivery", "Order Total", "Order Total INR"]) col(h);
    const csv = buildOrdersCsv([]);
    assert.equal(csv.slice(1).split("\r\n")[0].split(",").length, ORDER_CSV_HEADERS.length);
  });

  it("shows the order summary exactly as on the order page", () => {
    const [row] = rowsOf([example]);
    assert.equal(row[col("Subtotal (Excl. GST)")], "218.64");
    assert.equal(row[col("GST")], "30.36");
    assert.equal(row[col("Delivery")], "28.32");
    assert.equal(row[col("Order Total")], "277.32");
    assert.equal(row[col("Discount")], "0.00");
    const s = orderSummary(example);
    assert.equal(Math.round((s.subtotal + s.gst + s.delivery) * 100) / 100, s.total, "subtotal + GST + delivery = total");
  });

  it("item subtotals add up to the order subtotal, item GST to the items' GST", () => {
    const rows = rowsOf([example]);
    const sum = (h) => Math.round(rows.reduce((a, r) => a + Number(r[col(h)]), 0) * 100) / 100;
    assert.equal(sum("Item Subtotal (Excl. GST)"), 218.64);
    assert.equal(sum("Item GST"), 30.36);
    assert.equal(rows[1][col("GST Rate %")], "18");
  });

  it("prints the summary on the first row of each order only; order and customer on every row", () => {
    const rows = rowsOf([example]);
    assert.equal(rows[1][col("Order Total")], "");
    assert.equal(rows[1][col("Subtotal (Excl. GST)")], "");
    assert.equal(rows[1][col("Invoice No")], "DSG/2026-27/0003");
    assert.equal(rows[1][col("Customer Name")], "Manjushree RJ");
  });

  it("shows the discount separately, with the coupon code", () => {
    const [row] = rowsOf([{ ...example, discount: 25, couponCode: "DIWALI10", subtotal: 193.64, total: 252.32 }]);
    assert.equal(row[col("Discount")], "25.00");
    assert.equal(row[col("Coupon Code")], "DIWALI10");
    assert.equal(row[col("Subtotal (Excl. GST)")], "193.64");
  });

  it("uses the invoice number and the short order ID shown on the Orders page", () => {
    const [row] = rowsOf([example]);
    assert.equal(row[col("Invoice No")], "DSG/2026-27/0003");
    assert.equal(row[col("Order ID")], "#A66A7B");
    const [unpaid] = rowsOf([{ ...example, invoiceNumber: "", paymentStatus: "Failed" }]);
    assert.equal(unpaid[col("Invoice No")], "");
    assert.equal(unpaid[col("Payment Status")], "Failed");
  });

  it("gives the summary in INR at the order's own rate for foreign-currency orders", () => {
    const [row] = rowsOf([{
      _id: "x1", subtotal: 10, gstAmount: 0, deliveryCharge: 0, discount: 0, total: 10, totalInInr: 840, fxRateToInr: 84,
      currencyDisplay: { currency: "USD", amount: 10 },
      items: [{ name: "Web", price: 10, quantity: 1, tax: { discount: 0, taxable: 10, rate: 0, tax: 0, total: 10 } }]
    }]);
    assert.equal(row[col("Currency")], "USD");
    assert.equal(row[col("Order Total")], "10.00");
    assert.equal(row[col("FX Rate To INR")], "84.000000");
    assert.equal(row[col("Subtotal (Excl. GST) INR")], "840.00");
    assert.equal(row[col("Order Total INR")], "840.00");
  });

  it("an order with no items still gets one row with its summary", () => {
    const rows = rowsOf([{ ...example, items: [] }]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0][col("Order Total")], "277.32");
    assert.equal(rows[0][col("Product Name")], "");
  });
});

describe("orders CSV: tax and basic value per line", async () => {
  const { orderLineTaxes } = await import("../../src/utils/ordersCsv.js");

  it("basic value = item cost x quantity - discount - tax", () => {
    const [line] = orderLineTaxes({ items: [{ price: 118, quantity: 3, tax: { discount: 54, taxable: 254.24, tax: 45.76, total: 300, rate: 18 } }] });
    assert.equal(Math.round((118 * 3 - line.discount - line.tax) * 100) / 100, line.taxable);
  });

  it("shows each rate of a combo's components", () => {
    const [line] = orderLineTaxes({
      items: [{ price: 500, quantity: 1, tax: { discount: 0, taxable: 450, tax: 50, total: 500, parts: [{ rate: 0 }, { rate: 18 }, { rate: 18 }] } }]
    });
    assert.equal(line.rate, "0/18");
  });

  it("works out older orders saved without line tax: discount share and the product's rate", () => {
    const lines = orderLineTaxes({
      discount: 30,
      gstAmount: 10,
      gstPercent: 18,
      shipping: { country: "India" },
      items: [{ price: 118, quantity: 1, gstRate: 18 }, { price: 200, quantity: 1 }]
    });
    assert.equal(lines[0].discount + lines[1].discount, 30);
    assert.equal(lines[0].rate, 18);
    assert.equal(lines[1].rate, 18, "store rate when the order had GST");
    for (const l of lines) assert.equal(Math.round((l.taxable + l.tax) * 100) / 100, l.total);
  });

  it("no GST on older orders shipped outside India", () => {
    const [line] = orderLineTaxes({ gstAmount: 5, gstPercent: 18, shipping: { country: "United States" }, items: [{ price: 20, quantity: 1, gstRate: 18 }] });
    assert.equal(line.tax, 0);
    assert.equal(line.taxable, 20);
  });
});
