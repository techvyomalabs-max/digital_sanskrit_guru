const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const {
  SETTLEMENT_CURRENCY,
  verifyRazorpaySignature,
  getSettlementCharge
} = require("../utils/paymentVerification");

describe("paymentVerification utility (pure parts)", () => {
  const originalSecret = process.env.RAZORPAY_KEY_SECRET;
  const originalLegacySecret = process.env.RAZORPAY_SECRET;

  beforeEach(() => {
    process.env.RAZORPAY_KEY_SECRET = "test_secret_key_12345";
    delete process.env.RAZORPAY_SECRET;
  });

  afterEach(() => {
    if (originalSecret !== undefined) {
      process.env.RAZORPAY_KEY_SECRET = originalSecret;
    } else {
      delete process.env.RAZORPAY_KEY_SECRET;
    }
    if (originalLegacySecret !== undefined) {
      process.env.RAZORPAY_SECRET = originalLegacySecret;
    } else {
      delete process.env.RAZORPAY_SECRET;
    }
  });

  describe("verifyRazorpaySignature", () => {
    it("returns true for a valid HMAC-SHA256 signature", () => {
      const razorpayOrderId = "order_O123456789";
      const razorpayPaymentId = "pay_P987654321";
      const expectedSig = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest("hex");

      const isValid = verifyRazorpaySignature({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature: expectedSig
      });

      assert.equal(isValid, true);
    });

    it("returns false for a tampered signature", () => {
      const razorpayOrderId = "order_O123456789";
      const razorpayPaymentId = "pay_P987654321";
      const validSig = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest("hex");

      // Replace last character with a different hex char
      const lastChar = validSig.slice(-1);
      const tamperedChar = lastChar === "a" ? "b" : "a";
      const tamperedSig = validSig.slice(0, -1) + tamperedChar;

      const isValid = verifyRazorpaySignature({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature: tamperedSig
      });

      assert.equal(isValid, false);
    });

    it("returns false for non-hex signatures", () => {
      const isValid = verifyRazorpaySignature({
        razorpayOrderId: "order_123",
        razorpayPaymentId: "pay_123",
        razorpaySignature: "not_a_hex_string_with_g_z!!!"
      });
      assert.equal(isValid, false);
    });

    it("returns false for missing arguments", () => {
      assert.equal(verifyRazorpaySignature({}), false);
      assert.equal(
        verifyRazorpaySignature({
          razorpayOrderId: "order_123",
          razorpayPaymentId: ""
        }),
        false
      );
      assert.equal(
        verifyRazorpaySignature({
          razorpayOrderId: "",
          razorpayPaymentId: "pay_123"
        }),
        false
      );
      assert.equal(
        verifyRazorpaySignature({
          razorpayOrderId: "order_123",
          razorpayPaymentId: "pay_123",
          razorpaySignature: ""
        }),
        false
      );
    });

    it("returns false when signature has wrong length", () => {
      const shortSig = "abcdef123456";
      const isValid = verifyRazorpaySignature({
        razorpayOrderId: "order_123",
        razorpayPaymentId: "pay_123",
        razorpaySignature: shortSig
      });
      assert.equal(isValid, false);
    });

    it("returns false when no secret key is configured in env", () => {
      delete process.env.RAZORPAY_KEY_SECRET;
      delete process.env.RAZORPAY_SECRET;

      const isValid = verifyRazorpaySignature({
        razorpayOrderId: "order_123",
        razorpayPaymentId: "pay_123",
        razorpaySignature: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
      });
      assert.equal(isValid, false);
    });
  });

  describe("getSettlementCharge", () => {
    it("keeps INR total unchanged and sets currency to INR", () => {
      const settlement = getSettlementCharge({
        total: 499.5,
        orderCurrency: "INR",
        rates: {}
      });

      assert.deepEqual(settlement, {
        amount: 499.5,
        currency: SETTLEMENT_CURRENCY
      });
    });

    it("converts USD total to INR using provided exchange rates", () => {
      // 10 USD at rate 1 USD = 0.02 (meaning 1 INR = 0.02 USD -> 10 / 0.02 = 500 INR)
      const settlement = getSettlementCharge({
        total: 10,
        orderCurrency: "USD",
        rates: { INR: 1, USD: 0.02 }
      });

      assert.deepEqual(settlement, {
        amount: 500,
        currency: "INR"
      });
    });

    it("rounds converted settlement amount to 2 decimal places", () => {
      const settlement = getSettlementCharge({
        total: 15.333,
        orderCurrency: "USD",
        rates: { INR: 1, USD: 0.012 }
      });

      assert.equal(settlement.currency, "INR");
      assert.equal(typeof settlement.amount, "number");
      assert.equal(settlement.amount, Math.round((15.333 / 0.012) * 100) / 100);
    });
  });
});
