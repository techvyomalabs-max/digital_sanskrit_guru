// Chatbot API client.
//
// The real chatbot API is not connected yet. Until VITE_CHATBOT_API_URL is set,
// sendChatMessage() answers with the sample replies below so the chat window can be
// designed and tested. To connect the API, set VITE_CHATBOT_API_URL and make sure the
// endpoint accepts and returns the shapes documented on sendChatMessage().

import axios from "axios";

const CHATBOT_API_URL = String(import.meta.env.VITE_CHATBOT_API_URL || "").trim();

// The widget is shown in local development, and on a deployed site only when
// VITE_CHATBOT_ENABLED is "true" (so customers never see the sample replies).
export const isChatbotEnabled =
  Boolean(import.meta.env.DEV) || String(import.meta.env.VITE_CHATBOT_ENABLED || "") === "true";

export const isChatbotConnected = Boolean(CHATBOT_API_URL);

export const CHATBOT_STARTER_REPLIES = [
  "Track my order",
  "Shipping & delivery",
  "Access my digital products",
  "Help me choose a book"
];

const SAMPLE_REPLIES = [
  {
    match: /track|order status|where is my order|delivery status/i,
    text: "You can see the status and tracking details of every order on your Orders page. If you checked out as a guest, use the link in your order confirmation email.",
    links: [{ label: "Go to My Orders", to: "/my-orders" }]
  },
  {
    match: /ship|deliver|refund|return|cancel/i,
    text: "Delivery charges and times depend on your PIN code and are shown at checkout. Our Shipping & Refund Policy has the full details on returns and refunds.",
    links: [{ label: "Shipping & Refund Policy", to: "/shipping-refund-policy" }]
  },
  {
    match: /digital|library|download|web version|access|e-?book|kindle/i,
    text: "Web versions and other on-site digital products appear in My Digital Library once your payment is confirmed. Kindle editions are delivered through Amazon.",
    links: [{ label: "Open My Digital Library", to: "/my-library" }]
  },
  {
    match: /choose|recommend|suggest|beginner|learn|book/i,
    text: "Happy to help! Browse the full collection, or tell me a little about your level (beginner, intermediate or advanced) and what you'd like to learn.",
    links: [{ label: "Browse the collection", to: "/collection" }],
    quickReplies: ["I'm a beginner", "For my child", "Scripture study"]
  },
  {
    match: /human|agent|person|support|call|whatsapp|talk/i,
    text: "You can reach our Customer Seva Team on WhatsApp or by phone, 10 AM to 7 PM India time, Monday to Saturday.",
    links: [{ label: "Contact Us", to: "/contact" }]
  }
];

const FALLBACK_REPLY = {
  text: "I'm still learning, so I may not have the answer to that yet. Our FAQ covers most questions, or you can contact our Customer Seva Team.",
  links: [
    { label: "Read the FAQ", to: "/faq" },
    { label: "Contact Us", to: "/contact" }
  ]
};

function sampleReply(text) {
  const found = SAMPLE_REPLIES.find((reply) => reply.match.test(text)) || FALLBACK_REPLY;
  return {
    text: found.text,
    links: found.links || [],
    quickReplies: found.quickReplies || []
  };
}

/**
 * Sends the conversation to the chatbot and returns its reply.
 *
 * @param {Array<{role: "user" | "bot", text: string}>} messages Conversation so far, oldest first.
 * @param {{token?: string, pagePath?: string}} [options]
 * @returns {Promise<{text: string, links: Array<{label: string, to: string}>, quickReplies: string[]}>}
 *
 * Expected API contract once connected:
 *   POST VITE_CHATBOT_API_URL  { messages, pagePath }
 *   -> { reply: string, links?: [{label, to}], quickReplies?: string[] }
 */
export async function sendChatMessage(messages, { token, pagePath } = {}) {
  const lastUserText = [...messages].reverse().find((m) => m.role === "user")?.text || "";

  if (!isChatbotConnected) {
    // Short pause so the typing indicator is visible while testing the layout
    await new Promise((resolve) => setTimeout(resolve, 700));
    return sampleReply(lastUserText);
  }

  const res = await axios.post(
    CHATBOT_API_URL,
    {
      messages: messages.map(({ role, text }) => ({ role, text })),
      pagePath
    },
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      timeout: 30000
    }
  );

  return {
    text: String(res.data?.reply || "").trim() || FALLBACK_REPLY.text,
    links: Array.isArray(res.data?.links) ? res.data.links : [],
    quickReplies: Array.isArray(res.data?.quickReplies) ? res.data.quickReplies : []
  };
}
