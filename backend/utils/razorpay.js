const Razorpay = require("razorpay");

function getRazorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID || "";
  const razorpaySecret = process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET || "";

  if (!keyId || !razorpaySecret) {
    throw new Error("Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: razorpaySecret
  });
}

module.exports = getRazorpayClient;
