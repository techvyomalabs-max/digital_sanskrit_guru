const mongoose = require("mongoose");

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});
const Counter = mongoose.model("Counter", counterSchema);

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
    isGift: {
      type: Boolean,
      default: false
    },
    giftRecipientEmail: {
      type: String,
      default: ""
    },
    giftPasses: Array,
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
    billing: {
      name: {
        type: String,
        default: ""
      },
      phone: {
        type: String,
        default: ""
      },
      email: {
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
    trackingId: {
      type: String,
      default: ""
    },
    courierPartner: {
      type: String,
      default: "",
      enum: ["", "Delhivery", "India Post", "Other"]
    },
    shippedAt: {
      type: Date,
      default: null
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
    },
    lastUpdatedByName: {
      type: String,
      default: ""
    },
    lastUpdatedByEmail: {
      type: String,
      default: ""
    },
    lastUpdatedAt: {
      type: Date,
      default: null
    },
    invoiceNumber: {
      type: String,
      unique: true,
      sparse: true
    },
    taxDetails: {
      hsnCode: { type: String, default: "4901" },
      sacCode: { type: String, default: "9984" },
      cgstPercent: { type: Number, default: 0 },
      sgstPercent: { type: Number, default: 0 },
      igstPercent: { type: Number, default: 0 },
      cgstAmount: { type: Number, default: 0 },
      sgstAmount: { type: Number, default: 0 },
      igstAmount: { type: Number, default: 0 }
    }
  },
  { timestamps: true }
);

orderSchema.pre("save", function() {
  const self = this;
  if (self.isNew && !self.invoiceNumber) {
    return Counter.findByIdAndUpdate(
      { _id: "orderInvoice" },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    )
      .then((counter) => {
        const year = new Date().getFullYear();
        const seqStr = String(counter.seq).padStart(4, "0");
        self.invoiceNumber = `DSG-${year}-${seqStr}`;
      });
  }
});

// ── Indexes (Tier-1 performance) ──────────────────────────────────────────────

// 1. User's own orders — most frequent query (GET /api/orders/my)
orderSchema.index({ user: 1, createdAt: -1 });

// 2. Admin: filter by status (Pending, Shipped, etc.) + date sort
orderSchema.index({ status: 1, createdAt: -1 });

// 3. Admin: all orders sorted newest-first (default admin view)
orderSchema.index({ createdAt: -1 });

// 4. Payment verification by Razorpay order ID
orderSchema.index({ "paymentMeta.razorpayOrderId": 1 });

module.exports = mongoose.model("Order", orderSchema);
