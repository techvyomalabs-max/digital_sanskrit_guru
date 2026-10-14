const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      enum: ["Home", "Work", "Other"],
      default: "Home"
    },
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
    landmark: {
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
      default: "India"
    },
    latitude: {
      type: Number,
      default: null
    },
    longitude: {
      type: Number,
      default: null
    },
    isDefault: {
      type: Boolean,
      default: false
    }
  },
  { _id: false }
);

const userSchema = mongoose.Schema({
  name: String,
  email: {
    type: String,
    unique: true
  },
  password: String,
  phone: {
    type: String,
    default: ""
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  adminRole: {
    type: String,
    default: "Staff"
  },
  adminLevel: {
    type: Number,
    enum: [1, 2],
    default: 2
  },
  allowedPages: {
    type: [String],
    default: []
  },
  adminGrantedAt: {
    type: Date,
    default: null
  },
  adminGrantedByName: {
    type: String,
    default: ""
  },
  adminGrantedByEmail: {
    type: String,
    default: ""
  },
  lastActiveAt: {
    type: Date,
    default: null
  },
  totalTimeSpentSec: {
    type: Number,
    default: 0
  },
  addresses: {
    type: [addressSchema],
    default: []
  },
  resetPasswordToken: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
    type: Date,
    default: null
  },
  tokenVersion: {
    type: Number,
    default: 0
  },
  googleSub: {
    type: String,
    default: null
  },
  hasLocalPassword: {
    type: Boolean,
    default: true
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    name: { type: String, default: "" },
    email: { type: String, default: "" }
  },
  marketingOptOut: {
    type: Boolean,
    default: false
  },
  marketingOptOutAt: {
    type: Date,
    default: null
  }
});

userSchema.index({ isDeleted: 1 });
userSchema.index(
  { googleSub: 1 },
  { unique: true, partialFilterExpression: { googleSub: { $type: "string", $gt: "" } } }
);

module.exports = mongoose.model("User", userSchema);
