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
const DIST_DIR = path.join(__dirname, "..", "dist");
let dbConnected = false;
let isConnecting = false;

const isValidMongoUri = (uri) => /^mongodb(\+srv)?:\/\//.test(String(uri || "").trim());
const clientBuildExists = require("fs").existsSync(DIST_DIR);
const corsOrigin = String(process.env.CORS_ORIGIN || "").trim();

app.use(
  cors(
    corsOrigin
      ? {
          origin: corsOrigin,
          credentials: true
        }
      : undefined
  )
);
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

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

if (clientBuildExists) {
  app.use(express.static(DIST_DIR));

  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
} else {
  app.get("/", (req, res) => {
    res.send("API is running");
  });
}

app.use((error, req, res, next) => {
  console.error("Unhandled request error:", error?.stack || error?.message || error);

  if (res.headersSent) {
    return next(error);
  }

  return res.status(error?.status || 500).json({
    message: error?.message || "Internal server error"
  });
});

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

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.requestTimeout = 120000;

server.on("error", (error) => {
  console.error("HTTP server error:", error?.stack || error?.message || error);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason?.stack || reason?.message || reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error?.stack || error?.message || error);
});

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully.`);
  try {
    await mongoose.connection.close();
    await new Promise((resolve) => server.close(resolve));
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
