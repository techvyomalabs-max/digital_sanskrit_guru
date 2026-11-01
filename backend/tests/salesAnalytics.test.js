const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { computeSalesAnalytics, itemFormat, locationOf, buildBuckets, istDay } = require("../utils/salesAnalytics");

const start = new Date("2026-10-01T00:00:00+05:30");
const end = new Date("2026-10-31T23:59:59.999+05:30");

const inrOrder = (over = {}) => ({
  createdAt: new Date("2026-10-05T10:00:00+05:30"),
  total: 1000,
  totalInInr: 1000,
  currencyDisplay: { currency: "INR" },
  shipping: { country: "India", state: "Karnataka" },
  items: [{ product: "p1", name: "Gita Book", price: 1000, quantity: 1, isDigital: false }],
  ...over
});

describe("sales analytics", () => {
  it("adds USD orders in rupees using the order's own rate, never as raw dollars", () => {
    const usd = inrOrder({
      total: 20, totalInInr: 1660, fxRateToInr: 83, currencyDisplay: { currency: "USD" },
      shipping: { country: "United States", state: "CA" },
      items: [{ product: "p2", name: "Web Course", price: 20, quantity: 1, isDigital: true, digitalType: "Web Version" }]
    });
    const r = computeSalesAnalytics({ orders: [inrOrder(), usd], startDate: start, endDate: end });
    assert.equal(r.summary.grossInr, 2660);
    assert.equal(r.topProducts.find((p) => p.name === "Web Course").revenueInr, 1660);
  });

  it("net revenue subtracts refunds; average order uses net", () => {
    const r = computeSalesAnalytics({
      orders: [inrOrder(), inrOrder({ refundedAmountInInr: 400 })], startDate: start, endDate: end
    });
    assert.equal(r.summary.grossInr, 2000);
    assert.equal(r.summary.refundedInr, 400);
    assert.equal(r.summary.netInr, 1600);
    assert.equal(r.summary.refundedOrders, 1);
    assert.equal(r.summary.averageOrderInr, 800);
  });

  it("formats come from saved fields: combo, digital type, physical", () => {
    assert.equal(itemFormat({ productType: "bundle" }), "Combo");
    assert.equal(itemFormat({ bundleItems: [{}] , isDigital: true }), "Combo");
    assert.equal(itemFormat({ isDigital: true, digitalType: "Flipbook" }), "Flipbook");
    assert.equal(itemFormat({ isDigital: true }), "Digital (other)");
    assert.equal(itemFormat({ name: "Gita Web Version", isDigital: false }), "Physical", "no guessing from the name");
  });

  it("location: India with state, abroad as country, missing as Not recorded", () => {
    assert.deepEqual(locationOf({ shipping: { country: "India", state: "Kerala" } }), { country: "India", state: "Kerala" });
    assert.deepEqual(locationOf({ shipping: { country: "USA" } }), { country: "USA", state: "" });
    assert.deepEqual(locationOf({ shipping: {} }), { country: "Not recorded", state: "" });
    assert.deepEqual(locationOf({ shipping: { country: "India" } }), { country: "India", state: "Not recorded" });
  });

  it("trend is daily for a month (gaps filled) and monthly for a year, in India time", () => {
    const daily = buildBuckets(start, end);
    assert.equal(daily.unit, "day");
    assert.equal(daily.buckets.length, 31);
    assert.equal(daily.buckets[0].label, "1 Oct");
    const monthly = buildBuckets(new Date("2025-11-01T00:00:00+05:30"), end);
    assert.equal(monthly.unit, "month");
    assert.equal(monthly.buckets.length, 12);
    assert.equal(monthly.buckets[11].key, "2026-10");
    // 11:30 PM UTC on 4 Oct is already 5 Oct in India
    assert.equal(istDay("2026-10-04T23:30:00Z"), "2026-10-05");
    const r = computeSalesAnalytics({ orders: [inrOrder({ createdAt: new Date("2026-10-04T23:30:00Z") })], startDate: start, endDate: end });
    assert.equal(r.trend.find((b) => b.key === "2026-10-05").orders, 1);
    assert.equal(r.trend.filter((b) => b.orders === 0).length, 30);
  });

  it("change vs the previous period, null when there was nothing before", () => {
    const r = computeSalesAnalytics({ orders: [inrOrder(), inrOrder()], previousOrders: [inrOrder()], startDate: start, endDate: end });
    assert.equal(r.changes.netInr, 100);
    assert.equal(r.changes.orders, 100);
    const none = computeSalesAnalytics({ orders: [inrOrder()], startDate: start, endDate: end });
    assert.equal(none.changes.netInr, null);
  });

  it("top products group by product id, add units and revenue, sort by revenue", () => {
    const r = computeSalesAnalytics({
      orders: [
        inrOrder({ items: [{ product: "a", name: "A", price: 100, quantity: 3 }] }),
        inrOrder({ items: [{ product: "a", name: "A", price: 100, quantity: 1 }, { product: "b", name: "B", price: 500, quantity: 1 }] })
      ],
      startDate: start, endDate: end
    });
    assert.deepEqual(r.topProducts.map((p) => [p.name, p.units, p.revenueInr]), [["B", 1, 500], ["A", 4, 400]]);
    assert.deepEqual(r.indianStates.map((s) => [s.name, s.orders]), [["Karnataka", 2]]);
  });
});
