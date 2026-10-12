const crypto = require("crypto");
const mongoose = require("mongoose");

function getUnsubscribeSecret() {
  if (process.env.UNSUBSCRIBE_SECRET) {
    return String(process.env.UNSUBSCRIBE_SECRET);
  }
  return crypto
    .createHash("sha256")
    .update("unsubscribe:" + (process.env.JWT_SECRET || ""))
    .digest("hex");
}

function signUnsubscribe(userId) {
  const secret = getUnsubscribeSecret();
  return crypto
    .createHmac("sha256", secret)
    .update("unsubscribe:" + String(userId))
    .digest("hex");
}

function verifyUnsubscribe(userId, sig) {
  if (!mongoose.isValidObjectId(userId)) return false;
  if (typeof sig !== "string" || !/^[0-9a-f]{64}$/i.test(sig)) return false;

  const expected = signUnsubscribe(userId);
  const sigBuf = Buffer.from(sig.toLowerCase(), "utf8");
  const expBuf = Buffer.from(expected.toLowerCase(), "utf8");

  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

function buildUnsubscribeUrl(userId) {
  const base = String(
    process.env.SITE_URL || process.env.VITE_SITE_URL || "http://localhost:5173"
  )
    .trim()
    .replace(/\/+$/, "");
  const sig = signUnsubscribe(userId);
  return `${base}/api/unsubscribe?u=${encodeURIComponent(String(userId))}&s=${encodeURIComponent(sig)}`;
}

module.exports = {
  getUnsubscribeSecret,
  signUnsubscribe,
  verifyUnsubscribe,
  buildUnsubscribeUrl
};
