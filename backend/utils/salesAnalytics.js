"use strict";

/**
 * Sales Dashboard numbers (pure, no DB).
 * - Money is always in INR: each order is converted with its own saved rate (same rule as the
 *   Financial Dashboard), so a USD order is never added as if it were rupees.
 * - Net = gross minus what has been refunded on those orders (refundedAmountInInr).
 * - Days and months are India time (IST).
 * - Format comes from what the order saved (combo / digital type / physical), never from guessing
 *   at product names.
 */

const { getFxRate } = require("./financeLedger");
const { isInternationalCountry } = require("./productPricing");

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

/** "YYYY-MM-DD" of a date in India time. */
function istDay(date) {
  return new Date(new Date(date).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Converts an amount in the order's currency to INR; unknown rate -> the amount as is. */
function orderToInr(order, amount) {
  const fx = getFxRate(order);
  return round2((Number(amount) || 0) * (fx === null ? 1 : fx));
}

function orderGrossInr(order) {
  const saved = Number(order?.totalInInr);
  if (Number.isFinite(saved) && saved > 0) return round2(saved);
  return orderToInr(order, order?.total);
}

function orderRefundedInr(order) {
  return Math.max(0, round2(order?.refundedAmountInInr));
}

/** The saved format of an order line: Combo, the digital type (Web Version, Flipbook...), or Physical. */
function itemFormat(item) {
  const isCombo =
    String(item?.productType || "").toLowerCase() === "bundle" ||
    (Array.isArray(item?.bundleItems) && item.bundleItems.length > 0);
  if (isCombo) return "Combo";
  if (item?.isDigital === true) {
    const type = String(item?.digitalType || item?.format || "").trim();
    return type && type.toLowerCase() !== "other" ? type : "Digital (other)";
  }
  return "Physical";
}

function locationOf(order) {
  const country = String(order?.shipping?.country || "").trim();
  const state = String(order?.shipping?.state || "").trim();
  if (!country && !state) return { country: "Not recorded", state: "" };
  if (country && isInternationalCountry(country)) return { country, state: "" };
  return { country: "India", state: state || "Not recorded" };
}

/** Buckets between two dates: daily for ranges up to 62 days, otherwise monthly. All gaps filled with 0. */
function buildBuckets(startDate, endDate) {
  const startDay = istDay(startDate);
  const endDay = istDay(endDate);
  const days = Math.round((Date.parse(`${endDay}T00:00:00Z`) - Date.parse(`${startDay}T00:00:00Z`)) / DAY_MS) + 1;
  const buckets = [];
  if (days <= 62) {
    for (let i = 0; i < days; i += 1) {
      const key = new Date(Date.parse(`${startDay}T00:00:00Z`) + i * DAY_MS).toISOString().slice(0, 10);
      buckets.push({ key, label: `${Number(key.slice(8))} ${MONTHS[Number(key.slice(5, 7)) - 1]}` });
    }
    return { unit: "day", buckets };
  }
  let y = Number(startDay.slice(0, 4));
  let m = Number(startDay.slice(5, 7));
  const endKey = endDay.slice(0, 7);
  for (let guard = 0; guard < 24; guard += 1) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    buckets.push({ key, label: `${MONTHS[m - 1]} ${String(y).slice(2)}` });
    if (key === endKey) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return { unit: "month", buckets };
}

function summarize(orders) {
  let gross = 0;
  let refunded = 0;
  let items = 0;
  let refundedOrders = 0;
  for (const order of orders) {
    gross += orderGrossInr(order);
    const r = orderRefundedInr(order);
    refunded += r;
    if (r > 0) refundedOrders += 1;
    for (const item of Array.isArray(order?.items) ? order.items : []) {
      items += Math.max(1, Number(item?.quantity || 1));
    }
  }
  const net = gross - refunded;
  return {
    orders: orders.length,
    itemsSold: items,
    grossInr: round2(gross),
    refundedInr: round2(refunded),
    netInr: round2(net),
    refundedOrders,
    averageOrderInr: orders.length ? round2(net / orders.length) : 0
  };
}

/** % change from previous to current; null when there is nothing to compare with. */
function change(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function rankList(map, limit) {
  return [...map.values()].sort((a, b) => b.revenueInr - a.revenueInr || b.units - a.units).slice(0, limit);
}

/**
 * orders: paid orders whose createdAt is inside [startDate, endDate].
 * previousOrders: paid orders in the equally long period just before (for the % change).
 */
function computeSalesAnalytics({ orders = [], previousOrders = [], startDate, endDate }) {
  const summary = summarize(orders);
  const previous = summarize(previousOrders);

  const { unit, buckets } = buildBuckets(startDate, endDate);
  const byKey = new Map(buckets.map((b) => [b.key, { ...b, grossInr: 0, netInr: 0, orders: 0 }]));

  const formats = new Map();
  const products = new Map();
  const countries = new Map();
  const states = new Map();
  const add = (map, key, label, units, revenueInr) => {
    const row = map.get(key) || { name: label, units: 0, revenueInr: 0, orders: 0 };
    row.units += units;
    row.revenueInr = round2(row.revenueInr + revenueInr);
    map.set(key, row);
    return row;
  };

  for (const order of orders) {
    const gross = orderGrossInr(order);
    const net = gross - orderRefundedInr(order);
    const day = istDay(order.createdAt);
    const bucket = byKey.get(unit === "day" ? day : day.slice(0, 7));
    if (bucket) {
      bucket.grossInr = round2(bucket.grossInr + gross);
      bucket.netInr = round2(bucket.netInr + net);
      bucket.orders += 1;
    }

    const where = locationOf(order);
    add(countries, where.country, where.country, 0, net).orders += 1;
    if (where.country === "India") add(states, where.state, where.state, 0, net).orders += 1;

    for (const item of Array.isArray(order?.items) ? order.items : []) {
      const qty = Math.max(1, Number(item?.quantity || 1));
      const valueInr = orderToInr(order, Number(item?.price || 0) * qty);
      add(formats, itemFormat(item), itemFormat(item), qty, valueInr);
      const pid = String(item?.product || item?._id || "").trim();
      const name = String(item?.name || "Unknown product").trim();
      add(products, pid || `name:${name.toLowerCase()}`, name, qty, valueInr);
    }
  }

  return {
    range: { from: istDay(startDate), to: istDay(endDate), unit },
    summary,
    previous,
    changes: {
      netInr: change(summary.netInr, previous.netInr),
      orders: change(summary.orders, previous.orders),
      averageOrderInr: change(summary.averageOrderInr, previous.averageOrderInr),
      itemsSold: change(summary.itemsSold, previous.itemsSold)
    },
    trend: [...byKey.values()],
    formats: rankList(formats, 20),
    topProducts: rankList(products, 10),
    countries: rankList(countries, 15),
    indianStates: rankList(states, 15)
  };
}

module.exports = {
  istDay,
  orderGrossInr,
  orderRefundedInr,
  itemFormat,
  locationOf,
  buildBuckets,
  computeSalesAnalytics
};
