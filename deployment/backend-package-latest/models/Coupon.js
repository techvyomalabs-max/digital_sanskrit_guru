const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true
    },
    type: {
      type: String,
      enum: ["percentage", "fixed"],
      required: true
    },
    value: {
      type: Number,
      required: true
    },
    minOrder: {
      type: Number,
      default: 0
    },
    expiresAt: {
      type: Date
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Coupon", couponSchema);
