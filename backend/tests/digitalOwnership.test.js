const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { getOwnedDigitalProductIds, analyzeDigitalOwnership } = require("../utils/digitalOwnership");

describe("digitalOwnership utility (pure)", () => {
  describe("getOwnedDigitalProductIds", () => {
    it("paid normal order with a digital item is included", () => {
      const orders = [
        {
          paymentStatus: "Paid",
          status: "Processing",
          refundStatus: "Not Applicable",
          items: [
            {
              product: "prod_web_1",
              isDigital: true,
              returnRequest: { status: "Not Requested" }
            }
          ]
        }
      ];

      const owned = getOwnedDigitalProductIds({ orders, redeemedPasses: [] });
      assert.equal(owned.has("prod_web_1"), true);
      assert.equal(owned.size, 1);
    });

    it("unpaid, Cancelled, refundStatus 'Refunded', and item returnRequest 'Refunded' are excluded", () => {
      const orders = [
        // Unpaid
        {
          paymentStatus: "Pending",
          status: "Pending",
          refundStatus: "Not Applicable",
          items: [{ product: "prod_unpaid", isDigital: true }]
        },
        // Cancelled
        {
          paymentStatus: "Paid",
          status: "Cancelled",
          refundStatus: "Not Applicable",
          items: [{ product: "prod_cancelled", isDigital: true }]
        },
        // Order-level Refunded
        {
          paymentStatus: "Paid",
          status: "Completed",
          refundStatus: "Refunded",
          items: [{ product: "prod_order_refunded", isDigital: true }]
        },
        // Item-level Refunded
        {
          paymentStatus: "Paid",
          status: "Completed",
          refundStatus: "Not Applicable",
          items: [
            {
              product: "prod_item_refunded",
              isDigital: true,
              returnRequest: { status: "Refunded" }
            }
          ]
        }
      ];

      const owned = getOwnedDigitalProductIds({ orders, redeemedPasses: [] });
      assert.equal(owned.has("prod_unpaid"), false);
      assert.equal(owned.has("prod_cancelled"), false);
      assert.equal(owned.has("prod_order_refunded"), false);
      assert.equal(owned.has("prod_item_refunded"), false);
      assert.equal(owned.size, 0);
    });

    it("gift-order items excluded (order.isGift || item.isGift || item.giftCode)", () => {
      const orders = [
        // Order isGift
        {
          isGift: true,
          paymentStatus: "Paid",
          status: "Completed",
          refundStatus: "Not Applicable",
          items: [{ product: "prod_gift_order", isDigital: true }]
        },
        // Item isGift
        {
          paymentStatus: "Paid",
          status: "Completed",
          refundStatus: "Not Applicable",
          items: [{ product: "prod_gift_item", isDigital: true, isGift: true }]
        },
        // Item giftCode
        {
          paymentStatus: "Paid",
          status: "Completed",
          refundStatus: "Not Applicable",
          items: [{ product: "prod_gift_code", isDigital: true, giftCode: "GIFT-123" }]
        }
      ];

      const owned = getOwnedDigitalProductIds({ orders, redeemedPasses: [] });
      assert.equal(owned.has("prod_gift_order"), false);
      assert.equal(owned.has("prod_gift_item"), false);
      assert.equal(owned.has("prod_gift_code"), false);
      assert.equal(owned.size, 0);
    });

    it("combo digital components included while physical components are not", () => {
      const orders = [
        {
          paymentStatus: "Paid",
          status: "Completed",
          refundStatus: "Not Applicable",
          items: [
            {
              product: "combo_1",
              isDigital: false,
              bundleItems: [
                { product: "sub_dig_1", isDigital: true },
                { product: "sub_phys_1", isDigital: false },
                { product: "sub_dig_2", isDigital: true }
              ]
            }
          ]
        }
      ];

      const owned = getOwnedDigitalProductIds({ orders, redeemedPasses: [] });
      assert.equal(owned.has("combo_1"), false);
      assert.equal(owned.has("sub_phys_1"), false);
      assert.equal(owned.has("sub_dig_1"), true);
      assert.equal(owned.has("sub_dig_2"), true);
      assert.equal(owned.size, 2);
    });

    it("a redeemed pass is included, a revoked or unredeemed one is not", () => {
      const redeemedPasses = [
        { product: "pass_prod_ok", isRedeemed: true, isRevoked: false },
        { product: "pass_prod_unredeemed", isRedeemed: false, isRevoked: false },
        { product: "pass_prod_revoked", isRedeemed: true, isRevoked: true }
      ];

      const owned = getOwnedDigitalProductIds({ orders: [], redeemedPasses });
      assert.equal(owned.has("pass_prod_ok"), true);
      assert.equal(owned.has("pass_prod_unredeemed"), false);
      assert.equal(owned.has("pass_prod_revoked"), false);
      assert.equal(owned.size, 1);
    });
  });

  describe("analyzeDigitalOwnership", () => {
    it("owned single web version -> blocked and giftAllowed true", () => {
      const lines = [
        { productId: "w1", name: "Sanskrit Primer Web", isDigital: true, isBundle: false }
      ];
      const ownedIds = new Set(["w1"]);

      const result = analyzeDigitalOwnership({ lines, ownedIds, isGift: false });

      assert.equal(result.blocked, true);
      assert.equal(result.giftAllowed, true);
      assert.equal(result.notice, false);
      assert.deepEqual(result.ownedItems, ["Sanskrit Primer Web"]);
      assert.equal(
        result.message,
        "You already own everything digital in this purchase: Sanskrit Primer Web. You can still buy it as a gift."
      );
    });

    it("same with isGift true -> not blocked", () => {
      const lines = [
        { productId: "w1", name: "Sanskrit Primer Web", isDigital: true, isBundle: false }
      ];
      const ownedIds = new Set(["w1"]);

      const result = analyzeDigitalOwnership({ lines, ownedIds, isGift: true });

      assert.equal(result.blocked, false);
      assert.equal(result.giftAllowed, true);
      assert.equal(result.notice, true);
      assert.deepEqual(result.ownedItems, ["Sanskrit Primer Web"]);
      assert.equal(
        result.message,
        "You already own: Sanskrit Primer Web. They are included again in this purchase."
      );
    });

    it("fully-owned all-digital combo -> blocked, giftAllowed false, and still blocked with isGift true", () => {
      const lines = [
        {
          productId: "b1",
          name: "All-Digital Combo",
          isDigital: false,
          isBundle: true,
          components: [
            { productId: "w1", name: "Part 1 Web", isDigital: true },
            { productId: "w2", name: "Part 2 Web", isDigital: true }
          ]
        }
      ];
      const ownedIds = new Set(["w1", "w2"]);

      // With isGift: false
      const resNormal = analyzeDigitalOwnership({ lines, ownedIds, isGift: false });
      assert.equal(resNormal.blocked, true);
      assert.equal(resNormal.giftAllowed, false);
      assert.equal(resNormal.notice, false);
      assert.deepEqual(resNormal.ownedItems, ["Part 1 Web", "Part 2 Web"]);
      assert.equal(
        resNormal.message,
        "You already own everything digital in this purchase: Part 1 Web, Part 2 Web."
      );

      // With isGift: true -> still blocked because combos cannot bypass via gift
      const resGift = analyzeDigitalOwnership({ lines, ownedIds, isGift: true });
      assert.equal(resGift.blocked, true);
      assert.equal(resGift.giftAllowed, false);
      assert.equal(resGift.notice, false);
      assert.deepEqual(resGift.ownedItems, ["Part 1 Web", "Part 2 Web"]);
      assert.equal(
        resGift.message,
        "You already own everything digital in this purchase: Part 1 Web, Part 2 Web."
      );
    });

    it("combo with books and owned digital parts -> not blocked, notice true, names listed", () => {
      const lines = [
        {
          productId: "b2",
          name: "Hybrid Book & Digital Pack",
          isDigital: false,
          isBundle: true,
          components: [
            { productId: "p1", name: "Printed Book", isDigital: false },
            { productId: "w1", name: "E-Reader Access", isDigital: true }
          ]
        }
      ];
      const ownedIds = new Set(["w1"]);

      const result = analyzeDigitalOwnership({ lines, ownedIds, isGift: false });

      assert.equal(result.blocked, false);
      assert.equal(result.giftAllowed, false);
      assert.equal(result.notice, true);
      assert.deepEqual(result.ownedItems, ["E-Reader Access"]);
      assert.equal(
        result.message,
        "You already own: E-Reader Access. They are included again in this purchase."
      );
    });

    it("partly-owned digital-only cart -> not blocked with notice", () => {
      const lines = [
        { productId: "w1", name: "Web Vol 1", isDigital: true, isBundle: false },
        { productId: "w2", name: "Web Vol 2", isDigital: true, isBundle: false }
      ];
      const ownedIds = new Set(["w1"]); // owns w1, does not own w2

      const result = analyzeDigitalOwnership({ lines, ownedIds, isGift: false });

      assert.equal(result.blocked, false);
      assert.equal(result.giftAllowed, true);
      assert.equal(result.notice, true);
      assert.deepEqual(result.ownedItems, ["Web Vol 1"]);
      assert.equal(
        result.message,
        "You already own: Web Vol 1. They are included again in this purchase."
      );
    });

    it("nothing owned -> no notice", () => {
      const lines = [
        { productId: "w1", name: "Web Vol 1", isDigital: true, isBundle: false }
      ];
      const ownedIds = new Set();

      const result = analyzeDigitalOwnership({ lines, ownedIds, isGift: false });

      assert.equal(result.blocked, false);
      assert.equal(result.giftAllowed, true);
      assert.equal(result.notice, false);
      assert.deepEqual(result.ownedItems, []);
      assert.equal(result.message, "");
    });

    it("the same product as a single and inside a combo is de-duplicated", () => {
      const lines = [
        { productId: "w1", name: "Web Vol 1", isDigital: true, isBundle: false },
        {
          productId: "b1",
          name: "Combo Pack",
          isDigital: false,
          isBundle: true,
          components: [
            { productId: "w1", name: "Web Vol 1", isDigital: true },
            { productId: "w2", name: "Web Vol 2", isDigital: true }
          ]
        }
      ];
      const ownedIds = new Set(["w1"]);

      const result = analyzeDigitalOwnership({ lines, ownedIds, isGift: false });

      // w1 is present twice in lines, but ownedItems should only list "Web Vol 1" once
      assert.deepEqual(result.ownedItems, ["Web Vol 1"]);
      assert.equal(result.blocked, false);
      assert.equal(result.notice, true);
      assert.equal(
        result.message,
        "You already own: Web Vol 1. They are included again in this purchase."
      );
    });
  });
});
