/**
 * Gives every product a link name ("slug") for URLs like /product/<slug>.
 *
 * 1. Products that came from the old WordPress site get their old link name
 *    (wp_posts.post_name), so links like
 *    https://digitalsanskritguru.com/product/<old-name>/ keep working.
 *    Matching is by product name, the same way migrate-wordpress.js imported them.
 * 2. Every other product without a link name gets one made from its name.
 *
 * Products that already have a link name are not changed.
 *
 * Dry run by default (prints what it would do, writes nothing):
 *   node scripts/backfill-product-slugs.js
 *   node scripts/backfill-product-slugs.js --wp          (also read old WordPress names)
 *   node scripts/backfill-product-slugs.js --wp-file data/wp-product-slugs.json
 *                                                       (old names from a saved list instead of MySQL)
 * Write the changes:
 *   node scripts/backfill-product-slugs.js --wp --apply   (or --wp-file ... --apply)
 *
 * Needs MONGO_URI in backend/.env. With --wp it also needs the local WordPress export
 * database: MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB (default wp_old_export).
 */
const path = require("path");
const mongoose = require("mongoose");

require("dotenv").config({ path: path.join(__dirname, "../.env") });

const Product = require("../models/Product");
const { planSlugBackfill } = require("../utils/productSlugBackfill");

const APPLY = process.argv.includes("--apply");
const USE_WP = process.argv.includes("--wp");
const fileFlag = process.argv.indexOf("--wp-file");
const WP_FILE = fileFlag > -1 ? process.argv[fileFlag + 1] : "";

// Old WordPress link names saved as JSON: [{ "wpId": 23, "name": "...", "slug": "dhaturupaparicayah" }].
function loadWordPressFile(file) {
  const fs = require("fs");
  const rows = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const withName = rows.filter((r) => r && r.name && r.slug);
  rows
    .filter((r) => r && !r.name)
    .forEach((r) => console.log(`Old link with no product name in the file (set it by hand in Add Products): /product/${r.slug}/`));
  return withName.map((r) => ({ id: Number(r.wpId), title: String(r.name), slug: String(r.slug) }));
}

async function loadWordPressProducts() {
  if (!process.env.MYSQL_PASSWORD) {
    throw new Error("--wp needs MYSQL_PASSWORD (and MYSQL_USER / MYSQL_DB if not the defaults) in backend/.env");
  }
  const mysql = require("mysql2/promise");
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DB || "wp_old_export"
  });
  try {
    const [rows] = await conn.query(
      "SELECT ID, post_title, post_name FROM wp_posts WHERE post_type = 'product' AND post_status = 'publish'"
    );
    return rows.map((r) => ({ id: Number(r.ID), title: String(r.post_title || ""), slug: String(r.post_name || "") }));
  } finally {
    await conn.end();
  }
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is missing in backend/.env");

  const wpProducts = WP_FILE ? loadWordPressFile(WP_FILE) : USE_WP ? await loadWordPressProducts() : [];
  await mongoose.connect(process.env.MONGO_URI);

  const products = await Product.find({})
    .select("name slug slugHistory wpProductId optionParent hideFromListings isDeleted createdAt")
    .sort({ createdAt: 1 })
    .lean();

  const plan = planSlugBackfill(products, wpProducts);

  console.log(`Products in database:            ${products.length}`);
  console.log(`Already have a link name:        ${plan.alreadySet}`);
  console.log(`Old WordPress link names to set: ${plan.updates.filter((u) => u.source === "wordpress").length}`);
  console.log(`Old links added to existing ones: ${plan.updates.filter((u) => u.source === "wordpress-old-link").length}`);
  console.log(`New link names from the name:    ${plan.updates.filter((u) => u.source === "generated").length}`);
  console.log("");
  for (const u of plan.updates) {
    if (u.source === "wordpress-old-link") {
      console.log(`  [old link] /product/${u.oldSlug}  also opens  /product/${u.slug}   <- ${u.name}`);
    } else {
      const note = u.status ? `   (${u.status})` : "";
      console.log(`  [${u.source === "wordpress" ? "old site" : "new     "}] /product/${u.slug}   <- ${u.name}${note}`);
    }
  }
  if (plan.unmatchedWp.length) {
    console.log(`\nWordPress products with no product of the same name here (${plan.unmatchedWp.length}):`);
    plan.unmatchedWp.forEach((w) => console.log(`  #${w.id} ${w.title}  (/product/${w.slug}/)`));
  }
  if (plan.skippedWp.length) {
    console.log(`\nOld link names not used (${plan.skippedWp.length}):`);
    plan.skippedWp.forEach((w) => console.log(`  #${w.id} ${w.title}: ${w.reason}`));
  }

  if (!APPLY) {
    console.log("\nDry run: nothing was written. Add --apply to save these link names.");
    return;
  }

  const wpId = (u) => (u.wpProductId ? { wpProductId: u.wpProductId } : {});
  const ops = plan.updates.map((u) =>
    u.source === "wordpress-old-link"
      ? {
          updateOne: {
            filter: { _id: u._id },
            update: { $addToSet: { slugHistory: u.oldSlug }, ...(u.wpProductId ? { $set: wpId(u) } : {}) }
          }
        }
      : {
          updateOne: {
            filter: { _id: u._id, $or: [{ slug: { $exists: false } }, { slug: null }, { slug: "" }] },
            update: { $set: { slug: u.slug, ...wpId(u) } }
          }
        }
  );
  if (ops.length) {
    await Product.createIndexes();
    const result = await Product.bulkWrite(ops, { ordered: false });
    console.log(`\nSaved link names on ${result.modifiedCount} products.`);
  } else {
    console.log("\nNothing to save.");
  }
}

main()
  .catch((err) => {
    console.error("Failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect().catch(() => {}));
