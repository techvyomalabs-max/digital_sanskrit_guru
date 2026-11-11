const test = require("node:test");
const assert = require("node:assert/strict");
const { computeRefundQuote } = require("../utils/refundQuote");

test("whole-order cancellation, store_fault -> full remaining including delivery, no fee", () => {
  const order = {
    total: 900,
    totalInInr: 900,
    deliveryCharge: 100,
    discount: 0,
    refundedAmountInInr: 0,
    items: [
      { _id: "item1", name: "Book 1", price: 500, quantity: 1, isDigital: false },
      { _id: "item2", name: "Book 2", price: 300, quantity: 1, isDigital: false }
    ]
  };

  const quote = computeRefundQuote({
    order,
    itemIds: [],
    reason: "store_fault",
    gatewayFeePaise: 2000
  });

  assert.equal(quote.itemsValue, 800);
  assert.equal(quote.deliveryIncluded, 100);
  assert.equal(quote.feeShare, 0);
  assert.equal(quote.returnShipping, 0);
  assert.equal(quote.refundable, 900);
});

// The store no longer keeps the gateway fee (it would be a taxable supply of its own); these
// tests keep checking the deduction rule itself with the option switched on.
const keepFee = { deductGatewayFeeOnCustomerChoice: true };

test("by default no gateway fee is kept on a change-of-mind refund", () => {
  const order = {
    total: 900, totalInInr: 900, deliveryCharge: 100, discount: 0, refundedAmountInInr: 0,
    items: [{ _id: "item1", name: "Book 1", price: 800, quantity: 1, isDigital: false }]
  };
  const quote = computeRefundQuote({ order, itemIds: [], reason: "customer_choice", gatewayFeePaise: 2000, policy: require("../config/refundPolicy") });
  assert.equal(quote.feeShare, 0);
  assert.equal(quote.refundable, 900);
});

test("whole-order cancellation, customer_choice -> total minus the full fee", () => {
  const order = {
    total: 900,
    totalInInr: 900,
    deliveryCharge: 100,
    discount: 0,
    refundedAmountInInr: 0,
    items: [
      { _id: "item1", name: "Book 1", price: 500, quantity: 1, isDigital: false },
      { _id: "item2", name: "Book 2", price: 300, quantity: 1, isDigital: false }
    ]
  };

  const quote = computeRefundQuote({
    order,
    itemIds: [],
    reason: "customer_choice",
    gatewayFeePaise: 2000, // Rs. 20.00
    policy: keepFee
  });

  assert.equal(quote.itemsValue, 800);
  assert.equal(quote.deliveryIncluded, 100);
  assert.equal(quote.feeShare, 20);
  assert.equal(quote.refundable, 880);
});

test("1 of 2 items, customer_choice -> item value minus proportional fee, no delivery", () => {
  const order = {
    total: 900,
    totalInInr: 900,
    deliveryCharge: 100,
    discount: 0,
    refundedAmountInInr: 0,
    items: [
      { _id: "item1", name: "Book 1", price: 500, quantity: 1, isDigital: false },
      { _id: "item2", name: "Book 2", price: 300, quantity: 1, isDigital: false }
    ]
  };

  const quote = computeRefundQuote({
    order,
    itemIds: ["item1"],
    reason: "customer_choice",
    gatewayFeePaise: 2000,
    policy: keepFee
  });

  assert.equal(quote.itemsValue, 500);
  assert.equal(quote.deliveryIncluded, 0);
  // feeShare = 20 * (500 / 900) = 11.11
  assert.equal(quote.feeShare, 11.11);
  assert.equal(quote.refundable, 488.89);
});

test("1 of 2 items, store_fault -> item value plus that item's share of delivery", () => {
  const order = {
    total: 900,
    totalInInr: 900,
    deliveryCharge: 100,
    discount: 0,
    refundedAmountInInr: 0,
    items: [
      { _id: "item1", name: "Book 1", price: 500, quantity: 1, isDigital: false },
      { _id: "item2", name: "Book 2", price: 300, quantity: 1, isDigital: false }
    ]
  };

  const quote = computeRefundQuote({
    order,
    itemIds: ["item1"],
    reason: "store_fault",
    gatewayFeePaise: 2000
  });

  assert.equal(quote.itemsValue, 500);
  // The damaged ₹500 book carried 500/800 of the ₹100 delivery
  assert.equal(quote.deliveryIncluded, 62.5);
  assert.equal(quote.feeShare, 0);
  assert.equal(quote.refundable, 562.5);
});

test("1 of 2 items, store_fault, with the delivery-share option off -> no delivery (old rule)", () => {
  const order = {
    total: 900, totalInInr: 900, deliveryCharge: 100, discount: 0, refundedAmountInInr: 0,
    items: [
      { _id: "item1", name: "Book 1", price: 500, quantity: 1, isDigital: false },
      { _id: "item2", name: "Book 2", price: 300, quantity: 1, isDigital: false }
    ]
  };
  const quote = computeRefundQuote({ order, itemIds: ["item1"], reason: "store_fault", policy: { refundDeliveryShareOnStoreFault: false } });
  assert.equal(quote.deliveryIncluded, 0);
});

test("coupon discount allocated proportionally", () => {
  const order = {
    total: 720,
    totalInInr: 720,
    deliveryCharge: 0,
    discount: 80, // 80 coupon on 800 gross -> 10%
    refundedAmountInInr: 0,
    items: [
      { _id: "item1", price: 500, quantity: 1, isDigital: false },
      { _id: "item2", price: 300, quantity: 1, isDigital: false }
    ]
  };

  const quote = computeRefundQuote({
    order,
    itemIds: ["item1"],
    reason: "store_fault",
    gatewayFeePaise: 0
  });

  // item1 gross = 500, coupon discount = 80 * (500 / 800) = 50. Value = 450
  assert.equal(quote.itemsValue, 450);
  assert.equal(quote.refundable, 450);
});

test("feeUnknown when gatewayFeePaise is null", () => {
  const order = {
    total: 500,
    totalInInr: 500,
    deliveryCharge: 0,
    discount: 0,
    refundedAmountInInr: 0,
    items: [{ _id: "item1", price: 500, quantity: 1, isDigital: false }]
  };

  const quote = computeRefundQuote({
    order,
    itemIds: ["item1"],
    reason: "customer_choice",
    gatewayFeePaise: null,
    policy: keepFee
  });

  assert.equal(quote.feeUnknown, true);
  assert.equal(quote.feeShare, 0);
  assert.equal(quote.refundable, 500);
});

test("capped at the remaining refundable amount after an earlier partial refund", () => {
  const order = {
    total: 900,
    totalInInr: 900,
    deliveryCharge: 100,
    discount: 0,
    refundedAmountInInr: 600, // already refunded 600, only 300 remaining
    items: [
      { _id: "item1", price: 500, quantity: 1, isDigital: false },
      { _id: "item2", price: 300, quantity: 1, isDigital: false }
    ]
  };

  const quote = computeRefundQuote({
    order,
    itemIds: ["item1"],
    reason: "store_fault",
    gatewayFeePaise: 0
  });

  assert.equal(quote.itemsValue, 500);
  assert.equal(quote.remainingBefore, 300);
  assert.equal(quote.refundable, 300);
});
