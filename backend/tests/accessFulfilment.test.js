const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const {
  isDigitalLikeItem,
  requiresAdminAccess,
  isAccessPending,
  canAutoComplete,
  allDigitalAccessGranted
} = require("../utils/accessFulfilment");
const { validateExternalDelivery } = require("../utils/digitalDelivery");
const { hasItemDigitalAccess, serializeOrderForOwner } = require("../utils/orderAccess");

describe("accessFulfilment utility (pure)", () => {
  describe("canAutoComplete", () => {
    test("true for two ticked-digital items", () => {
      const items = [
        { name: "Digital Book 1", isDigital: true, accessManual: false },
        { name: "Digital Book 2", isDigital: true, accessManual: false }
      ];
      assert.equal(canAutoComplete(items), true);
    });

    test("false when one item is accessManual", () => {
      const items = [
        { name: "Digital Book 1", isDigital: true, accessManual: false },
        { name: "Digital External Course", isDigital: true, accessManual: true }
      ];
      assert.equal(canAutoComplete(items), false);
    });

    test("false for an empty list", () => {
      assert.equal(canAutoComplete([]), false);
      assert.equal(canAutoComplete(null), false);
    });

    test("false when a physical item is present", () => {
      const items = [
        { name: "Digital Book 1", isDigital: true, accessManual: false },
        { name: "Printed Hardcover", isDigital: false, accessManual: false }
      ];
      assert.equal(canAutoComplete(items), false);
    });
  });

  describe("isAccessPending", () => {
    test("isAccessPending before and after accessGrantedAt", () => {
      const pendingItem = { accessManual: true, accessGrantedAt: null };
      assert.equal(isAccessPending(pendingItem), true);

      const grantedItem = { accessManual: true, accessGrantedAt: new Date() };
      assert.equal(isAccessPending(grantedItem), false);

      const nonManualItem = { accessManual: false, accessGrantedAt: null };
      assert.equal(isAccessPending(nonManualItem), false);
    });
  });

  describe("allDigitalAccessGranted", () => {
    test("returns true when all digital items have access granted or do not require admin access", () => {
      const itemsAllGranted = [
        { isDigital: true, accessManual: true, accessGrantedAt: new Date() },
        { isDigital: true, accessManual: false }
      ];
      assert.equal(allDigitalAccessGranted(itemsAllGranted), true);

      const itemsWithPending = [
        { isDigital: true, accessManual: true, accessGrantedAt: null },
        { isDigital: true, accessManual: false }
      ];
      assert.equal(allDigitalAccessGranted(itemsWithPending), false);

      const itemsWithPhysical = [
        { isDigital: false, accessManual: false },
        { isDigital: true, accessManual: true, accessGrantedAt: new Date() }
      ];
      assert.equal(allDigitalAccessGranted(itemsWithPhysical), true);

      assert.equal(allDigitalAccessGranted([]), false);
    });
  });

  describe("validateExternalDelivery", () => {
    test("returns externalAccessManual false for onsite delivery even when the input says true", () => {
      const res = validateExternalDelivery({
        digitalDelivery: "onsite",
        externalAccessManual: true,
        isDigital: true
      });
      assert.equal(res.isValid, true);
      assert.equal(res.digitalDelivery, "onsite");
      assert.equal(res.externalAccessManual, false);
      assert.equal(res.value.externalAccessManual, false);
    });

    test("returns externalAccessManual true for external with the flag", () => {
      const res = validateExternalDelivery({
        digitalDelivery: "external",
        externalAccessLink: "https://example.com/portal",
        externalAccessLabel: "Portal",
        externalAccessManual: true,
        isDigital: true
      });
      assert.equal(res.isValid, true);
      assert.equal(res.digitalDelivery, "external");
      assert.equal(res.externalAccessManual, true);
      assert.equal(res.value.externalAccessManual, true);
    });

    test("returns externalAccessManual false for external without it", () => {
      const res = validateExternalDelivery({
        digitalDelivery: "external",
        externalAccessLink: "https://example.com/portal",
        externalAccessLabel: "Portal",
        externalAccessManual: false,
        isDigital: true
      });
      assert.equal(res.isValid, true);
      assert.equal(res.digitalDelivery, "external");
      assert.equal(res.externalAccessManual, false);
      assert.equal(res.value.externalAccessManual, false);
    });
  });

  describe("hasItemDigitalAccess", () => {
    const paidOrder = {
      paymentStatus: "Paid",
      status: "Processing",
      refundStatus: "None"
    };

    test("paid order with a pending manual item -> false", () => {
      const pendingItem = { accessManual: true, accessGrantedAt: null };
      assert.equal(hasItemDigitalAccess(paidOrder, pendingItem), false);
    });

    test("paid order with accessGrantedAt -> true", () => {
      const grantedItem = { accessManual: true, accessGrantedAt: new Date() };
      assert.equal(hasItemDigitalAccess(paidOrder, grantedItem), true);
    });

    test("paid order with a non-manual item -> true", () => {
      const nonManualItem = { accessManual: false };
      assert.equal(hasItemDigitalAccess(paidOrder, nonManualItem), true);
    });
  });

  describe("serializeOrderForOwner", () => {
    test("removes externalAccessLink for a pending item and keeps it for a granted one", () => {
      const order = {
        _id: "order123",
        user: "user1",
        paymentStatus: "Paid",
        status: "Processing",
        items: [
          {
            product: "prodPending",
            name: "Pending Course",
            digitalDelivery: "external",
            externalAccessLink: "https://portal.example.com/pending",
            externalAccessLabel: "Pending Portal",
            accessManual: true,
            accessGrantedAt: null,
            accessNote: "Grant note that shouldn't leak yet"
          },
          {
            product: "prodGranted",
            name: "Granted Course",
            digitalDelivery: "external",
            externalAccessLink: "https://portal.example.com/granted",
            externalAccessLabel: "Granted Portal",
            accessManual: true,
            accessGrantedAt: new Date("2026-01-01T00:00:00Z"),
            accessNote: "Your login username is student1"
          }
        ]
      };

      const serialized = serializeOrderForOwner(order, "user1");
      assert.ok(serialized);
      assert.equal(serialized.items.length, 2);

      const pendingItem = serialized.items[0];
      assert.equal(pendingItem.digitalAccess, false);
      assert.equal(pendingItem.externalAccessLink, undefined);
      assert.equal(pendingItem.externalAccessLabel, undefined);
      assert.equal(pendingItem.accessPending, true);
      assert.equal(pendingItem.accessGrantedAt, null);
      assert.equal(pendingItem.accessNote, undefined);

      const grantedItem = serialized.items[1];
      assert.equal(grantedItem.digitalAccess, true);
      assert.equal(grantedItem.externalAccessLink, "https://portal.example.com/granted");
      assert.equal(grantedItem.externalAccessLabel, "Granted Portal");
      assert.equal(grantedItem.accessPending, false);
      assert.ok(grantedItem.accessGrantedAt);
      assert.equal(grantedItem.accessNote, "Your login username is student1");
    });
  });

  describe("Order schema items array mutation persistence", () => {
    test("items: Array permits in-place item field updates with markModified", () => {
      const TestOrderModel =
        mongoose.models.TestOrderItemsPlainArray ||
        mongoose.model("TestOrderItemsPlainArray", new mongoose.Schema({ items: Array }));

      const doc = TestOrderModel.hydrate({
        _id: new mongoose.Types.ObjectId(),
        items: [{ name: "Sanskrit Course", returnRequest: null }]
      });

      doc.items[0].returnRequest = { status: "Requested" };
      doc.markModified("items");

      assert.equal(doc.$__delta()[1].$set.items[0].returnRequest.status, "Requested");
    });
  });
});
