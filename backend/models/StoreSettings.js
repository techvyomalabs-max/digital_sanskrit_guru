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
      button: { type: String, required: true, trim: true },
      navBottom: { type: String, default: "#1c2735", trim: true }
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

const internationalDeliveryCountryRateSchema = new mongoose.Schema(
  {
    country: {
      type: String,
      default: "",
      trim: true
    },
    fee: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  { _id: false }
);

const pricingMarketSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    currency: {
      type: String,
      default: "USD",
      trim: true
    },
    countries: {
      type: [String],
      default: []
    }
  },
  { _id: false }
);

const internationalPricingDefaultsSchema = new mongoose.Schema(
  {
    currency: {
      type: String,
      default: "USD",
      trim: true
    }
  },
  { _id: false }
);

const currencyConversionRatesSchema = new mongoose.Schema(
  {
    INR: { type: Number, default: 1, min: 0 },
    USD: { type: Number, default: 0.012, min: 0 },
    EUR: { type: Number, default: 0.011, min: 0 },
    GBP: { type: Number, default: 0.009, min: 0 },
    AED: { type: Number, default: 0.044, min: 0 },
    CAD: { type: Number, default: 0.016, min: 0 },
    AUD: { type: Number, default: 0.019, min: 0 }
  },
  { _id: false }
);

const internationalDeliverySchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: false
    },
    domesticCountry: {
      type: String,
      default: "India",
      trim: true
    },
    defaultFee: {
      type: Number,
      default: 0,
      min: 0
    },
    countryRates: {
      type: [internationalDeliveryCountryRateSchema],
      default: []
    }
  },
  { _id: false }
);

const heroBannerSchema = new mongoose.Schema(
  {
    image: {
      type: String,
      default: "",
      trim: true
    },
    productId: {
      type: String,
      default: "",
      trim: true
    }
  },
  { _id: false }
);

const sponsorSchema = new mongoose.Schema(
  {
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
    logoUrl: {
      type: String,
      default: "",
      trim: true
    },
    websiteUrl: {
      type: String,
      default: "",
      trim: true
    }
  }
);

const DEFAULT_SPONSORS = [
  {
    name: "Sanskrit Academy",
    description: "Preserving Ancient Wisdom",
    logoUrl: "",
    websiteUrl: "https://sanskritacademy.org"
  },
  {
    name: "Vyoma Linguistic Labs",
    description: "Language Tech Research",
    logoUrl: "",
    websiteUrl: "https://vyomalabs.in"
  },
  {
    name: "Veda Foundation",
    description: "Vedic Heritage Safeguarding",
    logoUrl: "",
    websiteUrl: "https://vedafoundation.org"
  },
  {
    name: "Indic Heritage Trust",
    description: "Cultural Legacy Preservation",
    logoUrl: "",
    websiteUrl: "https://indicheritage.org"
  },
  {
    name: "Devavani Press",
    description: "Scholarly Publishing Partner",
    logoUrl: "",
    websiteUrl: "https://devavanipress.com"
  }
];

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
    internationalDelivery: {
      type: internationalDeliverySchema,
      default: () => ({})
    },
    pricingMarkets: {
      type: [pricingMarketSchema],
      default: []
    },
    internationalPricingDefaults: {
      type: internationalPricingDefaultsSchema,
      default: () => ({})
    },
    currencyConversionRates: {
      type: currencyConversionRatesSchema,
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
    },
    heroBannerImage: {
      type: String,
      default: "",
      trim: true
    },
    heroBannerProductId: {
      type: String,
      default: "",
      trim: true
    },
    heroBanners: {
      type: [heroBannerSchema],
      default: []
    },
    homeSectionVisibility: {
      festiveOffers: {
        type: Boolean,
        default: true
      }
    },
    collectionFilterVisibility: {
      festiveOffers: {
        type: Boolean,
        default: true
      }
    },
    // ── Festive Animation ──────────────────────────────────────────────────
    festiveAnimation: {
      enabled: {
        type: Boolean,
        default: false
      },
      // "diwali" | "holi" | "christmas" | "newyear" | "confetti" OR a custom animation ID
      type: {
        type: String,
        default: "diwali"
      },
      intensity: {
        type: String,
        enum: ["subtle", "medium", "heavy"],
        default: "subtle"
      },
      // Admin-defined custom particle colors (max 8). Empty = use preset palette.
      customColors: {
        type: [String],
        default: []
      },
      // Admin-added Lottie animations from external sources
      customAnimations: {
        type: [
          {
            id:         { type: String, required: true },
            name:       { type: String, required: true, trim: true },
            sourceUrl:  { type: String, required: true, trim: true },
            sourceType: { type: String, enum: ["lottie"], default: "lottie" }
          }
        ],
        default: []
      }
    },
    // ── Festive Banner (announcement bar above navbar) ─────────────────────
    festiveBanner: {
      enabled: {
        type: Boolean,
        default: false
      },
      text: {
        type: String,
        default: "🎉 Festive Sale is Live! Shop Now",
        trim: true
      },
      bgFrom: {
        type: String,
        default: "#FF6B00",
        trim: true
      },
      bgTo: {
        type: String,
        default: "#FFD700",
        trim: true
      },
      textColor: {
        type: String,
        default: "#ffffff",
        trim: true
      },
      linkUrl: {
        type: String,
        default: "",
        trim: true
      },
      linkText: {
        type: String,
        default: "Shop Now",
        trim: true
      }
    },
    orderConfirmationEmail: {
      subjectTemplate: {
        type: String,
        default: "Order Confirmed — {{SITE_NAME}}",
        trim: true
      },
      bodyTemplate: {
        type: String,
        default: `<h2>Thank you for your order! 🎉</h2>
<p>Hi <strong>{{USER_NAME}}</strong>,</p>
<p>Your order has been placed successfully. We'll notify you when it ships.</p>
<p><strong>Order ID:</strong> {{ORDER_ID}}</p>
<h3>Order Details:</h3>
{{ITEMS_TABLE}}
{{SUMMARY_TABLE}}
<p><strong>Shipping to:</strong><br/>
{{SHIPPING_INFO}}
</p>`,
        trim: true
      },
      headerBgColor: {
        type: String,
        default: "#1a1a2e",
        trim: true
      },
      accentColor: {
        type: String,
        default: "#e94560",
        trim: true
      },
      headerText: {
        type: String,
        default: "Digital Sanskrit Guru",
        trim: true
      },
      headerSubtext: {
        type: String,
        default: "Spreading the wisdom of Sanskrit",
        trim: true
      }
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
    // ── Marketing / Notification settings ───────────────────────────────────
    lowStockThreshold: {
      type: Number,
      default: 5,
      min: 0
    },
    notificationEmail: {
      type: String,
      default: "",
      trim: true
    },
    emailEnabled: {
      type: Boolean,
      default: false
    },
    pushEnabled: {
      type: Boolean,
      default: true
    },
    sponsors: {
      type: [sponsorSchema],
      default: DEFAULT_SPONSORS
    }
  },
  { timestamps: true }
);

storeSettingsSchema.statics.SITE_THEMES = SITE_THEMES;
storeSettingsSchema.statics.DEFAULT_PRODUCT_CATEGORIES = DEFAULT_PRODUCT_CATEGORIES;

module.exports = mongoose.model("StoreSettings", storeSettingsSchema);
