const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  roundMoney,
  getFxRate,
  toInr,
  getPlaceOfSupply,
  getTaxSplit,
  buildInvoiceRow,
  reverseTaxProportionally,
  buildCreditNoteRows,
  summarize
} = require("../utils/financeLedger");

describe("financeLedger utility", () => {
  const defaultSettings = {
    businessDetails: {
      state: "Karnataka"
    },
    warehouseLocation: {
      state: "Karnataka"
    }
  };

  it("1. Local INR order with saved taxDetails -> CGST/SGST from taxDetails, taxSource: 'invoice'", () => {
    const order = {
      _id: "order123",
      invoiceNumber: "DSG-2026-0001",
      createdAt: new Date("2026-10-05T10:00:00Z"),
      currencyDisplay: { currency: "INR" },
      subtotal: 1000,
      total: 1180,
      gstAmount: 180,
      shipping: {
        country: "India",
        state: "Karnataka"
      },
      taxDetails: {
        cgstPercent: 9,
        sgstPercent: 9,
        igstPercent: 0,
        cgstAmount: 90,
        sgstAmount: 90,
        igstAmount: 0
      }
    };

    const row = buildInvoiceRow(order, defaultSettings);
    assert.strictEqual(row.taxSource, "invoice");
    assert.strictEqual(row.cgst, 90);
    assert.strictEqual(row.sgst, 90);
    assert.strictEqual(row.igst, 0);
    assert.strictEqual(row.placeOfSupply, "Karnataka");
    assert.strictEqual(row.isExport, false);
    assert.strictEqual(row.warnings.includes("tax_recomputed"), false);
  });

  it("2. Same order but taxDetails all zero and gstAmount > 0, state matches businessDetails.state (not warehouse) -> recomputed CGST/SGST", () => {
    const settingsDifferentStates = {
      businessDetails: { state: "Maharashtra" },
      warehouseLocation: { state: "Karnataka" }
    };

    const order = {
      _id: "order124",
      invoiceNumber: "DSG-2026-0002",
      createdAt: new Date("2026-10-06T10:00:00Z"),
      currencyDisplay: { currency: "INR" },
      subtotal: 1000,
      total: 1180,
      gstAmount: 180,
      shipping: {
        country: "India",
        state: "Maharashtra"
      },
      taxDetails: {
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0
      }
    };

    const row = buildInvoiceRow(order, settingsDifferentStates);
    assert.strictEqual(row.taxSource, "recomputed");
    assert.strictEqual(row.cgst, 90);
    assert.strictEqual(row.sgst, 90);
    assert.strictEqual(row.igst, 0);
    assert.strictEqual(row.placeOfSupply, "Maharashtra");
    assert.strictEqual(row.warnings.includes("tax_recomputed"), true);
  });

  it("3. Digital order with no shipping state -> IGST (when recomputed), Place of Supply 'Not recorded', warning present. Never 'Karnataka'.", () => {
    const order = {
      _id: "order125",
      invoiceNumber: "DSG-2026-0003",
      createdAt: new Date("2026-10-07T10:00:00Z"),
      currencyDisplay: { currency: "INR" },
      subtotal: 500,
      total: 590,
      gstAmount: 90,
      shipping: {
        country: "India",
        state: ""
      },
      taxDetails: {
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0
      }
    };

    const row = buildInvoiceRow(order, defaultSettings);
    assert.strictEqual(row.taxSource, "recomputed");
    assert.strictEqual(row.cgst, 0);
    assert.strictEqual(row.sgst, 0);
    assert.strictEqual(row.igst, 90);
    assert.strictEqual(row.placeOfSupply, "Not recorded");
    assert.notStrictEqual(row.placeOfSupply, "Karnataka");
    assert.strictEqual(row.warnings.includes("missing_place_of_supply"), true);
    assert.strictEqual(row.warnings.includes("tax_recomputed"), true);
  });

  it("4. USD order: total: 20, fxRateToInr: 83, totalInInr: 1660, country 'US' -> totalInr 1660, Place of Supply 'Outside India (export)', isExport: true", () => {
    const order = {
      _id: "order126",
      invoiceNumber: "DSG-2026-0004",
      createdAt: new Date("2026-10-08T10:00:00Z"),
      currencyDisplay: { currency: "USD" },
      total: 20,
      subtotal: 20,
      fxRateToInr: 83,
      totalInInr: 1660,
      shipping: {
        country: "US",
        state: "California"
      },
      taxDetails: {
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0
      }
    };

    const row = buildInvoiceRow(order, defaultSettings);
    assert.strictEqual(row.totalInr, 1660);
    assert.strictEqual(row.placeOfSupply, "Outside India (export)");
    assert.strictEqual(row.isExport, true);
    assert.strictEqual(row.currency, "USD");
    assert.strictEqual(row.originalTotal, 20);
    assert.strictEqual(row.warnings.includes("missing_fx_rate"), false);
  });

  it("5. Non-INR order missing fxRateToInr but with totalInInr -> rate derived; missing both -> missing_fx_rate warning", () => {
    const orderWithDerived = {
      _id: "order127a",
      invoiceNumber: "DSG-2026-0005a",
      createdAt: new Date("2026-10-09T10:00:00Z"),
      currencyDisplay: { currency: "EUR" },
      total: 10,
      totalInInr: 900,
      subtotal: 10,
      shipping: { country: "Germany", state: "Bavaria" }
    };

    const rate = getFxRate(orderWithDerived);
    assert.strictEqual(rate, 90);
    const rowA = buildInvoiceRow(orderWithDerived, defaultSettings);
    assert.strictEqual(rowA.warnings.includes("missing_fx_rate"), false);

    const orderMissingBoth = {
      _id: "order127b",
      invoiceNumber: "DSG-2026-0005b",
      createdAt: new Date("2026-10-09T10:00:00Z"),
      currencyDisplay: { currency: "EUR" },
      total: 10,
      subtotal: 10,
      shipping: { country: "Germany", state: "Bavaria" }
    };

    assert.strictEqual(getFxRate(orderMissingBoth), null);
    const rowB = buildInvoiceRow(orderMissingBoth, defaultSettings);
    assert.strictEqual(rowB.warnings.includes("missing_fx_rate"), true);
  });

  it("6. ₹900 order with refundedAmountInInr: 880 and one refund entry -> one credit note of ₹880, tax reversed proportionally; summary netReceivedInr = 20", () => {
    const order = {
      _id: "order128",
      invoiceNumber: "DSG-2026-0006",
      createdAt: new Date("2026-10-10T10:00:00Z"),
      currencyDisplay: { currency: "INR" },
      subtotal: 762.71,
      total: 900,
      totalInInr: 900,
      refundedAmountInInr: 880,
      refundStatus: "Partially Refunded",
      shipping: { country: "India", state: "Karnataka" },
      taxDetails: {
        cgstAmount: 68.64,
        sgstAmount: 68.65,
        igstAmount: 0
      },
      paymentMeta: {
        refunds: [
          {
            refundId: "rfnd_001",
            amountMinor: 88000,
            currency: "INR",
            method: "razorpay",
            reason: "Customer request",
            at: new Date("2026-10-11T12:00:00Z")
          }
        ]
      }
    };

    const invoiceRow = buildInvoiceRow(order, defaultSettings);
    const creditNotes = buildCreditNoteRows(order, invoiceRow, {
      from: new Date("2026-10-01T00:00:00+05:30"),
      to: new Date("2026-11-01T00:00:00+05:30")
    });

    assert.strictEqual(creditNotes.length, 1);
    const cn = creditNotes[0];
    assert.strictEqual(cn.refundInr, 880);
    assert.strictEqual(cn.taxTreatment, "proportional");

    // Ratio = 880 / 900 = 0.977777...
    const expectedCgst = roundMoney(68.64 * (880 / 900));
    const expectedSgst = roundMoney(68.65 * (880 / 900));
    assert.strictEqual(cn.cgst, expectedCgst);
    assert.strictEqual(cn.sgst, expectedSgst);

    const sm = summarize([invoiceRow], creditNotes);
    assert.strictEqual(sm.grossInvoicedInr, 900);
    assert.strictEqual(sm.refundsInr, 880);
    assert.strictEqual(sm.netReceivedInr, 20);
  });

  it("7. Two refund entries in different currencies -> credit-note rows add up exactly to refundedAmountInInr", () => {
    const order = {
      _id: "order129",
      invoiceNumber: "DSG-2026-0007",
      createdAt: new Date("2026-10-01T10:00:00Z"),
      currencyDisplay: { currency: "USD" },
      total: 100,
      totalInInr: 8300,
      refundedAmountInInr: 3320,
      refundStatus: "Partially Refunded",
      shipping: { country: "US", state: "NY" },
      paymentMeta: {
        refunds: [
          {
            refundId: "rfnd_part1",
            amountMinor: 2000, // $20 USD
            currency: "USD",
            at: new Date("2026-10-05T10:00:00Z")
          },
          {
            refundId: "rfnd_part2",
            amountMinor: 166000, // ₹1,660 INR
            currency: "INR",
            at: new Date("2026-10-06T10:00:00Z")
          }
        ]
      }
    };

    const invoiceRow = buildInvoiceRow(order, defaultSettings);
    const creditNotes = buildCreditNoteRows(order, invoiceRow, {
      from: new Date("2026-10-01T00:00:00+05:30"),
      to: new Date("2026-11-01T00:00:00+05:30")
    });

    assert.strictEqual(creditNotes.length, 2);
    const totalCnRefundInr = roundMoney(creditNotes[0].refundInr + creditNotes[1].refundInr);
    assert.strictEqual(totalCnRefundInr, 3320);
  });

  it("8. Refund with no entries -> one row dated updatedAt with refund_date_approximate", () => {
    const order = {
      _id: "order130",
      invoiceNumber: "DSG-2026-0008",
      createdAt: new Date("2026-10-02T10:00:00Z"),
      updatedAt: new Date("2026-10-15T15:30:00Z"),
      currencyDisplay: { currency: "INR" },
      total: 500,
      totalInInr: 500,
      refundedAmountInInr: 500,
      refundStatus: "Refunded",
      shipping: { country: "India", state: "Karnataka" },
      paymentMeta: {
        refunds: []
      }
    };

    const invoiceRow = buildInvoiceRow(order, defaultSettings);
    const creditNotes = buildCreditNoteRows(order, invoiceRow, {
      from: new Date("2026-10-01T00:00:00+05:30"),
      to: new Date("2026-11-01T00:00:00+05:30")
    });

    assert.strictEqual(creditNotes.length, 1);
    const cn = creditNotes[0];
    assert.strictEqual(cn.refundInr, 500);
    assert.strictEqual(cn.refundDate.toISOString(), order.updatedAt.toISOString());
    assert.strictEqual(cn.warnings.includes("refund_date_approximate"), true);
  });

  it("9. Refund entry outside the period -> excluded", () => {
    const order = {
      _id: "order131",
      invoiceNumber: "DSG-2026-0009",
      createdAt: new Date("2026-09-15T10:00:00Z"),
      currencyDisplay: { currency: "INR" },
      total: 1000,
      totalInInr: 1000,
      refundedAmountInInr: 500,
      shipping: { country: "India", state: "Karnataka" },
      paymentMeta: {
        refunds: [
          {
            refundId: "rfnd_sep",
            amountMinor: 50000,
            currency: "INR",
            at: new Date("2026-09-20T10:00:00Z")
          }
        ]
      }
    };

    const invoiceRow = buildInvoiceRow(order, defaultSettings);
    // Period is October 2026
    const creditNotes = buildCreditNoteRows(order, invoiceRow, {
      from: new Date("2026-10-01T00:00:00+05:30"),
      to: new Date("2026-11-01T00:00:00+05:30")
    });

    assert.strictEqual(creditNotes.length, 0);
  });
});
