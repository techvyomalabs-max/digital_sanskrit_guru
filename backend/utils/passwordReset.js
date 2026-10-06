const crypto = require("crypto");
const { sendEmail } = require("./email");

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
  const base = String(process.env.SITE_URL || process.env.VITE_SITE_URL || "http://localhost:5173").trim().replace(/\/+$/, "");
  return `${base}/#/reset-password?token=${encodeURIComponent(rawToken)}`;
}

async function sendPasswordResetEmail(user) {
  const raw = crypto.randomBytes(32).toString("hex");
  user.resetPasswordToken = crypto.createHash("sha256").update(raw).digest("hex");
  user.resetPasswordExpires = Date.now() + RESET_TTL_MS;
  await user.save();

  const url = buildResetUrl(raw);
  return sendEmail({
    to: user.email,
    subject: "Password Reset Link — Digital Sanskrit Guru",
    type: "password-reset",
    html: `<p>Hello ${esc(user.name || "User")},</p><p>We received a request to reset your password. Click the link below to set a new password:</p><p style="margin: 20px 0;"><a href="${url}" style="background-color: #1a1a2e; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">Reset your password</a></p><p style="font-size: 12px; color: #666;">This link is valid for 1 hour. If you did not request this, please ignore this email.</p>`
  });
}

module.exports = {
  sendPasswordResetEmail,
  buildResetUrl,
  RESET_TTL_MS
};
