/**
 * admin-user.js — Secure Admin Management CLI
 * 
 * Usage:
 *   node admin-user.js show --email=<email>
 *   node admin-user.js send-reset --email=<email> [--invalidate-current]
 *   node admin-user.js grant-admin --email=<email> --level=1|2 [--role="..."] [--pages=orders,products,...] --confirm --confirm-db=<db>
 *   node admin-user.js revoke-admin --email=<email> --confirm --confirm-db=<db>
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");
const User = require("../models/User");
const { sendPasswordResetEmail } = require("../utils/passwordReset");

function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Set();
  const vals = {};
  const positional = [];

  for (const a of argv) {
    if (a.startsWith("--")) {
      const i = a.indexOf("=");
      if (i === -1) {
        flags.add(a.slice(2));
      } else {
        vals[a.slice(2, i)] = a.slice(i + 1);
      }
    } else {
      positional.push(a);
    }
  }

  return {
    command: positional[0] || "help",
    has: (k) => flags.has(k) || k in vals,
    get: (k) => vals[k]
  };
}

const maskEmail = (e) => {
  const str = String(e || "");
  const [user, domain] = str.split("@");
  if (!domain) return str;
  return `${user.slice(0, 2)}****@${domain}`;
};

async function main() {
  const args = parseArgs();
  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/digital_sanskrit_guru_v2";
  
  if (args.command === "help") {
    console.log(`
Digital Sanskrit Guru — Admin User Management CLI

Commands:
  show         --email=<email>
  send-reset   --email=<email> [--invalidate-current]
  grant-admin  --email=<email> --level=1|2 [--role="..."] [--pages=p1,p2] --confirm --confirm-db=<db>
  revoke-admin --email=<email> --confirm --confirm-db=<db>
`);
    return;
  }

  const email = String(args.get("email") || "").trim().toLowerCase();
  if (!email) {
    console.error("❌ Error: --email is required.");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  const dbName = mongoose.connection.name;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.error(`❌ User not found: ${maskEmail(email)}`);
      process.exit(1);
    }

    if (args.command === "show") {
      console.log(`\n================ User Info ================`);
      console.log(`ID:           ${user._id}`);
      console.log(`Name:         ${user.name}`);
      console.log(`Email:        ${maskEmail(user.email)}`);
      console.log(`Is Admin:     ${user.isAdmin}`);
      console.log(`Admin Level:  ${user.adminLevel || 2}`);
      console.log(`Admin Role:   ${user.adminRole || "N/A"}`);
      console.log(`Allowed Pages:${(user.allowedPages || []).join(", ") || "None"}`);
      console.log(`Blocked:      ${Boolean(user.isBlocked)}`);
      console.log(`TokenVersion: ${user.tokenVersion || 0}`);
      console.log(`===========================================\n`);
    } else if (args.command === "send-reset") {
      if (args.has("invalidate-current")) {
        user.tokenVersion = Number(user.tokenVersion || 0) + 1;
        await user.save();
        console.log(`🔒 Existing active sessions invalidated.`);
      }
      await sendPasswordResetEmail(user);
      console.log(`✅ Password reset link generated and sent to ${maskEmail(user.email)}`);
    } else if (args.command === "grant-admin") {
      if (!args.has("confirm") || args.get("confirm-db") !== dbName) {
        console.error(`❌ Write operation requires --confirm and --confirm-db=${dbName}`);
        process.exit(1);
      }
      const level = Number(args.get("level") || 2);
      if (level !== 1 && level !== 2) {
        console.error("❌ Invalid --level (must be 1 for Super Admin or 2 for Sub-Admin)");
        process.exit(1);
      }
      const role = String(args.get("role") || (level === 1 ? "Super Admin" : "Custom Sub-Admin")).trim();
      const rawPages = String(args.get("pages") || "");
      const pages = rawPages ? rawPages.split(",").map((p) => p.trim()).filter(Boolean) : [];

      user.isAdmin = true;
      user.adminLevel = level;
      user.adminRole = role;
      user.allowedPages = level === 1 ? ["*"] : pages;
      user.isEmailVerified = true;
      user.isBlocked = false;
      await user.save();

      console.log(`✅ Granted Admin (Level ${level} - ${role}) to ${maskEmail(user.email)}`);
    } else if (args.command === "revoke-admin") {
      if (!args.has("confirm") || args.get("confirm-db") !== dbName) {
        console.error(`❌ Write operation requires --confirm and --confirm-db=${dbName}`);
        process.exit(1);
      }
      user.isAdmin = false;
      user.adminLevel = 2;
      user.adminRole = "";
      user.allowedPages = [];
      user.tokenVersion = Number(user.tokenVersion || 0) + 1;
      await user.save();

      console.log(`✅ Revoked admin access and invalidated active sessions for ${maskEmail(user.email)}`);
    } else {
      console.error(`❌ Unknown command: ${args.command}`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("❌ CLI Execution Error:", err.message);
  process.exit(1);
});
