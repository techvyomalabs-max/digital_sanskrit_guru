const { describe, it, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { planDigitalCopies, codesForLine, canShareCopies, describeCopies, MAX_DIGITAL_COPIES } = require("../utils/digitalCopies");
const { analyzeDigitalOwnership, getOwnedDigitalProductIds } = require("../utils/digitalOwnership");

const web = (extra = {}) => ({ product: "p_web", name: "Gita Web Version", isDigital: true, quantity: 1, ...extra });

describe("which products can have extra copies", () => {
  it("single digital products yes; combos and team-setup access no", () => {
    assert.equal(canShareCopies({ isDigital: true }), true);
    assert.equal(canShareCopies({ isDigital: true, productType: "bundle" }), false);
    assert.equal(canShareCopies({ isDigital: true, bundleItems: [{}] }), false);
    assert.equal(canShareCopies({ isDigital: true, digitalDelivery: "external", externalAccessManual: true }), false);
    assert.equal(canShareCopies({ isDigital: false }), false);
  });
});

describe("planning copies (option 2)", () => {
  it("1 copy: the buyer's own, no codes", () => {
    const [line] = planDigitalCopies([web()], {});
    assert.equal(line.shareableCopies, 0);
    assert.notEqual(line.isGift, true);
  });

  it("several copies: one for the buyer, the rest are codes", () => {
    const [line] = planDigitalCopies([web({ quantity: 5 })], {});
    assert.equal(line.shareableCopies, 4);
    assert.notEqual(line.isGift, true);
  });

  it("already owned: every copy is a code and none goes to the buyer's library", () => {
    const [line] = planDigitalCopies([web({ quantity: 2 })], { ownedIds: new Set(["p_web"]) });
    assert.equal(line.shareableCopies, 2);
    assert.equal(line.isGift, true);
  });

  it("gift order: every copy is a code", () => {
    const [line] = planDigitalCopies([web({ quantity: 3 })], { isGift: true });
    assert.equal(line.shareableCopies, 3);
    assert.equal(line.isGift, true);
  });

  it("leaves physical, combo and team-setup lines alone", () => {
    const lines = planDigitalCopies([
      { product: "book", isDigital: false, quantity: 2 },
      { product: "combo", isDigital: true, productType: "bundle", quantity: 1 },
      { product: "manual", isDigital: true, accessManual: true, quantity: 1 }
    ], { ownedIds: new Set(["combo", "manual"]) });
    assert.ok(lines.every((l) => l.shareableCopies === undefined && l.isGift === undefined));
  });

  it("codes per line, including older orders from before copies", () => {
    assert.equal(codesForLine({}, web({ shareableCopies: 4 })), 4);
    assert.equal(codesForLine({ isGift: true }, web()), 1, "older gift line: one code");
    assert.equal(codesForLine({}, web()), 0, "older normal line: none");
    assert.equal(codesForLine({}, { isDigital: false, shareableCopies: 3 }), 0);
    assert.equal(codesForLine({}, web({ shareableCopies: 99 })), MAX_DIGITAL_COPIES);
  });

  it("describes the copies for the buyer", () => {
    assert.equal(describeCopies({ quantity: 1 }), "");
    assert.equal(describeCopies({ quantity: 3 }), "1 copy for you + 2 shareable codes");
    assert.match(describeCopies({ quantity: 2, buyerHasIt: true }), /all 2 copies will be shareable codes/);
  });
});

describe("checkout is not blocked for products that can have copies", () => {
  const line = { productId: "p_web", name: "Gita Web Version", isDigital: true, isBundle: false, canShareCopies: true, quantity: 2, components: [] };

  it("owning it makes the purchase extra copies, not a block", () => {
    const result = analyzeDigitalOwnership({ lines: [line], ownedIds: new Set(["p_web"]) });
    assert.equal(result.blocked, false);
    assert.equal(result.notice, true);
    assert.deepEqual(result.extraCopies, [{ productId: "p_web", name: "Gita Web Version", quantity: 2 }]);
    assert.match(result.message, /shareable codes/);
  });

  it("a combo whose digital parts are all owned is still blocked, as before", () => {
    const combo = { productId: "c1", name: "Combo", isBundle: true, components: [{ productId: "p_web", name: "Gita Web Version", isDigital: true }] };
    const result = analyzeDigitalOwnership({ lines: [combo], ownedIds: new Set(["p_web"]) });
    assert.equal(result.blocked, true);
  });

  it("a team-setup product that is owned is still blocked, as before", () => {
    const manual = { productId: "m1", name: "Course access", isDigital: true, isBundle: false, canShareCopies: false, components: [] };
    assert.equal(analyzeDigitalOwnership({ lines: [manual], ownedIds: new Set(["m1"]) }).blocked, true);
  });
});

describe("buying again after access ended (option 3)", () => {
  const order = (extra = {}) => ({
    paymentStatus: "Paid",
    status: "Delivered",
    refundStatus: "Not Applicable",
    items: [{ product: "p_web", isDigital: true }],
    ...extra
  });

  it("working access counts as owned", () => {
    assert.ok(getOwnedDigitalProductIds({ orders: [order()] }).has("p_web"));
  });

  it("a refunded, cancelled or item-refunded copy no longer counts, so a new purchase gives a library copy", () => {
    for (const ended of [
      order({ refundStatus: "Refunded" }),
      order({ status: "Cancelled" }),
      order({ items: [{ product: "p_web", isDigital: true, returnRequest: { status: "Refunded" } }] })
    ]) {
      const owned = getOwnedDigitalProductIds({ orders: [ended] });
      assert.equal(owned.has("p_web"), false);
      const [line] = planDigitalCopies([web()], { ownedIds: owned });
      assert.equal(line.shareableCopies, 0, "the buyer gets it back in their library");
      assert.notEqual(line.isGift, true);
    }
  });

  it("a revoked code no longer counts; a redeemed working one does", () => {
    const passes = [{ product: "p_web", isRedeemed: true, isRevoked: true }];
    assert.equal(getOwnedDigitalProductIds({ redeemedPasses: passes }).has("p_web"), false);
    assert.equal(getOwnedDigitalProductIds({ redeemedPasses: [{ ...passes[0], isRevoked: false }] }).has("p_web"), true);
  });

  it("lines bought only as codes don't give the buyer access", () => {
    const codesOnly = order({ items: [{ product: "p_web", isDigital: true, isGift: true, shareableCopies: 2 }] });
    assert.equal(getOwnedDigitalProductIds({ orders: [codesOnly] }).has("p_web"), false);
  });
});

describe("issuing codes for several copies", () => {
  const Order = require("../models/Order");
  const GiftPass = require("../models/GiftPass");
  const { issueGiftPassesForOrder } = require("../utils/giftPasses");
  afterEach(() => mock.restoreAll());

  it("one code per extra copy, numbered by copy, and only once", async () => {
    const orderId = new mongoose.Types.ObjectId();
    const productId = new mongoose.Types.ObjectId();
    const stored = new Map();
    mock.method(Order, "findOne", () => ({
      lean: async () => ({
        _id: orderId,
        user: new mongoose.Types.ObjectId(),
        paymentStatus: "Paid",
        status: "Completed",
        items: [{ product: productId, name: "Gita Web Version", isDigital: true, quantity: 3, shareableCopies: 2 }]
      })
    }));
    mock.method(Order, "updateOne", async () => ({}));
    mock.method(GiftPass, "findOneAndUpdate", async (filter, update) => {
      const key = `${filter.lineIndex}:${typeof filter.copyIndex === "object" ? 0 : filter.copyIndex}`;
      const existed = stored.has(key);
      if (!existed) stored.set(key, { ...update.$setOnInsert, _id: key });
      return { value: stored.get(key), lastErrorObject: { updatedExisting: existed } };
    });

    const first = await issueGiftPassesForOrder(orderId);
    assert.equal(first.length, 2);
    assert.deepEqual([...stored.keys()].sort(), ["0:0", "0:1"]);
    assert.notEqual(stored.get("0:0").code, stored.get("0:1").code);
    assert.equal(stored.get("0:1").copyIndex, 1);

    const again = await issueGiftPassesForOrder(orderId);
    assert.equal(again.length, 0, "running again issues nothing new");
  });
});
