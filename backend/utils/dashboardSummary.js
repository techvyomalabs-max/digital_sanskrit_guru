"use strict";

/**
 * Admin Dashboard figures, worked out on the server so the page no longer downloads every order.
 * - Revenue counts paid orders only (Paid, or Paid then Refunded), in INR at each order's own rate,
 *   minus what was refunded. Unpaid or failed checkouts are not revenue.
 * - Days, weeks (starting Sunday) and months are India time (IST).
 */

const { getFxRate } = require("./financeLedger");
const { istDay, orderGrossInr, orderRefundedInr } = require("./salesAnalytics");

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const RETURN_OVERDUE_MS = 14 * DAY_MS;

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const dayMs = (ymd) => Date.parse(`${ymd}T00:00:00Z`);

function toInr(order, amount) {
  const fx = getFxRate(order);
  return round2((Number(amount) || 0) * (fx === null ? 1 : fx));
}

/** Shipped, Delivered or Cancelled; anything else counts as Pending (not shipped yet). */
function normalizeStatus(status) {
  return status === "Shipped" || status === "Delivered" || status === "Cancelled" ? status : "Pending";
}

function customerKey(order) {
  const user = order?.user?._id || order?.user;
  if (user) return `u:${String(user)}`;
  const email = String(order?.billing?.email || "").trim().toLowerCase();
  if (email) return `e:${email}`;
  const phone = String(order?.shipping?.phone || order?.billing?.phone || "").trim();
  return phone ? `p:${phone}` : "";
}

function customerName(order) {
  return String(order?.user?.name || order?.billing?.name || order?.shipping?.name || "Customer").trim() || "Customer";
}

/** "YYYY-MM-DD" of the Sunday that starts the IST week of this date. */
function istWeekStart(date) {
  const day = istDay(date);
  const weekday = new Date(dayMs(day)).getUTCDay();
  return new Date(dayMs(day) - weekday * DAY_MS).toISOString().slice(0, 10);
}

function lastMonths(now, count) {
  const today = istDay(now);
  let y = Number(today.slice(0, 4));
  let m = Number(today.slice(5, 7));
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.unshift({ key: `${y}-${String(m).padStart(2, "0")}`, label: `${MONTHS[m - 1]} ${String(y).slice(2)}`, revenue: 0 });
    m -= 1;
    if (m < 1) { m = 12; y -= 1; }
  }
  return out;
}

/**
 * paidOrders: every order with paymentStatus Paid or Refunded (narrow fields only).
 * now: the current time (passed in so tests are exact).
 */
function computeDashboardSummary({ paidOrders = [], now = new Date() }) {
  const today = istDay(now);
  const todayStart = dayMs(today) - 330 * 60 * 1000; // IST midnight as a real instant
  const nowMs = new Date(now).getTime();
  const last7Start = nowMs - 7 * DAY_MS;
  const last30Start = nowMs - 30 * DAY_MS;
  const prev30Start = nowMs - 60 * DAY_MS;

  const months = lastMonths(now, 6);
  const monthByKey = new Map(months.map((mo) => [mo.key, mo]));
  const weeks = new Map();
  const weekday = new Map(WEEKDAYS.map((d) => [d, 0]));
  const customers = new Map();
  const products = new Map();
  const statuses = { Pending: 0, Shipped: 0, Delivered: 0, Cancelled: 0 };
  const kpis = { today: 0, last7Days: 0, last30Days: 0, total: 0 };
  let prev30 = 0;
  let units = 0;
  let gross = 0;
  let refunded = 0;

  for (const order of paidOrders) {
    const ts = new Date(order?.createdAt).getTime();
    if (!Number.isFinite(ts)) continue;
    const orderGross = orderGrossInr(order);
    const orderRefund = orderRefundedInr(order);
    const net = orderGross - orderRefund;
    gross += orderGross;
    refunded += orderRefund;
    statuses[normalizeStatus(order?.status)] += 1;

    kpis.total += net;
    if (ts >= todayStart) kpis.today += net;
    if (ts >= last7Start) kpis.last7Days += net;
    if (ts >= last30Start) kpis.last30Days += net;
    else if (ts >= prev30Start) prev30 += net;

    const day = istDay(order.createdAt);
    const month = monthByKey.get(day.slice(0, 7));
    if (month) month.revenue += net;

    const wd = WEEKDAYS[new Date(dayMs(day)).getUTCDay()];
    weekday.set(wd, weekday.get(wd) + net);

    const weekKey = istWeekStart(order.createdAt);
    const week = weeks.get(weekKey) || { weekStart: weekKey, revenue: 0, ordersCount: 0, buyers: new Set() };
    week.revenue += net;
    week.ordersCount += 1;
    const ckey = customerKey(order);
    week.buyers.add(ckey || `order:${order?._id}`);
    weeks.set(weekKey, week);

    if (ckey) {
      const c = customers.get(ckey) || { name: customerName(order), orders: 0, spend: 0 };
      c.orders += 1;
      c.spend += net;
      customers.set(ckey, c);
    }

    for (const item of Array.isArray(order?.items) ? order.items : []) {
      const name = String(item?.name || "").trim();
      const qty = Math.max(1, Number(item?.quantity || 1));
      units += qty;
      if (!name) continue;
      const key = String(item?.product || "").trim() || `name:${name.toLowerCase()}`;
      const p = products.get(key) || { name, quantity: 0, sales: 0 };
      p.quantity += qty;
      p.sales += toInr(order, Number(item?.price || 0) * qty);
      products.set(key, p);
    }
  }

  const orderCount = paidOrders.length;
  const net = gross - refunded;
  const uniqueCustomers = customers.size;
  const repeatCustomers = [...customers.values()].filter((c) => c.orders > 1).length;
  const topCustomer = [...customers.values()].sort((a, b) => b.spend - a.spend)[0] || null;

  return {
    generatedAt: new Date(now).toISOString(),
    totals: {
      paidOrders: orderCount,
      grossInr: round2(gross),
      refundedInr: round2(refunded),
      revenueInr: round2(net),
      averageOrderInr: orderCount ? round2(net / orderCount) : 0,
      unitsSold: units,
      uniqueCustomers,
      repeatCustomers,
      repeatRate: uniqueCustomers ? round2((repeatCustomers / uniqueCustomers) * 100) : 0
    },
    statuses,
    revenue: {
      today: round2(kpis.today),
      last7Days: round2(kpis.last7Days),
      last30Days: round2(kpis.last30Days),
      previous30Days: round2(prev30),
      growthPercent: prev30 > 0 ? round2(((kpis.last30Days - prev30) / prev30) * 100) : kpis.last30Days > 0 ? 100 : 0,
      total: round2(kpis.total)
    },
    monthly: months.map((mo) => ({ ...mo, revenue: round2(mo.revenue) })),
    weekly: [...weeks.values()]
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
      .slice(0, 8)
      .map((w) => ({
        weekStart: w.weekStart,
        label: `Week of ${MONTHS[Number(w.weekStart.slice(5, 7)) - 1]} ${Number(w.weekStart.slice(8))}`,
        revenue: round2(w.revenue),
        ordersCount: w.ordersCount,
        uniqueUsersCount: w.buyers.size
      })),
    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => ({ day, value: round2(weekday.get(day)) })),
    topCustomer: topCustomer ? { name: topCustomer.name, spend: round2(topCustomer.spend) } : null,
    topProducts: [...products.values()]
      .sort((a, b) => b.quantity - a.quantity || b.sales - a.sales)
      .slice(0, 10)
      .map((p) => ({ ...p, sales: round2(p.sales) }))
  };
}

/** Counts for the dashboard alerts, from the few orders that have returns or refunds open. */
function computeAlertCounts(orders = [], now = new Date()) {
  const nowMs = new Date(now).getTime();
  const counts = { returnRequests: 0, returnsReceived: 0, returnsOverdue: 0, cancelledAwaitingRefund: 0, refundsProcessing: 0 };
  for (const order of orders) {
    if (order?.status === "Cancelled" && order?.refundStatus === "Pending") counts.cancelledAwaitingRefund += 1;
    if (order?.refundStatus === "Processing") counts.refundsProcessing += 1;
    if (order?.refundStatus === "Refunded") continue;
    for (const item of Array.isArray(order?.items) ? order.items : []) {
      const status = item?.returnRequest?.status;
      if (status === "Requested") counts.returnRequests += 1;
      else if (status === "Received") counts.returnsReceived += 1;
      else if (status === "Approved" && item?.returnRequest?.approvedAt) {
        if (nowMs - new Date(item.returnRequest.approvedAt).getTime() > RETURN_OVERDUE_MS) counts.returnsOverdue += 1;
      }
    }
  }
  return counts;
}

module.exports = {
  normalizeStatus,
  istWeekStart,
  computeDashboardSummary,
  computeAlertCounts
};
