const express = require("express");
const Coupon = require("../models/Coupon");
const StoreSettings = require("../models/StoreSettings");
const { convertCurrencyAmount, normalizeCurrencyCode } = require("../utils/currency");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const code = String(req.body?.code || "").trim().toUpperCase();
    const type = req.body?.type;
    const value = Number(req.body?.value || 0);
    const minOrder = Math.max(0, Number(req.body?.minOrder || 0));
    const expiresAt = req.body?.expiresAt ? new Date(req.body.expiresAt) : undefined;

    if (!code) {
      return res.status(400).json({ message: "Coupon code is required" });
    }
    if (!["percentage", "fixed"].includes(type)) {
      return res.status(400).json({ message: "Invalid coupon type" });
    }
    if (Number.isNaN(value) || value <= 0) {
      return res.status(400).json({ message: "Discount value must be greater than 0" });
    }
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      return res.status(400).json({ message: "Invalid expiry date" });
    }

    const coupon = await Coupon.create({
      code,
      type,
      value,
      minOrder,
      expiresAt
    });

    return res.json(coupon);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(400).json({ message: "Coupon already exists" });
    }
    return res.status(500).json({ message: "Failed to create coupon" });
  }
});

router.get("/", async (_req, res) => {
  const coupons = await Coupon.find().sort({ createdAt: -1 });
  res.json(coupons);
});

router.delete("/:id", async (req, res) => {
  await Coupon.findByIdAndDelete(req.params.id);
  res.json({ message: "Coupon deleted" });
});

router.post("/apply", async (req, res) => {
  const code = String(req.body?.code || "").trim().toUpperCase();
  const total = Number(req.body?.total || 0);
  const currency = normalizeCurrencyCode(req.body?.currency, "INR");
  const settings = await StoreSettings.findOne().lean();
  const currencyRates = settings?.currencyConversionRates || {};

  if (!code) {
    return res.status(400).json({ message: "Coupon code is required" });
  }

  if (Number.isNaN(total) || total < 0) {
    return res.status(400).json({ message: "Invalid order total" });
  }

  const coupon = await Coupon.findOne({ code });
  if (!coupon) {
    return res.status(400).json({ message: "Invalid coupon code" });
  }

  if (coupon.expiresAt && new Date() > coupon.expiresAt) {
    return res.status(400).json({ message: "Coupon expired" });
  }

  const minOrder = roundMoney(convertCurrencyAmount(Number(coupon.minOrder || 0), { currency, rates: currencyRates }));

  if (total < minOrder) {
    return res.status(400).json({
      message: `Minimum order ${minOrder} ${currency}`
    });
  }

  let discount = 0;
  if (coupon.type === "percentage") {
    discount = (total * Number(coupon.value || 0)) / 100;
  } else if (coupon.type === "fixed") {
    discount = convertCurrencyAmount(Number(coupon.value || 0), { currency, rates: currencyRates });
  }

  const safeDiscount = Math.max(0, Math.min(total, discount));
  return res.json({
    discount: safeDiscount,
    newTotal: Math.max(0, total - safeDiscount),
    currency
  });
});

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

module.exports = router;
