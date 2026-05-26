const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const protect = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");

const router = express.Router();

const getTokenExpiry = (rememberMe) => (rememberMe ? "30d" : "12h");

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

router.get("/register", (req, res) => {
  res.status(405).json({
    message: "Use POST /api/auth/register with name, email, and password."
  });
});

router.post("/register", async (req, res) => {
  const { name, email, password, rememberMe } = req.body;

  const userExists = await User.findOne({ email });
  if (userExists) {
    return res.status(400).json({ message: "User already exists" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    name,
    email,
    password: hashedPassword
  });

  const token = jwt.sign(
    { id: user._id },
    process.env.JWT_SECRET,
    { expiresIn: getTokenExpiry(rememberMe === true) }
  );

  res.json({
    _id: user._id,
    name: user.name,
    email: user.email,
    isAdmin: user.isAdmin,
    token
  });
});

router.get("/login", (req, res) => {
  res.status(405).json({
    message: "Use POST /api/auth/login with email and password."
  });
});

router.post("/login", async (req, res) => {
  const { email, password, rememberMe } = req.body;

  const user = await User.findOne({ email });

  if (user && await bcrypt.compare(password, user.password)) {
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: getTokenExpiry(rememberMe === true) }
    );

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      token
    });
  } else {
    res.status(401).json({ message: "Invalid credentials" });
  }
});

router.put("/make-admin", protect, admin, async (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase();

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (user.isAdmin) {
    return res.json({ message: "User is already an admin" });
  }

  user.isAdmin = true;
  await user.save();

  res.json({ message: `${user.email} is now an admin` });
});

router.post("/activity", protect, async (req, res) => {
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
});

router.get("/admin/users-metrics", protect, admin, async (req, res) => {
  const users = await User.find().select("name email isAdmin lastActiveAt totalTimeSpentSec").lean();
  const now = Date.now();
  const activeWindowMs = 5 * 60 * 1000;

  const mappedUsers = users
    .map((user) => {
      const lastActiveTs = user?.lastActiveAt ? new Date(user.lastActiveAt).getTime() : NaN;
      const isActive = !Number.isNaN(lastActiveTs) && now - lastActiveTs <= activeWindowMs;
      return {
        _id: String(user?._id || ""),
        name: user?.name || "User",
        email: user?.email || "",
        isAdmin: Boolean(user?.isAdmin),
        lastActiveAt: user?.lastActiveAt || null,
        totalTimeSpentSec: Math.max(0, Number(user?.totalTimeSpentSec || 0)),
        isActive
      };
    })
    .sort((a, b) => {
      const aTs = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
      const bTs = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
      return bTs - aTs;
    });

  const totalUsers = mappedUsers.length;
  const activeUsers = mappedUsers.filter((user) => user.isActive).length;
  const totalTimeSpentSec = mappedUsers.reduce((sum, user) => sum + Number(user.totalTimeSpentSec || 0), 0);

  res.json({
    totalUsers,
    activeUsers,
    totalTimeSpentSec,
    users: mappedUsers.slice(0, 30)
  });
});

router.get("/me", protect, async (req, res) => {
  const user = await User.findById(req.user).select("_id name email isAdmin addresses");
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.json({
    _id: user._id,
    name: user.name,
    email: user.email,
    isAdmin: Boolean(user.isAdmin),
    addresses: normalizeAddressList(user.addresses || [])
  });
});

router.get("/addresses", protect, async (req, res) => {
  const user = await User.findById(req.user).select("addresses");
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.json({
    addresses: normalizeAddressList(user.addresses || [])
  });
});

router.put("/addresses", protect, async (req, res) => {
  const user = await User.findById(req.user).select("addresses");
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const normalized = normalizeAddressList(req.body?.addresses || []);
  user.addresses = normalized.slice(0, 20);
  await user.save();

  res.json({
    addresses: normalizeAddressList(user.addresses || [])
  });
});

module.exports = router;
