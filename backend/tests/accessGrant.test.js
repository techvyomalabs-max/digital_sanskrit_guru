const { describe, it, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const User = require("../models/User");
const StoreSettings = require("../models/StoreSettings");
const AdminAuditLog = require("../models/AdminAuditLog");
const orderRoutes = require("../routes/orderRoutes");

const {
  sanitizeAccessNote,
  applyAccessGrant,
  shouldCompleteAfterGrant,
  hasPendingManualAccess
} = require("../utils/accessFulfilment");

const {
  accessGrantedPayload,
  accessPendingPayload
} = require("../utils/webPush");

const {
  buildPendingAccessNotice,
  buildAccessGrantedEmail,
  buildAccessPendingAdminAlert
} = require("../utils/email");

// Extract the handlers from router stack
const grantRoute = orderRoutes.stack.find(
  (s) => s.route && s.route.path === "/:id/grant-access" && s.route.methods.put
);
assert.ok(grantRoute, "grant-access route must be registered");
const grantHandler = grantRoute.route.stack[grantRoute.route.stack.length - 1].handle;

describe("Access Grant & Fulfilment", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  describe("sanitizeAccessNote", () => {
    it("returns empty string for non-strings", () => {
      assert.equal(sanitizeAccessNote(null), "");
      assert.equal(sanitizeAccessNote(undefined), "");
      assert.equal(sanitizeAccessNote(12345), "");
      assert.equal(sanitizeAccessNote({ note: "hello" }), "");
    });

    it("strips control characters but preserves \\n", () => {
      const input = "Line 1\x00\x08\x1F\nLine 2\x7F\x07";
      const result = sanitizeAccessNote(input);
      assert.equal(result, "Line 1\nLine 2");
    });

    it("trims whitespace and collapses 3+ newlines to 2", () => {
      const input = "   Hello\n\n\n\n\nWorld   ";
      const result = sanitizeAccessNote(input);
      assert.equal(result, "Hello\n\nWorld");
    });

    it("cuts text exceeding 500 characters down to 500", () => {
      const input = "A".repeat(600);
      const result = sanitizeAccessNote(input);
      assert.equal(result.length, 500);
      assert.equal(result, "A".repeat(500));
    });
  });

  describe("applyAccessGrant", () => {
    const makeSampleItems = () => [
      {
        name: "Manual Digital Course",
        isDigital: true,
        digitalDelivery: "external",
        accessManual: true,
        accessGrantedAt: null,
        externalAccessLink: "https://secret.portal.com/access/123"
      },
      {
        name: "Instant E-book",
        isDigital: true,
        digitalDelivery: "external",
        accessManual: false,
        accessGrantedAt: null
      },
      {
        name: "Physical Book",
        isDigital: false,
        accessManual: false
      }
    ];

    it("grants all pending manual items by default when itemIndexes is omitted", () => {
      const items = makeSampleItems();
      const adminId = "admin123";
      const now = new Date("2026-10-23T12:00:00Z");

      const result = applyAccessGrant(items, { adminId, note: "Login instructions", now });

      assert.equal(result.error, "");
      assert.deepEqual(result.grantedIndexes, [0]);
      assert.equal(result.items[0].accessGrantedAt.toISOString(), now.toISOString());
      assert.equal(result.items[0].accessGrantedBy, adminId);
      assert.equal(result.items[0].accessNote, "Login instructions");
      // Other items unchanged
      assert.equal(result.items[1].accessGrantedAt, null);
      assert.equal(result.items[2].accessGrantedAt, undefined);
    });

    it("does not mutate the input array", () => {
      const items = makeSampleItems();
      const originalFirstItemAccess = items[0].accessGrantedAt;
      const result = applyAccessGrant(items, { adminId: "admin1" });
      assert.equal(items[0].accessGrantedAt, originalFirstItemAccess);
      assert.notEqual(result.items, items);
    });

    it("grants only the chosen index when itemIndexes is provided", () => {
      const items = [
        { name: "Course A", isDigital: true, digitalDelivery: "external", accessManual: true, accessGrantedAt: null },
        { name: "Course B", isDigital: true, digitalDelivery: "external", accessManual: true, accessGrantedAt: null }
      ];

      const result = applyAccessGrant(items, { itemIndexes: [1], adminId: "admin" });
      assert.equal(result.error, "");
      assert.deepEqual(result.grantedIndexes, [1]);
      assert.equal(result.items[0].accessGrantedAt, null);
      assert.ok(result.items[1].accessGrantedAt);
    });

    it("rejects out of range index with an error", () => {
      const items = makeSampleItems();
      const result = applyAccessGrant(items, { itemIndexes: [99] });
      assert.ok(result.error.includes("out of range"));
      assert.equal(result.grantedIndexes.length, 0);
    });

    it("rejects non-manual item index with an error", () => {
      const items = makeSampleItems();
      const result = applyAccessGrant(items, { itemIndexes: [2] }); // Physical Book
      assert.ok(result.error.includes("does not require manual access"));
    });

    it("rejects already granted item index with error", () => {
      const items = [
        {
          name: "Course A",
          isDigital: true,
          digitalDelivery: "external",
          accessManual: true,
          accessGrantedAt: new Date()
        }
      ];
      const result = applyAccessGrant(items, { itemIndexes: [0] });
      assert.equal(result.error, "Access was already granted.");
    });

    it("returns 'Access was already granted.' when no items are pending and itemIndexes is omitted", () => {
      const items = [
        {
          name: "Course A",
          isDigital: true,
          digitalDelivery: "external",
          accessManual: true,
          accessGrantedAt: new Date()
        }
      ];
      const result = applyAccessGrant(items);
      assert.equal(result.error, "Access was already granted.");
    });
  });

  describe("shouldCompleteAfterGrant", () => {
    it("returns true for a digital-only order where all items are granted", () => {
      const items = [
        {
          isDigital: true,
          digitalDelivery: "external",
          accessManual: true,
          accessGrantedAt: new Date()
        },
        {
          isDigital: true,
          digitalDelivery: "external",
          accessManual: false
        }
      ];
      assert.equal(shouldCompleteAfterGrant(items), true);
    });

    it("returns false if any item is physical", () => {
      const items = [
        {
          isDigital: true,
          digitalDelivery: "external",
          accessManual: true,
          accessGrantedAt: new Date()
        },
        {
          isDigital: false,
          name: "Paper Book"
        }
      ];
      assert.equal(shouldCompleteAfterGrant(items), false);
    });

    it("returns false if any manual item is still pending", () => {
      const items = [
        {
          isDigital: true,
          digitalDelivery: "external",
          accessManual: true,
          accessGrantedAt: new Date()
        },
        {
          isDigital: true,
          digitalDelivery: "external",
          accessManual: true,
          accessGrantedAt: null
        }
      ];
      assert.equal(shouldCompleteAfterGrant(items), false);
    });

    it("returns false for empty items", () => {
      assert.equal(shouldCompleteAfterGrant([]), false);
      assert.equal(shouldCompleteAfterGrant(null), false);
    });
  });

  describe("hasPendingManualAccess", () => {
    it("returns true for paid order with pending manual item", () => {
      const order = {
        paymentStatus: "Paid",
        items: [
          { isDigital: true, digitalDelivery: "external", accessManual: true, accessGrantedAt: null }
        ]
      };
      assert.equal(hasPendingManualAccess(order), true);
    });

    it("returns false for unpaid order even with pending manual item", () => {
      const order = {
        paymentStatus: "Pending",
        items: [
          { isDigital: true, digitalDelivery: "external", accessManual: true, accessGrantedAt: null }
        ]
      };
      assert.equal(hasPendingManualAccess(order), false);
    });

    it("returns false for paid order when all items already granted", () => {
      const order = {
        paymentStatus: "Paid",
        items: [
          { isDigital: true, digitalDelivery: "external", accessManual: true, accessGrantedAt: new Date() }
        ]
      };
      assert.equal(hasPendingManualAccess(order), false);
    });
  });

  describe("Push payloads", () => {
    it("accessGrantedPayload returns valid format with url /my-library", () => {
      const payload = accessGrantedPayload({ _id: "order123" });
      assert.equal(payload.title, "Your access is ready");
      assert.equal(payload.body, "Open My Library to start");
      assert.equal(payload.url, "/my-library");
    });

    it("accessPendingPayload returns valid format pointing to /admin/orders", () => {
      const payload = accessPendingPayload({
        orderId: "650000000000000000000123",
        customerName: "Rohan",
        productNames: ["Sanskrit 101", "Advanced Grammar"]
      });
      assert.equal(payload.title, "Manual Access Required");
      assert.equal(payload.url, "/admin/orders");
      assert.ok(payload.body.includes("Rohan"));
      assert.ok(payload.body.includes("Sanskrit 101"));
    });
  });

  describe("Email builders & security rules", () => {
    it("escapes access note: <script> becomes text and not raw html", () => {
      const order = { _id: "ord1" };
      const user = { name: "Rohan", email: "rohan@example.com" };
      const grantedItems = [{ name: "Sanskrit Level 1" }];
      const dangerousNote = "<script>alert('xss')</script>\nUse code: ABC";

      const { html } = buildAccessGrantedEmail(order, user, grantedItems, dangerousNote);

      assert.ok(!html.includes("<script>alert"), "Must not contain raw script tag");
      assert.ok(html.includes("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;"));
      assert.ok(html.includes("<br/>Use code: ABC"));
    });

    it("NEVER includes externalAccessLink in the buyer email", () => {
      const order = { _id: "ord1" };
      const user = { name: "Rohan", email: "rohan@example.com" };
      const grantedItems = [
        {
          name: "Sanskrit Video Portal",
          externalAccessLink: "https://secret-external-portal.com/login?token=abc12345"
        }
      ];

      const { html } = buildAccessGrantedEmail(order, user, grantedItems, "Welcome!");

      assert.ok(!html.includes("https://secret-external-portal.com"), "Buyer email must never leak externalAccessLink");
      assert.ok(html.includes("/my-library"), "Must direct buyer to My Library");
    });

    it("buildPendingAccessNotice lists product names escaped", () => {
      const pendingItems = [
        { name: "Sanskrit <Online> Class" },
        { name: "Grammar & Vocab" }
      ];
      const notice = buildPendingAccessNotice(pendingItems);
      assert.ok(notice.includes("Sanskrit &lt;Online&gt; Class"));
      assert.ok(notice.includes("Grammar &amp; Vocab"));
      assert.ok(notice.startsWith("We are setting up your access for"));
    });

    it("buildAccessPendingAdminAlert lists pending product names and links to /admin/orders", () => {
      const order = { _id: "ord999", invoiceNumber: "INV-2026-999" };
      const pendingItems = [{ name: "Sanskrit Level 2", quantity: 2 }];
      const customer = { name: "Alice", email: "alice@example.com" };

      const { subject, html } = buildAccessPendingAdminAlert(order, pendingItems, customer);

      assert.ok(subject.includes("INV-2026-999"));
      assert.ok(html.includes("Alice"));
      assert.ok(html.includes("alice@example.com"));
      assert.ok(html.includes("Sanskrit Level 2"));
      assert.ok(html.includes("/admin/orders"));
    });
  });

  describe("Handler tests: PUT /api/orders/:id/grant-access", () => {
    function createMockRes() {
      let statusCode = 200;
      let jsonBody = null;
      return {
        status(c) {
          statusCode = c;
          return this;
        },
        json(b) {
          jsonBody = b;
          return this;
        },
        get statusCode() {
          return statusCode;
        },
        get jsonBody() {
          return jsonBody;
        }
      };
    }

    function createMockOrder(overrides = {}) {
      const modifiedFields = new Set();
      const order = {
        _id: new mongoose.Types.ObjectId(),
        paymentStatus: "Paid",
        status: "Pending",
        refundStatus: "Not Applicable",
        isGift: false,
        items: [
          {
            name: "Digital Course",
            isDigital: true,
            digitalDelivery: "external",
            accessManual: true,
            accessGrantedAt: null,
            externalAccessLink: "https://secret.example.com"
          }
        ],
        markModified(field) {
          modifiedFields.add(field);
        },
        async save() {
          return this;
        },
        hasModified(field) {
          return modifiedFields.has(field);
        },
        ...overrides
      };
      return order;
    }

    it("success on a digital-only order: status becomes Completed, markModified called", async () => {
      const order = createMockOrder();
      mock.method(Order, "findById", async () => order);
      mock.method(User, "findById", () => ({
        select: () => ({
          lean: async () => ({ name: "Super Admin", email: "admin@example.com" })
        })
      }));
      mock.method(AdminAuditLog, "create", async () => ({}));

      const req = {
        params: { id: order._id.toString() },
        user: new mongoose.Types.ObjectId().toString(),
        body: { note: "Welcome to class!" }
      };
      const res = createMockRes();

      await grantHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(order.status, "Completed");
      assert.equal(order.orderStatus, "Completed");
      assert.ok(order.hasModified("items"), "order.markModified('items') must be called");
      assert.ok(order.items[0].accessGrantedAt);
      assert.equal(order.items[0].accessNote, "Welcome to class!");
      assert.equal(order.lastUpdatedByName, "Super Admin");
    });

    it("success on a mixed order: status remains unchanged (e.g. Pending)", async () => {
      const order = createMockOrder({
        status: "Pending",
        items: [
          {
            name: "Digital Course",
            isDigital: true,
            digitalDelivery: "external",
            accessManual: true,
            accessGrantedAt: null
          },
          {
            name: "Printed Textbook",
            isDigital: false,
            accessManual: false
          }
        ]
      });

      mock.method(Order, "findById", async () => order);
      mock.method(User, "findById", () => ({
        select: () => ({
          lean: async () => ({ name: "Super Admin", email: "admin@example.com" })
        })
      }));
      mock.method(AdminAuditLog, "create", async () => ({}));

      const req = {
        params: { id: order._id.toString() },
        user: new mongoose.Types.ObjectId().toString(),
        body: {}
      };
      const res = createMockRes();

      await grantHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(order.status, "Pending", "Mixed order status must not change to Completed");
      assert.ok(order.items[0].accessGrantedAt);
    });

    it("second call on already granted order responds 409", async () => {
      const order = createMockOrder({
        items: [
          {
            name: "Digital Course",
            isDigital: true,
            digitalDelivery: "external",
            accessManual: true,
            accessGrantedAt: new Date()
          }
        ]
      });

      mock.method(Order, "findById", async () => order);
      mock.method(User, "findById", () => ({
        select: () => ({
          lean: async () => ({ name: "Super Admin", email: "admin@example.com" })
        })
      }));

      const req = {
        params: { id: order._id.toString() },
        user: new mongoose.Types.ObjectId().toString(),
        body: {}
      };
      const res = createMockRes();

      await grantHandler(req, res);

      assert.equal(res.statusCode, 409);
      assert.equal(res.jsonBody.message, "Access was already granted.");
    });

    it("rejects unpaid order with 400", async () => {
      const order = createMockOrder({ paymentStatus: "Pending" });
      mock.method(Order, "findById", async () => order);

      const req = {
        params: { id: order._id.toString() },
        user: "admin1",
        body: {}
      };
      const res = createMockRes();

      await grantHandler(req, res);
      assert.equal(res.statusCode, 400);
      assert.ok(res.jsonBody.message.includes("paid"));
    });

    it("rejects cancelled order with 400", async () => {
      const order = createMockOrder({ status: "Cancelled" });
      mock.method(Order, "findById", async () => order);

      const req = {
        params: { id: order._id.toString() },
        user: "admin1",
        body: {}
      };
      const res = createMockRes();

      await grantHandler(req, res);
      assert.equal(res.statusCode, 400);
      assert.ok(res.jsonBody.message.includes("cancelled"));
    });

    it("rejects refunded order with 400", async () => {
      const order = createMockOrder({ refundStatus: "Refunded" });
      mock.method(Order, "findById", async () => order);

      const req = {
        params: { id: order._id.toString() },
        user: "admin1",
        body: {}
      };
      const res = createMockRes();

      await grantHandler(req, res);
      assert.equal(res.statusCode, 400);
      assert.ok(res.jsonBody.message.includes("refunded"));
    });

    it("rejects gift order with 400", async () => {
      const order = createMockOrder({ isGift: true });
      mock.method(Order, "findById", async () => order);

      const req = {
        params: { id: order._id.toString() },
        user: "admin1",
        body: {}
      };
      const res = createMockRes();

      await grantHandler(req, res);
      assert.equal(res.statusCode, 400);
      assert.ok(res.jsonBody.message.includes("gift"));
    });

    it("returns 404 when order is not found", async () => {
      mock.method(Order, "findById", async () => null);

      const validId = new mongoose.Types.ObjectId().toString();
      const req = {
        params: { id: validId },
        user: "admin1",
        body: {}
      };
      const res = createMockRes();

      await grantHandler(req, res);
      assert.equal(res.statusCode, 404);
      assert.equal(res.jsonBody.message, "Order not found");
    });

    it("returns 400 for an invalid order id", async () => {
      const req = {
        params: { id: "invalid-order-id" },
        user: "admin1",
        body: {}
      };
      const res = createMockRes();

      await grantHandler(req, res);
      assert.equal(res.statusCode, 400);
      assert.equal(res.jsonBody.message, "Invalid order ID");
    });
  });

  describe("GET /api/orders/admin/access-pending endpoint", () => {
    const pendingRoute = orderRoutes.stack.find(
      (s) => s.route && s.route.path === "/admin/access-pending" && s.route.methods.get
    );
    assert.ok(pendingRoute, "admin/access-pending route must be registered");
    const pendingHandler = pendingRoute.route.stack[pendingRoute.route.stack.length - 1].handle;

    it("returns only pending items with original item indexes", async () => {
      const sampleOrders = [
        {
          _id: new mongoose.Types.ObjectId(),
          invoiceNumber: "INV-1001",
          createdAt: new Date("2026-10-20T10:00:00Z"),
          user: { name: "User One", email: "user1@example.com" },
          items: [
            { name: "Granted Item", isDigital: true, accessManual: true, accessGrantedAt: new Date(), quantity: 1 },
            { name: "Pending Item 1", isDigital: true, accessManual: true, accessGrantedAt: null, quantity: 2 },
            { name: "Physical Item", isDigital: false, accessManual: false, quantity: 1 }
          ]
        }
      ];

      mock.method(Order, "find", () => ({
        sort: () => ({
          limit: () => ({
            select: () => ({
              populate: () => ({
                lean: async () => sampleOrders
              })
            })
          })
        })
      }));

      let statusCode = 200;
      let jsonBody = null;
      const res = {
        status(c) {
          statusCode = c;
          return this;
        },
        json(b) {
          jsonBody = b;
          return this;
        }
      };

      await pendingHandler({}, res);

      assert.equal(statusCode, 200);
      assert.equal(jsonBody.count, 1);
      assert.equal(jsonBody.orders.length, 1);
      const o = jsonBody.orders[0];
      assert.equal(o.invoiceNumber, "INV-1001");
      assert.equal(o.customerName, "User One");
      assert.equal(o.customerEmail, "user1@example.com");
      assert.equal(o.items.length, 1);
      assert.deepEqual(o.items[0], {
        index: 1,
        name: "Pending Item 1",
        quantity: 2
      });
    });
  });

  describe("Admin Page Permission & Confirmation Email Wording", () => {
    const { requireAdminPage } = require("../middleware/adminMiddleware");
    const emailModule = require("../utils/email");

    it("(e) an admin without the 'orders' page permission gets 403", async () => {
      const middleware = requireAdminPage("orders");
      const req = {
        adminUser: { isAdmin: true },
        adminLevel: 2,
        adminRole: "Staff",
        allowedPages: ["dashboard", "products"] // no "orders"
      };
      let statusCode = null;
      let jsonBody = null;
      const res = {
        status(c) {
          statusCode = c;
          return this;
        },
        json(b) {
          jsonBody = b;
          return this;
        }
      };
      let nextCalled = false;
      middleware(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false);
      assert.equal(statusCode, 403);
      assert.ok(jsonBody.message.includes("permission"));
    });

    it("(f) sendOrderConfirmation wording changes only for pending manual items", () => {
      // 1. Order with pending manual item
      const pendingItems = [
        {
          name: "Sanskrit Portal",
          isDigital: true,
          digitalDelivery: "external",
          accessManual: true,
          accessGrantedAt: null
        }
      ];
      const pendingNotice = emailModule.resolveExternalAccessNotice(pendingItems);
      assert.ok(pendingNotice.includes("We are setting up your access for Sanskrit Portal. You will get another email as soon as it is ready."));
      assert.ok(!pendingNotice.includes("Your access link is waiting in My Library."));

      // 2. Order with instant external delivery (accessManual: false)
      const instantItems = [
        {
          name: "Instant Sanskrit Audio",
          isDigital: true,
          digitalDelivery: "external",
          accessManual: false
        }
      ];
      const instantNotice = emailModule.resolveExternalAccessNotice(instantItems);
      assert.equal(instantNotice, "Your access link is waiting in My Library.");
    });

    it("resolveDigitalAccessHeading gives 'We are setting up your access' for pending items and keeps default heading for others", () => {
      const pendingItems = [
        { name: "Portal Course", isDigital: true, accessManual: true, accessGrantedAt: null }
      ];
      assert.equal(
        emailModule.resolveDigitalAccessHeading(pendingItems, "Digital Access Unlocked!"),
        "We are setting up your access"
      );
      assert.equal(
        emailModule.resolveDigitalAccessHeading(pendingItems, "⚡ Instant Digital Access Unlocked!"),
        "We are setting up your access"
      );
      assert.equal(
        emailModule.resolveDigitalAccessHeading(pendingItems, "Digital Access Granted!"),
        "We are setting up your access"
      );
      assert.equal(
        emailModule.resolveDigitalAccessHeading(pendingItems, "⚡ Instant Digital Access Granted!"),
        "We are setting up your access"
      );

      const grantedItems = [
        { name: "Portal Course", isDigital: true, accessManual: true, accessGrantedAt: new Date() }
      ];
      assert.equal(
        emailModule.resolveDigitalAccessHeading(grantedItems, "Digital Access Unlocked!"),
        "Digital Access Unlocked!"
      );
      assert.equal(
        emailModule.resolveDigitalAccessHeading(grantedItems, "⚡ Instant Digital Access Unlocked!"),
        "⚡ Instant Digital Access Unlocked!"
      );
      assert.equal(
        emailModule.resolveDigitalAccessHeading(grantedItems, "Digital Access Granted!"),
        "Digital Access Granted!"
      );
      assert.equal(
        emailModule.resolveDigitalAccessHeading(grantedItems, "⚡ Instant Digital Access Granted!"),
        "⚡ Instant Digital Access Granted!"
      );

      const instantItems = [
        { name: "Instant Audio", isDigital: true, accessManual: false }
      ];
      assert.equal(
        emailModule.resolveDigitalAccessHeading(instantItems, "⚡ Instant Digital Access Unlocked!"),
        "⚡ Instant Digital Access Unlocked!"
      );
      assert.equal(
        emailModule.resolveDigitalAccessHeading(instantItems, { isMixed: true, hasExternalDelivery: true }),
        "Digital Access Unlocked!"
      );
    });
  });
});
