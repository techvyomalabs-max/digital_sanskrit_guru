const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const Order = require("../models/Order");

async function main() {
  const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/digital_sanskrit_guru_v2";
  await mongoose.connect(MONGO_URI);
  console.log("Connected to", mongoose.connection.name);

  const orders = await Order.find().sort({ createdAt: -1 }).limit(5).lean();
  console.log(JSON.stringify(orders, null, 2));

  await mongoose.disconnect();
}

main().catch(console.error);
