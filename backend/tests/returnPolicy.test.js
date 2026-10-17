const test = require("node:test");
const assert = require("node:assert/strict");
const {
  RETURN_OVERDUE_DAYS,
  isPhysicalItem,
  isReturnOverdue,
  checkRefundReceipt,
  restockableItems,
  deriveOrderRefundStatus
} = require("../utils/returnPolicy");

test("isPhysicalItem identifies physical vs digital items", () => {
  assert.equal(isPhysicalItem({ isDigital: false }), true);
  assert.equal(isPhysicalItem({ isDigital: true }), false);
  assert.equal(isPhysicalItem({}), true);
  assert.equal(isPhysicalItem(null), true);
});

test("isReturnOverdue at 13 and 15 days", () => {
  const baseTime = new Date("2026-10-01T12:00:00Z");
  const approvedItem = {
    returnRequest: {
      status: "Approved",
      approvedAt: baseTime
    }
  };

  const day13 = new Date(baseTime.getTime() + 13 * 24 * 60 * 60 * 1000);
  const day15 = new Date(baseTime.getTime() + 15 * 24 * 60 * 60 * 1000);

  assert.equal(isReturnOverdue(approvedItem, day13), false);
  assert.equal(isReturnOverdue(approvedItem, day15), true);

  // Status other than Approved or missing approvedAt
  assert.equal(isReturnOverdue({ returnRequest: { status: "Requested", approvedAt: baseTime } }, day15), false);
  assert.equal(isReturnOverdue({ returnRequest: { status: "Approved" } }, day15), false);
  assert.equal(isReturnOverdue(null, day15), false);
});

test("checkRefundReceipt (a): Shipped order with an unreceived physical item -> blocked", () => {
  const order = {
    status: "Shipped",
    items: [
      { _id: "item1", name: "Physical Book", isDigital: false, returnRequest: { status: "Approved" } }
    ]
  };

  const result = checkRefundReceipt({
    order,
    itemIds: ["item1"],
    isSuperAdmin: false
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockedItems.length, 1);
  assert.match(result.message, /Refund is blocked/);
  assert.doesNotMatch(result.message, /Super Admin/);
});

test("checkRefundReceipt (b): Shipped order with the same item Received -> ok", () => {
  const order = {
    status: "Shipped",
    items: [
      { _id: "item1", name: "Physical Book", isDigital: false, returnRequest: { status: "Received" } }
    ]
  };

  const result = checkRefundReceipt({
    order,
    itemIds: ["item1"],
    isSuperAdmin: false
  });

  assert.equal(result.ok, true);
});

test("checkRefundReceipt (c): digital-only items on Delivered order -> ok", () => {
  const order = {
    status: "Delivered",
    items: [
      { _id: "digital1", name: "E-Book", isDigital: true, returnRequest: { status: "Requested" } }
    ]
  };

  const result = checkRefundReceipt({
    order,
    itemIds: ["digital1"],
    isSuperAdmin: false
  });

  assert.equal(result.ok, true);
});

test("checkRefundReceipt (d): Pending (unshipped) order -> ok", () => {
  const order = {
    status: "Pending",
    items: [
      { _id: "item1", name: "Physical Book", isDigital: false, returnRequest: { status: "Approved" } }
    ]
  };

  const result = checkRefundReceipt({
    order,
    itemIds: ["item1"],
    isSuperAdmin: false
  });

  assert.equal(result.ok, true);
});

test("checkRefundReceipt (e): super admin with waive and a 10+ char reason -> ok + waived", () => {
  const order = {
    status: "Delivered",
    items: [
      { _id: "item1", name: "Physical Book", isDigital: false, returnRequest: { status: "Approved" } }
    ]
  };

  const result = checkRefundReceipt({
    order,
    itemIds: ["item1"],
    isSuperAdmin: true,
    waive: true,
    waiveReason: "Approved by manager exception"
  });

  assert.equal(result.ok, true);
  assert.equal(result.waived, true);
  assert.equal(result.blockedItems.length, 1);
});

test("checkRefundReceipt (f): super admin with a short reason -> blocked with hint", () => {
  const order = {
    status: "Delivered",
    items: [
      { _id: "item1", name: "Physical Book", isDigital: false, returnRequest: { status: "Approved" } }
    ]
  };

  const result = checkRefundReceipt({
    order,
    itemIds: ["item1"],
    isSuperAdmin: true,
    waive: true,
    waiveReason: "Too short"
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockedItems.length, 1);
  assert.match(result.message, /Super Admin/);
});

test("checkRefundReceipt (g): non-super admin with waive -> blocked without hint", () => {
  const order = {
    status: "Delivered",
    items: [
      { _id: "item1", name: "Physical Book", isDigital: false, returnRequest: { status: "Approved" } }
    ]
  };

  const result = checkRefundReceipt({
    order,
    itemIds: ["item1"],
    isSuperAdmin: false,
    waive: true,
    waiveReason: "Customer promises they sent it"
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockedItems.length, 1);
  assert.doesNotMatch(result.message, /Super Admin/);
});

test("restockableItems for Good, Damaged and digital items", () => {
  const items = [
    { _id: "1", name: "Book Good", isDigital: false, returnRequest: { status: "Received", condition: "Good" } },
    { _id: "2", name: "Book Damaged", isDigital: false, returnRequest: { status: "Received", condition: "Damaged" } },
    { _id: "3", name: "Digital Good", isDigital: true, returnRequest: { status: "Received", condition: "Good" } },
    { _id: "4", name: "Book Refunded Good", isDigital: false, returnRequest: { status: "Refunded", condition: "Good" } },
    { _id: "5", name: "Book Incomplete", isDigital: false, returnRequest: { status: "Received", condition: "Incomplete" } }
  ];

  const restockable = restockableItems(items);
  assert.equal(restockable.length, 2);
  assert.deepEqual(restockable.map((it) => it._id), ["1", "4"]);
});

test("deriveOrderRefundStatus: preserves Refunded and Partially Refunded", () => {
  const order1 = { refundStatus: "Refunded", items: [{ returnRequest: { status: "Received" } }] };
  assert.equal(deriveOrderRefundStatus(order1), "Refunded");

  const order2 = { refundStatus: "Partially Refunded", items: [{ returnRequest: { status: "Received" } }] };
  assert.equal(deriveOrderRefundStatus(order2), "Partially Refunded");
});

test("deriveOrderRefundStatus: branch derivation", () => {
  // Any item Received -> Processing
  const orderReceived = {
    refundStatus: "Pending",
    items: [
      { returnRequest: { status: "Approved" } },
      { returnRequest: { status: "Received" } }
    ]
  };
  assert.equal(deriveOrderRefundStatus(orderReceived), "Processing");

  // Else any Requested or Approved -> Pending
  const orderRequested = {
    refundStatus: "Not Applicable",
    items: [
      { returnRequest: { status: "Requested" } }
    ]
  };
  assert.equal(deriveOrderRefundStatus(orderRequested), "Pending");

  const orderApproved = {
    refundStatus: "Not Applicable",
    items: [
      { returnRequest: { status: "Approved" } },
      { returnRequest: { status: "Rejected" } }
    ]
  };
  assert.equal(deriveOrderRefundStatus(orderApproved), "Pending");

  // Else if every item that has a return request is Rejected -> Rejected
  const orderRejected = {
    refundStatus: "Pending",
    items: [
      { returnRequest: { status: "Rejected" } },
      { returnRequest: { status: "Rejected" } },
      { returnRequest: { status: "Not Requested" } }
    ]
  };
  assert.equal(deriveOrderRefundStatus(orderRejected), "Rejected");

  // Else keep current value
  const orderKeep = {
    refundStatus: "CustomStatus",
    items: [
      { returnRequest: { status: "Not Requested" } }
    ]
  };
  assert.equal(deriveOrderRefundStatus(orderKeep), "CustomStatus");
});
