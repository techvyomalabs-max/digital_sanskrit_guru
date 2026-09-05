const axios = require("axios");
const StoreSettings = require("../models/StoreSettings");

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

/**
 * Send WhatsApp Automated Order Confirmation via Meta Cloud API
 * @param {Object} order - Created order object
 */
async function sendWhatsAppOrderConfirmation(order) {
  try {
    const settings = await StoreSettings.findOne().lean();
    const ws = settings?.whatsappSettings || {};

    if (ws.mode !== "api" || !ws.autoSendOrderConfirmation) {
      return { skipped: true, reason: "WhatsApp API mode is disabled or order confirmation is turned off" };
    }

    if (!ws.metaPhoneNumberId || !ws.metaAccessToken) {
      return { skipped: true, reason: "Meta Phone Number ID or Access Token is missing in Admin settings" };
    }

    const recipientPhone = formatWhatsAppNumber(order?.shippingAddress?.phone || order?.userPhone || order?.phone);
    if (!recipientPhone) {
      return { skipped: true, reason: "Recipient phone number is missing" };
    }

    const orderId = order?.orderId || String(order?._id || "").slice(-8);
    const totalAmount = Math.round(Number(order?.totalAmount || order?.finalTotal || 0));

    // Construct Meta Cloud API template payload
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientPhone,
      type: "template",
      template: {
        name: "order_confirmation",
        language: { code: "en_US" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: String(order?.shippingAddress?.name || order?.userName || "Customer") },
              { type: "text", text: String(orderId) },
              { type: "text", text: `₹${totalAmount}` }
            ]
          }
        ]
      }
    };

    const url = `https://graph.facebook.com/v19.0/${ws.metaPhoneNumberId}/messages`;
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${ws.metaAccessToken}`,
        "Content-Type": "application/json"
      },
      timeout: 10000
    });

    console.log(`✅ WhatsApp order confirmation sent for Order #${orderId} to ${recipientPhone}`);
    return { success: true, data: response.data };
  } catch (error) {
    console.error("❌ Failed to send WhatsApp message via Meta Cloud API:", error?.response?.data || error?.message);
    return { success: false, error: error?.response?.data || error?.message };
  }
}

module.exports = {
  sendWhatsAppOrderConfirmation,
  formatWhatsAppNumber
};
