"use strict";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A gift needs the recipient's email (the Gift Pass code is sent there).
 * Returns { email } or { error } with a message for the customer.
 */
function checkGiftRecipientEmail(raw) {
  const email = String(raw || "").trim().toLowerCase();
  if (!email) return { error: "Please enter the recipient's email address to send this as a gift." };
  if (email.length > 254 || !EMAIL_RE.test(email)) return { error: "Please enter a valid recipient email address." };
  return { email };
}

module.exports = { checkGiftRecipientEmail };
