/**
 * marketingAudience.js — who a promotional email goes to.
 *
 * A "buyer" means a paid, not-cancelled order (PAID_ORDER_MATCH). Deleted, blocked and
 * unsubscribed customers are never included. In team-only mode (MAILMODO_TEST_EMAILS)
 * only the team addresses can match, so a local server on the live database can't
 * email real customers.
 */

const User = require("../models/User");
const Order = require("../models/Order");
const StoreSettings = require("../models/StoreSettings");
const { PAID_ORDER_MATCH, audienceUserFilter } = require("../utils/marketingCampaign");
const { getMailmodoConfig } = require("../utils/mailmodo");

async function getTotalSpentExpression() {
  const settings = await StoreSettings.findOne().select("currencyConversionRates").lean();
  const rates = settings?.currencyConversionRates || {};

  const branches = Object.entries(rates)
    .filter(([currency, rate]) => currency !== "INR" && Number(rate) > 0)
    .map(([currency, rate]) => ({
      case: { $eq: ["$currencyDisplay.currency", currency.toUpperCase()] },
      then: Number(rate)
    }));

  const paidAmountExpression = { $ifNull: ["$currencyDisplay.amount", "$total"] };

  if (branches.length === 0) {
    return paidAmountExpression;
  }

  return {
    $divide: [
      paidAmountExpression,
      {
        $switch: {
          branches,
          default: 1
        }
      }
    ]
  };
}

/** The team-only addresses while that mode is on, otherwise []. */
function currentTestEmails() {
  return getMailmodoConfig().testEmails;
}

/** Customers matching an audience: [{_id, email, name, marketingOptOut}]. */
async function resolveRecipientsList(filterType, filterValue, { testEmails = currentTestEmails() } = {}) {
  let userIds = null;

  if (filterType === "category") {
    userIds = await Order.distinct("user", { ...PAID_ORDER_MATCH, "items.category": filterValue });
  } else if (filterType === "product") {
    userIds = await Order.distinct("user", {
      ...PAID_ORDER_MATCH,
      $or: [
        { "items._id": filterValue },
        { "items.product": filterValue }
      ]
    });
  } else if (filterType === "minSpend") {
    const totalSpentExpression = await getTotalSpentExpression();
    const spendAgg = await Order.aggregate([
      { $match: { ...PAID_ORDER_MATCH, user: { $ne: null } } },
      { $group: { _id: "$user", totalSpent: { $sum: totalSpentExpression } } },
      { $match: { totalSpent: { $gte: Number(filterValue || 0) } } }
    ]);
    userIds = spendAgg.map((s) => s._id);
  }

  if (Array.isArray(userIds)) userIds = userIds.filter(Boolean);

  return User.find(audienceUserFilter(userIds, testEmails)).select("_id email name marketingOptOut").lean();
}

module.exports = {
  getTotalSpentExpression,
  resolveRecipientsList,
  currentTestEmails
};
