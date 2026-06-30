/**
 * email.js — Nodemailer wrapper with HTML templates.
 *
 * EMAIL_ENABLED=false in .env means emails are logged but not actually sent.
 * Set EMAIL_ENABLED=true and fill in SMTP_* vars to activate live sending.
 */

const nodemailer = require("nodemailer");
const EmailLog = require("../models/EmailLog");

const EMAIL_ENABLED = String(process.env.EMAIL_ENABLED || "false").toLowerCase() === "true";
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "").trim();
const SITE_NAME = "Digital Sanskrit Guru";
const SITE_COLOR = "#1a1a2e";
const ACCENT_COLOR = "#e94560";

// ── Transporter ──────────────────────────────────────────────────────────────

let transporter = null;

async function getTransporter() {
  if (transporter) return transporter;

  let host = process.env.SMTP_HOST || "smtp.gmail.com";
  let tlsOptions = {};

  if (host === "smtp.gmail.com") {
    try {
      const dns = require("dns").promises;
      const addresses = await dns.resolve4(host);
      if (addresses && addresses.length > 0) {
        host = addresses[0];
        tlsOptions = { servername: "smtp.gmail.com" };
        console.log(`[Email] Resolved smtp.gmail.com to IPv4: ${host}`);
      }
    } catch (err) {
      console.error("[Email] Failed to resolve SMTP host IPv4:", err.message);
    }
  }

  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: {
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || ""
    },
    tls: tlsOptions
  });
  return transporter;
}

// ── Core send function ────────────────────────────────────────────────────────

async function sendEmail({ to, subject, html, type = "campaign", orderId = "", productId = "" }) {
  const logEntry = { to, subject, type, orderId, productId, status: "sent", error: "" };

  try {
    if (!EMAIL_ENABLED) {
      console.log(`[Email DISABLED] Would send "${subject}" to ${to}`);
      await EmailLog.create({ ...logEntry, status: "sent" });
      return { skipped: true };
    }

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.warn("[Email] SMTP credentials not configured.");
      await EmailLog.create({ ...logEntry, status: "failed", error: "SMTP not configured" });
      return { skipped: true };
    }

    const transporterInstance = await getTransporter();
    const info = await transporterInstance.sendMail({
      from: `"${SITE_NAME}" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html
    });

    await EmailLog.create({ ...logEntry, status: "sent" });
    return { messageId: info.messageId };
  } catch (err) {
    console.error("[Email] Send failed:", err.message);
    try {
      await EmailLog.create({ ...logEntry, status: "failed", error: String(err.message || "").slice(0, 500) });
    } catch {
      // Ignore log write failure
    }
    return { error: err.message };
  }
}

// ── HTML email wrapper ────────────────────────────────────────────────────────

function htmlWrapper(title, bodyHtml, headerBgColor, accentColor, headerText, headerSubtext) {
  const headerBg = headerBgColor || SITE_COLOR;
  const accent = accentColor || ACCENT_COLOR;
  const headerTitle = headerText || SITE_NAME;
  const headerSub = headerSubtext || "Spreading the wisdom of Sanskrit";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background: #f5f5f5; font-family: 'Segoe UI', Arial, sans-serif; color: #333; }
    .wrapper { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .header { background: ${headerBg}; padding: 28px 32px; text-align: center; }
    .header h1 { margin: 0; color: #fff; font-size: 22px; letter-spacing: 1px; }
    .header p { margin: 6px 0 0; color: rgba(255,255,255,0.7); font-size: 13px; }
    .body { padding: 32px; }
    .body h2 { margin-top: 0; font-size: 20px; color: ${headerBg}; }
    .body p { line-height: 1.7; color: #555; }
    .cta { display: inline-block; margin: 20px 0; padding: 12px 28px; background: ${accent}; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; }
    .badge-pending { background: #fff3cd; color: #856404; }
    .badge-shipped { background: #d1ecf1; color: #0c5460; }
    .badge-delivered { background: #d4edda; color: #155724; }
    .badge-cancelled { background: #f8d7da; color: #721c24; }
    .badge-low { background: #fff3cd; color: #856404; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    td, th { padding: 10px 12px; border: 1px solid #eee; text-align: left; font-size: 14px; }
    th { background: #f8f9fa; color: #333; }
    .footer { background: #f8f9fa; padding: 20px 32px; text-align: center; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>${headerTitle}</h1>
      <p>${headerSub}</p>
    </div>
    <div class="body">
      ${bodyHtml}
    </div>
    <div class="footer">
      <p>You received this email because you have an account at ${headerTitle}.</p>
      <p>&copy; ${new Date().getFullYear()} ${headerTitle}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}

// ── Transactional templates ──────────────────────────────────────────────────

function buildOrderItemsTable(items = []) {
  if (!items.length) return "";
  const rows = items.map((item) => {
    let bundleHtml = "";
    if (item.productType === "bundle" && Array.isArray(item.bundleItems) && item.bundleItems.length > 0) {
      bundleHtml = `<div style="margin-top: 4px; padding-left: 8px; border-left: 2px solid #ccc; font-size: 12px; color: #555;">
        <strong>Pack Includes:</strong>
        <ul style="margin: 2px 0 0 0; padding: 0 0 0 12px;">
          ${item.bundleItems.map(bi => `<li>${bi.name} (Qty: ${bi.quantity * (item.quantity || 1)})</li>`).join("")}
        </ul>
      </div>`;
    }
    return `<tr>
      <td>
        <strong>${String(item.name || "Product")}</strong>
        ${bundleHtml}
      </td>
      <td style="text-align:center">${Number(item.quantity || 1)}</td>
      <td style="text-align:right">${item.currency || "INR"} ${Number(item.price || 0).toFixed(2)}</td>
    </tr>`;
  }).join("");
  return `
    <table>
      <thead><tr><th>Product</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

async function sendOrderConfirmation(order, user) {
  const to = String(user?.email || "").trim().toLowerCase();
  if (!to) return;

  const StoreSettings = require("../models/StoreSettings");

  let subject = `Order Confirmed — ${SITE_NAME}`;
  let body = "";
  let headerBgColor = "";
  let accentColor = "";
  let headerText = "";
  let headerSubtext = "";

  try {
    const settings = await StoreSettings.findOne().lean();
    if (settings && settings.orderConfirmationEmail) {
      const emailConfig = settings.orderConfirmationEmail;
      subject = emailConfig.subjectTemplate || subject;
      body = emailConfig.bodyTemplate || body;
      headerBgColor = emailConfig.headerBgColor;
      accentColor = emailConfig.accentColor;
      headerText = emailConfig.headerText;
      headerSubtext = emailConfig.headerSubtext;
    }
  } catch (err) {
    console.error("[Email] Failed to load settings for order confirmation:", err);
  }

  const userName = String(user?.name || "Customer");
  const orderId = String(order._id || "").slice(-8).toUpperCase();
  const rawOrderId = String(order._id || "");
  const orderTotal = `${order.currencyDisplay?.currency || "INR"} ${Number(order.total || 0).toFixed(2)}`;

  const itemsTableHtml = buildOrderItemsTable(order.items || []);
  const summaryTableHtml = `
    <table>
      <tr><td>Subtotal</td><td style="text-align:right">${order.currencyDisplay?.currency || "INR"} ${Number(order.subtotal || 0).toFixed(2)}</td></tr>
      <tr><td>GST (${Number(order.gstPercent || 0)}%)</td><td style="text-align:right">${order.currencyDisplay?.currency || "INR"} ${Number(order.gstAmount || 0).toFixed(2)}</td></tr>
      <tr><td>Delivery</td><td style="text-align:right">${order.currencyDisplay?.currency || "INR"} ${Number(order.deliveryCharge || 0).toFixed(2)}</td></tr>
      ${Number(order.discount || 0) > 0 ? `<tr><td>Discount</td><td style="text-align:right">- ${order.currencyDisplay?.currency || "INR"} ${Number(order.discount || 0).toFixed(2)}</td></tr>` : ""}
      <tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${order.currencyDisplay?.currency || "INR"} ${Number(order.total || 0).toFixed(2)}</strong></td></tr>
    </table>`;
  const shippingInfoHtml = `${String(order.shipping?.name || "")} — ${String(order.shipping?.address || "")}, ${String(order.shipping?.city || "")}, ${String(order.shipping?.state || "")} ${String(order.shipping?.pincode || "")}`;

  let substitutedSubject = subject;
  let substitutedBody = body || `
    <h2>Thank you for your order! 🎉</h2>
    <p>Hi <strong>{{USER_NAME}}</strong>,</p>
    <p>Your order has been placed successfully. We'll notify you when it ships.</p>
    <p><strong>Order ID:</strong> {{ORDER_ID}}</p>
    <h3>Order Details:</h3>
    {{ITEMS_TABLE}}
    {{SUMMARY_TABLE}}
    <p><strong>Shipping to:</strong><br/>
    {{SHIPPING_INFO}}
    </p>
  `;

  const tags = {
    "{{USER_NAME}}": userName,
    "{{ORDER_ID}}": orderId,
    "{{FULL_ORDER_ID}}": rawOrderId,
    "{{SITE_NAME}}": SITE_NAME,
    "{{ORDER_TOTAL}}": orderTotal,
    "{{ITEMS_TABLE}}": itemsTableHtml,
    "{{SUMMARY_TABLE}}": summaryTableHtml,
    "{{SHIPPING_INFO}}": shippingInfoHtml
  };

  Object.entries(tags).forEach(([tag, val]) => {
    substitutedSubject = substitutedSubject.replaceAll(tag, val);
    substitutedBody = substitutedBody.replaceAll(tag, val);
  });

  if (!substitutedBody.includes("/#/my-orders")) {
    substitutedBody += `\n<a class="cta" href="${process.env.SITE_URL || "http://localhost:5173"}/#/my-orders">View My Orders</a>`;
  }

  const html = htmlWrapper("Order Confirmed", substitutedBody, headerBgColor, accentColor, headerText, headerSubtext);

  return sendEmail({
    to,
    subject: substitutedSubject,
    html,
    type: "order-confirm",
    orderId: String(order._id || "")
  });
}

async function sendOrderStatusUpdate(order, user, newStatus) {
  const to = String(user?.email || "").trim().toLowerCase();
  if (!to) return;

  const statusMessages = {
    Shipped: { emoji: "🚚", title: "Your order has shipped!", body: "Your order is on its way and will reach you soon." },
    Delivered: { emoji: "✅", title: "Order delivered!", body: "Your order has been delivered. We hope you love it!" },
    Cancelled: { emoji: "❌", title: "Order cancelled", body: "Your order has been cancelled." + (String(order.paymentStatus || "") === "Paid" ? " A refund will be processed shortly." : "") }
  };

  const info = statusMessages[newStatus] || { emoji: "📦", title: `Order status: ${newStatus}`, body: `Your order status has been updated to ${newStatus}.` };
  const badgeClass = `badge-${newStatus.toLowerCase()}`;

  const html = htmlWrapper(info.title, `
    <h2>${info.emoji} ${info.title}</h2>
    <p>Hi <strong>${String(user?.name || "Customer")}</strong>,</p>
    <p>${info.body}</p>
    <p>
      <strong>Order ID:</strong> ${String(order._id || "").slice(-8).toUpperCase()}&nbsp;&nbsp;
      <span class="badge ${badgeClass}">${newStatus}</span>
    </p>
    ${buildOrderItemsTable(order.items || [])}
    <a class="cta" href="${process.env.SITE_URL || "http://localhost:5173"}/#/my-orders">View My Orders</a>
  `);

  return sendEmail({
    to,
    subject: `${info.emoji} Order ${newStatus} — ${SITE_NAME}`,
    html,
    type: "status-update",
    orderId: String(order._id || "")
  });
}

async function sendLowStockAdminAlert(products) {
  if (!ADMIN_EMAIL) return;
  const rows = products.map((p) =>
    `<tr>
      <td>${String(p.name || "")}</td>
      <td><span class="badge badge-low">${Number(p.stock || 0)} left</span></td>
      <td>${String(p.category || "")}</td>
      <td>${p.wishlistCount > 0 ? `<strong>${p.wishlistCount} user(s) have wishlisted this</strong>` : "—"}</td>
    </tr>`
  ).join("");

  const html = htmlWrapper("Low Stock Alert", `
    <h2>⚠️ Low Stock Alert</h2>
    <p>The following products are running low on stock:</p>
    <table>
      <thead><tr><th>Product</th><th>Stock</th><th>Category</th><th>Wishlisted By</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p>Please restock these items to avoid lost sales.</p>
    <a class="cta" href="${process.env.SITE_URL || "http://localhost:5173"}/#/admin/products">Go to Warehouse</a>
  `);

  return sendEmail({
    to: ADMIN_EMAIL,
    subject: `⚠️ Low Stock Alert — ${products.length} product(s) — ${SITE_NAME}`,
    html,
    type: "low-stock-admin"
  });
}

async function sendWishlistLowStockAlert(user, products) {
  const to = String(user?.email || "").trim().toLowerCase();
  if (!to) return;

  const rows = products.map((p) =>
    `<tr>
      <td>${String(p.name || "")}</td>
      <td><span class="badge badge-low">Only ${Number(p.stock || 0)} left!</span></td>
      <td>${String(p.category || "")}</td>
    </tr>`
  ).join("");

  const html = htmlWrapper("Items in Your Wishlist Are Running Low", `
    <h2>🔔 Items in Your Wishlist Are Running Low!</h2>
    <p>Hi <strong>${String(user?.name || "Customer")}</strong>,</p>
    <p>Some products you've saved in your wishlist are running low on stock. Don't miss out!</p>
    <table>
      <thead><tr><th>Product</th><th>Stock</th><th>Category</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <a class="cta" href="${process.env.SITE_URL || "http://localhost:5173"}/#/wishlist">View My Wishlist</a>
  `);

  return sendEmail({
    to,
    subject: `🔔 Items in your wishlist are running low — ${SITE_NAME}`,
    html,
    type: "wishlist-alert"
  });
}

async function sendBroadcastEmail({ subject, html, recipients = [] }) {
  const results = [];
  for (const recipient of recipients) {
    const to = String(recipient?.email || recipient || "").trim().toLowerCase();
    if (!to) continue;
    const result = await sendEmail({ to, subject, html, type: "broadcast" });
    results.push({ to, ...result });
  }
  return results;
}

async function sendTestEmail(to) {
  const html = htmlWrapper("Test Email", `
    <h2>✅ Email is working!</h2>
    <p>This is a test email from <strong>${SITE_NAME}</strong>.</p>
    <p>If you received this, your email configuration is correct.</p>
  `);
  return sendEmail({ to, subject: `Test Email — ${SITE_NAME}`, html, type: "test" });
}

module.exports = {
  sendEmail,
  sendOrderConfirmation,
  sendOrderStatusUpdate,
  sendLowStockAdminAlert,
  sendWishlistLowStockAlert,
  sendBroadcastEmail,
  sendTestEmail
};
