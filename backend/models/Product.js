


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

    reviews: [reviewSchema]
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);
