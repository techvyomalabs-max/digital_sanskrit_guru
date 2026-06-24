


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
      required: true
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1
    }
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },

    price: {
      type: Number,
      required: true
    },

    internationalPrice: {
      type: Number,
      default: null
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
      enum: ["single", "bundle"],
      default: "single"
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
      default: 1
    },

    rating: {
      type: Number,
      default: 0
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
    }
  },
  { timestamps: true }
);

// ── Indexes (Tier-1 performance) ──────────────────────────────────────────────
// These turn full-collection scans into fast O(log n) index lookups.

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

module.exports = mongoose.model("Product", productSchema);
