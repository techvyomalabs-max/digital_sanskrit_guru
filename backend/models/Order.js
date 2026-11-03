const mongoose = require("mongoose");
const { invoiceCounterId, formatInvoiceNumber, creditNoteCounterId, formatCreditNoteNumber } = require("../utils/invoiceNumber");

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
      },
      // Optional, for business buyers: printed on the invoice so they can claim input tax credit
      gstin: {
        type: String,
        default: ""
      },
      businessName: {
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
      enum: ["Pending", "Shipped", "Delivered", "Completed", "Cancelled"]
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
      enum: ["Pending", "Paid", "Failed", "Refunded"]
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
      razorpayRefundId: {
        type: String,
        default: ""
      },
      paidAt: {
        type: Date,
        default: null
      },
      refundedAt: {
        type: Date,
        default: null
      },
      paidAmountMinor: {
        type: Number,
        default: null
      },
      paidCurrency: {
        type: String,
        default: ""
      },
      refundedAmountMinor: {
        type: Number,
        default: 0
      },
      refundLock: {
        type: Date,
        default: null
      },
      refundRequestId: {
        type: String,
        default: ""
      },
      refundMethod: {
        type: String,
        default: "",
        enum: ["", "razorpay", "manual"]
      },
      refunds: [
        {
          refundId: String,
          amountMinor: Number,
          currency: String,
          method: String,
          reference: String,
          reason: String,
          byEmail: String,
          at: Date,
          // GST credit note for this refund (own series, e.g. CN/2026-27/0001), given when it is recorded
          creditNoteNumber: String,
          creditNoteIssuedAt: Date,
          // Items returned (order item ids); empty = the whole order
          itemIds: [String],
          _id: false
        }
      ],
      manualOverride: {
        by: { type: String, default: "" },
        reason: { type: String, default: "" },
        paymentReference: { type: String, default: "" },
        at: { type: Date, default: null }
      }
    },
    // Every change of payment status, kept with the order (never edited)
    paymentHistory: [
      {
        from: { type: String, default: "" },
        to: { type: String, default: "" },
        at: { type: Date, default: null },
        by: { type: String, default: "" },
        source: { type: String, default: "" },
        reference: { type: String, default: "" },
        note: { type: String, default: "" },
        _id: false
      }
    ],
    refundLock: {
      lockedAt: { type: Date, default: null },
      lockedBy: { type: String, default: "" },
      token: { type: String, default: "" },
      expiresAt: { type: Date, default: null }
    },
    refundStatus: {
      type: String,
      default: "Not Applicable",
      enum: ["Not Applicable", "Pending", "Processing", "Partially Refunded", "Refunded", "Rejected"]
    },
    stockReserved: {
      type: Boolean,
      default: false
    },
    stockComponentsReserved: {
      type: Boolean,
      default: false
    },
    couponClaimed: {
      type: Boolean,
      default: false
    },
    stockIssue: {
      type: Boolean,
      default: false
    },
    stockIssueDetails: {
      type: [String],
      default: []
    },
    fxRateToInr: {
      type: Number,
      default: null
    },
    totalInInr: {
      type: Number,
      default: null
    },
    refundedAmountInInr: {
      type: Number,
      default: 0
    },
    sellerDetails: {
      legalName: { type: String, default: "" },
      gstin: { type: String, default: "" },
      address: { type: String, default: "" },
      state: { type: String, default: "" },
      stateCode: { type: String, default: "" },
      email: { type: String, default: "" }
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
    // When the tax invoice was issued: the moment payment succeeded (India time decides its
    // financial year). Older orders don't have it; their invoice date is createdAt.
    invoiceIssuedAt: {
      type: Date,
      default: null
    },
    taxDetails: {
      hsnCode: { type: String, default: "4901" },
      sacCode: { type: String, default: "9984" },
      cgstPercent: { type: Number, default: 0 },
      sgstPercent: { type: Number, default: 0 },
      igstPercent: { type: Number, default: 0 },
      cgstAmount: { type: Number, default: 0 },
      sgstAmount: { type: Number, default: 0 },
      igstAmount: { type: Number, default: 0 },
      // true when the buyer is in the business's state (CGST + SGST), false for IGST
      isLocal: { type: Boolean, default: null },
      // true when lines have different GST rates (see each line's tax)
      mixedRates: { type: Boolean, default: false }
    }
  },
  { timestamps: true }
);

// What the order looked like when it was loaded, so a save can tell what changed
orderSchema.post("init", function() {
  this.$locals.loaded = {
    paymentStatus: this.paymentStatus,
    invoiceNumber: this.invoiceNumber || "",
    invoiceIssuedAt: this.invoiceIssuedAt ? new Date(this.invoiceIssuedAt).getTime() : null
  };
});

const SETTLED = new Set(["Paid", "Refunded"]);

class OrderLockedError extends Error {
  constructor(message) {
    super(message);
    this.name = "OrderLockedError";
    this.statusCode = 409;
  }
}

/**
 * Checks before any save of an order:
 * - A paid (or refunded) order can't go back to Pending or Failed: money taken is reversed
 *   with a refund, which gets a credit note.
 * - An invoice number and date never change once given.
 */
function checkLocks(order) {
  const loaded = order.$locals?.loaded;
  if (!loaded || order.isNew) return;
  if (SETTLED.has(loaded.paymentStatus) && !SETTLED.has(order.paymentStatus)) {
    throw new OrderLockedError("This order is paid, so its payment status can't be changed. To give the money back, issue a refund.");
  }
  if (loaded.invoiceNumber && order.invoiceNumber !== loaded.invoiceNumber) {
    throw new OrderLockedError("An invoice number can't be changed once it is issued.");
  }
  const issued = order.invoiceIssuedAt ? new Date(order.invoiceIssuedAt).getTime() : null;
  if (loaded.invoiceIssuedAt && issued !== loaded.invoiceIssuedAt) {
    throw new OrderLockedError("An invoice date can't be changed once it is issued.");
  }
}

/** Adds a payment history entry when the payment status is set or changed. */
function recordPaymentChange(order, now) {
  if (!order.isNew && !order.isModified("paymentStatus")) return;
  const from = order.isNew ? "" : String(order.$locals?.loaded?.paymentStatus || "");
  if (from === order.paymentStatus) return;
  const change = order.$locals?.paymentChange || {};
  const meta = order.paymentMeta || {};
  order.paymentHistory.push({
    from,
    to: order.paymentStatus,
    at: now,
    by: String(change.by || (order.isNew ? "customer" : "")),
    source: String(change.source || (order.isNew ? "checkout" : "update")),
    reference: String(change.reference || meta.razorpayPaymentId || ""),
    note: String(change.note || "").slice(0, 300)
  });
}

function nextNumber(counterId) {
  return Counter.findByIdAndUpdate(
    { _id: counterId },
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true }
  ).then((counter) => counter.seq);
}

orderSchema.pre("save", async function() {
  const self = this;
  const now = new Date();

  checkLocks(self);
  recordPaymentChange(self, now);

  // A tax invoice is issued only once payment has succeeded, so the numbers run without gaps
  // (unpaid or failed checkouts never take one). Covers orders created as paid and orders
  // marked paid later. An order that already has a number keeps it.
  if (!self.invoiceNumber && self.paymentStatus === "Paid") {
    // GST invoice number by financial year in India time, e.g. DSG/2026-27/0001.
    // Each financial year has its own counter, so the number restarts at 0001 every 1 April.
    self.invoiceIssuedAt = now;
    self.invoiceNumber = formatInvoiceNumber(now, await nextNumber(invoiceCounterId(now)));
  }

  // Each refund recorded gets a credit note number from its own series, in the order the
  // refunds happened, dated when the refund was recorded.
  const refunds = self.paymentMeta?.refunds;
  if (Array.isArray(refunds) && refunds.length && (self.isNew || self.isModified("paymentMeta.refunds") || self.isModified("paymentMeta"))) {
    const pending = refunds
      .filter((r) => r && !r.creditNoteNumber)
      .sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
    for (const refund of pending) {
      const issuedAt = refund.at ? new Date(refund.at) : now;
      refund.creditNoteIssuedAt = issuedAt;
      refund.creditNoteNumber = formatCreditNoteNumber(issuedAt, await nextNumber(creditNoteCounterId(issuedAt)));
    }
  }
});

orderSchema.statics.OrderLockedError = OrderLockedError;

// ── Indexes (Tier-1 performance & Security) ──────────────────────────────────

// 1. User's own orders — most frequent query (GET /api/orders/my)
orderSchema.index({ user: 1, createdAt: -1 });

// 2. Admin: filter by status (Pending, Shipped, etc.) + date sort
orderSchema.index({ status: 1, createdAt: -1 });

// 3. Admin: all orders sorted newest-first (default admin view)
orderSchema.index({ createdAt: -1 });

// 4. Payment verification by Razorpay order ID
orderSchema.index({ "paymentMeta.razorpayOrderId": 1 });

// 5. Payment ID Unique Constraint (Prevents Replay Attacks C1)
orderSchema.index(
  { "paymentMeta.razorpayPaymentId": 1 },
  {
    unique: true,
    name: "uniq_razorpay_payment_id",
    partialFilterExpression: { "paymentMeta.razorpayPaymentId": { $type: "string", $gt: "" } }
  }
);

// 6. Payment Status Index for Revenue & Financial Reports
orderSchema.index({ paymentStatus: 1, createdAt: -1 });

module.exports = mongoose.model("Order", orderSchema);
