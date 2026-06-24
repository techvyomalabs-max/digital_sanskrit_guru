/**
 * init-db-v2.js
 *
 * Initializes the `digital_sanskrit_guru_v2` MongoDB database.
 * Creates all required collections, indexes, and a default StoreSettings document
 * if they do not already exist.
 *
 * Usage:
 *   node backend/scripts/init-db-v2.js
 *
 * SAFE: This script NEVER touches the `digital_sanskrit_guru` database.
 */

const mongoose = require("mongoose");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

// ─── Target DB ───────────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/digital_sanskrit_guru_v2";

// ─── Models (inline – no side-effects on the global mongoose registry) ───────

// --- Review (sub-schema) ---
const reviewSchema = new mongoose.Schema({
  user: String,
  rating: Number,
  comment: String,
});

// --- Product ---
const internationalCountryPriceSchema = new mongoose.Schema(
  { country: { type: String, required: true, trim: true }, price: { type: Number, required: true, min: 0 } },
  { _id: false }
);
const marketPriceSchema = new mongoose.Schema(
  {
    market: { type: String, required: true, trim: true },
    regularPrice: { type: Number, required: true, min: 0 },
    salePrice: { type: Number, default: null, min: 0 },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
  },
  { _id: false }
);
const bundleItemSchema = new mongoose.Schema(
  { product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true }, quantity: { type: Number, default: 1, min: 1 } },
  { _id: false }
);
const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
    internationalPrice: { type: Number, default: null },
    internationalCountryPrices: { type: [internationalCountryPriceSchema], default: [] },
    marketPrices: { type: [marketPriceSchema], default: [] },
    description: String,
    aboutProduct: { type: [String], default: [] },
    image: String,
    images: { type: [String], default: [] },
    trailerVideoUrl: { type: String, default: "" },
    category: { type: String, default: "General" },
    festiveOffer: { type: Boolean, default: false },
    festiveDiscountPercent: { type: Number, default: 0, min: 0, max: 95 },
    productType: { type: String, enum: ["single", "bundle"], default: "single" },
    bundleItems: { type: [bundleItemSchema], default: [] },
    relatedProducts: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }], default: [] },
    stock: { type: Number, default: 1 },
    rating: { type: Number, default: 0 },
    reviews: [reviewSchema],
    lastUpdatedByName: { type: String, default: "" },
    lastUpdatedByEmail: { type: String, default: "" },
    lastUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
const Product = mongoose.model("Product", productSchema);

// --- User ---
const addressSchema = new mongoose.Schema(
  {
    label: { type: String, enum: ["Home", "Work", "Other"], default: "Home" },
    name: { type: String, default: "" },
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    landmark: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    pincode: { type: String, default: "" },
    country: { type: String, default: "India" },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    isDefault: { type: Boolean, default: false },
  },
  { _id: false }
);
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  isAdmin: { type: Boolean, default: false },
  adminGrantedAt: { type: Date, default: null },
  adminGrantedByName: { type: String, default: "" },
  adminGrantedByEmail: { type: String, default: "" },
  lastActiveAt: { type: Date, default: null },
  totalTimeSpentSec: { type: Number, default: 0 },
  addresses: { type: [addressSchema], default: [] },
});
const User = mongoose.model("User", userSchema);

// --- Order ---
const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    items: Array,
    subtotal: { type: Number, default: 0 },
    gstPercent: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    couponCode: { type: String, default: "" },
    discount: { type: Number, default: 0 },
    deliveryCharge: { type: Number, default: 0 },
    total: Number,
    currencyDisplay: {
      currency: { type: String, default: "" },
      amount: { type: Number, default: null },
      detectedCountry: { type: String, default: "" },
    },
    shipping: {
      name: { type: String, default: "" },
      phone: { type: String, default: "" },
      address: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      pincode: { type: String, default: "" },
      country: { type: String, default: "" },
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
    },
    status: { type: String, default: "Pending", enum: ["Pending", "Shipped", "Delivered", "Cancelled"] },
    paymentStatus: { type: String, default: "Pending", enum: ["Pending", "Paid", "Failed"] },
    paymentMethod: { type: String, default: "Razorpay" },
    paymentMeta: {
      razorpayOrderId: { type: String, default: "" },
      razorpayPaymentId: { type: String, default: "" },
      paidAt: { type: Date, default: null },
    },
    refundStatus: {
      type: String,
      default: "Not Applicable",
      enum: ["Not Applicable", "Pending", "Processing", "Refunded", "Rejected"],
    },
    deliveredAt: { type: Date, default: null },
    returnRequest: {
      status: { type: String, default: "Not Requested", enum: ["Not Requested", "Requested", "Approved", "Rejected", "Refunded"] },
      requestedAt: { type: Date, default: null },
      resolvedAt: { type: Date, default: null },
      reason: { type: String, default: "" },
      adminReason: { type: String, default: "" },
    },
    cancelledAt: { type: Date, default: null },
    lastUpdatedByName: { type: String, default: "" },
    lastUpdatedByEmail: { type: String, default: "" },
    lastUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
const Order = mongoose.model("Order", orderSchema);

// --- Cart ---
const cartItemSchema = new mongoose.Schema(
  { product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true }, quantity: { type: Number, default: 1 } },
  { _id: false }
);
const cartSchema = new mongoose.Schema(
  { user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true }, items: [cartItemSchema] },
  { timestamps: true }
);
const Cart = mongoose.model("Cart", cartSchema);

// --- Coupon ---
const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    type: { type: String, enum: ["percentage", "fixed"], required: true },
    value: { type: Number, required: true },
    minOrder: { type: Number, default: 0 },
    expiresAt: { type: Date },
    applicableProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    assignedUserEmail: { type: String, default: null, trim: true, lowercase: true },
    usedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    lastUpdatedByName: { type: String, default: "" },
    lastUpdatedByEmail: { type: String, default: "" },
    lastUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
const Coupon = mongoose.model("Coupon", couponSchema);

// --- AdminAuditLog ---
const adminAuditLogSchema = new mongoose.Schema(
  {
    actorUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    actorName: { type: String, default: "", trim: true },
    actorEmail: { type: String, default: "", trim: true, lowercase: true },
    action: { type: String, required: true, trim: true },
    entityType: { type: String, required: true, trim: true },
    entityId: { type: String, default: "", trim: true },
    entityLabel: { type: String, default: "", trim: true },
    summary: { type: String, required: true, trim: true },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);
const AdminAuditLog = mongoose.model("AdminAuditLog", adminAuditLogSchema);

// --- StoreSettings ---
const DEFAULT_PRODUCT_CATEGORIES = ["General", "Dharma", "Grammar", "Scriptures", "Gita", "Chanting", "Sanskrit", "Books"];

const storeSettingsSchema = new mongoose.Schema(
  {
    gstPercent: { type: Number, default: 18, min: 0, max: 50 },
    deliveryCharge: { type: Number, default: 0, min: 0 },
    warehouseLocation: {
      type: new mongoose.Schema(
        { name: { type: String, default: "" }, address: { type: String, default: "" }, mapUrl: { type: String, default: "" }, latitude: { type: Number, default: null }, longitude: { type: Number, default: null } },
        { _id: false }
      ),
      default: () => ({}),
    },
    distancePricing: {
      type: new mongoose.Schema(
        { enabled: { type: Boolean, default: true }, baseFee: { type: Number, default: 0, min: 0 }, perKmCharge: { type: Number, default: 0, min: 0 }, freeRadiusKm: { type: Number, default: 0, min: 0 }, maxCharge: { type: Number, default: null, min: 0 } },
        { _id: false }
      ),
      default: () => ({}),
    },
    internationalDelivery: {
      type: new mongoose.Schema(
        {
          enabled: { type: Boolean, default: false },
          domesticCountry: { type: String, default: "India" },
          defaultFee: { type: Number, default: 0, min: 0 },
          countryRates: { type: [new mongoose.Schema({ country: { type: String, default: "" }, fee: { type: Number, default: 0, min: 0 } }, { _id: false })], default: [] },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    pricingMarkets: { type: [new mongoose.Schema({ name: { type: String, required: true }, currency: { type: String, default: "USD" }, countries: { type: [String], default: [] } }, { _id: false })], default: [] },
    internationalPricingDefaults: { type: new mongoose.Schema({ currency: { type: String, default: "USD" } }, { _id: false }), default: () => ({}) },
    currencyConversionRates: {
      type: new mongoose.Schema(
        { INR: { type: Number, default: 1 }, USD: { type: Number, default: 0.012 }, EUR: { type: Number, default: 0.011 }, GBP: { type: Number, default: 0.009 }, AED: { type: Number, default: 0.044 }, CAD: { type: Number, default: 0.016 }, AUD: { type: Number, default: 0.019 } },
        { _id: false }
      ),
      default: () => ({}),
    },
    siteTheme: { type: String, default: "sunrise" },
    customThemes: { type: Array, default: [] },
    productCategories: { type: [String], default: DEFAULT_PRODUCT_CATEGORIES },
    heroBannerImage: { type: String, default: "" },
    heroBannerProductId: { type: String, default: "" },
    heroBanners: { type: Array, default: [] },
    homeSectionVisibility: { festiveOffers: { type: Boolean, default: true } },
    collectionFilterVisibility: { festiveOffers: { type: Boolean, default: true } },
    orderConfirmationEmail: {
      subjectTemplate: { type: String, default: "Order Confirmed — {{SITE_NAME}}" },
      bodyTemplate: {
        type: String,
        default: `<h2>Thank you for your order! 🎉</h2>\n<p>Hi <strong>{{USER_NAME}}</strong>,</p>\n<p>Your order has been placed successfully. We'll notify you when it ships.</p>\n<p><strong>Order ID:</strong> {{ORDER_ID}}</p>\n<h3>Order Details:</h3>\n{{ITEMS_TABLE}}\n{{SUMMARY_TABLE}}\n<p><strong>Shipping to:</strong><br/>\n{{SHIPPING_INFO}}\n</p>`
      },
      headerBgColor: { type: String, default: "#1a1a2e" },
      accentColor: { type: String, default: "#e94560" },
      headerText: { type: String, default: "Digital Sanskrit Guru" },
      headerSubtext: { type: String, default: "Spreading the wisdom of Sanskrit" }
    },
    lastUpdatedByName: { type: String, default: "" },
    lastUpdatedByEmail: { type: String, default: "" },
    lastUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
const StoreSettings = mongoose.model("StoreSettings", storeSettingsSchema);

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔗  Connecting to database...\n`);

  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 });

  // Double-check we are on the right DB
  const dbName = mongoose.connection.name;
  if (dbName === "digital_sanskrit_guru") {
    console.error(`❌  Safety guard triggered: Connected to "${dbName}" which is the legacy database. Aborting to prevent data loss.`);
    process.exit(1);
  }

  console.log(`✅  Connected to database: "${dbName}"\n`);

  const collections = await mongoose.connection.db.listCollections().toArray();
  const existingNames = new Set(collections.map((c) => c.name));

  const models = [
    { model: Product,       collectionName: "products" },
    { model: User,          collectionName: "users" },
    { model: Order,         collectionName: "orders" },
    { model: Cart,          collectionName: "carts" },
    { model: Coupon,        collectionName: "coupons" },
    { model: AdminAuditLog, collectionName: "adminauditlogs" },
    { model: StoreSettings, collectionName: "storesettings" },
  ];

  for (const { model, collectionName } of models) {
    if (existingNames.has(collectionName)) {
      console.log(`⏭️   Collection "${collectionName}" already exists – skipping creation.`);
    } else {
      console.log(`📦  Creating collection "${collectionName}" …`);
    }
    // ensureIndexes creates the collection (if missing) and syncs all indexes
    await model.ensureIndexes();
    console.log(`🔑   Indexes synced for "${collectionName}".`);
  }

  // ─── Seed default StoreSettings (only if collection is empty) ─────────────
  const settingsCount = await StoreSettings.countDocuments();
  if (settingsCount === 0) {
    console.log("\n🌱  No StoreSettings found – seeding default document …");
    await StoreSettings.create({});
    console.log("✅  Default StoreSettings document created.");
  } else {
    console.log(`\n⏭️   StoreSettings already has ${settingsCount} document(s) – skipping seed.`);
  }

  console.log("\n✅  Database initialisation complete for \"digital_sanskrit_guru_v2\".\n");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌  Error during DB initialisation:", err.message);
  process.exit(1);
});
