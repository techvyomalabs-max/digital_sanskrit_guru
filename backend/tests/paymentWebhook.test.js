const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { verifyWebhookSignature } = require("../routes/paymentWebhook");

describe("paymentWebhook utility (pure verifyWebhookSignature)", () => {
  const secret = "webhook_secret_998877";
  const payload = JSON.stringify({
    entity: "event",
    account_id: "acc_123",
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_test123",
          order_id: "order_test123",
          amount: 50000,
          currency: "INR",
          status: "captured"
        }
      }
    }
  });

  it("returns true for a valid signature with string body", () => {
    const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    const valid = verifyWebhookSignature(payload, signature, secret);
    assert.equal(valid, true);
  });

  it("returns true for a valid signature with Buffer body", () => {
    const rawBuffer = Buffer.from(payload, "utf8");
    const signature = crypto.createHmac("sha256", secret).update(rawBuffer).digest("hex");
    const valid = verifyWebhookSignature(rawBuffer, signature, secret);
    assert.equal(valid, true);
  });

  it("returns false for a tampered body", () => {
    const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    const tamperedPayload = payload + " ";
    const valid = verifyWebhookSignature(tamperedPayload, signature, secret);
    assert.equal(valid, false);
  });

  it("returns false for wrong signature", () => {
    const validSig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    const lastChar = validSig.slice(-1);
    const flippedChar = lastChar === "a" ? "b" : "a";
    const wrongSignature = validSig.slice(0, -1) + flippedChar;

    const valid = verifyWebhookSignature(payload, wrongSignature, secret);
    assert.equal(valid, false);
  });

  it("returns false for missing secret", () => {
    const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    assert.equal(verifyWebhookSignature(payload, signature, ""), false);
    assert.equal(verifyWebhookSignature(payload, signature, null), false);
    assert.equal(verifyWebhookSignature(payload, signature, undefined), false);
  });

  it("returns false for different-length signature", () => {
    const shortSig = "abcd1234ef";
    const valid = verifyWebhookSignature(payload, shortSig, secret);
    assert.equal(valid, false);
  });

  it("returns false for non-hex signature", () => {
    const nonHexSig = "z".repeat(64);
    const valid = verifyWebhookSignature(payload, nonHexSig, secret);
    assert.equal(valid, false);
  });

  it("returns false for empty or null payload", () => {
    const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    assert.equal(verifyWebhookSignature("", signature, secret), false);
    assert.equal(verifyWebhookSignature(null, signature, secret), false);
    assert.equal(verifyWebhookSignature(undefined, signature, secret), false);
  });
});
