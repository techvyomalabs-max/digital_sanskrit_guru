// Client for the Vyoma chatbot API. The rules for what may be sent live in chatbotApi.js.

import axios from "axios";
import { buildChatRequest, getChatErrorMessage, getPrivateTopicReply, parseChatReply } from "./chatbotApi.js";

const CHATBOT_API_BASE = String(
  import.meta.env.VITE_CHATBOT_API_URL || "https://cross-platform-chatbot.ai.vyoma.org"
)
  .trim()
  .replace(/\/+$/, "");

// localhost is not on the API's allowlist, so development goes through the Vite proxy
const CHAT_ENDPOINT = import.meta.env.DEV ? "/chatbot-api/v1/chat" : `${CHATBOT_API_BASE}/v1/chat`;

// The widget is shown in local development, and on a deployed site only when
// VITE_CHATBOT_ENABLED is "true".
export const isChatbotEnabled =
  Boolean(import.meta.env.DEV) || String(import.meta.env.VITE_CHATBOT_ENABLED || "") === "true";

export const CHATBOT_STARTER_REPLIES = [
  "Track my order",
  "Shipping & delivery",
  "Access my digital products",
  "Help me choose a book"
];

let retryAllowedAt = 0;
let lastBusyMessage = "";

/**
 * Sends the conversation's latest question and returns the reply. Questions about
 * orders, accounts, payments or passwords are answered locally and never leave the site.
 * A failed request throws an Error whose message is safe to show to the visitor.
 *
 * @param {Array<{id: string, role: "user" | "bot", text: string}>} messages Oldest first, ending with the question.
 * @param {string} sessionId Anonymous random ID for this browser tab.
 * @returns {Promise<{text: string, links: Array<{label: string, to: string}>, quickReplies: string[], isLocal?: boolean}>}
 */
export async function sendChatMessage(messages, sessionId) {
  const localReply = getPrivateTopicReply(messages[messages.length - 1]?.text);
  if (localReply) return { ...localReply, isLocal: true };

  if (Date.now() < retryAllowedAt) throw new Error(lastBusyMessage);

  try {
    const res = await axios.post(CHAT_ENDPOINT, buildChatRequest(messages, sessionId), {
      baseURL: "", // Not the site's own API, which axios.defaults points at
      headers: { "Content-Type": "application/json" },
      timeout: 45000
    });
    return parseChatReply(res.data);
  } catch (err) {
    const status = err?.response?.status;
    const message = getChatErrorMessage(status, err?.response?.data?.detail);
    const retryAfterSeconds = Number(err?.response?.headers?.["retry-after"]);
    if (status === 429 && retryAfterSeconds > 0) {
      retryAllowedAt = Date.now() + retryAfterSeconds * 1000;
      lastBusyMessage = message;
    }
    throw new Error(message);
  }
}
