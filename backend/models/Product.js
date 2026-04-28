


const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
  user: String,
  rating: Number,
  comment: String
});

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
