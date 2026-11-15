"use strict";

/**
 * Login details an admin can send with "Grant access" for an account they created on the
 * other website. They go into that one email only: never saved on the order, never logged.
 * Returns { credentials } (or { credentials: null } when none were sent) or { error }.
 */
function cleanAccessCredentials(input) {
  if (!input || typeof input !== "object") return { credentials: null };
  const loginEmail = String(input.loginEmail || "").trim().toLowerCase();
  const tempPassword = String(input.tempPassword || "");
  const loginUrl = String(input.loginUrl || "").trim();
  if (!loginEmail && !tempPassword && !loginUrl) return { credentials: null };

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail) || loginEmail.length > 254) {
    return { error: "Enter the email the customer logs in with." };
  }
  if (tempPassword && (tempPassword.length > 100 || /[\r\n]/.test(tempPassword))) {
    return { error: "The password must be one line, at most 100 characters." };
  }
  let url = "";
  if (loginUrl) {
    try {
      const parsed = new URL(loginUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("bad protocol");
      url = parsed.toString();
    } catch {
      return { error: "The login page must be a web address starting with https://" };
    }
  }
  return { credentials: { loginEmail, tempPassword, loginUrl: url } };
}

module.exports = { cleanAccessCredentials };
