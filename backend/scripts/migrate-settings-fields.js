/**
 * migrate-settings-fields.js
 *
 * ONE-TIME migration: renames legacy StoreSettings field names to match
 * what the backend models and routes expect.
 *
 * Fields renamed:
 *   currencyRates                 → currencyConversionRates
 *   defaultInternationalCurrency  → internationalPricingDefaults.currency
 *
 * Also adds missing performance indexes on orders and products.
 *
 * Safe to re-run: $rename is a no-op if the source field doesn't exist.
 */

const mongoose = require("mongoose");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/digital_sanskrit_guru_v2";

async function main() {
  console.log(`\n🔗  Connecting to database...`);
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 });

  const dbName = mongoose.connection.name;
  if (dbName === "digital_sanskrit_guru") {
    console.error(`❌  Safety guard triggered: Connected to "${dbName}" which is the legacy database. Aborting to prevent data loss.`);
    process.exit(1);
  }
  console.log(`✅  Connected to: "${dbName}"\n`);

  const db = mongoose.connection.db;

  // ── 1. Rename legacy StoreSettings fields ──────────────────────────────────
  console.log("📋  Migrating storesettings field names …");
  const settingsResult = await db.collection("storesettings").updateMany(
    {},
    {
      $rename: {
        currencyRates: "currencyConversionRates",
        defaultInternationalCurrency: "internationalPricingDefaults.currency"
      }
    }
  );
  if (settingsResult.modifiedCount > 0) {
    console.log(`✅  Renamed fields in ${settingsResult.modifiedCount} storesettings document(s).`);
  } else {
    console.log("⏭️   storesettings fields already up-to-date (no rename needed).");
  }

  // ── 2. Verify the migration ────────────────────────────────────────────────
  const settings = await db.collection("storesettings").findOne({});
  console.log("\n🔍  Verifying storesettings after migration:");
  console.log("  currencyConversionRates:", settings?.currencyConversionRates ? "✅ Present" : "❌ MISSING");
  console.log("  internationalPricingDefaults:", settings?.internationalPricingDefaults ? `✅ ${JSON.stringify(settings.internationalPricingDefaults)}` : "❌ MISSING");
  console.log("  currencyRates (old):", settings?.currencyRates === undefined ? "✅ Cleaned up" : "⚠️  Still present");
  console.log("  defaultInternationalCurrency (old):", settings?.defaultInternationalCurrency === undefined ? "✅ Cleaned up" : "⚠️  Still present");

  // ── 3. Add missing performance indexes ────────────────────────────────────
  console.log("\n🔑  Adding performance indexes …");

  // orders: (user, createdAt) — for fast "my orders" queries
  await db.collection("orders").createIndex(
    { user: 1, createdAt: -1 },
    { name: "user_1_createdAt_-1", background: true }
  );
  console.log("✅  orders index: { user: 1, createdAt: -1 }");

  // products: category — for collection-page filtering
  await db.collection("products").createIndex(
    { category: 1 },
    { name: "category_1", background: true }
  );
  console.log("✅  products index: { category: 1 }");

  // products: festiveOffer — for festive section queries
  await db.collection("products").createIndex(
    { festiveOffer: 1 },
    { name: "festiveOffer_1", background: true }
  );
  console.log("✅  products index: { festiveOffer: 1 }");

  // products: createdAt — for "new arrivals" sorting
  await db.collection("products").createIndex(
    { createdAt: -1 },
    { name: "createdAt_-1", background: true }
  );
  console.log("✅  products index: { createdAt: -1 }");

  // ── 4. Report final index state ────────────────────────────────────────────
  console.log("\n📊  Final index list:");
  for (const collectionName of ["orders", "products", "users", "coupons", "carts"]) {
    const indexes = await db.collection(collectionName).indexes();
    console.log(`  ${collectionName}: ${indexes.map(i => i.name).join(", ")}`);
  }

  // ── 5. Drop orphan reviews collection ─────────────────────────────────────
  const cols = await db.listCollections({ name: "reviews" }).toArray();
  if (cols.length > 0) {
    const reviewCount = await db.collection("reviews").countDocuments();
    await db.collection("reviews").drop();
    console.log(`\n🗑️   Dropped orphan "reviews" collection (${reviewCount} docs removed).`);
  } else {
    console.log('\n\u23ED\uFE0F   No orphan "reviews" collection found.');
  }

  console.log("\n✅  Migration complete for digital_sanskrit_guru_v2.\n");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌  Migration failed:", err.message);
  process.exit(1);
});
