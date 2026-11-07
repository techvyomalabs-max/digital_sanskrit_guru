const test = require("node:test");
const assert = require("node:assert/strict");
const { emailStreamForType, getSmtpConfig, isMarketingSmtpConfigured } = require("../utils/emailStream");

const MAIN = { SMTP_HOST: "smtp.main.test", SMTP_PORT: "465", SMTP_USER: "orders@dsg.test", SMTP_PASS: "p1", SENDER_EMAIL: "noreply@dsg.test" };
const PROMO = { MARKETING_SMTP_HOST: "smtp.promo.test", MARKETING_SMTP_USER: "news@dsg.test", MARKETING_SMTP_PASS: "p2", MARKETING_SENDER_EMAIL: "offers@news.dsg.test" };

test("only promotional types use the marketing stream", () => {
  for (const type of ["broadcast", "wishlist-alert", "wishlist-reminder"]) {
    assert.equal(emailStreamForType(type), "marketing", type);
  }
  for (const type of [
    "order-confirm", "status-update", "refund-update", "return-status", "password-reset",
    "gift-pass", "access-granted", "welcome-credentials", "low-stock-admin", "orphan-payment-admin",
    "support-interest", "bulk-enquiry", "test", "campaign", "", undefined, "something-new"
  ]) {
    assert.equal(emailStreamForType(type), "transactional", String(type));
  }
});

test("transactional mail always uses the main server", () => {
  const config = getSmtpConfig("transactional", { ...MAIN, ...PROMO });
  assert.equal(config.stream, "transactional");
  assert.equal(config.host, "smtp.main.test");
  assert.equal(config.port, 465);
  assert.equal(config.sender, "noreply@dsg.test");
});

test("promotional mail uses the marketing server when it is fully set", () => {
  const config = getSmtpConfig("marketing", { ...MAIN, ...PROMO });
  assert.equal(config.stream, "marketing");
  assert.equal(config.host, "smtp.promo.test");
  assert.equal(config.port, 587);
  assert.equal(config.user, "news@dsg.test");
  assert.equal(config.sender, "offers@news.dsg.test");
  assert.equal(isMarketingSmtpConfigured({ ...PROMO }), true);
});

test("promotional mail falls back to the main server when the marketing one is incomplete", () => {
  const partial = { ...MAIN, MARKETING_SMTP_HOST: "smtp.promo.test", MARKETING_SMTP_USER: "news@dsg.test" };
  const config = getSmtpConfig("marketing", partial);
  assert.equal(config.stream, "transactional");
  assert.equal(config.host, "smtp.main.test");
  assert.equal(isMarketingSmtpConfigured(partial), false);
});

test("defaults match the old single-server behaviour", () => {
  const config = getSmtpConfig("transactional", { SMTP_USER: "me@gmail.com", SMTP_PASS: "x" });
  assert.equal(config.host, "smtp.gmail.com");
  assert.equal(config.port, 587);
  assert.equal(config.sender, "me@gmail.com");
});
