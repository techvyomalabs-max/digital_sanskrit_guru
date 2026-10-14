const { describe, it, test } = require("node:test");
const assert = require("node:assert/strict");
const {
  BASE_CURRENCY,
  DEFAULT_CURRENCY_EXCHANGE_RATES,
  normalizeCurrencyRates,
  normalizeCurrencyCode,
  convertCurrencyAmount,
  getCurrencyExponent,
  toMinorUnits,
  fromMinorUnits,
  resolveItemsCurrency
} = require("../utils/currency");

describe("currency utility", () => {
  describe("toMinorUnits & fromMinorUnits", () => {
    it("converts standard 2-decimal currencies (INR, USD, EUR) to minor units and back", () => {
      assert.equal(toMinorUnits(199.99, "INR"), 19999);
      assert.equal(fromMinorUnits(19999, "INR"), 199.99);

      assert.equal(toMinorUnits(10.5, "USD"), 1050);
      assert.equal(fromMinorUnits(1050, "USD"), 10.5);

      assert.equal(toMinorUnits(0, "INR"), 0);
      assert.equal(fromMinorUnits(0, "INR"), 0);
    });

    it("handles zero-decimal currencies (JPY, KRW)", () => {
      assert.equal(toMinorUnits(500, "JPY"), 500);
      assert.equal(fromMinorUnits(500, "JPY"), 500);
      assert.equal(toMinorUnits(1500.8, "JPY"), 1501);
    });

    it("handles 3-decimal currencies (KWD, BHD, OMR) actual behavior", () => {
      // Current implementation rounds to 2 decimals * 10
      assert.equal(toMinorUnits(12.34, "KWD"), 12340);
      assert.equal(fromMinorUnits(12340, "KWD"), 12.34);
    });

    test.todo("toMinorUnits should preserve 3rd decimal place for 3-decimal currencies without intermediate 2-decimal rounding", () => {
      assert.equal(toMinorUnits(12.345, "KWD"), 12345);
    });

    it("returns NaN for invalid or non-numeric inputs (except null which JavaScript coerces to 0)", () => {
      assert.ok(Number.isNaN(toMinorUnits("invalid", "INR")));
      assert.ok(Number.isNaN(fromMinorUnits("invalid", "INR")));
      assert.ok(Number.isNaN(toMinorUnits(undefined, "INR")));
      assert.ok(Number.isNaN(fromMinorUnits(undefined, "INR")));
      // Number(null) in JS is 0, so fromMinorUnits(null) evaluates to 0
      assert.equal(fromMinorUnits(null, "INR"), 0);
    });
  });

  describe("getCurrencyExponent", () => {
    it("returns 2 for INR, USD, GBP, EUR and fallback default", () => {
      assert.equal(getCurrencyExponent("INR"), 2);
      assert.equal(getCurrencyExponent("USD"), 2);
      assert.equal(getCurrencyExponent("GBP"), 2);
      assert.equal(getCurrencyExponent("EUR"), 2);
      assert.equal(getCurrencyExponent(""), 2);
      assert.equal(getCurrencyExponent(null), 2);
    });

    it("returns 0 for zero-decimal currencies", () => {
      assert.equal(getCurrencyExponent("JPY"), 0);
      assert.equal(getCurrencyExponent("KRW"), 0);
      assert.equal(getCurrencyExponent("VND"), 0);
    });

    it("returns 3 for three-decimal currencies", () => {
      assert.equal(getCurrencyExponent("KWD"), 3);
      assert.equal(getCurrencyExponent("BHD"), 3);
      assert.equal(getCurrencyExponent("OMR"), 3);
    });
  });

  describe("convertCurrencyAmount", () => {
    it("returns exact same amount when source and target currencies match", () => {
      assert.equal(convertCurrencyAmount(250, { sourceCurrency: "INR", currency: "INR" }), 250);
      assert.equal(convertCurrencyAmount(50, { sourceCurrency: "USD", currency: "USD" }), 50);
    });

    it("converts INR to USD using provided custom rates", () => {
      const customRates = { INR: 1, USD: 0.02 };
      const converted = convertCurrencyAmount(1000, {
        sourceCurrency: "INR",
        currency: "USD",
        rates: customRates
      });
      assert.equal(converted, 20);
    });

    it("converts non-INR source currency to non-INR target currency via base rate", () => {
      const customRates = { INR: 1, USD: 0.012, EUR: 0.01 };
      // 120 USD = 120 / 0.012 = 10,000 INR -> 10,000 * 0.01 = 100 EUR
      const converted = convertCurrencyAmount(120, {
        sourceCurrency: "USD",
        currency: "EUR",
        rates: customRates
      });
      assert.equal(converted, 100);
    });

    it("falls back to DEFAULT_CURRENCY_EXCHANGE_RATES when rates object is empty", () => {
      const converted = convertCurrencyAmount(1000, {
        sourceCurrency: "INR",
        currency: "USD",
        rates: {}
      });
      assert.equal(converted, 1000 * DEFAULT_CURRENCY_EXCHANGE_RATES.USD);
    });

    it("returns 0 for invalid non-finite amounts", () => {
      assert.equal(convertCurrencyAmount("abc", { sourceCurrency: "INR", currency: "USD" }), 0);
      assert.equal(convertCurrencyAmount(null, { sourceCurrency: "INR", currency: "USD" }), 0);
    });
  });

  describe("normalizeCurrencyCode", () => {
    it("normalizes lowercase and whitespace-padded currency codes", () => {
      assert.equal(normalizeCurrencyCode("inr"), "INR");
      assert.equal(normalizeCurrencyCode("  usd  "), "USD");
      assert.equal(normalizeCurrencyCode("eur"), "EUR");
    });

    it("falls back to default BASE_CURRENCY (INR) or custom fallback for empty or unknown inputs", () => {
      assert.equal(normalizeCurrencyCode(""), "INR");
      assert.equal(normalizeCurrencyCode(null), "INR");
      assert.equal(normalizeCurrencyCode(undefined), "INR");
      assert.equal(normalizeCurrencyCode("UNKNOWN_XYZ"), "INR");
      assert.equal(normalizeCurrencyCode("UNKNOWN_XYZ", "USD"), "USD");
    });
  });

  describe("resolveItemsCurrency", () => {
    it("resolves single currency successfully", () => {
      const items = [{ currency: "INR" }, { currency: "inr" }, { currency: "INR" }];
      const res = resolveItemsCurrency(items);
      assert.deepEqual(res, { ok: true, currency: "INR" });
    });

    it("identifies mixed currencies across cart items", () => {
      const items = [{ currency: "INR" }, { currency: "USD" }];
      const res = resolveItemsCurrency(items);
      assert.equal(res.ok, false);
      assert.equal(res.currency, "");
      assert.deepEqual(res.currencies, ["INR", "USD"]);
    });
  });
});
