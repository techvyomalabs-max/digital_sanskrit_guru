const crypto = require("crypto");
const { sendEmail } = require("./email");
const { getSiteUrl } = require("./siteLinks");

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
// A new buyer may not open the welcome email straight away
const WELCOME_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

const esc = (s) =>
  String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));

function buildResetUrl(rawToken) {
  const base = getSiteUrl();
  return `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

// Accounts created through Google sign-in have no password of their own
// (hasLocalPassword: false), so their email offers to *set* one rather than reset it.
async function sendPasswordResetEmail(user) {
  const raw = crypto.randomBytes(32).toString("hex");
  user.resetPasswordToken = crypto.createHash("sha256").update(raw).digest("hex");
  user.resetPasswordExpires = Date.now() + RESET_TTL_MS;
  await user.save();

  const url = buildResetUrl(raw);
  const isSettingFirstPassword = user.hasLocalPassword === false;
  const subject = isSettingFirstPassword
    ? "Set a Password — Digital Sanskrit Guru"
    : "Password Reset Link — Digital Sanskrit Guru";
  const intro = isSettingFirstPassword
    ? user.googleSub
      ? "Your account was created with Google sign-in. Click the link below to set a password, so you can also sign in with your email address. You can keep using Google sign-in as well."
      : "Your account doesn't have a password yet. Click the link below to set one:"
    : "We received a request to reset your password. Click the link below to set a new password:";
  const buttonText = isSettingFirstPassword ? "Set your password" : "Reset your password";
  return sendEmail({
    to: user.email,
    subject,
    type: "password-reset",
    html: `<p>Hello ${esc(user.name || "User")},</p><p>${intro}</p><p style="margin: 20px 0;"><a href="${url}" style="background-color: #1a1a2e; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">${buttonText}</a></p><p style="font-size: 12px; color: #666;">This link is valid for 1 hour. If you did not request this, please ignore this email.</p>`
  });
}

/**
 * Welcome email for an account created at guest checkout. It carries a link to set a
 * password (the same reset-password page) instead of a password in plain text.
 */
async function sendWelcomeSetPasswordEmail(user) {
  const raw = crypto.randomBytes(32).toString("hex");
  user.resetPasswordToken = crypto.createHash("sha256").update(raw).digest("hex");
  user.resetPasswordExpires = Date.now() + WELCOME_TTL_MS;
  await user.save();

  const url = buildResetUrl(raw);
  const base = getSiteUrl();
  return sendEmail({
    to: user.email,
    subject: "Welcome to Digital Sanskrit Guru — set your password",
    type: "welcome-credentials",
    html: `<p>Namaste ${esc(user.name || "Student")},</p><p>Thank you for your purchase. We have created an account for you with this email address, so you can open your digital library and track your orders.</p><p>Choose a password to sign in:</p><p style="margin: 20px 0;"><a href="${url}" style="background-color: #1a1a2e; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">Set your password</a></p><p style="font-size: 12px; color: #666;">This link is valid for 3 days. After that, use "Forgot password" on the <a href="${base}/login">sign-in page</a> to get a new one.</p>`
  });
}

module.exports = {
  sendPasswordResetEmail,
  sendWelcomeSetPasswordEmail,
  WELCOME_TTL_MS,
  buildResetUrl,
  RESET_TTL_MS
};
