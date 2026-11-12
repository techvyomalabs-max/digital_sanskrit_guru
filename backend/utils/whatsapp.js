const axios = require("axios");
const StoreSettings = require("../models/StoreSettings");
const { isDigitalLikeItem } = require("./accessFulfilment");

// Meta Graph API version. Override with WHATSAPP_GRAPH_VERSION when Meta retires this one.
const GRAPH_API_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v23.0";
// Language code the templates were created with in WhatsApp Manager ("English" = "en").
const TEMPLATE_LANGUAGE = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en";

// Template names as created in WhatsApp Manager.
const TEMPLATES = Object.freeze({
  orderConfirmation: "order_confirmation",
  orderShipped: "order_shipped",
  orderDelivered: "order_delivered",
  orderCancelled: "order_cancelled",
  digitalAccessReady: "digital_access_ready",
  otp: "auth_otp"
});

const IS_PROD = process.env.NODE_ENV === "production";
const DEV_LOG = !IS_PROD && process.env.WHATSAPP_OTP_DEV_LOG === "true";
const maskPhone = (p) => (p ? `${"*".repeat(Math.max(0, p.length - 4))}${p.slice(-4)}` : "");

/**
 * Clean phone number for WhatsApp Graph API (must include country code without + or spaces)
 */
function formatWhatsAppNumber(phone, defaultCountry = "91") {
  if (!phone) return "";
  let cleaned = String(phone).replace(/\D/g, "");
  if (cleaned.length === 10) {
    cleaned = defaultCountry + cleaned;
  }
  return cleaned;
}

/** Cloud API settings from the admin panel, or null when order messages are off or not configured. */
async function getOrderMessagingSettings() {
  const settings = await StoreSettings.findOne().lean();
  const ws = settings?.whatsappSettings || {};
  if (ws.mode !== "api" || !ws.autoSendOrderConfirmation) return null;
  if (!ws.metaPhoneNumberId || !ws.metaAccessToken) return null;
  return ws;
}

function orderRecipient(order, user) {
  return formatWhatsAppNumber(
    order?.shipping?.phone || order?.billing?.phone || order?.userPhone || user?.phone || ""
  );
}

function customerName(order, user) {
  return String(user?.name || order?.shipping?.name || order?.billing?.name || order?.userName || "Customer").trim() || "Customer";
}

/** Same short order code the emails use. */
function orderCode(order) {
  return String(order?._id || "").slice(-8).toUpperCase();
}

function isDigitalOnlyOrder(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  return items.length > 0 && items.every(isDigitalLikeItem);
}

function formatAmount(order) {
  const total = Number(order?.total || 0);
  const text = Number.isInteger(total) ? String(total) : total.toFixed(2);
  return `₹${text}`;
}

// Meta rejects empty or multi-line template parameters.
const param = (value) => ({ type: "text", text: String(value ?? "").replace(/\s+/g, " ").trim() || "-" });

function graphUrl(ws, path) {
  return `https://graph.facebook.com/${GRAPH_API_VERSION}/${ws.metaPhoneNumberId}/${path}`;
}

/** Upload a PDF to Meta and return its media id. */
async function uploadPdf(ws, buffer, filename) {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "application/pdf");
  form.append("file", new Blob([buffer], { type: "application/pdf" }), filename);
  const res = await axios.post(graphUrl(ws, "media"), form, {
    headers: { Authorization: `Bearer ${ws.metaAccessToken}` },
    timeout: 20000
  });
  return res.data?.id;
}

/** The order's GST invoice as a PDF, built the same way as the email attachment. */
async function buildInvoicePdf(order, user) {
  const { generateInvoicePdfBuffer } = require("./invoicePdfGenerator");
  let seller = (order?.sellerDetails && String(order.sellerDetails.gstin || "").trim()) ? order.sellerDetails : null;
  if (!seller) {
    const settings = await StoreSettings.findOne().select("businessDetails").lean();
    seller = settings?.businessDetails || null;
  }
  const buffer = await generateInvoicePdfBuffer(order, user, seller);
  const filename = `${String(order.invoiceNumber || `Tax-Invoice-${orderCode(order)}`).replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`;
  return { buffer, filename };
}

/**
 * Send one approved template. `document` ({ id, filename }) fills a Document header.
 * Throws on failure so callers can log Meta's error.
 */
async function sendTemplate(ws, { to, name, bodyParams = [], document = null }) {
  const components = [];
  if (document?.id) {
    components.push({
      type: "header",
      parameters: [{ type: "document", document: { id: document.id, filename: document.filename } }]
    });
  }
  if (bodyParams.length) {
    components.push({ type: "body", parameters: bodyParams.map(param) });
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: { name, language: { code: TEMPLATE_LANGUAGE }, components }
  };

  const res = await axios.post(graphUrl(ws, "messages"), payload, {
    headers: { Authorization: `Bearer ${ws.metaAccessToken}`, "Content-Type": "application/json" },
    timeout: 10000
  });
  return res.data;
}

/**
 * Send a template with the order's invoice attached. If the invoice can't be built or
 * uploaded, or the template has no document header, the message is sent without it.
 */
async function sendTemplateWithInvoice(ws, order, user, { to, name, bodyParams }) {
  let document = null;
  if (order?.invoiceNumber) {
    try {
      const { buffer, filename } = await buildInvoicePdf(order, user);
      const id = await uploadPdf(ws, buffer, filename);
      if (id) document = { id, filename };
    } catch (err) {
      console.error(`[WhatsApp] Invoice upload failed for ${name}:`, err?.response?.data || err?.message);
    }
  }

  try {
    return await sendTemplate(ws, { to, name, bodyParams, document });
  } catch (err) {
    // 132000 / 132012: parameters don't match the template (e.g. no document header)
    const code = err?.response?.data?.error?.code;
    if (document && (code === 132000 || code === 132012)) {
      console.warn(`[WhatsApp] ${name} rejected the invoice header; resending without it.`);
      return sendTemplate(ws, { to, name, bodyParams });
    }
    throw err;
  }
}

async function dispatch(label, order, user, send) {
  try {
    const ws = await getOrderMessagingSettings();
    if (!ws) return { skipped: true, reason: "WhatsApp order messages are off or not configured" };

    const to = orderRecipient(order, user);
    if (!to) return { skipped: true, reason: "Recipient phone number is missing" };

    const data = await send(ws, to);
    console.log(`✅ WhatsApp ${label} sent for Order #${orderCode(order)} to +${maskPhone(to)}`);
    return { success: true, data };
  } catch (error) {
    console.error(`❌ WhatsApp ${label} failed for Order #${orderCode(order)}:`, error?.response?.data || error?.message);
    return { success: false, error: error?.response?.data || error?.message };
  }
}

/** Sent when the order invoice is ready for a digital-only order (access given). */
function sendWhatsAppDigitalAccess(order, user) {
  if (!isDigitalOnlyOrder(order) || !order?.invoiceNumber) {
    return Promise.resolve({ skipped: true, reason: "Not a digital-only order with an issued invoice" });
  }
  return dispatch("digital access", order, user, (ws, to) =>
    sendTemplateWithInvoice(ws, order, user, {
      to,
      name: TEMPLATES.digitalAccessReady,
      bodyParams: [customerName(order, user), orderCode(order)]
    })
  );
}

/**
 * Order confirmation after payment. Digital-only orders whose access (and invoice)
 * was given instantly also get the digital access message with the invoice.
 */
async function sendWhatsAppOrderConfirmation(order, user = null) {
  const result = await dispatch("order confirmation", order, user, (ws, to) =>
    sendTemplate(ws, {
      to,
      name: TEMPLATES.orderConfirmation,
      bodyParams: [customerName(order, user), orderCode(order), formatAmount(order)]
    })
  );
  if (result.success) await sendWhatsAppDigitalAccess(order, user);
  return result;
}

/** Shipped (with invoice), Delivered and Cancelled updates. */
function sendWhatsAppOrderStatus(order, user, status) {
  const name = customerName(order, user);
  const code = orderCode(order);

  if (status === "Shipped") {
    return dispatch("shipped update", order, user, (ws, to) =>
      sendTemplateWithInvoice(ws, order, user, {
        to,
        name: TEMPLATES.orderShipped,
        bodyParams: [name, code, order?.courierPartner || "Delhivery", order?.trackingId || "will be shared soon"]
      })
    );
  }
  if (status === "Delivered") {
    return dispatch("delivered update", order, user, (ws, to) =>
      sendTemplate(ws, { to, name: TEMPLATES.orderDelivered, bodyParams: [name, code] })
    );
  }
  if (status === "Cancelled") {
    return dispatch("cancelled update", order, user, (ws, to) =>
      sendTemplate(ws, { to, name: TEMPLATES.orderCancelled, bodyParams: [name, code] })
    );
  }
  return Promise.resolve({ skipped: true, reason: `No WhatsApp template for status ${status}` });
}

/**
 * Send WhatsApp OTP Verification Code via Meta Cloud API
 * @param {string} phone - Recipient phone number
 * @param {string} otp - 6-digit OTP code
 */
async function sendWhatsAppOtp(phone, otp) {
  try {
    const recipientPhone = formatWhatsAppNumber(phone);
    if (!recipientPhone) {
      return { success: false, error: "Recipient phone number is invalid" };
    }

    const settings = await StoreSettings.findOne().lean();
    const ws = settings?.whatsappSettings || {};

    if (!(ws.mode === "api" && ws.metaPhoneNumberId && ws.metaAccessToken)) {
      if (DEV_LOG) {
        console.log(`📲 [WhatsApp OTP][DEV ONLY] +${recipientPhone}: ${otp}`);
        return { success: true, devMode: true };
      }
      return { success: false, error: "WhatsApp OTP delivery is not configured." };
    }

    // Authentication template with a copy-code button. No free-text fallback: Meta only
    // delivers free text inside the 24-hour customer service window, so it would be
    // accepted and then dropped (131047) while the site said "sent".
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientPhone,
      type: "template",
      template: {
        name: TEMPLATES.otp,
        language: { code: TEMPLATE_LANGUAGE },
        components: [
          { type: "body", parameters: [{ type: "text", text: String(otp) }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: String(otp) }] }
        ]
      }
    };

    try {
      const response = await axios.post(graphUrl(ws, "messages"), payload, {
        headers: { Authorization: `Bearer ${ws.metaAccessToken}`, "Content-Type": "application/json" },
        timeout: 10000
      });
      console.log(`✅ WhatsApp OTP sent to +${maskPhone(recipientPhone)}`);
      return { success: true, data: response.data };
    } catch (metaErr) {
      console.error("❌ Meta template auth_otp failed:", metaErr?.response?.data || metaErr?.message);
      return { success: false, error: "Failed to deliver WhatsApp OTP. Please verify the auth_otp template and credentials." };
    }
  } catch (error) {
    console.error("❌ WhatsApp OTP Error:", error?.message || error);
    return { success: false, error: error?.message || "Failed to dispatch WhatsApp OTP" };
  }
}

module.exports = {
  sendWhatsAppOrderConfirmation,
  sendWhatsAppOrderStatus,
  sendWhatsAppDigitalAccess,
  sendWhatsAppOtp,
  formatWhatsAppNumber,
  TEMPLATES
};
