const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async (req, res, next) => {
  const authHeader = String(req.headers.authorization || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return res.status(401).json({ message: "Not authorized" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    const user = await User.findById(decoded.id).select("isBlocked isDeleted tokenVersion").lean();
    if (!user || user.isDeleted || user.isBlocked) {
      return res.status(401).json({ message: "Account is inactive, blocked, or not found." });
    }

    const decodedTv = Number(decoded.tv ?? decoded.tokenVersion ?? 0);
    const userTv = Number(user.tokenVersion || 0);

    if (decodedTv !== userTv) {
      return res.status(401).json({ message: "Session expired. Please sign in again." });
    }

    req.user = decoded.id;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};