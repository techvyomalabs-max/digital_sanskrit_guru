const crypto = require("crypto");
const { sendEmail } = require("./email");
const { getSiteUrl } = require("./siteLinks");

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

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
    ? "Your account was created with Google sign-in. Click the link below to set a password, so you can also sign in with your email address. You can keep using Google sign-in as well."
    : "We received a request to reset your password. Click the link below to set a new password:";
  const buttonText = isSettingFirstPassword ? "Set your password" : "Reset your password";
  return sendEmail({
    to: user.email,
    subject,
    type: "password-reset",
    html: `<p>Hello ${esc(user.name || "User")},</p><p>${intro}</p><p style="margin: 20px 0;"><a href="${url}" style="background-color: #1a1a2e; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">${buttonText}</a></p><p style="font-size: 12px; color: #666;">This link is valid for 1 hour. If you did not request this, please ignore this email.</p>`
  });
}

module.exports = {
  sendPasswordResetEmail,
  buildResetUrl,
  RESET_TTL_MS
};
