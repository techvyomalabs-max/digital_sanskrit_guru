const Razorpay = require("razorpay");

let razorpay = null;

function getRazorpayClient() {
  if (razorpay) {
    return razorpay;
  }

  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_SECRET) {
    throw new Error("Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_SECRET.");
  }

  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_SECRET
  });

  return razorpay;
}

module.exports = getRazorpayClient;
