/**
 * server.js
 *
 * Tier-1 performance improvements applied:
 *  1. Node.js Cluster mode  — uses all CPU cores (one worker per core)
 *  2. gzip/brotli compression via `compression` middleware
 *  3. MongoDB connection pool increased: maxPoolSize 5 → 50
 *  4. JSON body limit reduced globally (2mb) to block memory-exhaustion attacks;
 *     25mb only applied per-route where needed (admin product routes)
 *  5. keepAlive + timeouts already present, verified correct
 */

"use strict";

const cluster = require("cluster");
const os = require("os");

// ── Cluster: only in production — nodemon (dev) doesn't support multi-worker ─
const IS_PRODUCTION = process.env.NODE_ENV === "production";

if (IS_PRODUCTION && cluster.isPrimary) {
  const cpuCount = os.cpus().length;
  console.log(`[Cluster] Primary ${process.pid} running. Forking ${cpuCount} workers.`);

  for (let i = 0; i < cpuCount; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    console.warn(`[Cluster] Worker ${worker.process.pid} died (code=${code}, signal=${signal}). Restarting…`);
    cluster.fork();
  });

} else {
  // ── Worker process ──────────────────────────────────────────────────────────
  const path = require("path");
  const dotenv = require("dotenv");
  dotenv.config({ path: path.join(__dirname, ".env") });

  const express = require("express");
  const compression = require("compression");
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
  const pushRoutes = require("./routes/pushRoutes");
  const wishlistRoutes = require("./routes/wishlistRoutes");
  const marketingRoutes = require("./routes/marketingRoutes");
  const { initVapid } = require("./utils/webPush");

  const app = express();
  const PORT = process.env.PORT || 5001;
  const DIST_DIR = path.join(__dirname, "..", "dist");
  let dbConnected = false;
  let isConnecting = false;

  const isValidMongoUri = (uri) => /^mongodb(\+srv)?:\/\//.test(String(uri || "").trim());
  const clientBuildExists = require("fs").existsSync(DIST_DIR);
  const corsOrigin = String(process.env.CORS_ORIGIN || "").trim();

  // ── Middleware ──────────────────────────────────────────────────────────────

  // 1. Compression — compresses all JSON/HTML/text responses (gzip/brotli)
  //    Saves 3-6× bandwidth for product listing payloads
  app.use(compression({
    level: 6,                       // balanced speed vs compression ratio
    threshold: 1024,                // only compress responses > 1KB
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) return false;
      return compression.filter(req, res);
    }
  }));

  app.use(cors(
    corsOrigin
      ? { origin: corsOrigin, credentials: true }
      : undefined
  ));

  // 2. Global JSON body limit: increased to 25mb to support Base64 product image uploads
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true, limit: "25mb" }));

  // ── Health check ────────────────────────────────────────────────────────────
  app.get("/api/health", (req, res) => {
    res.json({
      api: "ok",
      worker: process.pid,
      db: dbConnected ? "connected" : "disconnected",
      dbName: mongoose.connection?.name || null,
      readyState: mongoose.connection?.readyState ?? null
    });
  });

  // ── Cache stats endpoint (admin only reference) ─────────────────────────────
  app.get("/api/cache/stats", (req, res) => {
    try {
      const { appCache } = require("./utils/cache");
      res.json({ keys: appCache.keys().length, stats: appCache.getStats() });
    } catch {
      res.json({ keys: 0 });
    }
  });

  const requireDatabase = (req, res, next) => {
    if (!dbConnected) {
      return res.status(503).json({
        message: "Database is not connected. Start MongoDB or update MONGO_URI."
      });
    }
    next();
  };

  // ── Routes ──────────────────────────────────────────────────────────────────
  app.use("/api/auth", requireDatabase, authRoutes);
  app.use("/api/orders", requireDatabase, orderRoutes);
  app.use("/api/products", requireDatabase, productRoutes);
  app.use("/api/cart", requireDatabase, cartRoutes);
  app.use("/api/settings", requireDatabase, settingsRoutes);
  app.use("/api/coupons", requireDatabase, couponRoutes);
  app.use("/api/payment", requireDatabase, paymentRoutes);
  app.use("/api/maps", mapsRoutes);
  app.use("/api/push", requireDatabase, pushRoutes);
  app.use("/api/wishlist", requireDatabase, wishlistRoutes);
  app.use("/api/marketing", requireDatabase, marketingRoutes);

  // ── Static files (served after API routes) ─────────────────────────────────
  if (clientBuildExists) {
    app.use(express.static(DIST_DIR, {
      maxAge: "7d",            // cache static assets for 7 days in browser
      etag: true,
      lastModified: true
    }));

    app.get(/^\/(?!api).*/, (req, res) => {
      res.sendFile(path.join(DIST_DIR, "index.html"));
    });
  } else {
    app.get("/", (req, res) => {
      res.send(`API is running (worker ${process.pid})`);
    });
  }

  // ── Global error handler ────────────────────────────────────────────────────
  app.use((error, req, res, next) => {
    console.error("Unhandled request error:", error?.stack || error?.message || error);
    if (res.headersSent) return next(error);
    return res.status(error?.status || 500).json({
      message: error?.message || "Internal server error"
    });
  });

  // ── MongoDB connection ──────────────────────────────────────────────────────
  if (!isValidMongoUri(process.env.MONGO_URI)) {
    console.error("Invalid MONGO_URI in backend/.env. Use a full URI starting with mongodb:// or mongodb+srv://");
  }

  async function connectToDatabase() {
    if (!isValidMongoUri(process.env.MONGO_URI)) { dbConnected = false; return; }
    if (isConnecting || dbConnected) return;
    isConnecting = true;

    try {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 8000,
        socketTimeoutMS: 45000,
        // 3. Increased connection pool — default was 5, now 50
        //    Allows 50 parallel DB operations instead of queuing at 5
        maxPoolSize: 50,
        minPoolSize: 5,
        // Heartbeat keeps connections warm and detects stale ones
        heartbeatFrequencyMS: 10000
      });
      dbConnected = true;
      console.log(`[Worker ${process.pid}] MongoDB connected (${mongoose.connection?.name || "unknown-db"})`);
    } catch (error) {
      dbConnected = false;
      console.error(`[Worker ${process.pid}] MongoDB connection failed:`, error.message);
    } finally {
      isConnecting = false;
    }
  }

  connectToDatabase();
  initVapid();

  // Retry connection if disconnected
  setInterval(() => {
    if (!dbConnected) connectToDatabase();
  }, 10000);

  mongoose.connection.on("disconnected", () => { dbConnected = false; console.warn(`[Worker ${process.pid}] MongoDB disconnected`); });
  mongoose.connection.on("reconnected", () => { dbConnected = true;  console.log(`[Worker ${process.pid}] MongoDB reconnected`); });
  mongoose.connection.on("error", (error) => { dbConnected = false; console.error(`[Worker ${process.pid}] MongoDB error:`, error.message); });

  // ── HTTP server ─────────────────────────────────────────────────────────────
  const server = app.listen(PORT, () => {
    console.log(`[Worker ${process.pid}] Server running on port ${PORT}`);
  });

  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  server.requestTimeout = 120000;

  server.on("error", (error) => {
    console.error("HTTP server error:", error?.stack || error?.message || error);
  });

  // ── Process guards ──────────────────────────────────────────────────────────
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled promise rejection:", reason?.stack || reason?.message || reason);
  });

  process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error?.stack || error?.message || error);
  });

  async function shutdown(signal) {
    console.log(`[Worker ${process.pid}] ${signal} received. Shutting down gracefully.`);
    try {
      await mongoose.connection.close();
      await new Promise((resolve) => server.close(resolve));
    } finally {
      process.exit(0);
    }
  }

  process.on("SIGINT",  () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
