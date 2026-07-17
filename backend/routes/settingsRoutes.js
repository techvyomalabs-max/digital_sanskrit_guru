const express = require("express");
const StoreSettings = require("../models/StoreSettings");
const protect = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");
const { DEFAULT_CURRENCY_EXCHANGE_RATES, normalizeCurrencyRates } = require("../utils/currency");
const { getAdminActorSnapshot, logAdminAction } = require("../utils/adminAudit");
const { cacheAside, invalidateProductCache, TTL } = require("../utils/cache");

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
      button: String(item?.palette?.button || "").trim(),
      navBottom: String(item?.palette?.navBottom || "").trim() || "#1c2735"
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
      mobileImage: String(item?.mobileImage || "").trim(),
      productId: String(item?.productId || "").trim()
    }))
    .filter((item) => item.image);

  if (normalized.length > 0) {
    return normalized.slice(0, 10);
  }

  const fallbackImage = String(legacyImage || "").trim();
  const fallbackProductId = String(legacyProductId || "").trim();
  return fallbackImage ? [{ image: fallbackImage, mobileImage: "", productId: fallbackProductId }] : [];
}

function normalizeSponsors(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => ({
      _id: item?._id ? String(item._id).trim() : undefined,
      name: String(item?.name || "").trim(),
      description: String(item?.description || "").trim(),
      logoUrl: String(item?.logoUrl || "").trim(),
      websiteUrl: String(item?.websiteUrl || "").trim()
    }))
    .filter((item) => item.name);
}

function normalizeSettings(settings) {
  const heroBanners = normalizeHeroBanners(
    settings?.heroBanners || [],
    settings?.heroBannerImage || "",
    settings?.heroBannerProductId || ""
  );

  const VALID_ANIM_INTENSITIES = ["subtle", "medium", "heavy"];
  const rawAnimIntensity = String(settings?.festiveAnimation?.intensity || "subtle");

  return {
    enableCurrentLocation: settings?.enableCurrentLocation !== false,
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
    },
    festiveAnimation: {
      enabled:   Boolean(settings?.festiveAnimation?.enabled),
      type:      String(settings?.festiveAnimation?.type || "diwali"),
      intensity: VALID_ANIM_INTENSITIES.includes(rawAnimIntensity) ? rawAnimIntensity : "subtle",
      customColors: Array.isArray(settings?.festiveAnimation?.customColors)
        ? settings.festiveAnimation.customColors
            .map(c => String(c || "").trim())
            .filter(c => /^#[0-9A-Fa-f]{6}$/.test(c))
            .slice(0, 8)
        : [],
      customAnimations: Array.isArray(settings?.festiveAnimation?.customAnimations)
        ? settings.festiveAnimation.customAnimations
            .filter(a => a?.id && a?.name && a?.sourceUrl)
            .map(a => ({
              id:         String(a.id).trim(),
              name:       String(a.name).trim(),
              sourceUrl:  String(a.sourceUrl).trim(),
              sourceType: String(a.sourceType || "lottie")
            }))
            .slice(0, 20)
        : []
    },
    festiveBanner: {
      enabled:   Boolean(settings?.festiveBanner?.enabled),
      text:      String(settings?.festiveBanner?.text      || "🎉 Festive Sale is Live!").trim(),
      bgFrom:    String(settings?.festiveBanner?.bgFrom    || "#FF6B00").trim(),
      bgTo:      String(settings?.festiveBanner?.bgTo      || "#FFD700").trim(),
      textColor: String(settings?.festiveBanner?.textColor || "#ffffff").trim(),
      linkUrl:   String(settings?.festiveBanner?.linkUrl   || "").trim(),
      linkText:  String(settings?.festiveBanner?.linkText  || "Shop Now").trim()
    },
    orderConfirmationEmail: {
      subjectTemplate: String(settings?.orderConfirmationEmail?.subjectTemplate || "Order Confirmed — {{SITE_NAME}}").trim(),
      bodyTemplate: String(settings?.orderConfirmationEmail?.bodyTemplate || `<h2>Thank you for your order! 🎉</h2>
<p>Hi <strong>{{USER_NAME}}</strong>,</p>
<p>Your order has been placed successfully. We'll notify you when it ships.</p>
<p><strong>Order ID:</strong> {{ORDER_ID}}</p>
<h3>Order Details:</h3>
{{ITEMS_TABLE}}
{{SUMMARY_TABLE}}
<p><strong>Shipping to:</strong><br/>
{{SHIPPING_INFO}}
</p>`).trim(),
      headerBgColor: String(settings?.orderConfirmationEmail?.headerBgColor || "#1a1a2e").trim(),
      accentColor: String(settings?.orderConfirmationEmail?.accentColor || "#e94560").trim(),
      headerText: String(settings?.orderConfirmationEmail?.headerText || "Digital Sanskrit Guru").trim(),
      headerSubtext: String(settings?.orderConfirmationEmail?.headerSubtext || "Spreading the wisdom of Sanskrit").trim()
    },
    lastUpdatedByName: String(settings?.lastUpdatedByName || "").trim(),
    lastUpdatedByEmail: String(settings?.lastUpdatedByEmail || "").trim().toLowerCase(),
    lastUpdatedAt: settings?.lastUpdatedAt || null,
    sponsors: normalizeSponsors(settings?.sponsors || []),
    storeIcons: {
      home: String(settings?.storeIcons?.home || "🏠").trim(),
      categories: String(settings?.storeIcons?.categories || "📚").trim(),
      wishlist: String(settings?.storeIcons?.wishlist || "❤️").trim(),
      cart: String(settings?.storeIcons?.cart || "🛒").trim(),
      profile: String(settings?.storeIcons?.profile || "👤").trim(),
      search: String(settings?.storeIcons?.search || "🔍").trim()
    }
  };
}

function buildPublicSettingsPayload(settings) {
  const normalized = normalizeSettings(settings);
  return {
    enableCurrentLocation: normalized.enableCurrentLocation,
    gstPercent: normalized.gstPercent,
    deliveryCharge: normalized.deliveryCharge,
    warehouseLocation: normalized.warehouseLocation,
    distancePricing: normalized.distancePricing,
    internationalDelivery: normalized.internationalDelivery,
    pricingMarkets: normalized.pricingMarkets,
    internationalPricingDefaults: normalized.internationalPricingDefaults,
    currencyConversionRates: normalized.currencyConversionRates,
    siteTheme: normalized.siteTheme,
    customThemes: normalized.customThemes,
    festiveAnimation: normalized.festiveAnimation,
    festiveBanner:    normalized.festiveBanner,
    sponsors:         normalized.sponsors,
    storeIcons:       normalized.storeIcons
  };
}

function summarizeSettingsChanges(previousSettings = {}, nextSettings = {}) {
  const changes = [];

  if (Boolean(previousSettings?.enableCurrentLocation) !== Boolean(nextSettings?.enableCurrentLocation)) changes.push("current location visibility");
  if (Number(previousSettings?.gstPercent || 0) !== Number(nextSettings?.gstPercent || 0)) changes.push("GST");
  if (Number(previousSettings?.deliveryCharge || 0) !== Number(nextSettings?.deliveryCharge || 0)) changes.push("delivery charge");
  if (JSON.stringify(previousSettings?.warehouseLocation || {}) !== JSON.stringify(nextSettings?.warehouseLocation || {})) changes.push("warehouse location");
  if (JSON.stringify(previousSettings?.distancePricing || {}) !== JSON.stringify(nextSettings?.distancePricing || {})) changes.push("distance pricing");
  if (JSON.stringify(previousSettings?.internationalDelivery || {}) !== JSON.stringify(nextSettings?.internationalDelivery || {})) changes.push("international delivery");
  if (JSON.stringify(previousSettings?.pricingMarkets || []) !== JSON.stringify(nextSettings?.pricingMarkets || [])) changes.push("pricing markets");
  if (JSON.stringify(previousSettings?.internationalPricingDefaults || {}) !== JSON.stringify(nextSettings?.internationalPricingDefaults || {})) changes.push("fallback currency");
  if (JSON.stringify(previousSettings?.currencyConversionRates || {}) !== JSON.stringify(nextSettings?.currencyConversionRates || {})) changes.push("conversion rates");
  if (String(previousSettings?.siteTheme || "") !== String(nextSettings?.siteTheme || "")) changes.push("site theme");
  if (JSON.stringify(previousSettings?.customThemes || []) !== JSON.stringify(nextSettings?.customThemes || [])) changes.push("custom themes");
  if (JSON.stringify(previousSettings?.productCategories || []) !== JSON.stringify(nextSettings?.productCategories || [])) changes.push("product categories");
  if (JSON.stringify(previousSettings?.heroBanners || []) !== JSON.stringify(nextSettings?.heroBanners || [])) changes.push("hero banners");
  if (JSON.stringify(previousSettings?.homeSectionVisibility || {}) !== JSON.stringify(nextSettings?.homeSectionVisibility || {})) changes.push("home sections");
  if (JSON.stringify(previousSettings?.collectionFilterVisibility || {}) !== JSON.stringify(nextSettings?.collectionFilterVisibility || {})) changes.push("collection filters");
  if (JSON.stringify(previousSettings?.sponsors || []) !== JSON.stringify(nextSettings?.sponsors || [])) changes.push("sponsors");
  if (JSON.stringify(previousSettings?.storeIcons || {}) !== JSON.stringify(nextSettings?.storeIcons || {})) changes.push("store icons");

  return changes;
}

async function getOrCreateSettings() {
  let settings = await StoreSettings.findOne();
  if (!settings) {
    settings = await StoreSettings.create({});
  }
  return settings;
}

// Admin: full settings (no cache for admin panel to prevent config lag)
router.get("/", async (req, res) => {
  const settings = await getOrCreateSettings();
  res.json(normalizeSettings(settings));
});

// Public: checkout/pricing settings (no browser cache to prevent configuration lag)
router.get("/public", async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  const settings = await cacheAside("settings:public", TTL.SETTINGS_PUBLIC, getOrCreateSettings);
  res.json(buildPublicSettingsPayload(settings));
});

// Public: Detect user country from CDN/Edge headers silently (no browser popup needed)
router.get(["/detect-country", "/detect_country"], (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  const country = req.headers["cf-ipcountry"] || 
                  req.headers["x-vercel-ip-country"] || 
                  req.headers["x-country"] ||
                  req.headers["cloudfront-viewer-country"] || 
                  "IN";
  res.json({ country: String(country).toUpperCase() });
});

router.put("/", protect, admin, async (req, res) => {
  const actor = await getAdminActorSnapshot(req.user);
  const hasEnableCurrentLocation = req.body?.enableCurrentLocation !== undefined;
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
  const hasFestiveAnimation = Boolean(
    req.body?.festiveAnimation && typeof req.body.festiveAnimation === "object"
  );
  const hasOrderConfirmationEmail = Boolean(
    req.body?.orderConfirmationEmail && typeof req.body.orderConfirmationEmail === "object"
  );

  const gstPercent = Number.isNaN(rawGst) ? 0 : Math.min(50, Math.max(0, rawGst));
  const deliveryCharge = Number.isNaN(rawDelivery) ? 0 : Math.max(0, rawDelivery);

  const settings = await getOrCreateSettings();
  const previousSettings = normalizeSettings(settings.toObject ? settings.toObject() : settings);
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
  const hasSponsors = Array.isArray(req.body?.sponsors);
  const sponsors = hasSponsors
    ? normalizeSponsors(req.body?.sponsors)
    : normalizeSponsors(settings.sponsors || []);

  const hasStoreIcons = Boolean(req.body?.storeIcons && typeof req.body.storeIcons === "object");
  if (hasStoreIcons) {
    settings.storeIcons = {
      home: String(req.body.storeIcons.home || "🏠").trim(),
      categories: String(req.body.storeIcons.categories || "📚").trim(),
      wishlist: String(req.body.storeIcons.wishlist || "❤️").trim(),
      cart: String(req.body.storeIcons.cart || "🛒").trim(),
      profile: String(req.body.storeIcons.profile || "👤").trim(),
      search: String(req.body.storeIcons.search || "🔍").trim()
    };
    settings.markModified("storeIcons");
  }
  const allowedThemeIds = new Set([
    ...StoreSettings.SITE_THEMES,
    ...customThemes.map((theme) => theme.id)
  ]);

  if (hasEnableCurrentLocation) {
    settings.enableCurrentLocation = Boolean(req.body.enableCurrentLocation);
  }

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
  settings.sponsors = sponsors;
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
  // ── Festive animation ────────────────────────────────────────────────────
  if (hasFestiveAnimation) {
    const PRESET_TYPES  = ["diwali", "holi", "christmas", "newyear", "confetti"];
    const VALID_INTENSITIES = ["subtle", "medium", "heavy"];
    const inType      = String(req.body.festiveAnimation?.type      || "").trim();
    const inIntensity = String(req.body.festiveAnimation?.intensity || "");
    const inColors    = Array.isArray(req.body.festiveAnimation?.customColors)
      ? req.body.festiveAnimation.customColors
          .map(c => String(c || "").trim())
          .filter(c => /^#[0-9A-Fa-f]{6}$/.test(c))
          .slice(0, 8)
      : (settings.festiveAnimation?.customColors || []);
    // customAnimations: accept add/remove/reorder via full array replacement
    const inCustomAnimations = Array.isArray(req.body.festiveAnimation?.customAnimations)
      ? req.body.festiveAnimation.customAnimations
          .filter(a => a?.id && a?.name && a?.sourceUrl)
          .map(a => ({
            id:         String(a.id).trim(),
            name:       String(a.name).trim(),
            sourceUrl:  String(a.sourceUrl).trim(),
            sourceType: "lottie"
          }))
          .slice(0, 20)
      : (settings.festiveAnimation?.customAnimations || []);
    // Type must be a preset OR exist in current customAnimations
    const allKnownTypes = [...PRESET_TYPES, ...inCustomAnimations.map(a => a.id)];
    settings.festiveAnimation = {
      enabled:          Boolean(req.body.festiveAnimation?.enabled),
      type:             inType && allKnownTypes.includes(inType) ? inType : (settings.festiveAnimation?.type || "diwali"),
      intensity:        VALID_INTENSITIES.includes(inIntensity) ? inIntensity : (settings.festiveAnimation?.intensity || "subtle"),
      customColors:     inColors,
      customAnimations: inCustomAnimations
    };
  }
  // ── Festive banner ──────────────────────────────────────────────────
  if (req.body?.festiveBanner && typeof req.body.festiveBanner === "object") {
    settings.festiveBanner = {
      enabled:   Boolean(req.body.festiveBanner?.enabled),
      text:      String(req.body.festiveBanner?.text      || "🎉 Festive Sale is Live!").trim(),
      bgFrom:    String(req.body.festiveBanner?.bgFrom    || "#FF6B00").trim(),
      bgTo:      String(req.body.festiveBanner?.bgTo      || "#FFD700").trim(),
      textColor: String(req.body.festiveBanner?.textColor || "#ffffff").trim(),
      linkUrl:   String(req.body.festiveBanner?.linkUrl   || "").trim(),
      linkText:  String(req.body.festiveBanner?.linkText  || "Shop Now").trim()
    };
  }
  if (hasOrderConfirmationEmail) {
    settings.orderConfirmationEmail = {
      subjectTemplate: String(req.body.orderConfirmationEmail.subjectTemplate || "Order Confirmed — {{SITE_NAME}}").trim(),
      bodyTemplate: String(req.body.orderConfirmationEmail.bodyTemplate || `<h2>Thank you for your order! 🎉</h2>
<p>Hi <strong>{{USER_NAME}}</strong>,</p>
<p>Your order has been placed successfully. We'll notify you when it ships.</p>
<p><strong>Order ID:</strong> {{ORDER_ID}}</p>
<h3>Order Details:</h3>
{{ITEMS_TABLE}}
{{SUMMARY_TABLE}}
<p><strong>Shipping to:</strong><br/>
{{SHIPPING_INFO}}
</p>`).trim(),
      headerBgColor: String(req.body.orderConfirmationEmail.headerBgColor || "#1a1a2e").trim(),
      accentColor: String(req.body.orderConfirmationEmail.accentColor || "#e94560").trim(),
      headerText: String(req.body.orderConfirmationEmail.headerText || "Digital Sanskrit Guru").trim(),
      headerSubtext: String(req.body.orderConfirmationEmail.headerSubtext || "Spreading the wisdom of Sanskrit").trim()
    };
  }
  settings.siteTheme = hasSiteTheme && allowedThemeIds.has(rawTheme)
    ? rawTheme
    : allowedThemeIds.has(settings.siteTheme)
      ? settings.siteTheme
      : DEFAULT_THEME;
  settings.lastUpdatedByName = actor.name;
  settings.lastUpdatedByEmail = actor.email;
  settings.lastUpdatedAt = new Date();
  await settings.save();
  const normalizedSettings = normalizeSettings(settings);
  const changedSections = summarizeSettingsChanges(previousSettings, normalizedSettings);

  await logAdminAction({
    req,
    action: "settings-updated",
    entityType: "store-settings",
    entityId: String(settings._id || ""),
    entityLabel: "Store Settings",
    summary:
      changedSections.length > 0
        ? `Updated store settings: ${changedSections.slice(0, 4).join(", ")}`
        : "Updated store settings",
    details: {
      changedSections
    }
  });

  res.json(normalizedSettings);
  // Settings change may affect pricing/home data — flush all relevant caches
  invalidateProductCache();
});

module.exports = router;
