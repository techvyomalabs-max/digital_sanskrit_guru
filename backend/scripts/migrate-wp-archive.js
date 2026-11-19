const mysql = require("mysql2/promise");
const mongoose = require("mongoose");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "../.env") });

const WpOrder = require("../models/WpOrder");
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

function mapWpStatus(wpStatus) {
  const s = String(wpStatus || "").toLowerCase();
  if (s.includes("completed")) return { status: "Delivered", paymentStatus: "Paid" };
  if (s.includes("processing")) return { status: "Pending", paymentStatus: "Paid" };
  if (s.includes("refunded")) return { status: "Cancelled", paymentStatus: "Paid", refundStatus: "Refunded" };
  if (s.includes("cancelled") || s.includes("failed")) return { status: "Cancelled", paymentStatus: "Failed" };
  return { status: "Pending", paymentStatus: "Pending" };
}

async function migrateWpArchive() {
  console.log("==================================================");
  console.log("🚀 Populating Dedicated WpOrder Archive Collection");
  console.log("==================================================");

  console.log("Connecting to MongoDB:", process.env.MONGO_URI);
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB:", mongoose.connection.name);

  console.log("Connecting to MySQL database:", MYSQL_CONFIG.database);
  const mysqlConn = await mysql.createConnection(MYSQL_CONFIG);
  console.log("Connected to MySQL!");

  try {
    // ── 1. Pre-fetch Mongo Products Map ───────────────────────────────────────
    console.log("⚡ [1/5] Pre-fetching Mongo products...");
    const mongoProducts = await Product.find({}).select("_id name price image wpProductId").lean();
    const productMapByTitle = new Map();
    for (const p of mongoProducts) {
      productMapByTitle.set(p.name.toLowerCase().trim(), p);
    }
    console.log(`Loaded ${mongoProducts.length} MongoDB products.`);

    // ── 2. Pre-fetch WP Product Titles Map ────────────────────────────────────
    console.log("⚡ [2/5] Pre-fetching MySQL Product Titles...");
    const [wpProducts] = await mysqlConn.query(`SELECT ID, post_title FROM wp_posts WHERE post_type = 'product'`);
    const wpIdToTitleMap = new Map();
    for (const p of wpProducts) {
      wpIdToTitleMap.set(p.ID, String(p.post_title || "").trim());
    }
    console.log(`Loaded ${wpIdToTitleMap.size} MySQL product titles.`);

    // ── 3. Pre-fetch Mongo Users Map ──────────────────────────────────────────
    console.log("⚡ [3/5] Pre-fetching Mongo users by email...");
    const mongoUsers = await User.find({}).select("_id email").lean();
    const userMapByEmail = new Map();
    for (const u of mongoUsers) {
      if (u.email) {
        userMapByEmail.set(u.email.toLowerCase().trim(), u._id);
      }
    }
    console.log(`Loaded ${mongoUsers.length} MongoDB users.`);

    // ── 4. Pre-fetch Order Line Items ─────────────────────────────────────────
    console.log("⚡ [4/5] Pre-fetching 11,626 order line items from MySQL...");
    const [itemRows] = await mysqlConn.query(`
      SELECT order_id, product_id, product_qty, product_net_revenue, product_gross_revenue
      FROM wp_wc_order_product_lookup
    `);
    const orderItemsMap = new Map();
    for (const item of itemRows) {
      if (!orderItemsMap.has(item.order_id)) {
        orderItemsMap.set(item.order_id, []);
      }
      orderItemsMap.get(item.order_id).push(item);
    }
    console.log(`Loaded line items for ${orderItemsMap.size} unique orders.`);

    // ── 5. Pre-fetch All Order Postmeta ───────────────────────────────────────
    console.log("⚡ [5/5] Pre-fetching postmeta for all orders...");
    const [orderMetaRows] = await mysqlConn.query(`
      SELECT post_id, meta_key, meta_value 
      FROM wp_postmeta 
      WHERE post_id IN (SELECT ID FROM wp_posts WHERE post_type = 'shop_order')
    `);

    const orderMetaMap = new Map();
    for (const m of orderMetaRows) {
      if (!orderMetaMap.has(m.post_id)) {
        orderMetaMap.set(m.post_id, {});
      }
      orderMetaMap.get(m.post_id)[m.meta_key] = m.meta_value;
    }
    console.log(`Loaded metadata for ${orderMetaMap.size} orders.`);

    // ── 6. Execute Bulk Upsert into WpOrder Collection ────────────────────────
    console.log("\n📦 Migrating 8,573 WooCommerce Orders to WpOrder collection...");
    const [orderPosts] = await mysqlConn.query(`
      SELECT ID, post_status, post_date_gmt, post_date
      FROM wp_posts
      WHERE post_type = 'shop_order'
    `);

    const archiveOps = [];

    for (const oPost of orderPosts) {
      const wpOrderId = oPost.ID;
      const meta = orderMetaMap.get(wpOrderId) || {};

      const email = String(meta._billing_email || "").trim().toLowerCase();
      const userId = userMapByEmail.get(email) || null;

      const { status, paymentStatus, refundStatus } = mapWpStatus(oPost.post_status);

      const billingName = `${meta._billing_first_name || ""} ${meta._billing_last_name || ""}`.trim() || "Customer";
      const billingAddress = [meta._billing_address_1, meta._billing_address_2].filter(Boolean).join(", ");
      const billing = {
        name: billingName,
        phone: String(meta._billing_phone || "").trim(),
        email: email,
        address: billingAddress,
        city: String(meta._billing_city || "").trim(),
        state: String(meta._billing_state || "").trim(),
        pincode: String(meta._billing_postcode || "").trim(),
        country: String(meta._billing_country || "IN").trim()
      };

      const shippingName = `${meta._shipping_first_name || meta._billing_first_name || ""} ${meta._shipping_last_name || meta._billing_last_name || ""}`.trim() || billingName;
      const shippingAddress = [meta._shipping_address_1 || meta._billing_address_1, meta._shipping_address_2 || meta._billing_address_2].filter(Boolean).join(", ");
      const shipping = {
        name: shippingName,
        phone: String(meta._shipping_phone || meta._billing_phone || "").trim(),
        email: email,
        address: shippingAddress || billingAddress,
        city: String(meta._shipping_city || meta._billing_city || "").trim(),
        state: String(meta._shipping_state || meta._billing_state || "").trim(),
        pincode: String(meta._shipping_postcode || meta._billing_postcode || "").trim(),
        country: String(meta._shipping_country || meta._billing_country || "IN").trim()
      };

      const rawItems = orderItemsMap.get(wpOrderId) || [];
      const items = [];

      for (const rawItem of rawItems) {
        const wpTitle = wpIdToTitleMap.get(rawItem.product_id) || "";
        const mongoP = wpTitle ? productMapByTitle.get(wpTitle.toLowerCase().trim()) : null;

        const price = Number(rawItem.product_gross_revenue || rawItem.product_net_revenue || 0);
        const qty = Number(rawItem.product_qty || 1);

        items.push({
          product: mongoP ? mongoP._id : null,
          wpProductId: rawItem.product_id,
          name: mongoP ? mongoP.name : (wpTitle || `WooCommerce Product #${rawItem.product_id}`),
          price: qty > 0 ? Math.round((price / qty) * 100) / 100 : price,
          quantity: qty,
          image: mongoP ? mongoP.image : "",
          isDigital: mongoP ? Boolean(mongoP.isDigital) : false
        });
      }

      const totalAmount = Number(meta._order_total || 0);
      const taxAmount = Number(meta._order_tax || 0);
      const shippingAmount = Number(meta._order_shipping || 0);
      const discountAmount = Number(meta._cart_discount || 0);
      const couponCode = String(meta._coupon_code || "").trim().toUpperCase();

      if (items.length === 0) {
        items.push({
          product: null,
          wpProductId: null,
          name: `WooCommerce Order #${wpOrderId}`,
          price: totalAmount,
          quantity: 1,
          image: "",
          isDigital: false
        });
      }

      const subtotal = Math.max(0, totalAmount - taxAmount - shippingAmount + discountAmount);
      const orderDate = oPost.post_date_gmt ? new Date(oPost.post_date_gmt) : (oPost.post_date ? new Date(oPost.post_date) : new Date());

      archiveOps.push({
        updateOne: {
          filter: { wpOrderId: wpOrderId },
          update: {
            $set: {
              wpOrderId: wpOrderId,
              user: userId,
              billingEmail: email,
              billingName: billingName,
              billingPhone: String(meta._billing_phone || "").trim(),
              items: items,
              subtotal: subtotal,
              total: totalAmount,
              gstAmount: taxAmount,
              deliveryCharge: shippingAmount,
              discount: discountAmount,
              couponCode: couponCode,
              status: status,
              paymentStatus: paymentStatus,
              paymentMethod: String(meta._payment_method || "Razorpay").trim(),
              refundStatus: refundStatus || "Not Applicable",
              transactionId: String(meta._transaction_id || "").trim(),
              billing: billing,
              shipping: shipping,
              currencyDisplay: {
                currency: String(meta._order_currency || "INR").trim().toUpperCase(),
                amount: totalAmount,
                detectedCountry: String(shipping.country || "IN").trim()
              },
              wpCreatedAt: orderDate,
              wpPaidAt: paymentStatus === "Paid" ? orderDate : null,
              wpDeliveredAt: status === "Delivered" ? orderDate : null
            }
          },
          upsert: true
        }
      });
    }

    console.log(`Prepared ${archiveOps.length} operations for WpOrder collection.`);

    for (let i = 0; i < archiveOps.length; i += 1000) {
      const chunk = archiveOps.slice(i, i + 1000);
      await WpOrder.bulkWrite(chunk);
      console.log(`Archived ${Math.min(i + 1000, archiveOps.length)} / ${archiveOps.length} orders...`);
    }

    console.log("\n==================================================");
    console.log(`🎉 SUCCESSFULLY POPULATED ${archiveOps.length} WP ARCHIVE ORDERS!`);
    console.log("==================================================");
  } catch (error) {
    console.error("Migration Error:", error);
  } finally {
    await mysqlConn.end();
    await mongoose.disconnect();
    process.exit(0);
  }
}

migrateWpArchive();
