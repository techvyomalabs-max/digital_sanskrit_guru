const mongoose = require("mongoose");

const phoneOtpSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      index: true
    },
    otpHash: {
      type: String,
      required: true
    },
    verificationToken: {
      type: String,
      default: null,
      index: true
    },
    attempts: {
      type: Number,
      default: 0
    },
    verified: {
      type: Boolean,
      default: false
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 } // MongoDB TTL index to auto-delete expired OTPs
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("PhoneOtp", phoneOtpSchema);
