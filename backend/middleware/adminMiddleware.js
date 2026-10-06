const User = require("../models/User");

const adminMiddleware = async (req, res, next) => {
  try {
    const user = await User.findById(req.user).select("-password").lean();

    if (!user || !user.isAdmin) {
      return res.status(403).json({ message: "Admin access denied" });
    }

    req.adminUser = user;
    req.adminLevel = Number(user.adminLevel) === 1 ? 1 : 2;
    req.adminRole = req.adminLevel === 1 ? "Super Admin" : (user.adminRole || "Staff");
    req.allowedPages = req.adminLevel === 1
      ? ["dashboard", "orders", "products", "add-products", "coupons", "marketing", "users", "theme", "settings"]
      : (Array.isArray(user.allowedPages) ? user.allowedPages : []);

    next();
  } catch (error) {
    return res.status(500).json({ message: "Server error checking admin privileges." });
  }
};

const requireSuperAdmin = (req, res, next) => {
  if (!req.adminUser || !req.adminUser.isAdmin) {
    return res.status(403).json({ message: "Admin access denied." });
  }

  const level = Number(req.adminLevel || 2);

  if (level === 1) {
    return next();
  }

  return res.status(403).json({ message: "Access denied. Only 1st Level Super Admins can perform this action." });
};

const requireAdminRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.adminUser || !req.adminUser.isAdmin) {
      return res.status(403).json({ message: "Admin access denied." });
    }

    const level = Number(req.adminLevel || 1);
    const currentRole = req.adminRole || "Super Admin";

    if (level === 1 || currentRole === "Super Admin" || allowedRoles.includes(currentRole)) {
      return next();
    }

    return res.status(403).json({
      message: `Access denied. Required role: ${allowedRoles.join(", ")}`
    });
  };
};

const requireAdminPage = (pageKey) => {
  return (req, res, next) => {
    if (!req.adminUser || !req.adminUser.isAdmin) {
      return res.status(403).json({ message: "Admin access denied." });
    }

    const level = Number(req.adminLevel || 1);
    if (level === 1) {
      return next(); // Level 1 Super Admins have access to all pages
    }

    const pages = Array.isArray(req.allowedPages) ? req.allowedPages : ["dashboard"];
    if (pages.includes(pageKey)) {
      return next();
    }

    return res.status(403).json({
      message: `Access denied. Page level permission required: ${pageKey}`
    });
  };
};

module.exports = adminMiddleware;
module.exports.requireSuperAdmin = requireSuperAdmin;
module.exports.requireAdminRole = requireAdminRole;
module.exports.requireAdminPage = requireAdminPage;