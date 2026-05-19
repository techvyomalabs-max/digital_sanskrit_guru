const mongoose = require("mongoose");

// const orderSchema = new mongoose.Schema(
//   {
//     user: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User"
//     },
//     items: Array,
//     total: Number
//   },
//   { timestamps: true }
// );


const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    items: Array,
    subtotal: {
      type: Number,
      default: 0
    },
    gstPercent: {
      type: Number,
      default: 0
    },
    gstAmount: {
      type: Number,
      default: 0
    },
    couponCode: {
      type: String,
      default: ""
    },
    discount: {
      type: Number,
      default: 0
    },
    deliveryCharge: {
      type: Number,
      default: 0
    },
    total: Number,
    currencyDisplay: {
      currency: {
        type: String,
        default: ""
      },
      amount: {
        type: Number,
        default: null
      },
      detectedCountry: {
        type: String,
        default: ""
      }
    },
    shipping: {
      name: {
        type: String,
        default: ""
      },
      phone: {
        type: String,
        default: ""
      },
      address: {
        type: String,
        default: ""
      },
      city: {
        type: String,
        default: ""
      },
      state: {
        type: String,
        default: ""
      },
      pincode: {
        type: String,
        default: ""
      },
      country: {
        type: String,
        default: ""
      },
      latitude: {
        type: Number,
        default: null
      },
      longitude: {
        type: Number,
        default: null
      }
    },
    status: {
      type: String,
      default: "Pending",
      enum: ["Pending", "Shipped", "Delivered", "Cancelled"]
    },
    paymentStatus: {
      type: String,
      default: "Pending",
      enum: ["Pending", "Paid", "Failed"]
    },
    paymentMethod: {
      type: String,
      default: "Razorpay"
    },
    paymentMeta: {
      razorpayOrderId: {
        type: String,
        default: ""
      },
      razorpayPaymentId: {
        type: String,
        default: ""
      },
      paidAt: {
        type: Date,
        default: null
      }
    },
    refundStatus: {
      type: String,
      default: "Not Applicable",
      enum: ["Not Applicable", "Pending", "Processing", "Refunded", "Rejected"]
    },
    deliveredAt: {
      type: Date,
      default: null
    },
    returnRequest: {
      status: {
        type: String,
        default: "Not Requested",
        enum: ["Not Requested", "Requested", "Approved", "Rejected", "Refunded"]
      },
      requestedAt: {
        type: Date,
        default: null
      },
      resolvedAt: {
        type: Date,
        default: null
      },
      reason: {
        type: String,
        default: ""
      },
      adminReason: {
        type: String,
        default: ""
      }
    },
    cancelledAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
