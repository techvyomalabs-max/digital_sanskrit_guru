const mysql = require("mysql2/promise");
const mongoose = require("mongoose");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "../.env") });

const Product = require("../models/Product");
const User = require("../models/User");

// The MySQL password comes only from the environment (never written in the code):
//   PowerShell:  $env:MYSQL_PASSWORD="..."; node backend/scripts/<this script>.js
function requireMysqlPassword() {
  const value = process.env.MYSQL_PASSWORD;
  if (!value) {
    console.error("Set MYSQL_PASSWORD before running this script.");
    process.exit(1);
  }
  return value;
}

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: requireMysqlPassword(),
  database: process.env.MYSQL_DB || "wp_old_export"
};

function cleanWpShortcodes(text) {
  if (!text) return "";
  let cleaned = String(text);
  // Remove Divi, Visual Composer, Elementor, and generic bracket shortcodes
  cleaned = cleaned.replace(/\[\/?et_pb_[^\]]*\]/gi, "");
  cleaned = cleaned.replace(/\[\/?vc_[^\]]*\]/gi, "");
  cleaned = cleaned.replace(/\[\/?elementor[^\]]*\]/gi, "");
  cleaned = cleaned.replace(/\[\/?[a-z0-9_-]+(?:\s+[^\]]+)?\]/gi, "");
  cleaned = cleaned.replace(/&nbsp;/gi, " ");
  cleaned = cleaned.replace(/&amp;/gi, "&");
  cleaned = cleaned.replace(/&lt;/gi, "<");
  cleaned = cleaned.replace(/&gt;/gi, ">");
  cleaned = cleaned.replace(/\r\n/g, "\n");
  cleaned = cleaned.replace(/\n\s*\n+/g, "\n\n").trim();
  return cleaned;
}

function fixImageUrl(rawUrl) {
  if (!rawUrl) return "";
  let url = String(rawUrl).trim();
  url = url.replace(/https?:\/\/3\.108\.166\.236/gi, "https://digitalsanskritguru.com");
  url = url.replace(/https?:\/\/localhost[^\/]*/gi, "https://digitalsanskritguru.com");
  url = url.replace(/https?:\/\/vyomalabs\.in/gi, "https://digitalsanskritguru.com");
  if (url.startsWith("/wp-content/")) {
    url = "https://digitalsanskritguru.com" + url;
  }
  return url;
}

async function migrateWordPress() {
  console.log("==================================================");
  console.log("🚀 Smart WordPress WooCommerce -> MongoDB Migration");
  console.log("==================================================");

  console.log("Connecting to MongoDB:", process.env.MONGO_URI);
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB:", mongoose.connection.name);

  console.log("Connecting to MySQL database:", MYSQL_CONFIG.database);
  const mysqlConn = await mysql.createConnection(MYSQL_CONFIG);
  console.log("Connected to MySQL!");

  try {
    // ── 1. Pre-fetch Attachments Map ──────────────────────────────────────────
    console.log("⚡ [Pre-fetch 1/3] Loading attachment image URLs...");
    const [attachmentRows] = await mysqlConn.query(
      `SELECT ID, guid FROM wp_posts WHERE post_type = 'attachment'`
    );
    const attachmentMap = new Map();
    for (const att of attachmentRows) {
      const fixedGuid = fixImageUrl(att.guid);
      attachmentMap.set(String(att.ID), fixedGuid);
    }
    console.log(`Loaded ${attachmentMap.size} image attachments.`);

    // ── 2. Pre-fetch Categories Map ───────────────────────────────────────────
    console.log("⚡ [Pre-fetch 2/3] Loading product categories...");
    const [catRows] = await mysqlConn.query(`
      SELECT tr.object_id, t.name 
      FROM wp_terms t
      INNER JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id
      INNER JOIN wp_term_relationships tr ON tt.term_taxonomy_id = tr.term_taxonomy_id
      WHERE tt.taxonomy = 'product_cat'
    `);
    const categoryMap = new Map();
    for (const c of catRows) {
      if (!categoryMap.has(c.object_id)) {
        categoryMap.set(c.object_id, String(c.name || "").trim());
      }
    }
    console.log(`Loaded categories for ${categoryMap.size} products.`);

    // ── 3. Pre-fetch Product Meta Map ────────────────────────────────────────
    console.log("⚡ [Pre-fetch 3/3] Loading all product metadata...");
    const [allProductMeta] = await mysqlConn.query(`
      SELECT post_id, meta_key, meta_value 
      FROM wp_postmeta 
      WHERE post_id IN (SELECT ID FROM wp_posts WHERE post_type = 'product' AND post_status = 'publish')
    `);
    const productMetaMap = new Map();
    for (const m of allProductMeta) {
      if (!productMetaMap.has(m.post_id)) {
        productMetaMap.set(m.post_id, {});
      }
      productMetaMap.get(m.post_id)[m.meta_key] = m.meta_value;
    }
    console.log(`Loaded metadata for ${productMetaMap.size} products.`);

    // ── STEP 1: Bulk Migrate Products ─────────────────────────────────────────
    console.log("\n📦 [1/3] Processing WooCommerce Products...");
    const [productsRows] = await mysqlConn.query(`
      SELECT ID, post_title, post_content, post_excerpt
      FROM wp_posts
      WHERE post_type = 'product' AND post_status = 'publish'
    `);

    const productOps = [];
    for (const pRow of productsRows) {
      const productId = pRow.ID;
      const title = String(pRow.post_title || "").trim();
      if (!title) continue;

      const meta = productMetaMap.get(productId) || {};

      const regPrice = Number(meta._regular_price || meta._price || 0);
      const salePrice = Number(meta._sale_price || 0);
      const activePrice = salePrice > 0 && salePrice < regPrice ? salePrice : (regPrice || Number(meta._price || 0));

      const rawStock = Number(meta._stock || 0);
      const stockStatus = String(meta._stock_status || "").toLowerCase();
      const stock = stockStatus === "outofstock" ? 0 : Math.max(1, rawStock || 10);
      const isDigital = meta._downloadable === "yes" || meta._virtual === "yes";

      // Smart description selection & shortcode stripping
      const cleanedContent = cleanWpShortcodes(pRow.post_content);
      const cleanedExcerpt = cleanWpShortcodes(pRow.post_excerpt);

      let finalDescription = "";
      if (cleanedContent && cleanedContent.length > 10) {
        finalDescription = cleanedContent;
      } else if (cleanedExcerpt && cleanedExcerpt.length > 0) {
        finalDescription = cleanedExcerpt;
      } else {
        finalDescription = title;
      }

      // Main Thumbnail
      let mainImage = "";
      const thumbId = meta._thumbnail_id;
      if (thumbId && attachmentMap.has(String(thumbId))) {
        mainImage = attachmentMap.get(String(thumbId));
      }

      // Gallery Images
      const galleryImages = [];
      if (meta._product_image_gallery) {
        const galleryIds = String(meta._product_image_gallery).split(",").map((id) => id.trim()).filter(Boolean);
        for (const gId of galleryIds) {
          if (attachmentMap.has(gId)) {
            galleryImages.push(attachmentMap.get(gId));
          }
        }
      }
      if (mainImage && !galleryImages.includes(mainImage)) {
        galleryImages.unshift(mainImage);
      }

      const category = categoryMap.get(productId) || "General";

      productOps.push({
        updateOne: {
          filter: { name: title },
          update: {
            $set: {
              name: title,
              price: activePrice > 0 ? activePrice : 99,
              description: finalDescription,
              category: category,
              image: mainImage || (galleryImages[0] || ""),
              images: galleryImages,
              isDigital: isDigital,
              stock: stock,
              isDeleted: false
            }
          },
          upsert: true
        }
      });
    }

    if (productOps.length > 0) {
      await Product.bulkWrite(productOps);
    }
    console.log(`✅ Successfully migrated ${productOps.length} products to MongoDB!`);

    // ── STEP 2: Bulk Migrate Users ───────────────────────────────────────────
    console.log("\n👤 [2/3] Processing WordPress Users...");
    const [userRows] = await mysqlConn.query(`
      SELECT ID, user_login, user_email, user_registered, display_name
      FROM wp_users
    `);

    const [allUserMeta] = await mysqlConn.query(`
      SELECT user_id, meta_key, meta_value FROM wp_usermeta 
      WHERE meta_key IN ('first_name', 'last_name', 'billing_phone')
    `);

    const userMetaMap = new Map();
    for (const m of allUserMeta) {
      if (!userMetaMap.has(m.user_id)) {
        userMetaMap.set(m.user_id, {});
      }
      userMetaMap.get(m.user_id)[m.meta_key] = m.meta_value;
    }

    const userOps = [];
    for (const uRow of userRows) {
      const email = String(uRow.user_email || "").trim().toLowerCase();
      if (!email) continue;

      const uMeta = userMetaMap.get(uRow.ID) || {};
      const name = String(
        (uMeta.first_name || uMeta.last_name) 
          ? `${uMeta.first_name || ""} ${uMeta.last_name || ""}`.trim() 
          : uRow.display_name || uRow.user_login
      ).trim();

      const phone = String(uMeta.billing_phone || "").trim();

      userOps.push({
        updateOne: {
          filter: { email: email },
          update: {
            $setOnInsert: {
              name: name || "Sanskrit Learner",
              email: email,
              password: "$2a$10$dummyLegacyImportedPasswordHashDoNotUseDirectly",
              role: "customer",
              phone: phone,
              createdAt: uRow.user_registered ? new Date(uRow.user_registered) : new Date()
            }
          },
          upsert: true
        }
      });
    }

    if (userOps.length > 0) {
      for (let i = 0; i < userOps.length; i += 1000) {
        await User.bulkWrite(userOps.slice(i, i + 1000));
      }
    }
    console.log(`✅ Successfully migrated ${userOps.length} customer accounts to MongoDB!`);

    // ── STEP 3: Bulk Migrate Reviews ─────────────────────────────────────────
    console.log("\n⭐ [3/3] Processing Product Reviews...");
    const [reviewRows] = await mysqlConn.query(`
      SELECT c.comment_ID, c.comment_post_ID, c.comment_author, c.comment_content, cm.meta_value AS rating
      FROM wp_comments c
      LEFT JOIN wp_commentmeta cm ON c.comment_ID = cm.comment_id AND cm.meta_key = 'rating'
      WHERE c.comment_type IN ('review', '') AND c.comment_approved = '1'
    `);

    const [wpProductTitles] = await mysqlConn.query(`
      SELECT ID, post_title FROM wp_posts WHERE post_type = 'product'
    `);
    const wpProductTitleMap = new Map();
    for (const p of wpProductTitles) {
      wpProductTitleMap.set(p.ID, String(p.post_title || "").trim());
    }

    let attachedReviewsCount = 0;
    const reviewsByProductName = new Map();
    for (const rRow of reviewRows) {
      const wpProductId = rRow.comment_post_ID;
      const rating = Number(rRow.rating || 5);
      const author = String(rRow.comment_author || "Verified Buyer").trim();
      const content = String(rRow.comment_content || "").trim();

      if (!content || !wpProductTitleMap.has(wpProductId)) continue;
      const wpTitle = wpProductTitleMap.get(wpProductId);

      if (!reviewsByProductName.has(wpTitle)) {
        reviewsByProductName.set(wpTitle, []);
      }
      reviewsByProductName.get(wpTitle).push({
        user: author,
        rating: Math.min(5, Math.max(1, rating)),
        comment: content
      });
    }

    for (const [productTitle, reviewList] of reviewsByProductName.entries()) {
      const mongoProduct = await Product.findOne({ name: productTitle });
      if (mongoProduct) {
        let added = false;
        for (const rev of reviewList) {
          const exists = (mongoProduct.reviews || []).find(
            (r) => r.comment === rev.comment && r.user === rev.user
          );
          if (!exists) {
            mongoProduct.reviews.push(rev);
            added = true;
            attachedReviewsCount++;
          }
        }
        if (added) {
          const totalRating = mongoProduct.reviews.reduce((acc, curr) => acc + curr.rating, 0);
          mongoProduct.reviewsCount = mongoProduct.reviews.length;
          mongoProduct.rating = Math.round((totalRating / mongoProduct.reviews.length) * 10) / 10;
          await mongoProduct.save();
        }
      }
    }

    console.log(`✅ Successfully attached ${attachedReviewsCount} product reviews to MongoDB!`);

    console.log("\n==================================================");
    console.log("🎉 SMART MIGRATION COMPLETED SUCCESSFULLY!");
    console.log("==================================================");
  } catch (error) {
    console.error("Migration Error:", error);
  } finally {
    await mysqlConn.end();
    await mongoose.disconnect();
    process.exit(0);
  }
}

migrateWordPress();
