const mysql = require("mysql2/promise");
const mongoose = require("mongoose");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "../.env") });

const Order = require("../models/Order");
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

async function migrateOrders() {
  console.log("==================================================");
  console.log("🚀 Complete WooCommerce Orders (8,573) -> MongoDB Migration");
  console.log("==================================================");

  console.log("Connecting to MongoDB:", process.env.MONGO_URI);
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB:", mongoose.connection.name);

  console.log("Connecting to MySQL database:", MYSQL_CONFIG.database);
  const mysqlConn = await mysql.createConnection(MYSQL_CONFIG);
  console.log("Connected to MySQL!");

  try {
    // ── 1. Pre-fetch Mongo Products Map ───────────────────────────────────────
    console.log("⚡ [1/6] Pre-fetching Mongo products...");
    const mongoProducts = await Product.find({}).select("_id name price image").lean();
    const productMapByTitle = new Map();
    for (const p of mongoProducts) {
      productMapByTitle.set(p.name.toLowerCase().trim(), p);
    }
    console.log(`Loaded ${mongoProducts.length} MongoDB products.`);

    // ── 2. Pre-fetch WP Product Titles Map ────────────────────────────────────
    console.log("⚡ [2/6] Pre-fetching MySQL Product Titles...");
    const [wpProducts] = await mysqlConn.query(`SELECT ID, post_title FROM wp_posts WHERE post_type = 'product'`);
    const wpIdToTitleMap = new Map();
    for (const p of wpProducts) {
      wpIdToTitleMap.set(p.ID, String(p.post_title || "").trim());
    }
    console.log(`Loaded ${wpIdToTitleMap.size} MySQL product titles.`);

    // ── 3. Pre-fetch WP Coupon Titles Map ─────────────────────────────────────
    console.log("⚡ [3/6] Pre-fetching MySQL Coupons...");
    const [couponLookup] = await mysqlConn.query(`
      SELECT cl.order_id, cl.discount_amount, p.post_title AS coupon_code
      FROM wp_wc_order_coupon_lookup cl
      LEFT JOIN wp_posts p ON cl.coupon_id = p.ID
    `);
    const couponMap = new Map();
    for (const c of couponLookup) {
      couponMap.set(c.order_id, {
        code: String(c.coupon_code || "DISCOUNT").trim().toUpperCase(),
        discount: Number(c.discount_amount || 0)
      });
    }
    console.log(`Loaded coupons for ${couponMap.size} orders.`);

    // ── 4. Pre-fetch Operational Data (Paid/Completed Dates) ──────────────────
    console.log("⚡ [4/6] Pre-fetching operational data (dates/discounts)...");
    const [opRows] = await mysqlConn.query(`
      SELECT order_id, date_paid_gmt, date_completed_gmt, discount_total_amount
      FROM wp_wc_order_operational_data
    `);
    const opMap = new Map();
    for (const op of opRows) {
      opMap.set(op.order_id, op);
    }
    console.log(`Loaded operational data for ${opMap.size} orders.`);

    // ── 5. Pre-fetch Order Line Items ─────────────────────────────────────────
    console.log("⚡ [5/6] Pre-fetching 11,626 order line items from MySQL...");
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

    // ── 6. Pre-fetch All Order Postmeta ───────────────────────────────────────
    console.log("⚡ [6/6] Pre-fetching postmeta for all 8,573 orders...");
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

    // ── 7. Ensure All Customer Emails Have A MongoDB User Account ─────────────
    console.log("\n👤 Upserting User Accounts for Guest Checkout Buyers...");
    const [orderPosts] = await mysqlConn.query(`
      SELECT ID, post_status, post_date_gmt, post_date
      FROM wp_posts
      WHERE post_type = 'shop_order'
    `);

    const userOps = [];
    for (const oPost of orderPosts) {
      const meta = orderMetaMap.get(oPost.ID) || {};
      const email = String(meta._billing_email || "").trim().toLowerCase();
      if (!email || !email.includes("@")) continue;

      const name = `${meta._billing_first_name || ""} ${meta._billing_last_name || ""}`.trim() || "Sanskrit Learner";
      const phone = String(meta._billing_phone || "").trim();

      userOps.push({
        updateOne: {
          filter: { email: email },
          update: {
            $setOnInsert: {
              name: name,
              email: email,
              password: "$2a$10$dummyLegacyImportedPasswordHashDoNotUseDirectly",
              role: "customer",
              phone: phone,
              createdAt: oPost.post_date_gmt ? new Date(oPost.post_date_gmt) : new Date()
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
    console.log(`✅ Ensured User profiles exist for all customer emails.`);

    // Re-fetch all Mongo User IDs mapped by email
    const mongoUsers = await User.find({}).select("_id email").lean();
    const userMapByEmail = new Map();
    for (const u of mongoUsers) {
      if (u.email) {
        userMapByEmail.set(u.email.toLowerCase().trim(), u._id);
      }
    }

    // ── 8. Execute Complete Order Migration ──────────────────────────────────
    console.log(`\n🛍️ Processing and Migrating ${orderPosts.length} WooCommerce Orders...`);

    const orderOps = [];

    for (const oPost of orderPosts) {
      const wpOrderId = oPost.ID;
      const legacyRef = `WP-ORDER-${wpOrderId}`;
      const meta = orderMetaMap.get(wpOrderId) || {};
      const op = opMap.get(wpOrderId) || {};
      const coupon = couponMap.get(wpOrderId) || {};

      const email = String(meta._billing_email || "").trim().toLowerCase();
      const userId = userMapByEmail.get(email) || null;

      const { status, paymentStatus, refundStatus } = mapWpStatus(oPost.post_status);

      const billingName = `${meta._billing_first_name || ""} ${meta._billing_last_name || ""}`.trim();
      const billingAddress = [meta._billing_address_1, meta._billing_address_2].filter(Boolean).join(", ");
      const billing = {
        name: billingName || "Customer",
        phone: String(meta._billing_phone || "").trim(),
        email: email,
        address: billingAddress,
        city: String(meta._billing_city || "").trim(),
        state: String(meta._billing_state || "").trim(),
        pincode: String(meta._billing_postcode || "").trim(),
        country: String(meta._billing_country || "IN").trim()
      };

      const shippingName = `${meta._shipping_first_name || meta._billing_first_name || ""} ${meta._shipping_last_name || meta._billing_last_name || ""}`.trim();
      const shippingAddress = [meta._shipping_address_1 || meta._billing_address_1, meta._shipping_address_2 || meta._billing_address_2].filter(Boolean).join(", ");
      const shipping = {
        name: shippingName || billing.name,
        phone: String(meta._shipping_phone || meta._billing_phone || "").trim(),
        email: email,
        address: shippingAddress || billing.address,
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
          product: mongoP ? mongoP._id : new mongoose.Types.ObjectId(),
          name: mongoP ? mongoP.name : (wpTitle || `WooCommerce Product #${rawItem.product_id}`),
          price: qty > 0 ? Math.round((price / qty) * 100) / 100 : price,
          quantity: qty,
          image: mongoP ? mongoP.image : ""
        });
      }

      const totalAmount = Number(meta._order_total || 0);
      const taxAmount = Number(meta._order_tax || 0);
      const shippingAmount = Number(meta._order_shipping || 0);
      const discountAmount = Number(op.discount_total_amount || coupon.discount || meta._cart_discount || 0);
      const couponCode = coupon.code || String(meta._coupon_code || "").trim().toUpperCase();

      // Fallback line item for orders missing in lookup table
      if (items.length === 0) {
        items.push({
          product: new mongoose.Types.ObjectId(),
          name: `WooCommerce Order #${wpOrderId}`,
          price: totalAmount,
          quantity: 1,
          image: ""
        });
      }

      const subtotal = Math.max(0, totalAmount - taxAmount - shippingAmount + discountAmount);
      const orderDate = oPost.post_date_gmt ? new Date(oPost.post_date_gmt) : (oPost.post_date ? new Date(oPost.post_date) : new Date());

      const paidAt = op.date_paid_gmt ? new Date(op.date_paid_gmt) : (paymentStatus === "Paid" ? orderDate : null);
      const deliveredAt = op.date_completed_gmt ? new Date(op.date_completed_gmt) : (status === "Delivered" ? orderDate : null);

      orderOps.push({
        updateOne: {
          filter: { "paymentMeta.razorpayOrderId": legacyRef },
          update: {
            $set: {
              user: userId,
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
              billing: billing,
              shipping: shipping,
              deliveredAt: deliveredAt,
              shippedAt: status === "Delivered" || status === "Shipped" ? orderDate : null,
              currencyDisplay: {
                currency: String(meta._order_currency || "INR").trim().toUpperCase(),
                amount: totalAmount,
                detectedCountry: String(shipping.country || "IN").trim()
              },
              paymentMeta: {
                razorpayOrderId: legacyRef,
                razorpayPaymentId: String(meta._transaction_id || "").trim(),
                paidAt: paidAt
              },
              createdAt: orderDate,
              updatedAt: orderDate
            }
          },
          upsert: true
        }
      });
    }

    console.log(`Prepared ${orderOps.length} bulk upsert operations for MongoDB.`);

    for (let i = 0; i < orderOps.length; i += 1000) {
      const chunk = orderOps.slice(i, i + 1000);
      await Order.bulkWrite(chunk);
      console.log(`Migrated ${Math.min(i + 1000, orderOps.length)} / ${orderOps.length} orders...`);
    }

    console.log("\n==================================================");
    console.log(`🎉 COMPLETE ORDER MIGRATION FINISHED FOR ${orderOps.length} ORDERS!`);
    console.log("==================================================");
  } catch (error) {
    console.error("Migration Error:", error);
  } finally {
    await mysqlConn.end();
    await mongoose.disconnect();
    process.exit(0);
  }
}

migrateOrders();
