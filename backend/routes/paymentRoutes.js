const express = require("express");
const getRazorpayClient = require("../utils/razorpay");
const crypto = require("crypto");

const router = express.Router();

router.post("/create-order", async (req, res) => {
  try {
    const amount = Number(req.body?.amount || 0);
    const currency = String(req.body?.currency || "INR").trim().toUpperCase();
    if (Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const razorpay = getRazorpayClient();
    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency,
      receipt: `order_${Date.now()}`
    });

    return res.json(order);
  } catch (error) {
    const message =
      error?.error?.description ||
      error?.error?.reason ||
      error?.message ||
      "Failed to create Razorpay order";

    console.error("Razorpay create-order failed:", message);
    return res.status(500).json({
      message
    });
  }
});

router.post("/verify", async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature
  } = req.body || {};

  const body = `${razorpay_order_id || ""}|${razorpay_payment_id || ""}`;
  const razorpaySecret = process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET || "";
  if (!razorpaySecret) {
    return res.status(500).json({ message: "Razorpay secret not configured on server" });
  }

  const expectedSignature = crypto
    .createHmac("sha256", razorpaySecret)
    .update(body)
    .digest("hex");

  if (expectedSignature === razorpay_signature) {
    return res.json({ success: true });
  }

  return res.status(400).json({ success: false });
});

module.exports = router;
