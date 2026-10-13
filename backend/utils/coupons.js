const mongoose = require("mongoose");
const Coupon = require("../models/Coupon");
const Order = require("../models/Order");
const User = require("../models/User");
const { convertCurrencyAmount } = require("./currency");

const roundMoney = (v) => Math.round((Number(v) || 0) * 100) / 100;
const fail = (m, s = 400) => Object.assign(new Error(m), { status: s });

const liveCouponFilter = (code, now = new Date()) => ({
  code: String(code || "").trim().toUpperCase(),
  isDeleted: { $ne: true },
  isActive: { $ne: false },
  $and: [
    {
      $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }]
    },
    {
      $or: [
        { usageLimit: null },
        { usageLimit: 0 },
        { $expr: { $lt: ["$usageCount", "$usageLimit"] } }
      ]
    }
  ]
});

async function validateCoupon({ code, userId, priced, orderCurrency = "INR", rates = {} }) {
  const c = await Coupon.findOne(liveCouponFilter(code)).lean();
  if (!c) throw fail("Invalid, expired or fully used coupon code.");

  if (!userId && c.usageLimitPerUser) {
    throw fail("Sign in to use coupons.");
  }

  if (userId && (c.usedBy || []).some((u) => String(u) === String(userId))) {
    throw fail("You have already used this coupon code.");
  }

  if (c.assignedUserEmail && userId) {
    const u = await User.findById(userId).select("email").lean();
    if (String(c.assignedUserEmail).toLowerCase() !== String(u?.email || "").toLowerCase()) {
      throw fail("This coupon is assigned to another account.");
    }
  }

  const restricted = Array.isArray(c.applicableProducts) && c.applicableProducts.length > 0;
  const ids = new Set(restricted ? c.applicableProducts.map(String) : []);

  const eligible = (priced || []).filter((p) => !restricted || ids.has(String(p?.it?.product || p?.product)));
  if (!eligible.length) {
    throw fail("Coupon not applicable to the products in this order.");
  }

  const base = eligible.reduce((s, p) => s + Number(p.gross || p.price * p.quantity || 0), 0);
  const toCcy = (inr) => convertCurrencyAmount(inr, { sourceCurrency: "INR", currency: orderCurrency, rates });

  if (base < roundMoney(toCcy(Number(c.minOrder || 0)))) {
    throw fail(`Minimum order value not met for this coupon.`);
  }

  const discount =
    c.discountType === "percentage" || c.type === "percentage"
      ? roundMoney((base * Number(c.discountValue || c.value || 0)) / 100)
      : roundMoney(toCcy(Number(c.discountValue || c.value || 0)));

  return {
    discount: Math.max(0, Math.min(base, discount)),
    appliedCouponCode: c.code,
    eligibleIds: ids
  };
}

const claimCoupon = ({ code, userId, session }) => {
  const uid = userId ? new mongoose.Types.ObjectId(String(userId)) : null;
  const update = { $inc: { usageCount: 1 } };
  if (uid) {
    update.$addToSet = { usedBy: uid };
  }
  return Coupon.findOneAndUpdate(
    liveCouponFilter(code),
    update,
    { returnDocument: "after", session }
  );
};

const releaseCoupon = ({ code, userId, session }) => {
  const uid = userId ? new mongoose.Types.ObjectId(String(userId)) : null;
  const update = { $inc: { usageCount: -1 } };
  if (uid) {
    update.$pull = { usedBy: uid };
  }
  return Coupon.updateOne(
    { code: String(code).toUpperCase(), usageCount: { $gt: 0 } },
    update,
    { session }
  );
};

async function releaseCouponForOrder(orderId, { session } = {}) {
  const prev = await Order.findOneAndUpdate(
    { _id: orderId, couponClaimed: true },
    { $set: { couponClaimed: false } },
    { returnDocument: "before", session }
  );
  if (!prev?.couponCode) return false;
  await releaseCoupon({ code: prev.couponCode, userId: prev.user, session });
  return true;
}

module.exports = {
  liveCouponFilter,
  validateCoupon,
  claimCoupon,
  releaseCoupon,
  releaseCouponForOrder
};
