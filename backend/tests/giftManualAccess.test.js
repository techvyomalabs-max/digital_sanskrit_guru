const test = require("node:test");
const assert = require("node:assert/strict");
const {
  holdGiftManualAccess,
  isGiftAwaitingRecipient,
  findGiftLineIndex,
  buildGiftRecipient,
  giftRecipientsForLines
} = require("../utils/giftAccess");
const { isAccessPending, canAutoComplete, applyAccessGrant } = require("../utils/accessFulfilment");
const { serializeOrderForOwner } = require("../utils/orderAccess");

const manualLine = (product = "P1") => ({
  product,
  name: "Sanskrit Course (other website)",
  isDigital: true,
  digitalDelivery: "external",
  accessManual: true,
  externalAccessLink: "https://partner.test/course"
});
const bookLine = { product: "B1", name: "Gita Paperback", isDigital: false, accessManual: false };

test("gift order: manual-access lines wait for a recipient, not in the admin queue", () => {
  const items = holdGiftManualAccess([manualLine(), bookLine]);
  assert.equal(items[0].accessManual, false);
  assert.equal(items[0].giftAccessManual, true);
  assert.equal(isAccessPending(items[0]), false); // not in "Access Pending"
  assert.equal(isGiftAwaitingRecipient(items[0]), true);
  assert.deepEqual(items[1], bookLine); // physical line untouched
  assert.equal(canAutoComplete([items[0]]), true); // buyer's part (the code) is done
});

test("finding the order line for a Gift Pass", () => {
  const items = [manualLine("P1"), manualLine("P2")];
  assert.equal(findGiftLineIndex(items, { product: "P2", lineIndex: 1 }), 1);
  assert.equal(findGiftLineIndex(items, { product: "P2", lineIndex: 0 }), 1); // old pass with wrong line number
  assert.equal(findGiftLineIndex(items, { product: "P9" }), -1);
});

test("after redeem the line is pending with the recipient's details, and the grant works", () => {
  const held = holdGiftManualAccess([manualLine()])[0];
  const redeemed = {
    ...held,
    accessManual: true,
    giftRecipient: buildGiftRecipient({ _id: "U2", name: "Asha", email: "Asha@Example.com" }, new Date("2026-11-15"))
  };
  assert.equal(redeemed.giftRecipient.email, "asha@example.com");
  assert.equal(isAccessPending(redeemed), true);
  assert.equal(isGiftAwaitingRecipient(redeemed), false);

  const grant = applyAccessGrant([redeemed], { adminId: "A1", note: "Login sent" });
  assert.equal(grant.error, "");
  assert.deepEqual(grant.grantedIndexes, [0]);
  const groups = giftRecipientsForLines(grant.items, grant.grantedIndexes);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].recipient.name, "Asha");
});

test("a held (not yet redeemed) gift line can't be granted", () => {
  const held = holdGiftManualAccess([manualLine()]);
  assert.match(applyAccessGrant(held, {}).error, /already granted/i); // nothing pending
});

const BUYER = "64b000000000000000000001";
const RECIPIENT = "64b000000000000000000002";
const giftOrder = (line) => ({
  _id: "64c000000000000000000009",
  user: BUYER,
  isGift: true,
  paymentStatus: "Paid",
  status: "Completed",
  billing: { name: "Buyer" },
  items: [{ ...line, giftCode: "GIFT-DSG-AAAA" }]
});

test("buyer view: a gift someone redeemed is not the buyer's wait, and hides who redeemed", () => {
  const line = { ...holdGiftManualAccess([manualLine()])[0], accessManual: true, giftRecipient: { name: "Asha", email: "a@x.test" } };
  const out = serializeOrderForOwner(giftOrder(line), BUYER);
  assert.equal(out.items[0].accessPending, false);
  assert.equal(out.items[0].giftRedeemed, true);
  assert.equal(out.items[0].giftRecipient, undefined);
  assert.equal(out.items[0].externalAccessLink, undefined);
});

test("recipient view: pending until granted, then the link appears", () => {
  const pendingLine = { ...holdGiftManualAccess([manualLine()])[0], accessManual: true, giftRecipient: { name: "Asha" } };
  const pending = serializeOrderForOwner({ ...giftOrder(pendingLine), isRedeemedGift: true }, RECIPIENT, {
    redeemedProductIds: new Set(["P1"])
  });
  assert.equal(pending.items[0].accessPending, true);
  assert.equal(pending.items[0].externalAccessLink, undefined);

  const granted = serializeOrderForOwner(
    { ...giftOrder({ ...pendingLine, accessGrantedAt: new Date(), accessNote: "Use your email to log in" }), isRedeemedGift: true },
    RECIPIENT,
    { redeemedProductIds: new Set(["P1"]) }
  );
  assert.equal(granted.items[0].accessPending, false);
  assert.equal(granted.items[0].externalAccessLink, "https://partner.test/course");
  assert.equal(granted.items[0].accessNote, "Use your email to log in");
  assert.equal(granted.billing, undefined);
});
