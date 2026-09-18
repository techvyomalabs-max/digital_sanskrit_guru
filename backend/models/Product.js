


const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
  user: String,
  rating: Number,
  comment: String
});

const internationalCountryPriceSchema = new mongoose.Schema(
  {
    country: {
      type: String,
      required: true,
      trim: true
    },
    price: {
      type: Number,
      required: true,
      min: 0
    }
  },
  { _id: false }
);

const marketPriceSchema = new mongoose.Schema(
  {
    market: {
      type: String,
      required: true,
      trim: true
    },
    regularPrice: {
      type: Number,
      required: true,
      min: 0
    },
    salePrice: {
      type: Number,
      default: null,
      min: 0
    },
    startDate: {
      type: Date,
      default: null
    },
    endDate: {
      type: Date,
      default: null
    }
  },
  { _id: false }
);

const bundleItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
      required: false
    },
    itemType: {
      type: String,
      enum: ["existing", "custom"],
      default: "existing"
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1
    },
    name: {
      type: String,
      default: ""
    },
    image: {
      type: String,
      default: ""
    },
    description: {
      type: String,
      default: ""
    },
    price: {
      type: Number,
      default: 0
    },
    isDigital: {
      type: Boolean,
      default: false
    },
    webReaderLink: {
      type: String,
      default: ""
    },
    kindleLink: {
      type: String,
      default: ""
    }
  },
  { _id: true }
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },

    price: {
      type: Number,
      required: true,
      min: 0
    },

    internationalPrice: {
      type: Number,
      default: null,
      min: 0
    },

    internationalCountryPrices: {
      type: [internationalCountryPriceSchema],
      default: []
    },

    marketPrices: {
      type: [marketPriceSchema],
      default: []
    },

    description: String,

    aboutProduct: {
      type: [String],
      default: []
    },

    image: String,

    images: {
      type: [String],
      default: []
    },

    trailerVideoUrl: {
      type: String,
      default: ""
    },

    category: {
      type: String,
      default: "General"
    },

    discountType: {
      type: String,
      enum: ["none", "festive", "new_launch", "weekly", "monthly", "combo"],
      default: "none"
    },

    festiveOffer: {
      type: Boolean,
      default: false
    },

    festiveDiscountPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 95
    },

    productType: {
      type: String,
      enum: ["single", "bundle", "bulk"],
      default: "single"
    },

    isDigital: {
      type: Boolean,
      default: false
    },

    digitalType: {
      type: String,
      default: "Web Version"
    },

    webReaderLink: {
      type: String,
      default: ""
    },

    kindleLink: {
      type: String,
      default: ""
    },

    kindleAsin: {
      type: String,
      default: ""
    },

    digitalInstructions: {
      type: String,
      default: ""
    },

    courseLink: {
      type: String,
      default: ""
    },

    bundleItems: {
      type: [bundleItemSchema],
      default: []
    },

    relatedProducts: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product"
        }
      ],
      default: []
    },

    stock: {
      type: Number,
      default: 1,
      min: 0
    },

    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },

    reviewsCount: {
      type: Number,
      default: 0,
      min: 0
    },

    reviews: [reviewSchema],

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
    weight: {
      type: Number,
      default: 0,
      min: 0
    },
    height: {
      type: Number,
      default: 0,
      min: 0
    },
    width: {
      type: Number,
      default: 0,
      min: 0
    },
    length: {
      type: Number,
      default: 0,
      min: 0
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
    views: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  { timestamps: true }
);

// ── Indexes (Tier-1 performance) ──────────────────────────────────────────────
// These turn full-collection scans into fast O(log n) index lookups.

// 0. Soft-delete filter index
productSchema.index({ isDeleted: 1 });

// 1. Category listing + sort by creation date (main collection page)
productSchema.index({ category: 1, createdAt: -1 });

// 2. Featured sort: stock desc + rating desc (default sort on collection page)
productSchema.index({ stock: -1, rating: -1 });

// 3. Low-stock admin alert queries
productSchema.index({ stock: 1 });

// 4. Festive offer filtering
productSchema.index({ festiveOffer: 1, createdAt: -1 });

// 5. Full-text search on name and description
productSchema.index({ name: "text", description: "text" }, { weights: { name: 10, description: 3 } });

// 6. Rating sort
productSchema.index({ rating: -1 });

// 7. Popularity / total views sort
productSchema.index({ views: -1 });

module.exports = mongoose.model("Product", productSchema);
