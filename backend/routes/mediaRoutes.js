"use strict";

const express = require("express");
const protect = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");
const { requireAnyAdminPage } = require("../middleware/adminMiddleware");
const { mediaRateLimiter } = require("../utils/spamFilter");
const { createPresignedUpload } = require("../utils/mediaPresign");

const router = express.Router();

/**
 * Handle POST /presign
 * Generates presigned POST fields for client-to-S3 direct uploads.
 */
async function handlePresign(req, res) {
  try {
    const { kind, contentType } = req.body || {};
    const result = await createPresignedUpload({ kind, contentType });

    return res.status(200).json({
      url: result.url,
      fields: result.fields,
      key: result.key,
      publicUrl: result.publicUrl
    });
  } catch (error) {
    const status = error && (error.status === 400 || error.status === 503)
      ? error.status
      : 500;

    if (status === 500) {
      return res.status(500).json({
        message: "Failed to generate presigned upload URL"
      });
    }

    return res.status(status).json({
      message: error.message || "An error occurred"
    });
  }
}

// POST /presign - protected by protect, admin, requireAnyAdminPage, mediaRateLimiter
router.post(
  "/presign",
  protect,
  admin,
  requireAnyAdminPage("products", "add-products", "marketing", "theme", "settings"),
  mediaRateLimiter,
  handlePresign
);

router.handlePresign = handlePresign;

module.exports = router;
