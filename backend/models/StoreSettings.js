const mongoose = require("mongoose");

const SITE_THEMES = ["sunrise", "forest", "midnight"];
const DEFAULT_PRODUCT_CATEGORIES = [
  "General",
  "Dharma",
  "Grammar",
  "Scriptures",
  "Gita",
  "Chanting",
  "Sanskrit",
  "Books"
];

const customThemeSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: "",
      trim: true
    },
    palette: {
      bg: { type: String, required: true, trim: true },
      surface: { type: String, required: true, trim: true },
      text: { type: String, required: true, trim: true },
      header: { type: String, required: true, trim: true },
      accent: { type: String, required: true, trim: true },
      button: { type: String, required: true, trim: true }
    }
  },
  { _id: false }
);

const warehouseLocationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: "",
      trim: true
    },
    address: {
      type: String,
      default: "",
      trim: true
    },
    mapUrl: {
      type: String,
      default: "",
      trim: true
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
  { _id: false }
);

const distancePricingSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: true
    },
    baseFee: {
      type: Number,
      default: 0,
      min: 0
    },
    perKmCharge: {
      type: Number,
      default: 0,
      min: 0
    },
    freeRadiusKm: {
      type: Number,
      default: 0,
      min: 0
    },
    maxCharge: {
      type: Number,
      default: null,
      min: 0
    }
  },
  { _id: false }
);

const storeSettingsSchema = new mongoose.Schema(
  {
    gstPercent: {
      type: Number,
      default: 18,
      min: 0,
      max: 50
    },
    deliveryCharge: {
      type: Number,
      default: 0,
      min: 0
    },
    warehouseLocation: {
      type: warehouseLocationSchema,
      default: () => ({})
    },
    distancePricing: {
      type: distancePricingSchema,
      default: () => ({})
    },
    siteTheme: {
      type: String,
      default: "sunrise"
    },
    customThemes: {
      type: [customThemeSchema],
      default: []
    },
    productCategories: {
      type: [String],
      default: DEFAULT_PRODUCT_CATEGORIES
    }
  },
  { timestamps: true }
);

storeSettingsSchema.statics.SITE_THEMES = SITE_THEMES;
storeSettingsSchema.statics.DEFAULT_PRODUCT_CATEGORIES = DEFAULT_PRODUCT_CATEGORIES;

module.exports = mongoose.model("StoreSettings", storeSettingsSchema);
