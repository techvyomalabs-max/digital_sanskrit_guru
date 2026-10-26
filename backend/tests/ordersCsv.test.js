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

  it("header text matches spec character for character", () => {
    const expectedHeaderStr =
      "Order Number, Order Status, Order Date, First Name (Billing), Last Name (Billing), " +
      "Address 1&2 (Billing), City (Billing), State Code (Billing), Country Code (Billing), " +
      "Email (Billing), Phone (Billing), Product Name, billing code, Category, Quantity, " +
      "Product Variation, Cart Discount Amount, Order Shipping Amount, Currency, Item Cost, " +
      "Order Total Tax Amount, Order Total Amount";

    const expectedHeaders = expectedHeaderStr.split(", ");
    assert.deepEqual(ORDER_CSV_HEADERS, expectedHeaders);

    const csv = buildOrdersCsv([]);
    const firstLine = csv.slice(1).split("\r\n")[0]; // slice off BOM
    const headerCells = firstLine.split(",").map((c) => c.replace(/^"|"$/g, ""));
    assert.deepEqual(headerCells, expectedHeaders);
  });

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

  it("handles order number modes (invoiceNumber default with fallback, and shortCode)", () => {
    const orderWithInvoice = {
      _id: "661234567890abcdef123456",
      invoiceNumber: "INV-2026-001"
    };
    const orderWithoutInvoice = {
      _id: "661234567890abcdef654321"
    };

    // Default mode: invoiceNumber (uses invoiceNumber if present, fallback to slice(-6))
    const csvDefault1 = buildOrdersCsv([orderWithInvoice]);
    assert.match(csvDefault1, /"INV-2026-001"/);

    const csvDefault2 = buildOrdersCsv([orderWithoutInvoice]);
    assert.match(csvDefault2, /"654321"/);

    // shortCode mode: always slice(-6)
    const csvShortCode = buildOrdersCsv([orderWithInvoice], {
      config: { orderNumberMode: "shortCode" }
    });
    assert.match(csvShortCode, /"123456"/);
  });

  it("prints order-level totals on the first row only and blanks them on subsequent rows", () => {
    const sampleOrder = {
      _id: "661234567890abcdef123456",
      invoiceNumber: "INV-2026-089",
      status: "Delivered",
      paymentStatus: "Paid",
      createdAt: "2026-10-16T10:30:00.000Z",
      billing: {
        name: "Abhishek Rao",
        address: "123 Temple Road",
        city: "Bengaluru",
        state: "Karnataka",
        country: "India",
        email: "abhishek@example.com",
        phone: "+919988776655"
      },
      discount: 50,
      deliveryCharge: 80,
      gstAmount: 18,
      total: 1048,
      items: [
        {
          name: "Sanskrit Grammar Book",
          category: "Books",
          quantity: 1,
          price: 500
        },
        {
          name: "Gita Study Guide",
          category: "Scriptures",
          quantity: 2,
          price: 250
        }
      ]
    };

    const csv = buildOrdersCsv([sampleOrder], {
      getStatus: (o) => o.status,
      getPaymentStatus: (o) => o.paymentStatus
    });
    const lines = csv.slice(1).split("\r\n"); // Remove BOM and split
    assert.equal(lines.length, 3); // 1 header + 2 items

    const row1 = lines[1].split(",");
    const row2 = lines[2].split(",");

    // Row 1 checks:
    // Order Number (invoiceNumber mode default)
    assert.equal(row1[0], "\"INV-2026-089\"");
    // Status
    assert.equal(row1[1], "\"Delivered\"");
    // Names
    assert.equal(row1[3], "\"Abhishek\"");
    assert.equal(row1[4], "\"Rao\"");
    // State Code & Country Code
    assert.equal(row1[7], "\"KA\"");
    assert.equal(row1[8], "\"IN\"");
    // Phone (not prefixed by formula guard)
    assert.equal(row1[10], "\"+919988776655\"");
    // Product 1
    assert.equal(row1[11], "\"Sanskrit Grammar Book\"");
    assert.equal(row1[12], "\"4901\""); // Book HSN
    assert.equal(row1[14], "\"1\""); // Qty
    // Order Totals present on row 1
    assert.equal(row1[16], "\"50.00\""); // Cart Discount
    assert.equal(row1[17], "\"80.00\""); // Shipping
    assert.equal(row1[18], "\"INR\"");   // Currency
    assert.equal(row1[19], "\"500.00\""); // Item Cost
    assert.equal(row1[20], "\"18.00\""); // Tax
    assert.equal(row1[21], "\"1048.00\""); // Total

    // Row 2 checks:
    // Same Order Number and customer info
    assert.equal(row2[0], "\"INV-2026-089\"");
    assert.equal(row2[11], "\"Gita Study Guide\"");
    assert.equal(row2[12], "\"4901\"");
    assert.equal(row2[14], "\"2\"");
    assert.equal(row2[19], "\"250.00\"");
    // Order Totals blanked on row 2
    assert.equal(row2[16], "\"\"");
    assert.equal(row2[17], "\"\"");
    assert.equal(row2[18], "\"INR\"");
    assert.equal(row2[20], "\"\"");
    assert.equal(row2[21], "\"\"");
  });

  it("handles combo / bundle variation string correctly and resolves US state", () => {
    const bundleOrder = {
      _id: "661234567890abcdef999999",
      invoiceNumber: "INV-2026-999",
      paymentStatus: "Paid",
      createdAt: "2026-10-16T12:00:00.000Z",
      billing: {
        name: "John Doe",
        state: "California",
        country: "United States"
      },
      currencyDisplay: { currency: "USD" },
      total: 75.0,
      items: [
        {
          name: "Sanskrit Starter Combo",
          productType: "bundle",
          category: "Combo",
          quantity: 1,
          price: 75.0,
          bundleItems: [
            { name: "Grammar Vol 1", quantity: 1 },
            { name: "Workbook", quantity: 2 }
          ]
        }
      ]
    };

    const csv = buildOrdersCsv([bundleOrder], {
      getStatus: () => "Completed",
      getPaymentStatus: () => "Paid"
    });
    const lines = csv.slice(1).split("\r\n");
    const row = lines[1].split(",");

    assert.equal(row[0], "\"INV-2026-999\"");
    assert.equal(row[8], "\"US\"");
    assert.equal(row[7], "\"CA\""); // California mapped to CA
    assert.equal(row[11], "\"Sanskrit Starter Combo\"");
    assert.equal(row[15], "\"Includes: Grammar Vol 1 x1; Workbook x2\"");
    assert.equal(row[18], "\"USD\"");
    assert.equal(row[19], "\"75.00\"");
  });
});
