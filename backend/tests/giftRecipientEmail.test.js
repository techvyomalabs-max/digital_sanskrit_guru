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

test("gift recipient can't be the buyer, even with +tags, Gmail dots or case", () => {
  const own = ["supreeth.ns@gmail.com", ""];
  for (const email of ["supreeth.ns@gmail.com", "SupreethNS@gmail.com", "supreeth.n.s+gift@googlemail.com"]) {
    const result = checkGiftRecipientEmail(email, own);
    assert.equal(result.code, "GIFT_TO_SELF", email);
    assert.match(result.error, /your own email/);
  }
  // dots matter outside Gmail; someone else's address is fine
  assert.deepEqual(checkGiftRecipientEmail("a.b@example.com", ["ab@example.com"]), { email: "a.b@example.com" });
  assert.deepEqual(checkGiftRecipientEmail("friend@gmail.com", own), { email: "friend@gmail.com" });
  assert.deepEqual(checkGiftRecipientEmail("friend@gmail.com"), { email: "friend@gmail.com" });
});
