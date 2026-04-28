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
  isAdmin: {
    type: Boolean,
    default: false
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
  }
});

module.exports = mongoose.model("User", userSchema);
