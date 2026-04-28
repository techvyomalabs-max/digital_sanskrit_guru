const express = require("express");
const StoreSettings = require("../models/StoreSettings");
const protect = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");

const router = express.Router();
const DEFAULT_THEME = "sunrise";
const HEX_COLOR_REGEX = /^#([0-9a-f]{6})$/i;
const LEGACY_DEFAULT_PRODUCT_CATEGORIES = [
  "Audio Device",
  "Book - Paperback",
  "Combo",
  "Course Products",
  "E-Book - Kindle",
  "Festival Offer",
  "Flipbook",
  "Learning path",
  "USB Stick",
  "Web Version",
  "General"
];

function sanitizeThemeId(value, fallback = "custom-theme") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

function normalizeCustomThemes(input) {
  if (!Array.isArray(input)) return [];

  const usedIds = new Set(StoreSettings.SITE_THEMES);

  return input.reduce((acc, item, index) => {
    const name = String(item?.name || "").trim();
    if (!name) {
      return acc;
    }

    const palette = {
      bg: String(item?.palette?.bg || "").trim(),
      surface: String(item?.palette?.surface || "").trim(),
      text: String(item?.palette?.text || "").trim(),
      header: String(item?.palette?.header || "").trim(),
      accent: String(item?.palette?.accent || "").trim(),
      button: String(item?.palette?.button || "").trim()
    };

    const paletteValid = Object.values(palette).every((color) => HEX_COLOR_REGEX.test(color));
    if (!paletteValid) {
      return acc;
    }

    let id = sanitizeThemeId(item?.id || name, `custom-theme-${index + 1}`);
    while (usedIds.has(id)) {
      id = `${id}-${index + 1}`;
    }
    usedIds.add(id);

    acc.push({
      id,
      name,
      description: String(item?.description || "").trim(),
      palette
    });

    return acc;
  }, []);
}

function normalizeProductCategories(input) {
  const values = Array.isArray(input) ? input : StoreSettings.DEFAULT_PRODUCT_CATEGORIES;
  const seen = new Set();

  const normalized = values.reduce((acc, item) => {
    const value = String(item || "").trim();
    const key = value.toLowerCase();

    if (!value || seen.has(key)) {
      return acc;
    }

    seen.add(key);
    acc.push(value);
    return acc;
  }, []);

  if (!seen.has("general")) {
    normalized.push("General");
  }

  const isLegacyDefault =
    normalized.length === LEGACY_DEFAULT_PRODUCT_CATEGORIES.length &&
    normalized.every((item, index) => item.toLowerCase() === LEGACY_DEFAULT_PRODUCT_CATEGORIES[index].toLowerCase());

  if (isLegacyDefault) {
    return [...StoreSettings.DEFAULT_PRODUCT_CATEGORIES];
  }

  return normalized;
}

function normalizeCoordinate(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeWarehouseLocation(input) {
  return {
    name: String(input?.name || "").trim(),
    address: String(input?.address || "").trim(),
    mapUrl: String(input?.mapUrl || "").trim(),
    latitude: normalizeCoordinate(input?.latitude),
    longitude: normalizeCoordinate(input?.longitude)
  };
}

function normalizeDistancePricing(input, fallbackDeliveryCharge = 0) {
  const rawMax = normalizeCoordinate(input?.maxCharge);
  return {
    enabled: input?.enabled !== false,
    baseFee: Math.max(0, Number(input?.baseFee ?? fallbackDeliveryCharge ?? 0)),
    perKmCharge: Math.max(0, Number(input?.perKmCharge || 0)),
    freeRadiusKm: Math.max(0, Number(input?.freeRadiusKm || 0)),
    maxCharge: rawMax === null ? null : Math.max(0, rawMax)
  };
}

function normalizeSettings(settings) {
  return {
    gstPercent: Number(settings?.gstPercent || 0),
    deliveryCharge: Number(settings?.deliveryCharge || 0),
    warehouseLocation: normalizeWarehouseLocation(settings?.warehouseLocation || {}),
    distancePricing: normalizeDistancePricing(settings?.distancePricing || {}, settings?.deliveryCharge || 0),
    siteTheme: String(settings?.siteTheme || DEFAULT_THEME),
    customThemes: normalizeCustomThemes(settings?.customThemes || []),
    productCategories: normalizeProductCategories(settings?.productCategories || [])
  };
}

async function getOrCreateSettings() {
  let settings = await StoreSettings.findOne();
  if (!settings) {
    settings = await StoreSettings.create({});
  }
  return settings;
}

router.get("/", async (req, res) => {
  const settings = await getOrCreateSettings();
  res.json(normalizeSettings(settings));
});

router.put("/", protect, admin, async (req, res) => {
  const rawGst = Number(req.body?.gstPercent);
  const rawDelivery = Number(req.body?.deliveryCharge);
  const rawTheme = String(req.body?.siteTheme || "").trim().toLowerCase();
  const hasSiteTheme = Boolean(String(req.body?.siteTheme || "").trim());
  const hasCustomThemes = Array.isArray(req.body?.customThemes);
  const hasProductCategories = Array.isArray(req.body?.productCategories);
  const hasWarehouseLocation = Boolean(req.body?.warehouseLocation && typeof req.body.warehouseLocation === "object");
  const hasDistancePricing = Boolean(req.body?.distancePricing && typeof req.body.distancePricing === "object");

  const gstPercent = Number.isNaN(rawGst) ? 0 : Math.min(50, Math.max(0, rawGst));
  const deliveryCharge = Number.isNaN(rawDelivery) ? 0 : Math.max(0, rawDelivery);

  const settings = await getOrCreateSettings();
  const nextDeliveryCharge = Number.isNaN(rawDelivery) ? Number(settings.deliveryCharge || 0) : deliveryCharge;
  const warehouseLocation = hasWarehouseLocation
    ? normalizeWarehouseLocation(req.body?.warehouseLocation)
    : normalizeWarehouseLocation(settings.warehouseLocation || {});
  const distancePricing = hasDistancePricing
    ? normalizeDistancePricing(req.body?.distancePricing, nextDeliveryCharge)
    : normalizeDistancePricing(settings.distancePricing || {}, nextDeliveryCharge);
  const customThemes = hasCustomThemes
    ? normalizeCustomThemes(req.body?.customThemes)
    : normalizeCustomThemes(settings.customThemes || []);
  const productCategories = hasProductCategories
    ? normalizeProductCategories(req.body?.productCategories)
    : normalizeProductCategories(settings.productCategories || []);
  const allowedThemeIds = new Set([
    ...StoreSettings.SITE_THEMES,
    ...customThemes.map((theme) => theme.id)
  ]);

  settings.gstPercent = Number.isNaN(rawGst) ? settings.gstPercent : gstPercent;
  settings.deliveryCharge = Number.isNaN(rawDelivery) ? settings.deliveryCharge : deliveryCharge;
  settings.warehouseLocation = warehouseLocation;
  settings.distancePricing = distancePricing;
  settings.customThemes = customThemes;
  settings.productCategories = productCategories;
  settings.siteTheme = hasSiteTheme && allowedThemeIds.has(rawTheme)
    ? rawTheme
    : allowedThemeIds.has(settings.siteTheme)
      ? settings.siteTheme
      : DEFAULT_THEME;
  await settings.save();

  res.json(normalizeSettings(settings));
});

module.exports = router;
