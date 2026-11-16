const test = require("node:test");
const assert = require("node:assert/strict");
const { serializeOrderForOwner } = require("../utils/orderAccess");

const BUYER = "64b000000000000000000001";
const FRIEND = "64b000000000000000000002";
const giftOrder = () => ({
  _id: "64c000000000000000000009",
  user: BUYER,
  isGift: true,
  paymentStatus: "Paid",
  status: "Completed",
  billing: { name: "Buyer" },
  items: [
    { product: "P1", name: "Gita Web Version", isDigital: true, giftCode: "GIFT-DSG-AAAA", webReaderLink: "https://reader.test/gita" },
    { product: "P2", name: "Sandhi Web Version", isDigital: true, giftCode: "GIFT-DSG-BBBB", webReaderLink: "https://reader.test/sandhi" }
  ]
});

test("buyer of a gift order: no reader links (the passes are for someone else)", () => {
  const out = serializeOrderForOwner(giftOrder(), BUYER);
  assert.equal(out.items[0].webReaderLink, undefined);
  assert.equal(out.items[0].digitalAccess, false);
  assert.equal(out.items[0].redeemedByViewer, undefined);
});

test("buyer who redeemed their own pass gets that item only", () => {
  const out = serializeOrderForOwner(giftOrder(), BUYER, { redeemedProductIds: new Set(["P1"]) });
  assert.equal(out.items[0].webReaderLink, "https://reader.test/gita");
  assert.equal(out.items[0].redeemedByViewer, true);
  assert.equal(out.items[1].webReaderLink, undefined);
  assert.equal(out.billing.name, "Buyer"); // still their own order
});

test("recipient who redeemed one pass sees only that item, and no buyer details", () => {
  const order = { ...giftOrder(), isRedeemedGift: true };
  const out = serializeOrderForOwner(order, FRIEND, { redeemedProductIds: new Set(["P2"]) });
  assert.equal(out.items[1].webReaderLink, "https://reader.test/sandhi");
  assert.equal(out.items[0].webReaderLink, undefined);
  assert.equal(out.billing, undefined);
});

test("cancelled gift order gives no access even if redeemed", () => {
  const order = { ...giftOrder(), status: "Cancelled" };
  const out = serializeOrderForOwner(order, BUYER, { redeemedProductIds: new Set(["P1"]) });
  assert.equal(out.items[0].webReaderLink, undefined);
});
