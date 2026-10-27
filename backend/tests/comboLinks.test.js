const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeOrderItem } = require("../utils/orderItems");
const { serializeOrderForOwner } = require("../utils/orderAccess");
const { canAutoComplete, shouldCompleteAfterGrant, applyAccessGrant } = require("../utils/accessFulfilment");
const { buildAccessGrantedEmail, buildAccessPendingAdminAlert } = require("../utils/email");
const { formatCart } = require("../routes/cartRoutes");

describe("Combo product delivery types and access granting (pure, no DB)", () => {
  describe("normalizeOrderItem bundleItems component delivery fields and line accessManual", () => {
    it("saves component digitalDelivery + link for external component, '' for onsite component, and accessManual per component", () => {
      const comboProduct = {
        _id: "combo-1",
        name: "Sanskrit Master Combo",
        productType: "bundle",
        isDigital: true,
        digitalDelivery: "onsite",
        externalAccessManual: false,
        bundleItems: [
          {
            _id: "bi-1",
            product: {
              _id: "prod-ext-auto",
              name: "External Instant Book",
              isDigital: true,
              digitalDelivery: "external",
              externalAccessLink: "https://partner.org/instant-read",
              externalAccessLabel: "Open Reader",
              externalAccessManual: false
            }
          },
          {
            _id: "bi-2",
            product: {
              _id: "prod-ext-manual",
              name: "Team Setup Course",
              isDigital: true,
              digitalDelivery: "external",
              externalAccessLink: "https://courses.org/access",
              externalAccessLabel: "View Portal",
              externalAccessManual: true
            }
          },
          {
            _id: "bi-3",
            product: {
              _id: "prod-onsite",
              name: "Onsite Web Reader Book",
              isDigital: true,
              digitalDelivery: "onsite",
              externalAccessLink: "https://ignored.org/link",
              externalAccessLabel: "Ignored Label",
              externalAccessManual: true, // Should be false since delivery is onsite
              webReaderLink: "https://site.org/read/123"
            }
          }
        ]
      };

      const normalized = normalizeOrderItem(comboProduct, { quantity: 1 });

      assert.equal(normalized.bundleItems.length, 3);

      // Component 1: external, auto access
      const comp1 = normalized.bundleItems[0];
      assert.equal(comp1.name, "External Instant Book");
      assert.equal(comp1.digitalDelivery, "external");
      assert.equal(comp1.externalAccessLink, "https://partner.org/instant-read");
      assert.equal(comp1.externalAccessLabel, "Open Reader");
      assert.equal(comp1.accessManual, false);

      // Component 2: external, team setup (manual)
      const comp2 = normalized.bundleItems[1];
      assert.equal(comp2.name, "Team Setup Course");
      assert.equal(comp2.digitalDelivery, "external");
      assert.equal(comp2.externalAccessLink, "https://courses.org/access");
      assert.equal(comp2.externalAccessLabel, "View Portal");
      assert.equal(comp2.accessManual, true);

      // Component 3: onsite
      const comp3 = normalized.bundleItems[2];
      assert.equal(comp3.name, "Onsite Web Reader Book");
      assert.equal(comp3.digitalDelivery, "onsite");
      assert.equal(comp3.externalAccessLink, "");
      assert.equal(comp3.externalAccessLabel, "");
      assert.equal(comp3.accessManual, false);
      assert.equal(comp3.webReaderLink, "https://site.org/read/123");
    });

    it("combo line accessManual is true when a component is manual; false when nothing is manual", () => {
      // 1. Combo line with 1 manual component -> line accessManual is true
      const comboWithManual = {
        _id: "combo-manual",
        name: "Combo With Manual Component",
        productType: "bundle",
        isDigital: true,
        digitalDelivery: "onsite",
        externalAccessManual: false,
        bundleItems: [
          {
            product: {
              _id: "comp-manual",
              name: "Manual External Component",
              isDigital: true,
              digitalDelivery: "external",
              externalAccessManual: true,
              externalAccessLink: "https://example.com/manual"
            }
          }
        ]
      };
      const normManual = normalizeOrderItem(comboWithManual, { quantity: 1 });
      assert.equal(normManual.accessManual, true, "Combo line must have accessManual: true when component is manual");

      // 2. Combo line where no component is manual -> line accessManual is false
      const comboAutoOnly = {
        _id: "combo-auto",
        name: "Combo With Auto Component",
        productType: "bundle",
        isDigital: true,
        digitalDelivery: "onsite",
        externalAccessManual: false,
        bundleItems: [
          {
            product: {
              _id: "comp-auto",
              name: "Auto External Component",
              isDigital: true,
              digitalDelivery: "external",
              externalAccessManual: false,
              externalAccessLink: "https://example.com/auto"
            }
          }
        ]
      };
      const normAuto = normalizeOrderItem(comboAutoOnly, { quantity: 1 });
      assert.equal(normAuto.accessManual, false, "Combo line must have accessManual: false when no components are manual");
    });
  });

  describe("serializeOrderForOwner component links stripping and retention", () => {
    const viewerId = "user-123";

    it("pending combo -> component externalAccessLink and externalAccessLabel are stripped", () => {
      const pendingOrder = {
        _id: "order-pending",
        user: viewerId,
        paymentStatus: "Paid",
        status: "Pending",
        refundStatus: "None",
        items: [
          {
            _id: "item-1",
            product: "combo-1",
            name: "Sanskrit Master Combo",
            isDigital: true,
            productType: "bundle",
            accessManual: true,
            accessGrantedAt: null,
            bundleItems: [
              {
                product: "comp-1",
                name: "Normal External Book",
                digitalDelivery: "external",
                externalAccessLink: "https://example.com/book-1",
                externalAccessLabel: "View Book 1"
              },
              {
                product: "comp-2",
                name: "Manual External Course",
                digitalDelivery: "external",
                externalAccessLink: "https://example.com/course-2",
                externalAccessLabel: "View Course 2",
                accessManual: true
              }
            ]
          }
        ]
      };

      const serialized = serializeOrderForOwner(pendingOrder, viewerId);
      const comboLine = serialized.items[0];

      assert.equal(comboLine.accessPending, true);
      assert.equal(comboLine.digitalAccess, false);
      assert.equal(comboLine.bundleItems.length, 2);
      assert.equal(comboLine.bundleItems[0].externalAccessLink, undefined, "Component 1 link must be stripped while pending");
      assert.equal(comboLine.bundleItems[0].externalAccessLabel, undefined);
      assert.equal(comboLine.bundleItems[1].externalAccessLink, undefined, "Component 2 link must be stripped while pending");
      assert.equal(comboLine.bundleItems[1].externalAccessLabel, undefined);
    });

    it("granted combo -> components keep their links and accessNote is exposed", () => {
      const grantDate = new Date();
      const grantedOrder = {
        _id: "order-granted",
        user: viewerId,
        paymentStatus: "Paid",
        status: "Completed",
        refundStatus: "None",
        items: [
          {
            _id: "item-1",
            product: "combo-1",
            name: "Sanskrit Master Combo",
            isDigital: true,
            productType: "bundle",
            accessManual: true,
            accessGrantedAt: grantDate,
            accessNote: "Your account credentials have been created.",
            bundleItems: [
              {
                product: "comp-1",
                name: "Normal External Book",
                digitalDelivery: "external",
                externalAccessLink: "https://example.com/book-1",
                externalAccessLabel: "View Book 1"
              },
              {
                product: "comp-2",
                name: "Manual External Course",
                digitalDelivery: "external",
                externalAccessLink: "https://example.com/course-2",
                externalAccessLabel: "View Course 2",
                accessManual: true
              }
            ]
          }
        ]
      };

      const serialized = serializeOrderForOwner(grantedOrder, viewerId);
      const comboLine = serialized.items[0];

      assert.equal(comboLine.accessPending, false);
      assert.equal(comboLine.digitalAccess, true);
      assert.equal(comboLine.accessNote, "Your account credentials have been created.");
      assert.equal(comboLine.bundleItems[0].externalAccessLink, "https://example.com/book-1");
      assert.equal(comboLine.bundleItems[0].externalAccessLabel, "View Book 1");
      assert.equal(comboLine.bundleItems[1].externalAccessLink, "https://example.com/course-2");
      assert.equal(comboLine.bundleItems[1].externalAccessLabel, "View Course 2");
    });

    it("normal (non-manual) combo -> components keep their links immediately", () => {
      const normalOrder = {
        _id: "order-normal",
        user: viewerId,
        paymentStatus: "Paid",
        status: "Completed",
        refundStatus: "None",
        items: [
          {
            _id: "item-1",
            product: "combo-normal",
            name: "Instant Combo",
            isDigital: true,
            productType: "bundle",
            accessManual: false,
            bundleItems: [
              {
                product: "comp-1",
                name: "Normal External Book",
                digitalDelivery: "external",
                externalAccessLink: "https://example.com/book-1",
                externalAccessLabel: "View Book 1"
              }
            ]
          }
        ]
      };

      const serialized = serializeOrderForOwner(normalOrder, viewerId);
      const comboLine = serialized.items[0];

      assert.equal(comboLine.accessPending, false);
      assert.equal(comboLine.digitalAccess, true);
      assert.equal(comboLine.bundleItems[0].externalAccessLink, "https://example.com/book-1");
      assert.equal(comboLine.bundleItems[0].externalAccessLabel, "View Book 1");
    });

    it("refunded combo or gift combo for buyer -> component links are stripped", () => {
      // Refunded combo
      const refundedOrder = {
        _id: "order-refunded",
        user: viewerId,
        paymentStatus: "Paid",
        status: "Completed",
        refundStatus: "None",
        items: [
          {
            _id: "item-1",
            product: "combo-1",
            name: "Refunded Combo",
            isDigital: true,
            accessManual: false,
            returnRequest: { status: "Refunded" },
            bundleItems: [
              {
                product: "comp-1",
                externalAccessLink: "https://example.com/book-1"
              }
            ]
          }
        ]
      };
      const resRefunded = serializeOrderForOwner(refundedOrder, viewerId);
      assert.equal(resRefunded.items[0].bundleItems[0].externalAccessLink, undefined);

      // Gift combo viewed by buyer
      const giftOrder = {
        _id: "order-gift",
        user: viewerId,
        isGift: true,
        paymentStatus: "Paid",
        status: "Completed",
        refundStatus: "None",
        items: [
          {
            _id: "item-1",
            product: "combo-1",
            name: "Gifted Combo",
            isDigital: true,
            accessManual: false,
            bundleItems: [
              {
                product: "comp-1",
                externalAccessLink: "https://example.com/book-1"
              }
            ]
          }
        ]
      };
      const resGift = serializeOrderForOwner(giftOrder, viewerId);
      assert.equal(resGift.items[0].bundleItems[0].externalAccessLink, undefined);
    });
  });

  describe("canAutoComplete and shouldCompleteAfterGrant lifecycle for combos", () => {
    it("canAutoComplete is false for a paid digital combo with a manual component, true after the line is granted", () => {
      const comboItem = {
        name: "Combo with Manual Course",
        isDigital: true,
        accessManual: true,
        accessGrantedAt: null,
        bundleItems: [
          { name: "Part 1", isDigital: true, accessManual: false },
          { name: "Part 2", isDigital: true, accessManual: true }
        ]
      };

      // Before grant: must NOT auto-complete
      assert.equal(canAutoComplete([comboItem]), false);

      // Apply grant to the combo item
      const grantResult = applyAccessGrant([comboItem], {
        itemIndexes: [0],
        adminId: "admin-1",
        note: "Granted by admin",
        now: new Date()
      });

      assert.equal(grantResult.error, "");
      assert.equal(grantResult.grantedIndexes.length, 1);
      const grantedCombo = grantResult.items[0];
      assert.ok(grantedCombo.accessGrantedAt instanceof Date);

      // After grant: shouldCompleteAfterGrant returns true
      assert.equal(shouldCompleteAfterGrant([grantedCombo]), true);
    });

    it("canAutoComplete is true for a digital combo where no component requires manual access", () => {
      const autoCombo = {
        name: "Auto Combo",
        isDigital: true,
        accessManual: false,
        bundleItems: [
          { name: "Part 1", isDigital: true, accessManual: false }
        ]
      };
      assert.equal(canAutoComplete([autoCombo]), true);
    });
  });

  describe("Email notifications component listing for combo products", () => {
    it("buildAccessGrantedEmail lists component names under the combo without links", () => {
      const comboItem = {
        name: "Gita & Upanishad Deluxe Pack",
        productType: "bundle",
        bundleItems: [
          { name: "Bhagavad Gita Web Reader", externalAccessLink: "https://secret.com/gita" },
          { name: "Isha Upanishad Portal Access", externalAccessLink: "https://secret.com/isha" }
        ]
      };

      const email = buildAccessGrantedEmail({}, { name: "Anand" }, [comboItem], "Enjoy your reading.");

      // Check item and components are present
      assert.ok(email.html.includes("Gita &amp; Upanishad Deluxe Pack"));
      assert.ok(email.html.includes("Bhagavad Gita Web Reader"));
      assert.ok(email.html.includes("Isha Upanishad Portal Access"));

      // NEVER include component access links in the email body
      assert.ok(!email.html.includes("https://secret.com/gita"));
      assert.ok(!email.html.includes("https://secret.com/isha"));
    });

    it("buildAccessPendingAdminAlert lists component names under the combo without links", () => {
      const comboItem = {
        name: "Complete Sanskrit Bundle",
        productType: "bundle",
        quantity: 1,
        bundleItems: [
          { name: "Grammar Video Series", externalAccessLink: "https://secret.com/grammar" },
          { name: "Chanting Audio Library", externalAccessLink: "https://secret.com/chanting" }
        ]
      };

      const alert = buildAccessPendingAdminAlert(
        { invoiceNumber: "INV-1001", _id: "order-1001" },
        [comboItem],
        { name: "Priya", email: "priya@example.com" }
      );

      assert.ok(alert.html.includes("Complete Sanskrit Bundle"));
      assert.ok(alert.html.includes("Grammar Video Series"));
      assert.ok(alert.html.includes("Chanting Audio Library"));
      assert.ok(!alert.html.includes("https://secret.com/grammar"));
      assert.ok(!alert.html.includes("https://secret.com/chanting"));
    });
  });

  describe("formatCart combo externalAccessManual (pure, no DB)", () => {
    it("sets externalAccessManual: true when a combo product has a bundle item with externalAccessManual: true and digitalDelivery: 'external'", () => {
      const cart = {
        items: [
          {
            product: {
              _id: "combo-100",
              name: "Sanskrit Bundle with Manual Course",
              productType: "bundle",
              price: 1500,
              isDigital: true,
              digitalDelivery: "onsite",
              externalAccessManual: false,
              bundleItems: [
                {
                  product: {
                    _id: "book-1",
                    digitalDelivery: "external",
                    externalAccessManual: true
                  }
                },
                {
                  product: {
                    _id: "book-2",
                    digitalDelivery: "onsite",
                    externalAccessManual: false
                  }
                }
              ]
            },
            quantity: 1
          }
        ]
      };

      const formatted = formatCart(cart);
      assert.equal(formatted.length, 1);
      assert.equal(formatted[0].externalAccessManual, true);
    });

    it("sets externalAccessManual: false when combo components are onsite or external without manual access", () => {
      const cart = {
        items: [
          {
            product: {
              _id: "combo-200",
              name: "Standard Digital Bundle",
              productType: "bundle",
              price: 999,
              isDigital: true,
              digitalDelivery: "onsite",
              externalAccessManual: false,
              bundleItems: [
                {
                  product: {
                    _id: "book-auto",
                    digitalDelivery: "external",
                    externalAccessManual: false
                  }
                },
                {
                  product: {
                    _id: "book-onsite-manual",
                    digitalDelivery: "onsite",
                    externalAccessManual: true // Not external, so should not trigger manual setup
                  }
                }
              ]
            },
            quantity: 1
          }
        ]
      };

      const formatted = formatCart(cart);
      assert.equal(formatted.length, 1);
      assert.equal(formatted[0].externalAccessManual, false);
    });
  });
});
