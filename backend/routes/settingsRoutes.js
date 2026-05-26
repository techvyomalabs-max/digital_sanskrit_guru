const express = require("express");
const StoreSettings = require("../models/StoreSettings");
const protect = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");
const { DEFAULT_CURRENCY_EXCHANGE_RATES, normalizeCurrencyRates } = require("../utils/currency");

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
const SUPPORTED_PRICING_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "CAD", "AUD"];
const DEFAULT_INTERNATIONAL_CURRENCY = "USD";

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

function normalizeCountryName(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeCurrencyCode(value, fallback = DEFAULT_INTERNATIONAL_CURRENCY) {
  const normalized = String(value || "").trim().toUpperCase();
  if (SUPPORTED_PRICING_CURRENCIES.includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function normalizePricingMarkets(input) {
  const values = Array.isArray(input) ? input : [];
  const seenMarkets = new Set();

  return values.reduce((acc, item) => {
    const name = String(item?.name || "").trim();
    const key = name.toLowerCase();
    if (!name || seenMarkets.has(key)) {
      return acc;
    }

    seenMarkets.add(key);
    const seenCountries = new Set();
    const countries = (Array.isArray(item?.countries) ? item.countries : []).reduce((countryAcc, countryValue) => {
      const country = String(countryValue || "").trim();
      const countryKey = country.toLowerCase();
      if (!country || seenCountries.has(countryKey)) {
        return countryAcc;
      }

      seenCountries.add(countryKey);
      countryAcc.push(country);
      return countryAcc;
    }, []);

    acc.push({
      name,
      currency: normalizeCurrencyCode(item?.currency, DEFAULT_INTERNATIONAL_CURRENCY),
      countries
    });
    return acc;
  }, []);
}

function normalizeInternationalPricingDefaults(input) {
  return {
    currency: normalizeCurrencyCode(input?.currency, DEFAULT_INTERNATIONAL_CURRENCY)
  };
}

function normalizeCurrencyConversionRates(input) {
  return normalizeCurrencyRates(input || DEFAULT_CURRENCY_EXCHANGE_RATES);
}

function normalizeInternationalDelivery(input, fallbackDeliveryCharge = 0) {
  const rawRates = Array.isArray(input?.countryRates) ? input.countryRates : [];
  const seen = new Set();

  const countryRates = rawRates.reduce((acc, item) => {
    const country = String(item?.country || "").trim();
    const key = normalizeCountryName(country);
    if (!country || seen.has(key)) {
      return acc;
    }

    seen.add(key);
    acc.push({
      country,
      fee: Math.max(0, Number(item?.fee ?? 0))
    });
    return acc;
  }, []);

  return {
    enabled: input?.enabled === true,
    domesticCountry: String(input?.domesticCountry || "India").trim() || "India",
    defaultFee: Math.max(0, Number(input?.defaultFee ?? fallbackDeliveryCharge ?? 0)),
    countryRates
  };
}

function normalizeHeroBanners(input, legacyImage = "", legacyProductId = "") {
  const values = Array.isArray(input) ? input : [];
  const normalized = values
    .map((item) => ({
      image: String(item?.image || "").trim(),
      productId: String(item?.productId || "").trim()
    }))
    .filter((item) => item.image);

  if (normalized.length > 0) {
    return normalized.slice(0, 10);
  }

  const fallbackImage = String(legacyImage || "").trim();
  const fallbackProductId = String(legacyProductId || "").trim();
  return fallbackImage ? [{ image: fallbackImage, productId: fallbackProductId }] : [];
}

function normalizeSettings(settings) {
  const heroBanners = normalizeHeroBanners(
    settings?.heroBanners || [],
    settings?.heroBannerImage || "",
    settings?.heroBannerProductId || ""
  );

  return {
    gstPercent: Number(settings?.gstPercent || 0),
    deliveryCharge: Number(settings?.deliveryCharge || 0),
    warehouseLocation: normalizeWarehouseLocation(settings?.warehouseLocation || {}),
    distancePricing: normalizeDistancePricing(settings?.distancePricing || {}, settings?.deliveryCharge || 0),
    internationalDelivery: normalizeInternationalDelivery(settings?.internationalDelivery || {}, settings?.deliveryCharge || 0),
    pricingMarkets: normalizePricingMarkets(settings?.pricingMarkets || []),
    internationalPricingDefaults: normalizeInternationalPricingDefaults(settings?.internationalPricingDefaults || {}),
    currencyConversionRates: normalizeCurrencyConversionRates(settings?.currencyConversionRates || {}),
    siteTheme: String(settings?.siteTheme || DEFAULT_THEME),
    customThemes: normalizeCustomThemes(settings?.customThemes || []),
    productCategories: normalizeProductCategories(settings?.productCategories || []),
    heroBannerImage: heroBanners[0]?.image || "",
    heroBannerProductId: heroBanners[0]?.productId || "",
    heroBanners,
    homeSectionVisibility: {
      festiveOffers: settings?.homeSectionVisibility?.festiveOffers !== false
    },
    collectionFilterVisibility: {
      festiveOffers: settings?.collectionFilterVisibility?.festiveOffers !== false
    }
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
  const hasInternationalDelivery = Boolean(
    req.body?.internationalDelivery && typeof req.body.internationalDelivery === "object"
  );
  const hasPricingMarkets = Array.isArray(req.body?.pricingMarkets);
  const hasInternationalPricingDefaults = Boolean(
    req.body?.internationalPricingDefaults && typeof req.body.internationalPricingDefaults === "object"
  );
  const hasCurrencyConversionRates = Boolean(
    req.body?.currencyConversionRates && typeof req.body.currencyConversionRates === "object"
  );
  const hasHeroBannerImage = typeof req.body?.heroBannerImage === "string";
  const hasHeroBannerProductId = typeof req.body?.heroBannerProductId === "string";
  const hasHeroBanners = Array.isArray(req.body?.heroBanners);
  const hasHomeSectionVisibility = Boolean(
    req.body?.homeSectionVisibility && typeof req.body.homeSectionVisibility === "object"
  );
  const hasCollectionFilterVisibility = Boolean(
    req.body?.collectionFilterVisibility && typeof req.body.collectionFilterVisibility === "object"
  );

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
  const internationalDelivery = hasInternationalDelivery
    ? normalizeInternationalDelivery(req.body?.internationalDelivery, nextDeliveryCharge)
    : normalizeInternationalDelivery(settings.internationalDelivery || {}, nextDeliveryCharge);
  const pricingMarkets = hasPricingMarkets
    ? normalizePricingMarkets(req.body?.pricingMarkets)
    : normalizePricingMarkets(settings.pricingMarkets || []);
  const internationalPricingDefaults = hasInternationalPricingDefaults
    ? normalizeInternationalPricingDefaults(req.body?.internationalPricingDefaults)
    : normalizeInternationalPricingDefaults(settings.internationalPricingDefaults || {});
  const currencyConversionRates = hasCurrencyConversionRates
    ? normalizeCurrencyConversionRates(req.body?.currencyConversionRates)
    : normalizeCurrencyConversionRates(settings.currencyConversionRates || {});
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
  settings.internationalDelivery = internationalDelivery;
  settings.pricingMarkets = pricingMarkets;
  settings.internationalPricingDefaults = internationalPricingDefaults;
  settings.currencyConversionRates = currencyConversionRates;
  settings.customThemes = customThemes;
  settings.productCategories = productCategories;
  const nextHeroBanners = hasHeroBanners
    ? normalizeHeroBanners(req.body?.heroBanners || [])
    : normalizeHeroBanners(
        settings.heroBanners || [],
        hasHeroBannerImage ? String(req.body?.heroBannerImage || "").trim() : settings.heroBannerImage || "",
        hasHeroBannerProductId ? String(req.body?.heroBannerProductId || "").trim() : settings.heroBannerProductId || ""
      );
  settings.heroBanners = nextHeroBanners;
  settings.heroBannerImage = nextHeroBanners[0]?.image || "";
  settings.heroBannerProductId = nextHeroBanners[0]?.productId || "";
  settings.homeSectionVisibility = {
    festiveOffers: hasHomeSectionVisibility
      ? req.body?.homeSectionVisibility?.festiveOffers !== false
      : settings?.homeSectionVisibility?.festiveOffers !== false
  };
  settings.collectionFilterVisibility = {
    festiveOffers: hasCollectionFilterVisibility
      ? req.body?.collectionFilterVisibility?.festiveOffers !== false
      : settings?.collectionFilterVisibility?.festiveOffers !== false
  };
  settings.siteTheme = hasSiteTheme && allowedThemeIds.has(rawTheme)
    ? rawTheme
    : allowedThemeIds.has(settings.siteTheme)
      ? settings.siteTheme
      : DEFAULT_THEME;
  await settings.save();

  res.json(normalizeSettings(settings));
});

module.exports = router;
