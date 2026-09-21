const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const axios = require("axios");
const User = require("../models/User");
const PhoneOtp = require("../models/PhoneOtp");
const StoreSettings = require("../models/StoreSettings");
const AdminAuditLog = require("../models/AdminAuditLog");
const protect = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");
const { logAdminAction } = require("../utils/adminAudit");
const { sendEmail } = require("../utils/email");
const { sendWhatsAppOtp } = require("../utils/whatsapp");
const { honeypotMiddleware, turnstileMiddleware } = require("../utils/spamFilter");

const router = express.Router();

const isWhatsAppOtpRequired = async () => {
  try {
    const settings = await StoreSettings.findOne();
    if (!settings || !settings.whatsappSettings) return false;
    const mode = settings.whatsappSettings.mode;
    const enableOtp = settings.whatsappSettings.enableOtpVerification !== false;
    return mode === "api" && enableOtp;
  } catch (err) {
    console.error("[Auth] Error checking WhatsApp OTP setting:", err.message);
    return false;
  }
};

// ── Rate limiters ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // max 20 login attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again in 15 minutes." }
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,                   // max 10 registrations per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many accounts created. Please try again later." }
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,                   // max 5 password reset attempts per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many password reset attempts. Please try again in an hour." }
});

const otpLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 6,               // max 6 OTP requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many OTP attempts. Please wait a minute before trying again." }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const getTokenExpiry = (rememberMe) => (rememberMe ? "30d" : "12h");

const isValidEmail = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim().toLowerCase());

const validatePhoneNumber = (rawPhone, country = "India") => {
  const trimmed = String(rawPhone || "").trim();
  if (!trimmed) {
    return { isValid: false, message: "Phone number is required.", cleanPhone: "" };
  }

  const cleaned = trimmed.replace(/[\s\-()]/g, "");
  const digitsOnly = cleaned.replace(/\D/g, "");

  if (cleaned.startsWith("+")) {
    if (cleaned.startsWith("+91")) {
      const indianDigits = cleaned.slice(3).replace(/\D/g, "");
      if (!/^[6-9]\d{9}$/.test(indianDigits)) {
        return {
          isValid: false,
          message: "Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.",
          cleanPhone: indianDigits
        };
      }
      return { isValid: true, message: "", cleanPhone: indianDigits };
    }

    if (!/^\+[1-9]\d{6,14}$/.test(cleaned)) {
      return {
        isValid: false,
        message: "Please enter a valid international phone number with country code (e.g. +1 2025550143).",
        cleanPhone: cleaned
      };
    }
    return { isValid: true, message: "", cleanPhone: cleaned };
  }

  if (digitsOnly.length === 10) {
    if (!/^[6-9]\d{9}$/.test(digitsOnly)) {
      return {
        isValid: false,
        message: "Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9 (e.g. 9876543210).",
        cleanPhone: digitsOnly
      };
    }
    return { isValid: true, message: "", cleanPhone: digitsOnly };
  }

  if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
    const indianDigits = digitsOnly.slice(2);
    if (!/^[6-9]\d{9}$/.test(indianDigits)) {
      return {
        isValid: false,
        message: "Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.",
        cleanPhone: indianDigits
      };
    }
    return { isValid: true, message: "", cleanPhone: indianDigits };
  }

  if (digitsOnly.length === 11 && digitsOnly.startsWith("0")) {
    const indianDigits = digitsOnly.slice(1);
    if (!/^[6-9]\d{9}$/.test(indianDigits)) {
      return {
        isValid: false,
        message: "Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.",
        cleanPhone: indianDigits
      };
    }
    return { isValid: true, message: "", cleanPhone: indianDigits };
  }

  if (country && country.toLowerCase() !== "india" && digitsOnly.length >= 7 && digitsOnly.length <= 15) {
    return { isValid: true, message: "", cleanPhone: digitsOnly };
  }

  return {
    isValid: false,
    message: "Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9 (e.g. 9876543210).",
    cleanPhone: digitsOnly
  };
};

const validatePassword = (value) => {
  const password = typeof value === "string" ? value : "";
  if (!password) {
    return { isValid: false, message: "Password is required." };
  }
  if (password.startsWith(" ") || password.endsWith(" ")) {
    return { isValid: false, message: "Password cannot start or end with a space." };
  }
  const trimmed = password.trim();
  if (trimmed.length < 8) {
    return { isValid: false, message: "Password must be at least 8 characters (excluding spaces)." };
  }
  if (password.length > 128) {
    return { isValid: false, message: "Password must be 128 characters or fewer." };
  }
  if (/^\s+$/.test(password)) {
    return { isValid: false, message: "Password cannot consist only of spaces." };
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return { isValid: false, message: "Password must contain at least one letter and one number." };
  }
  return { isValid: true };
};

const normalizeAddress = (item = {}, index = 0) => {
  const normalizedLabel = ["Home", "Work", "Other"].includes(String(item?.label || "").trim())
    ? String(item.label).trim()
    : "Home";

  const latitudeRaw = item?.latitude;
  const longitudeRaw = item?.longitude;
  const latitude =
    latitudeRaw === null || latitudeRaw === undefined || latitudeRaw === "" ? null : Number(latitudeRaw);
  const longitude =
    longitudeRaw === null || longitudeRaw === undefined || longitudeRaw === "" ? null : Number(longitudeRaw);

  return {
    label: normalizedLabel,
    name: String(item?.name || "").trim(),
    phone: String(item?.phone || "").trim(),
    address: String(item?.address || "").trim(),
    landmark: String(item?.landmark || "").trim(),
    city: String(item?.city || "").trim(),
    state: String(item?.state || "").trim(),
    pincode: String(item?.pincode || "").trim(),
    country: String(item?.country || "").trim() || "India",
    latitude: Number.isNaN(latitude) ? null : latitude,
    longitude: Number.isNaN(longitude) ? null : longitude,
    isDefault: Boolean(item?.isDefault && index >= 0)
  };
};

const normalizeAddressList = (rawAddresses = []) => {
  const list = Array.isArray(rawAddresses) ? rawAddresses : [];
  const normalized = list.map((item, index) => normalizeAddress(item, index));

  if (normalized.length > 0 && !normalized.some((item) => item.isDefault)) {
    normalized[0].isDefault = true;
  }

  let defaultSeen = false;
  return normalized.map((item) => {
    if (!item.isDefault) return item;
    if (!defaultSeen) {
      defaultSeen = true;
      return item;
    }
    return { ...item, isDefault: false };
  });
};

// ── WhatsApp OTP Endpoints ───────────────────────────────────────────────────

router.post("/send-whatsapp-otp", otpLimiter, async (req, res) => {
  try {
    const otpRequired = await isWhatsAppOtpRequired();
    if (!otpRequired) {
      return res.status(400).json({
        message: "WhatsApp OTP verification is currently disabled in store settings."
      });
    }

    const rawPhone = String(req.body?.phone || "").trim();
    if (!rawPhone) {
      return res.status(400).json({ message: "Phone number is required." });
    }

    const phoneValidation = validatePhoneNumber(rawPhone);
    if (!phoneValidation.isValid) {
      return res.status(400).json({ message: phoneValidation.message });
    }

    const cleanPhone = phoneValidation.cleanPhone;

    // Check if OTP was requested within last 30s
    const existingOtp = await PhoneOtp.findOne({
      phone: cleanPhone,
      expiresAt: { $gt: new Date() },
      verified: false
    }).sort({ createdAt: -1 });

    if (existingOtp && Date.now() - new Date(existingOtp.createdAt).getTime() < 30 * 1000) {
      return res.status(429).json({
        message: "Please wait 30 seconds before requesting a new OTP."
      });
    }

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Invalidate previous unverified OTPs for this phone
    await PhoneOtp.deleteMany({ phone: cleanPhone, verified: false });

    // Save new OTP record
    await PhoneOtp.create({
      phone: cleanPhone,
      otpHash,
      expiresAt
    });

    // Dispatch via WhatsApp
    const dispatchResult = await sendWhatsAppOtp(cleanPhone, otp);

    return res.json({
      success: true,
      message: `OTP sent to your WhatsApp (+${cleanPhone.replace(/^\+/, "")}) successfully.`,
      phone: cleanPhone,
      devMode: Boolean(dispatchResult?.devMode),
      note: dispatchResult?.note || ""
    });
  } catch (error) {
    console.error("[Auth] Send WhatsApp OTP error:", error);
    return res.status(500).json({ message: "Failed to send WhatsApp OTP. Please try again." });
  }
});

router.post("/verify-whatsapp-otp", otpLimiter, async (req, res) => {
  try {
    const rawPhone = String(req.body?.phone || "").trim();
    const otp = String(req.body?.otp || "").trim();

    if (!rawPhone || !otp) {
      return res.status(400).json({ message: "Phone number and OTP code are required." });
    }

    const phoneValidation = validatePhoneNumber(rawPhone);
    if (!phoneValidation.isValid) {
      return res.status(400).json({ message: phoneValidation.message });
    }

    const cleanPhone = phoneValidation.cleanPhone;

    const record = await PhoneOtp.findOne({
      phone: cleanPhone,
      verified: false,
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });

    if (!record) {
      return res.status(400).json({
        message: "OTP expired or not found. Please request a new verification code."
      });
    }

    if (record.attempts >= 5) {
      await PhoneOtp.deleteOne({ _id: record._id });
      return res.status(400).json({
        message: "Too many incorrect attempts. Please request a new OTP code."
      });
    }

    const isMatch = await bcrypt.compare(otp, record.otpHash);
    if (!isMatch) {
      record.attempts = (record.attempts || 0) + 1;
      await record.save();
      const remaining = Math.max(0, 5 - record.attempts);
      return res.status(400).json({
        message: `Incorrect OTP. ${remaining} ${remaining === 1 ? "attempt" : "attempts"} remaining.`
      });
    }

    // Generate phone verification token
    const verificationToken = crypto.randomBytes(24).toString("hex");
    record.verified = true;
    record.verificationToken = verificationToken;
    record.expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 mins
    await record.save();

    return res.json({
      success: true,
      message: "Phone number verified successfully!",
      phone: cleanPhone,
      phoneVerificationToken: verificationToken
    });
  } catch (error) {
    console.error("[Auth] Verify WhatsApp OTP error:", error);
    return res.status(500).json({ message: "Failed to verify OTP. Please try again." });
  }
});

router.get("/register", (_req, res) => {
  res.status(405).json({ message: "Use POST /api/auth/register with name, email, and password." });
});

router.post("/register", registerLimiter, honeypotMiddleware, turnstileMiddleware, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const phone = String(req.body?.phone || "").trim();
    const { rememberMe } = req.body;

    if (!name || name.length < 2) {
      return res.status(400).json({ message: "Name must be at least 2 characters." });
    }
    if (name.length > 80) {
      return res.status(400).json({ message: "Name must be 80 characters or fewer." });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Please enter a valid email address." });
    }
    let cleanPhone = "";
    if (phone) {
      const phoneValidation = validatePhoneNumber(phone);
      if (!phoneValidation.isValid) {
        return res.status(400).json({ message: phoneValidation.message });
      }
      cleanPhone = phoneValidation.cleanPhone;

      const otpRequired = await isWhatsAppOtpRequired();
      if (otpRequired) {
        if (!req.body?.phoneVerificationToken) {
          return res.status(400).json({ message: "Please verify your phone number via WhatsApp OTP before registering." });
        }
        const otpRecord = await PhoneOtp.findOne({
          phone: cleanPhone,
          verificationToken: req.body.phoneVerificationToken,
          verified: true,
          expiresAt: { $gt: new Date() }
        });
        if (!otpRecord) {
          return res.status(400).json({ message: "WhatsApp verification token expired or invalid. Please verify phone number again." });
        }
      }
    }
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ message: passwordValidation.message });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "An account with this email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, password: hashedPassword, phone: cleanPhone || phone });

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: getTokenExpiry(rememberMe === true) }
    );

    const adminLevel = Number(user.adminLevel || 1);
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone || "",
      isAdmin: user.isAdmin,
      adminLevel,
      adminRole: user.adminRole || (adminLevel === 1 ? "Super Admin" : "Page Level Sub-Admin"),
      allowedPages: adminLevel === 1 ? ALL_ADMIN_PAGES : (Array.isArray(user.allowedPages) && user.allowedPages.length > 0 ? user.allowedPages : ["dashboard"]),
      token
    });
  } catch (err) {
    console.error("[Auth] Register error:", err.message);
    res.status(500).json({ message: "Registration failed. Please try again." });
  }
});

router.get("/login", (_req, res) => {
  res.status(405).json({ message: "Use POST /api/auth/login with email and password." });
});

router.post("/login", authLimiter, honeypotMiddleware, turnstileMiddleware, async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const { rememberMe } = req.body;

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Please enter a valid email address." });
    }
    if (!password) {
      return res.status(400).json({ message: "Password is required." });
    }

    const user = await User.findOne({ email });

    if (user && user.isDeleted) {
      return res.status(401).json({ message: "This account has been deleted or deactivated." });
    }

    if (user && await bcrypt.compare(password, user.password)) {
      const token = jwt.sign(
        { id: user._id },
        process.env.JWT_SECRET,
        { expiresIn: getTokenExpiry(rememberMe === true) }
      );
      const adminLevel = Number(user.adminLevel || 1);
      const allowedPages = adminLevel === 1
        ? ALL_ADMIN_PAGES
        : (Array.isArray(user.allowedPages) && user.allowedPages.length > 0 ? user.allowedPages : ["dashboard"]);

      return res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        isAdmin: user.isAdmin,
        adminLevel,
        adminRole: user.adminRole || (adminLevel === 1 ? "Super Admin" : "Page Level Sub-Admin"),
        allowedPages,
        token
      });
    }

    res.status(401).json({ message: "Invalid email or password." });
  } catch (err) {
    console.error("[Auth] Login error:", err.message);
    res.status(500).json({ message: "Login failed. Please try again." });
  }
});

const ALL_ADMIN_PAGES = [
  "dashboard",
  "users",
  "admin-access",
  "orders",
  "products",
  "add-products",
  "coupons",
  "marketing",
  "theme",
  "security-logs"
];

function sanitizeAllowedPages(inputPages = [], isSuperAdmin = false) {
  if (isSuperAdmin) return ALL_ADMIN_PAGES;
  if (!Array.isArray(inputPages)) return [];

  const filtered = inputPages
    .map((p) => String(p || "").trim().toLowerCase())
    .filter((p) => ALL_ADMIN_PAGES.includes(p));

  return [...new Set(filtered)];
}

router.put("/make-admin", protect, admin, admin.requireSuperAdmin, async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const requestedLevel = Number(req.body.adminLevel || 1);
    const adminLevel = [1, 2].includes(requestedLevel) ? requestedLevel : 1;
    const requestedRole = String(req.body.adminRole || (adminLevel === 1 ? "Super Admin" : "Custom Sub-Admin")).trim();
    const allowedPages = sanitizeAllowedPages(req.body.allowedPages, adminLevel === 1);

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const actor = await User.findById(req.user).select("name email").lean();
    if (actor?.email && actor.email.toLowerCase() === user.email.toLowerCase() && adminLevel === 2) {
      return res.status(400).json({
        message: "You cannot demote your own Super Admin account to Level 2 Sub-Admin."
      });
    }

    user.isAdmin = true;
    user.adminLevel = adminLevel;
    user.adminRole = adminLevel === 1 ? "Super Admin" : requestedRole;
    user.allowedPages = allowedPages;
    user.adminGrantedAt = new Date();
    user.adminGrantedByName = String(actor?.name || "").trim();
    user.adminGrantedByEmail = String(actor?.email || "").trim().toLowerCase();
    await user.save();

    await logAdminAction({
      req,
      actorName: actor?.name,
      actorEmail: actor?.email,
      action: "admin-access-granted",
      entityType: "user",
      entityId: String(user._id || ""),
      entityLabel: user.email,
      summary: `Granted Level ${adminLevel} (${user.adminRole}) access to ${user.email}`,
      details: {
        targetUserName: String(user.name || "").trim(),
        targetUserEmail: user.email,
        adminLevel,
        assignedRole: user.adminRole,
        allowedPages
      }
    });

    res.json({
      message: `${user.email} is now a Level ${adminLevel} Admin (${user.adminRole})`,
      adminLevel,
      adminRole: user.adminRole,
      allowedPages
    });
  } catch (err) {
    console.error("[Auth] Make-admin error:", err.message);
    res.status(500).json({ message: err?.message || "Failed to update admin status." });
  }
});

router.put("/update-admin-role", protect, admin, admin.requireSuperAdmin, async (req, res) => {
  try {
    const userId = String(req.body.userId || "").trim();
    const actionType = String(req.body.action || "updateRole").trim(); // "updateRole" or "revokeAdmin"
    const requestedLevel = Number(req.body.adminLevel || 1);
    const adminLevel = [1, 2].includes(requestedLevel) ? requestedLevel : 1;
    const requestedRole = String(req.body.adminRole || (adminLevel === 1 ? "Super Admin" : "Custom Sub-Admin")).trim();
    const allowedPages = sanitizeAllowedPages(req.body.allowedPages, adminLevel === 1);

    if (!userId) {
      return res.status(400).json({ message: "User ID is required." });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found." });
    }

    const actor = await User.findById(req.user).select("name email").lean();

    if (actionType === "revokeAdmin") {
      targetUser.isAdmin = false;
      await targetUser.save();

      await logAdminAction({
        req,
        actorName: actor?.name,
        actorEmail: actor?.email,
        action: "admin-access-revoked",
        entityType: "user",
        entityId: String(targetUser._id),
        entityLabel: targetUser.email,
        summary: `Revoked admin access for ${targetUser.email}`,
        details: { targetUserEmail: targetUser.email }
      });

      return res.json({ message: `Revoked admin access for ${targetUser.email}` });
    }

    targetUser.isAdmin = true;
    targetUser.adminLevel = adminLevel;
    targetUser.adminRole = adminLevel === 1 ? "Super Admin" : requestedRole;
    targetUser.allowedPages = allowedPages;
    await targetUser.save();

    await logAdminAction({
      req,
      actorName: actor?.name,
      actorEmail: actor?.email,
      action: "admin-role-updated",
      entityType: "user",
      entityId: String(targetUser._id),
      entityLabel: targetUser.email,
      summary: `Updated Level ${adminLevel} permissions for ${targetUser.email}`,
      details: { targetUserEmail: targetUser.email, adminLevel, newRole: targetUser.adminRole, allowedPages }
    });

    res.json({
      message: `Updated Level ${adminLevel} access for ${targetUser.email}`,
      adminLevel,
      adminRole: targetUser.adminRole,
      allowedPages
    });
  } catch (err) {
    console.error("[Auth] Update-admin-role error:", err.message);
    res.status(500).json({ message: err?.message || "Failed to update admin role." });
  }
});

router.post("/activity", protect, async (req, res) => {
  try {
    const raw = Number(req.body?.timeSpentSec || 0);
    const safeTimeSpentSec = Number.isNaN(raw) ? 0 : Math.max(0, Math.min(600, raw));

    const user = await User.findById(req.user);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.lastActiveAt = new Date();
    user.totalTimeSpentSec = Math.max(0, Number(user.totalTimeSpentSec || 0) + safeTimeSpentSec);
    await user.save();

    res.json({ ok: true });
  } catch (err) {
    console.error("[Auth] Activity error:", err.message);
    res.status(500).json({ message: "Failed to record activity." });
  }
});

router.get("/admin/audit-logs", protect, admin, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 10)));
    const skip = (page - 1) * limit;

    const total = await AdminAuditLog.countDocuments();
    const logs = await AdminAuditLog.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const recentAdminActions = logs.map((entry) => ({
      _id: String(entry?._id || ""),
      actorUser: entry?.actorUser ? String(entry.actorUser) : "",
      actorName: String(entry?.actorName || "").trim() || "Admin",
      actorEmail: String(entry?.actorEmail || "").trim().toLowerCase(),
      action: String(entry?.action || "").trim(),
      entityType: String(entry?.entityType || "").trim(),
      entityId: String(entry?.entityId || "").trim(),
      entityLabel: String(entry?.entityLabel || "").trim(),
      summary: String(entry?.summary || "").trim(),
      details: entry?.details && typeof entry.details === "object" ? entry.details : {},
      createdAt: entry?.createdAt || null
    }));

    res.json({
      recentAdminActions,
      total,
      hasMore: skip + logs.length < total
    });
  } catch (err) {
    console.error("[Auth] Audit logs pagination error:", err.message);
    res.status(500).json({ message: "Failed to load audit logs." });
  }
});

router.get("/admin/security-logs", protect, admin, async (req, res) => {
  try {
    const fs = require("fs");
    const path = require("path");
    const logFile = path.resolve(__dirname, "../../logs/security_threats.log");

    if (!fs.existsSync(logFile)) {
      return res.json({ logs: [] });
    }

    const data = fs.readFileSync(logFile, "utf8");
    const lines = data.split("\n").filter(line => line.trim().length > 0);
    const parsedLogs = lines.map(line => {
      // 1. Try standard JSON parse
      try {
        return JSON.parse(line);
      } catch (e) {}

      // 2. Parse text log format: [ISO_DATE] IP=xxx PATH=xxx THREAT=xxx DETAILS={...}
      const match = line.match(/^\[(.*?)\]\s+IP=(.*?)\s+PATH=(.*?)\s+THREAT=(.*?)\s+DETAILS=(.*)$/);
      if (match) {
        let details = {};
        try {
          details = JSON.parse(match[5]);
        } catch (e) {
          details = { raw: match[5] };
        }
        return {
          timestamp: match[1],
          ip: match[2],
          path: match[3],
          threat: match[4],
          details
        };
      }

      return null;
    }).filter(log => log !== null).reverse();

    res.json({ logs: parsedLogs });
  } catch (err) {
    console.error("[Auth] Security logs fetch error:", err.message);
    res.status(500).json({ message: "Failed to load security logs." });
  }
});

router.get("/admin/users-metrics", protect, admin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitQuery = req.query.limit;
    const isPaginated = limitQuery !== "all";
    const limit = isPaginated ? Math.max(1, Math.min(100, parseInt(limitQuery, 10) || 25)) : 10000;
    const search = String(req.query.search || "").trim();
    const statusFilter = String(req.query.status || "All").trim();

    const now = Date.now();
    const activeWindowMs = 5 * 60 * 1000;
    const activeThresholdDate = new Date(now - activeWindowMs);

    // 1. Overall Metrics across ALL users in database
    const [totalUsers, activeUsersCount, timeAgg] = await Promise.all([
      User.countDocuments({ isDeleted: { $ne: true } }),
      User.countDocuments({ isDeleted: { $ne: true }, lastActiveAt: { $gte: activeThresholdDate } }),
      User.aggregate([
        { $match: { isDeleted: { $ne: true } } },
        { $group: { _id: null, totalSec: { $sum: "$totalTimeSpentSec" } } }
      ])
    ]);

    const totalTimeSpentSec = timeAgg.length > 0 ? (timeAgg[0].totalSec || 0) : 0;

    // 2. Build filter query for user listing
    const query = { isDeleted: { $ne: true } };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } }
      ];
    }

    if (statusFilter === "Online") {
      query.lastActiveAt = { $gte: activeThresholdDate };
    } else if (statusFilter === "Offline") {
      query.$or = [
        { lastActiveAt: { $lt: activeThresholdDate } },
        { lastActiveAt: { $exists: false } },
        { lastActiveAt: null }
      ];
    } else if (statusFilter === "Admin") {
      query.isAdmin = true;
    } else if (statusFilter === "Customer") {
      query.isAdmin = { $ne: true };
    }

    const skip = (page - 1) * limit;

    const [rawUsers, totalMatching] = await Promise.all([
      User.find(query)
        .select("name email isAdmin adminLevel adminRole allowedPages lastActiveAt totalTimeSpentSec")
        .sort({ lastActiveAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query)
    ]);

    const mappedUsers = rawUsers.map((user) => {
      const lastActiveTs = user?.lastActiveAt ? new Date(user.lastActiveAt).getTime() : NaN;
      const isActive = !Number.isNaN(lastActiveTs) && now - lastActiveTs <= activeWindowMs;
      const adminLevel = Number(user?.adminLevel || 1);
      return {
        _id: String(user?._id || ""),
        name: user?.name || "User",
        email: user?.email || "",
        isAdmin: Boolean(user?.isAdmin),
        adminLevel,
        adminRole: user?.adminRole || (adminLevel === 1 ? "Super Admin" : "Page Level Sub-Admin"),
        allowedPages: Array.isArray(user?.allowedPages) && user.allowedPages.length > 0 ? user.allowedPages : ["dashboard"],
        lastActiveAt: user?.lastActiveAt || null,
        totalTimeSpentSec: Math.max(0, Number(user?.totalTimeSpentSec || 0)),
        isActive
      };
    });

    const adminUsersRaw = await User.find({ isAdmin: true, isDeleted: { $ne: true } })
      .select("name email isAdmin adminLevel adminRole allowedPages adminGrantedAt adminGrantedByName adminGrantedByEmail lastActiveAt")
      .sort({ adminGrantedAt: -1, createdAt: -1 })
      .lean();

    const admins = adminUsersRaw.map((user) => {
      const lastActiveTs = user?.lastActiveAt ? new Date(user.lastActiveAt).getTime() : NaN;
      const adminLevel = Number(user?.adminLevel || 1);
      return {
        _id: String(user?._id || ""),
        name: user?.name || "Admin",
        email: user?.email || "",
        adminLevel,
        adminRole: user?.adminRole || (adminLevel === 1 ? "Super Admin" : "Page Level Sub-Admin"),
        allowedPages: Array.isArray(user?.allowedPages) && user.allowedPages.length > 0 ? user.allowedPages : ALL_ADMIN_PAGES,
        isActive: !Number.isNaN(lastActiveTs) && now - lastActiveTs <= activeWindowMs,
        lastActiveAt: user?.lastActiveAt || null,
        adminGrantedAt: user?.adminGrantedAt || null,
        adminGrantedByName: String(user?.adminGrantedByName || "").trim(),
        adminGrantedByEmail: String(user?.adminGrantedByEmail || "").trim().toLowerCase()
      };
    });

    res.json({
      totalUsers,
      activeUsers: activeUsersCount,
      totalTimeSpentSec,
      users: mappedUsers,
      pagination: {
        page,
        limit,
        total: totalMatching,
        totalPages: Math.ceil(totalMatching / limit)
      },
      admins,
      recentAdminActions: []
    });
  } catch (err) {
    console.error("[Auth] Users-metrics error:", err.message);
    res.status(500).json({ message: "Failed to load user metrics." });
  }
});

router.get("/me", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user).select("_id name email phone isAdmin adminLevel adminRole allowedPages addresses");
    if (!user) return res.status(404).json({ message: "User not found" });
    const adminLevel = Number(user.adminLevel || 1);
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone || "",
      isAdmin: Boolean(user.isAdmin),
      adminLevel,
      adminRole: user.adminRole || (adminLevel === 1 ? "Super Admin" : "Page Level Sub-Admin"),
      allowedPages: Array.isArray(user.allowedPages) && user.allowedPages.length > 0 ? user.allowedPages : ALL_ADMIN_PAGES,
      addresses: normalizeAddressList(user.addresses || [])
    });
  } catch (err) {
    console.error("[Auth] /me error:", err.message);
    res.status(500).json({ message: "Failed to load account." });
  }
});

router.get("/addresses", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user).select("addresses");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ addresses: normalizeAddressList(user.addresses || []) });
  } catch (err) {
    console.error("[Auth] Addresses error:", err.message);
    res.status(500).json({ message: "Failed to load addresses." });
  }
});

router.put("/addresses", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user).select("addresses");
    if (!user) return res.status(404).json({ message: "User not found" });
    const normalized = normalizeAddressList(req.body?.addresses || []);
    user.addresses = normalized.slice(0, 20);
    await user.save();
    res.json({ addresses: normalizeAddressList(user.addresses || []) });
  } catch (err) {
    console.error("[Auth] Update addresses error:", err.message);
    res.status(500).json({ message: "Failed to update addresses." });
  }
});

// ── Password Reset Flow ──────────────────────────────────────────────────────
router.post("/forgot-password", passwordResetLimiter, honeypotMiddleware, turnstileMiddleware, async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Please enter a valid email address." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Standard security: do not leak existence of user, just say it's sent
      return res.json({ message: "If that email is registered, a password reset link has been sent." });
    }

    const token = crypto.randomBytes(20).toString("hex");
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Construct reset link using HashRouter structure
    const resetUrl = `${req.protocol}://${req.get("host")}/#/reset-password?token=${token}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
        <h2 style="color: #1a1a2e;">Password Reset Request</h2>
        <p>Hello ${user.name || "User"},</p>
        <p>You requested a password reset for your account. Please click the button below to set a new password:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #e94560; color: white; padding: 12px 24px; text-decoration: none; border-radius: 10px; display: inline-block; font-weight: bold;">Reset Password</a>
        </p>
        <p>Or copy and paste this URL into your browser:</p>
        <p style="word-break: break-all; color: #666;"><a href="${resetUrl}">${resetUrl}</a></p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 0.85em; color: #999;">This link will expire in 1 hour. If you did not request this, you can safely ignore this email.</p>
      </div>
    `;

    await sendEmail({
      to: user.email,
      subject: "Password Reset Link",
      html: htmlContent,
      type: "password-reset"
    });

    res.json({ message: "If that email is registered, a password reset link has been sent." });
  } catch (err) {
    console.error("[Auth] Forgot password error:", err.message);
    res.status(500).json({ message: "Failed to request password reset. Please try again." });
  }
});

router.post("/reset-password", passwordResetLimiter, honeypotMiddleware, turnstileMiddleware, async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token) {
      return res.status(400).json({ message: "Password reset token is required." });
    }
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ message: passwordValidation.message });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: "Password reset token is invalid or has expired." });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    user.password = hashedPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ message: "Your password has been successfully updated. You can now log in." });
  } catch (err) {
    console.error("[Auth] Reset password error:", err.message);
    res.status(500).json({ message: "Failed to reset password. Please try again." });
  }
});

// Update user profile details
router.put("/profile", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const phone = req.body.phone !== undefined ? String(req.body.phone || "").trim() : undefined;
    const password = req.body.password;

    if (name) {
      if (name.length < 2) {
        return res.status(400).json({ message: "Name must be at least 2 characters." });
      }
      user.name = name;
    }

    if (phone !== undefined) {
      if (phone) {
        const phoneValidation = validatePhoneNumber(phone);
        if (!phoneValidation.isValid) {
          return res.status(400).json({ message: phoneValidation.message });
        }
        const cleanPhone = phoneValidation.cleanPhone;
        const otpRequired = await isWhatsAppOtpRequired();
        if (otpRequired && cleanPhone !== user.phone) {
          if (!req.body?.phoneVerificationToken) {
            return res.status(400).json({ message: "Please verify your new phone number via WhatsApp OTP." });
          }
          const otpRecord = await PhoneOtp.findOne({
            phone: cleanPhone,
            verificationToken: req.body.phoneVerificationToken,
            verified: true,
            expiresAt: { $gt: new Date() }
          });
          if (!otpRecord) {
            return res.status(400).json({ message: "WhatsApp verification token expired or invalid. Please verify phone number again." });
          }
        }
        user.phone = cleanPhone;
      } else {
        user.phone = "";
      }
    }

    if (email) {
      if (!isValidEmail(email)) {
        return res.status(400).json({ message: "Please provide a valid email address." });
      }
      const existingUser = await User.findOne({ email });
      if (existingUser && String(existingUser._id) !== String(user._id)) {
        return res.status(400).json({ message: "This email address is already in use by another account." });
      }
      user.email = email;
    }

    if (password) {
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isValid) {
        return res.status(400).json({ message: passwordValidation.message });
      }
      user.password = await bcrypt.hash(password, 12);
    }

    await user.save();

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({
      success: true,
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone || "",
      isAdmin: Boolean(user.isAdmin),
      token,
      message: "Profile details updated successfully."
    });
  } catch (err) {
    console.error("[Auth] Profile update error:", err.message);
    res.status(500).json({ message: "Failed to update profile details. Please try again." });
  }
});

// ── Google Sign-In ───────────────────────────────────────────────────────────
router.post("/google", async (req, res) => {
  try {
    const { idToken, rememberMe } = req.body;
    if (!idToken) {
      return res.status(400).json({ message: "Google ID Token is required." });
    }

    let email = "";
    let name = "";

    // Check for dev/testing simulation token
    if (idToken.startsWith("mock-google-token-")) {
      email = "mock.google.user@example.com";
      name = "Demo Google User";
    } else {
      const tokenInfoUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
      const googleRes = await axios.get(tokenInfoUrl);
      
      const payload = googleRes.data;
      if (!payload || !payload.email) {
        return res.status(400).json({ message: "Invalid Google token payload." });
      }

      email = String(payload.email).trim().toLowerCase();
      name = String(payload.name || payload.given_name || "Google User").trim();
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Invalid email from Google account." });
    }

    let user = await User.findOne({ email });
    if (!user) {
      const randomPassword = crypto.randomBytes(32).toString("hex");
      const hashedPassword = await bcrypt.hash(randomPassword, 12);
      user = await User.create({
        name,
        email,
        password: hashedPassword
      });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: getTokenExpiry(rememberMe === true) }
    );

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone || "",
      isAdmin: Boolean(user.isAdmin),
      token
    });
  } catch (err) {
    console.error("[Auth] Google sign-in validation error:", err?.response?.data || err.message);
    res.status(401).json({ message: "Google verification failed. Please try again." });
  }
});

// DELETE /api/auth/admin/users/:id - Soft delete user (ADMIN)
router.delete("/admin/users/:id", protect, admin, admin.requireSuperAdmin, async (req, res) => {
  try {
    const userToSoftDelete = await User.findById(req.params.id);
    if (!userToSoftDelete) {
      return res.status(404).json({ message: "User not found." });
    }
    if (String(userToSoftDelete._id) === String(req.user)) {
      return res.status(400).json({ message: "You cannot delete your own account." });
    }

    const actor = await User.findById(req.user).select("name email").lean();
    userToSoftDelete.isDeleted = true;
    userToSoftDelete.deletedAt = new Date();
    userToSoftDelete.deletedBy = {
      name: actor?.name || "Admin",
      email: actor?.email || ""
    };
    await userToSoftDelete.save();

    await logAdminAction({
      req,
      actorName: actor?.name,
      actorEmail: actor?.email,
      action: "user-soft-deleted",
      entityType: "user",
      entityId: String(userToSoftDelete._id),
      entityLabel: userToSoftDelete.email,
      summary: `Soft-deleted user ${userToSoftDelete.email}`,
      details: { email: userToSoftDelete.email }
    });

    res.json({ message: `Soft-deleted user ${userToSoftDelete.email}` });
  } catch (err) {
    res.status(500).json({ message: "Failed to soft delete user", error: err.message });
  }
});

// POST /api/auth/admin/users/:id/restore - Restore soft-deleted user (ADMIN)
router.post("/admin/users/:id/restore", protect, admin, admin.requireSuperAdmin, async (req, res) => {
  try {
    const userToRestore = await User.findById(req.params.id);
    if (!userToRestore) {
      return res.status(404).json({ message: "User not found." });
    }

    const actor = await User.findById(req.user).select("name email").lean();
    userToRestore.isDeleted = false;
    userToRestore.deletedAt = null;
    userToRestore.deletedBy = { name: "", email: "" };
    await userToRestore.save();

    await logAdminAction({
      req,
      actorName: actor?.name,
      actorEmail: actor?.email,
      action: "user-restored",
      entityType: "user",
      entityId: String(userToRestore._id),
      entityLabel: userToRestore.email,
      summary: `Restored user ${userToRestore.email}`,
      details: { email: userToRestore.email }
    });

    res.json({ message: `Restored user ${userToRestore.email}` });
  } catch (err) {
    res.status(500).json({ message: "Failed to restore user", error: err.message });
  }
});

// DELETE /api/auth/admin/users/:id/purge - Permanently delete user (ADMIN)
router.delete("/admin/users/:id/purge", protect, admin, admin.requireSuperAdmin, async (req, res) => {
  try {
    const userToPurge = await User.findById(req.params.id);
    if (!userToPurge) {
      return res.status(404).json({ message: "User not found." });
    }
    if (String(userToPurge._id) === String(req.user)) {
      return res.status(400).json({ message: "You cannot purge your own account." });
    }

    const email = userToPurge.email;
    const actor = await User.findById(req.user).select("name email").lean();
    await userToPurge.deleteOne();

    await logAdminAction({
      req,
      actorName: actor?.name,
      actorEmail: actor?.email,
      action: "user-permanently-deleted",
      entityType: "user",
      entityId: String(req.params.id),
      entityLabel: email,
      summary: `Permanently deleted user ${email}`,
      details: { email }
    });

    res.json({ message: `User ${email} permanently deleted.` });
  } catch (err) {
    res.status(500).json({ message: "Failed to purge user", error: err.message });
  }
});

module.exports = router;
