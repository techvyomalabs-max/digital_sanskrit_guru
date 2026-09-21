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

    console.log(`\n========================================`);
    console.log(`📲 [WhatsApp OTP] Code for +${recipientPhone}: ${otp}`);
    console.log(`========================================\n`);

    if (ws.mode === "api" && ws.metaPhoneNumberId && ws.metaAccessToken) {
      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipientPhone,
        type: "template",
        template: {
          name: "auth_otp",
          language: { code: "en_US" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: String(otp) }
              ]
            },
            {
              type: "button",
              sub_type: "url",
              index: "0",
              parameters: [
                { type: "text", text: String(otp) }
              ]
            }
          ]
        }
      };

      const url = `https://graph.facebook.com/v19.0/${ws.metaPhoneNumberId}/messages`;
      try {
        const response = await axios.post(url, payload, {
          headers: {
            Authorization: `Bearer ${ws.metaAccessToken}`,
            "Content-Type": "application/json"
          },
          timeout: 10000
        });
        console.log(`✅ WhatsApp OTP sent via Meta Cloud API to +${recipientPhone}`);
        return { success: true, data: response.data };
      } catch (metaErr) {
        console.warn("⚠️ Meta template auth_otp failed, trying direct text fallback...", metaErr?.response?.data || metaErr.message);
        try {
          const textPayload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: recipientPhone,
            type: "text",
            text: {
              body: `Your Digital Sanskrit Guru verification code is: *${otp}*.\n\nThis OTP is valid for 5 minutes. Please do not share it with anyone.`
            }
          };
          const fallbackRes = await axios.post(url, textPayload, {
            headers: {
              Authorization: `Bearer ${ws.metaAccessToken}`,
              "Content-Type": "application/json"
            },
            timeout: 10000
          });
          return { success: true, data: fallbackRes.data };
        } catch (fallbackErr) {
          console.error("❌ Failed to send WhatsApp message via Meta Cloud API:", fallbackErr?.response?.data || fallbackErr?.message);
          // Return success in dev mode so developer can test with console OTP
          return { success: true, devMode: true, note: "Logged to console" };
        }
      }
    }

    return { success: true, devMode: true, note: "Logged to server console" };
  } catch (error) {
    console.error("❌ WhatsApp OTP Error:", error?.message || error);
    return { success: false, error: error?.message || "Failed to dispatch WhatsApp OTP" };
  }
}

module.exports = {
  sendWhatsAppOrderConfirmation,
  sendWhatsAppOtp,
  formatWhatsAppNumber
};
