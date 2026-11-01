const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { sumNetRevenueInr, paidOnly } = require("../utils/orderRevenue");
const { computeSalesAnalytics } = require("../utils/salesAnalytics");

const orders = [
  { paymentStatus: "Paid", total: 4599, totalInInr: 4599, createdAt: new Date("2026-10-05T04:30:00Z") },
  { paymentStatus: "Paid", total: 30, fxRateToInr: 84.5, totalInInr: 2535, currencyDisplay: { currency: "USD", amount: 30 }, createdAt: new Date("2026-10-09T04:30:00Z") },
  { paymentStatus: "Paid", total: 20, fxRateToInr: 85, currencyDisplay: { currency: "USD", amount: 20 }, createdAt: new Date("2026-10-10T04:30:00Z") },
  { paymentStatus: "Paid", total: 3000, totalInInr: 3000, refundedAmountInInr: 1000, createdAt: new Date("2026-10-15T04:30:00Z") },
  { paymentStatus: "Refunded", total: 1500, totalInInr: 1500, refundedAmountInInr: 1500, createdAt: new Date("2026-10-16T04:30:00Z") },
  { paymentStatus: "Pending", total: 9999, totalInInr: 9999, createdAt: new Date("2026-10-20T04:30:00Z") },
  { paymentStatus: "Failed", total: 2375, totalInInr: 2375, createdAt: new Date("2026-10-21T04:30:00Z") },
  { paymentStatus: "Paid", status: "Cancelled", refundStatus: "Pending", total: 800, totalInInr: 800, createdAt: new Date("2026-10-23T04:30:00Z") }
];

describe("orderRevenue", () => {
  it("counts paid orders only, at their own rate, minus refunds", () => {
    // 4599 + 2535 + 1700 + (3000 − 1000) + (1500 − 1500) + 800
    assert.equal(sumNetRevenueInr(orders), 11634);
  });

  it("gives exactly the Sales Dashboard's net revenue for the same orders", () => {
    const paid = orders.filter((o) => ["Paid", "Refunded"].includes(o.paymentStatus));
    const sales = computeSalesAnalytics({
      orders: paid,
      startDate: new Date("2026-09-30T18:30:00Z"),
      endDate: new Date("2026-10-31T18:29:59.999Z")
    });
    assert.equal(sumNetRevenueInr(orders), sales.summary.netInr);
  });

  it("narrows a query to paid orders without dropping its own conditions", () => {
    assert.deepEqual(paidOnly({ status: "Shipped" }), { $and: [{ status: "Shipped" }, { paymentStatus: { $in: ["Paid", "Refunded"] } }] });
  });
});
