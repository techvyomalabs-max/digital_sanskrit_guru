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

const IS_PROD = process.env.NODE_ENV === "production";
const DEV_LOG = !IS_PROD && process.env.WHATSAPP_OTP_DEV_LOG === "true";
const maskPhone = (p) => (p ? `${"*".repeat(Math.max(0, p.length - 4))}${p.slice(-4)}` : "");

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

    const url = `https://graph.facebook.com/v19.0/${ws.metaPhoneNumberId}/messages`;
    const templatePayload = {
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

    const textPayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientPhone,
      type: "text",
      text: {
        body: `Your Digital Sanskrit Guru verification code is: *${otp}*.\n\nThis OTP is valid for 5 minutes. Please do not share it with anyone.`
      }
    };

    const postMessage = (payload) =>
      axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${ws.metaAccessToken}`,
          "Content-Type": "application/json"
        },
        timeout: 10000
      });

    try {
      const response = await postMessage(templatePayload);
      console.log(`✅ WhatsApp OTP sent to +${maskPhone(recipientPhone)}`);
      return { success: true, data: response.data };
    } catch (metaErr) {
      console.warn("⚠️ Meta template auth_otp failed, trying direct text fallback...", metaErr?.response?.data || metaErr.message);
      try {
        const fallbackRes = await postMessage(textPayload);
        console.log(`✅ WhatsApp OTP (fallback) sent to +${maskPhone(recipientPhone)}`);
        return { success: true, data: fallbackRes.data };
      } catch (fallbackErr) {
        console.error("❌ Failed to send WhatsApp message via Meta Cloud API:", fallbackErr?.response?.data || fallbackErr?.message);
        return { success: false, error: "Failed to deliver WhatsApp OTP. Please verify credentials." };
      }
    }
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
