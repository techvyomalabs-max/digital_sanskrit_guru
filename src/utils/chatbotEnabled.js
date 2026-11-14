// In its own small file so the app can check this without loading the chat code.
// The widget is shown in local development, and on a deployed site only when
// VITE_CHATBOT_ENABLED is "true".
export const isChatbotEnabled =
  Boolean(import.meta.env.DEV) || String(import.meta.env.VITE_CHATBOT_ENABLED || "") === "true";
