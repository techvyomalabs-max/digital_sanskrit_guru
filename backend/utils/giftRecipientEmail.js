"use strict";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The mailbox an address really goes to: lowercase, "+tag" dropped, and for Gmail the dots
 * in the name dropped too (a.b+x@gmail.com and ab@gmail.com reach the same inbox).
 */
function mailboxKey(raw) {
  const email = String(raw || "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1) return email;
  let name = email.slice(0, at).split("+")[0];
  let domain = email.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") name = name.replace(/\./g, "");
  return `${name}@${domain}`;
}

/**
 * A gift needs the recipient's email (the Gift Pass code is sent there), and it must be
 * someone else's: pass the buyer's own email(s) as ownEmails.
 * Returns { email } or { error } with a message for the customer.
 */
function checkGiftRecipientEmail(raw, ownEmails = []) {
  const email = String(raw || "").trim().toLowerCase();
  if (!email) return { error: "Please enter the recipient's email address to send this as a gift." };
  if (email.length > 254 || !EMAIL_RE.test(email)) return { error: "Please enter a valid recipient email address." };
  const key = mailboxKey(email);
  if (ownEmails.some((own) => own && mailboxKey(own) === key)) {
    return {
      error: "That's your own email. A gift is sent to someone else, so please enter their email.",
      code: "GIFT_TO_SELF"
    };
  }
  return { email };
}

module.exports = { checkGiftRecipientEmail, mailboxKey };
