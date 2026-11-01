"use strict";

/**
 * Revenue as every admin page counts it: paid orders only (Paid, or Paid then Refunded),
 * in INR at each order's own rate, minus what has been refunded on them.
 * Shared by the Orders page, the Dashboard and the Sales Dashboard so their numbers match.
 */

const { orderGrossInr, orderRefundedInr } = require("./salesAnalytics");

const PAID_STATUSES = ["Paid", "Refunded"];
const REVENUE_FIELDS = "paymentStatus total totalInInr fxRateToInr currencyDisplay refundedAmountInInr";

const isPaidOrder = (order) => PAID_STATUSES.includes(order?.paymentStatus);

function sumNetRevenueInr(orders = []) {
  let net = 0;
  for (const order of orders) {
    if (!isPaidOrder(order)) continue;
    net += orderGrossInr(order) - orderRefundedInr(order);
  }
  return Math.round(net * 100) / 100;
}

/** Narrows any order query to paid orders, keeping its own conditions. */
function paidOnly(query = {}) {
  return { $and: [query, { paymentStatus: { $in: PAID_STATUSES } }] };
}

module.exports = { PAID_STATUSES, REVENUE_FIELDS, isPaidOrder, sumNetRevenueInr, paidOnly };
