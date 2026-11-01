const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { computeDashboardSummary, computeAlertCounts, istWeekStart, normalizeStatus } = require("../utils/dashboardSummary");

const now = new Date("2026-10-31T12:00:00+05:30"); // Saturday 31 Oct 2026, India time
const at = (iso) => new Date(iso);

describe("dashboardSummary", () => {
  it("converts USD orders to INR and subtracts refunds", () => {
    const out = computeDashboardSummary({
      now,
      paidOrders: [
        { _id: "a", createdAt: at("2026-10-30T10:00:00+05:30"), total: 1000, totalInInr: 1000, user: "u1", items: [{ name: "Book", price: 1000, quantity: 1 }] },
        { _id: "b", createdAt: at("2026-10-29T10:00:00+05:30"), total: 20, fxRateToInr: 85, currencyDisplay: { currency: "USD" }, user: "u2", items: [{ name: "Book", price: 20, quantity: 1 }] },
        { _id: "c", createdAt: at("2026-10-28T10:00:00+05:30"), total: 500, totalInInr: 500, refundedAmountInInr: 500, user: "u1", items: [{ name: "USB", price: 500, quantity: 2 }] }
      ]
    });
    assert.equal(out.totals.grossInr, 3200);
    assert.equal(out.totals.refundedInr, 500);
    assert.equal(out.totals.revenueInr, 2700);
    assert.equal(out.totals.averageOrderInr, 900);
    assert.equal(out.totals.unitsSold, 4);
    assert.equal(out.topProducts[0].name, "Book");
    assert.equal(out.topProducts[0].sales, 2700);
    assert.equal(out.totals.uniqueCustomers, 2);
    assert.equal(out.totals.repeatCustomers, 1);
    assert.equal(out.totals.repeatRate, 50);
  });

  it("uses India time for today, and compares the last 30 days with the 30 before", () => {
    const out = computeDashboardSummary({
      now,
      paidOrders: [
        { createdAt: at("2026-10-31T00:10:00+05:30"), totalInInr: 100 }, // today in IST (still 30 Oct in UTC)
        { createdAt: at("2026-10-30T23:50:00+05:30"), totalInInr: 200 }, // yesterday
        { createdAt: at("2026-09-15T10:00:00+05:30"), totalInInr: 150 } // 30-60 days ago
      ]
    });
    assert.equal(out.revenue.today, 100);
    assert.equal(out.revenue.last7Days, 300);
    assert.equal(out.revenue.last30Days, 300);
    assert.equal(out.revenue.previous30Days, 150);
    assert.equal(out.revenue.growthPercent, 100);
  });

  it("keeps the last 6 months, including months with no sales", () => {
    const out = computeDashboardSummary({
      now,
      paidOrders: [{ createdAt: at("2026-07-05T10:00:00+05:30"), totalInInr: 400 }]
    });
    assert.deepEqual(out.monthly.map((m) => m.key), ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    assert.equal(out.monthly[2].revenue, 400);
    assert.equal(out.monthly[5].revenue, 0);
    assert.equal(out.monthly[5].label, "Oct 26");
  });

  it("groups weeks from Sunday in India time and counts buyers once", () => {
    assert.equal(istWeekStart(at("2026-10-31T12:00:00+05:30")), "2026-10-25");
    assert.equal(istWeekStart(at("2026-10-24T19:00:00Z")), "2026-10-25"); // Sun 00:30 IST
    const out = computeDashboardSummary({
      now,
      paidOrders: [
        { createdAt: at("2026-10-26T10:00:00+05:30"), totalInInr: 100, user: "u1" },
        { createdAt: at("2026-10-27T10:00:00+05:30"), totalInInr: 100, user: "u1" },
        { createdAt: at("2026-10-28T10:00:00+05:30"), totalInInr: 100, billing: { email: "Guest@x.com" } }
      ]
    });
    assert.equal(out.weekly.length, 1);
    assert.equal(out.weekly[0].label, "Week of Oct 25");
    assert.equal(out.weekly[0].ordersCount, 3);
    assert.equal(out.weekly[0].uniqueUsersCount, 2);
    assert.equal(out.weekdays.find((d) => d.day === "Mon").value, 100);
  });

  it("counts shipping statuses and picks the top customer by spend", () => {
    const out = computeDashboardSummary({
      now,
      paidOrders: [
        { createdAt: now, totalInInr: 900, status: "Processing", billing: { name: "Asha", email: "a@x.com" } },
        { createdAt: now, totalInInr: 100, status: "Delivered", user: { _id: "u9", name: "Ravi" } },
        { createdAt: now, totalInInr: 50, status: "Cancelled", user: "u8" }
      ]
    });
    assert.deepEqual(out.statuses, { Pending: 1, Shipped: 0, Delivered: 1, Cancelled: 1 });
    assert.deepEqual(out.topCustomer, { name: "Asha", spend: 900 });
    assert.equal(normalizeStatus("Placed"), "Pending");
  });

  it("returns zeros when there are no paid orders", () => {
    const out = computeDashboardSummary({ now });
    assert.equal(out.totals.revenueInr, 0);
    assert.equal(out.totals.averageOrderInr, 0);
    assert.equal(out.topCustomer, null);
    assert.equal(out.revenue.growthPercent, 0);
  });

  it("counts open returns and refunds for the alerts", () => {
    const counts = computeAlertCounts(
      [
        { refundStatus: "Not Applicable", items: [{ returnRequest: { status: "Requested" } }, { returnRequest: { status: "Received" } }] },
        { items: [{ returnRequest: { status: "Approved", approvedAt: at("2026-10-01T00:00:00Z") } }] },
        { items: [{ returnRequest: { status: "Approved", approvedAt: at("2026-10-29T00:00:00Z") } }] },
        { refundStatus: "Refunded", items: [{ returnRequest: { status: "Requested" } }] },
        { status: "Cancelled", refundStatus: "Pending", items: [] },
        { refundStatus: "Processing", items: [] }
      ],
      now
    );
    assert.deepEqual(counts, { returnRequests: 1, returnsReceived: 1, returnsOverdue: 1, cancelledAwaitingRefund: 1, refundsProcessing: 1 });
  });
});
