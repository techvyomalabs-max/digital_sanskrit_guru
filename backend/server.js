const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, ".env") });

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const orderRoutes = require("./routes/orderRoutes");
const productRoutes = require("./routes/productRoutes");
const cartRoutes = require("./routes/cartRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const couponRoutes = require("./routes/couponRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const mapsRoutes = require("./routes/mapsRoutes");

const app = express();
const PORT = process.env.PORT || 5001;
let dbConnected = false;
let isConnecting = false;

const isValidMongoUri = (uri) => /^mongodb(\+srv)?:\/\//.test(String(uri || "").trim());

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("API is running");
});

app.get("/api/health", (req, res) => {
  res.json({
    api: "ok",
    db: dbConnected ? "connected" : "disconnected",
    dbName: mongoose.connection?.name || null,
    readyState: mongoose.connection?.readyState ?? null
  });
});

const requireDatabase = (req, res, next) => {
  if (!dbConnected) {
    return res.status(503).json({
      message: "Database is not connected. Start MongoDB or update MONGO_URI."
    });
  }
  next();
};

app.use("/api/auth", requireDatabase, authRoutes);
app.use("/api/orders", requireDatabase, orderRoutes);
app.use("/api/products", requireDatabase, productRoutes);
app.use("/api/cart", requireDatabase, cartRoutes);
app.use("/api/settings", requireDatabase, settingsRoutes);
app.use("/api/coupons", requireDatabase, couponRoutes);
app.use("/api/payment", requireDatabase, paymentRoutes);
app.use("/api/maps", mapsRoutes);

if (!isValidMongoUri(process.env.MONGO_URI)) {
  console.error(
    "Invalid MONGO_URI in backend/.env. Use a full URI starting with mongodb:// or mongodb+srv://"
  );
}

async function connectToDatabase() {
  if (!isValidMongoUri(process.env.MONGO_URI)) {
    dbConnected = false;
    return;
  }

  if (isConnecting || dbConnected) return;
  isConnecting = true;

  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 8000
    });
    dbConnected = true;
    console.log(`MongoDB connected (${mongoose.connection?.name || "unknown-db"})`);
  } catch (error) {
    dbConnected = false;
    console.error("MongoDB connection failed:", error.message);
  } finally {
    isConnecting = false;
  }
}

connectToDatabase();

setInterval(() => {
  if (!dbConnected) {
    connectToDatabase();
  }
}, 10000);

mongoose.connection.on("disconnected", () => {
  dbConnected = false;
  console.warn("MongoDB disconnected");
});

mongoose.connection.on("reconnected", () => {
  dbConnected = true;
  console.log("MongoDB reconnected");
});

mongoose.connection.on("error", (error) => {
  dbConnected = false;
  console.error("MongoDB runtime error:", error.message);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

process.on("SIGINT", async () => {
  try {
    await mongoose.connection.close();
  } finally {
    process.exit(0);
  }
});
