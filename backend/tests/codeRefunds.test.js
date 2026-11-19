const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { orderHasCodes, usedCodeCounts, usedCodesValue, refundedLineIndexes } = require("../utils/codeRefunds");
const { computeRefundQuote } = require("../utils/refundQuote");
const { previewRefund } = require("../utils/refunds");

// 5 copies of a ₹100 digital book: 1 for the buyer, 4 shareable codes
const order = {
  _id: "o1",
  total: 500,
  totalInInr: 500,
  discount: 0,
  refundedAmountInInr: 0,
  items: [{ _id: "line1", product: "p1", isDigital: true, price: 100, quantity: 5, shareableCopies: 4 }]
};
const pass = (copyIndex, extra = {}) => ({ lineIndex: 0, copyIndex, isRedeemed: false, isRevoked: false, ...extra });

describe("refunds of orders with codes", () => {
  it("knows which orders have codes", () => {
    assert.equal(orderHasCodes(order), true);
    assert.equal(orderHasCodes({ items: [{ isDigital: true, price: 100, quantity: 1 }] }), false);
    assert.equal(orderHasCodes({ items: [{ isDigital: false, price: 100, quantity: 2 }] }), false);
  });

  it("counts only redeemed codes that still work", () => {
    const counts = usedCodeCounts([pass(0, { isRedeemed: true }), pass(1, { isRedeemed: true, isRevoked: true }), pass(2)]);
    assert.equal(counts.get(0), 1);
  });

  it("values the used codes at their price less their share of the discount", () => {
    const passes = [pass(0, { isRedeemed: true }), pass(1, { isRedeemed: true }), pass(2)];
    assert.deepEqual(usedCodesValue(order, passes), { count: 2, valueInInr: 200 });
    const discounted = { ...order, discount: 50, total: 450, totalInInr: 450 };
    assert.deepEqual(usedCodesValue(discounted, passes), { count: 2, valueInInr: 180 });
    assert.deepEqual(usedCodesValue(order, passes, ["other-line"]), { count: 0, valueInInr: 0 });
  });

  it("the refund quote leaves out the codes already used", () => {
    const passes = [pass(0, { isRedeemed: true }), pass(1, { isRedeemed: true }), pass(2), pass(3)];
    const quote = computeRefundQuote({ order, reason: "store_fault", codePasses: passes });
    assert.equal(quote.refundable, 300);
    assert.equal(quote.usedCodesCount, 2);
    assert.ok(quote.lines.some((l) => l.label === "Codes already used (2)" && l.amount === -200));
  });

  it("with no codes used, the quote is unchanged", () => {
    const quote = computeRefundQuote({ order, reason: "store_fault", codePasses: [pass(0), pass(1)] });
    assert.equal(quote.refundable, 500);
    assert.equal(quote.usedCodesCount, 0);
  });

  it("a refund can't pay back used codes", () => {
    assert.throws(() => previewRefund({ order, refundAmount: 500, usedCodesValueInInr: 200 }), /codes already used/);
    assert.equal(previewRefund({ order, usedCodesValueInInr: 200 }).proposedRefundAmountInInr, 300);
    assert.equal(previewRefund({ order, refundAmount: 500, usedCodesValueInInr: 200, clipToRemaining: true }).proposedRefundAmountInInr, 300);
    assert.equal(previewRefund({ order, refundAmount: 500 }).proposedRefundAmountInInr, 500);
  });

  it("refunding an item stops the codes of that item only", () => {
    const two = { ...order, items: [...order.items, { _id: "line2", product: "p2", isDigital: true, price: 50, quantity: 2, shareableCopies: 1 }, { _id: "line3", product: "p3", isDigital: false, price: 300, quantity: 1 }] };
    assert.deepEqual(refundedLineIndexes(two, ["line2"]), [1]);
    assert.deepEqual(refundedLineIndexes(two, []), [0, 1]);
    assert.deepEqual(refundedLineIndexes(two, ["line3"]), []);
  });
});
