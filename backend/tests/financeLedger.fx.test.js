const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildInvoiceRow } = require("../utils/financeLedger");

test("invoice row carries the saved FX rate", () => {
  const row = buildInvoiceRow({ _id: "a", total: 10, totalInInr: 850, fxRateToInr: 85, currencyDisplay: { currency: "USD" } }, {});
  assert.equal(row.fxRate, 85);
});

test("invoice row falls back to INR total / order total, and 1 for INR", () => {
  assert.equal(buildInvoiceRow({ _id: "b", total: 10, totalInInr: 840, currencyDisplay: { currency: "USD" } }, {}).fxRate, 84);
  assert.equal(buildInvoiceRow({ _id: "c", total: 500 }, {}).fxRate, 1);
});

test("invoice row has no FX rate when nothing was saved", () => {
  assert.equal(buildInvoiceRow({ _id: "d", total: 10, currencyDisplay: { currency: "USD" } }, {}).fxRate, null);
});
