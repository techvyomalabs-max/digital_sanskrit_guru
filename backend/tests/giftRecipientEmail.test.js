const test = require("node:test");
const assert = require("node:assert/strict");
const { checkGiftRecipientEmail } = require("../utils/giftRecipientEmail");

test("gift recipient email is required and must look like an email", () => {
  assert.match(checkGiftRecipientEmail("").error, /enter the recipient/);
  assert.match(checkGiftRecipientEmail("   ").error, /enter the recipient/);
  assert.match(checkGiftRecipientEmail(undefined).error, /enter the recipient/);
  assert.match(checkGiftRecipientEmail("asha@").error, /valid/);
  assert.match(checkGiftRecipientEmail("asha example.com").error, /valid/);
  assert.deepEqual(checkGiftRecipientEmail("  Asha.Rao@Example.com "), { email: "asha.rao@example.com" });
});
