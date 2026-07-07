const REGION_TO_CURRENCY = {
  IN: "INR",
  US: "USD",
  GB: "GBP",
  CA: "CAD",
  AU: "AUD",
  NZ: "NZD",
  JP: "JPY",
  CN: "CNY",
  SG: "SGD",
  AE: "AED",
  SA: "SAR",
  QA: "QAR",
  KW: "KWD",
  OM: "OMR",
  BH: "BHD",
  PK: "PKR",
  BD: "BDT",
  NP: "NPR",
  LK: "LKR",
  DE: "EUR",
  FR: "EUR",
  IT: "EUR",
  ES: "EUR",
  NL: "EUR",
  IE: "EUR",
  PT: "EUR",
  BE: "EUR"
};

const COUNTRY_NAME_TO_REGION = {
  india: "IN",
  usa: "US",
  "united states": "US",
  "united states of america": "US",
  uk: "GB",
  "united kingdom": "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  canada: "CA",
  australia: "AU",
  "new zealand": "NZ",
  japan: "JP",
  china: "CN",
  singapore: "SG",
  "united arab emirates": "AE",
  uae: "AE",
  "saudi arabia": "SA",
  qatar: "QA",
  kuwait: "KW",
  oman: "OM",
  bahrain: "BH",
  pakistan: "PK",
  bangladesh: "BD",
  nepal: "NP",
  "sri lanka": "LK",
  germany: "DE",
  france: "FR",
  italy: "IT",
  spain: "ES",
  netherlands: "NL",
  ireland: "IE",
  portugal: "PT",
  belgium: "BE"
};

const CURRENCY_TO_LOCALE = {
  INR: "en-IN",
  USD: "en-US",
  GBP: "en-GB",
  CAD: "en-CA",
  AUD: "en-AU",
  NZD: "en-NZ",
  JPY: "ja-JP",
  CNY: "zh-CN",
  SGD: "en-SG",
  AED: "en-AE",
  SAR: "ar-SA",
  QAR: "ar-QA",
  KWD: "ar-KW",
  OMR: "ar-OM",
  BHD: "ar-BH",
  PKR: "en-PK",
  BDT: "bn-BD",
  NPR: "ne-NP",
  LKR: "en-LK",
  EUR: "de-DE"
};

const BASE_CURRENCY = "INR";

export const DEFAULT_CURRENCY_EXCHANGE_RATES = {
  INR: 1,
  USD: 0.012,
  GBP: 0.009,
  CAD: 0.016,
  AUD: 0.019,
  NZD: 0.021,
  JPY: 1.71,
  CNY: 0.087,
  SGD: 0.016,
  AED: 0.044,
  SAR: 0.045,
  QAR: 0.044,
  KWD: 0.0037,
  OMR: 0.0046,
  BHD: 0.0045,
  PKR: 3.34,
  BDT: 1.46,
  NPR: 1.6,
  LKR: 3.61,
  EUR: 0.011
};

const STORAGE_KEYS = {
  preferredCurrency: "preferredCurrency",
  geoCountry: "geoCountry",
  geoPrompted: "currencyGeoPermissionPrompted",
  deliveryCountry: "selectedDeliveryCountry",
  conversionRates: "currencyConversionRates"
};

export function normalizeCurrencyRates(rates = {}) {
  const normalized = { ...DEFAULT_CURRENCY_EXCHANGE_RATES };
  Object.keys(DEFAULT_CURRENCY_EXCHANGE_RATES).forEach((currencyCode) => {
    const candidate = Number(rates?.[currencyCode]);
    if (Number.isFinite(candidate) && candidate > 0) {
      normalized[currencyCode] = candidate;
    }
  });
  return normalized;
}

export function storeCurrencyConversionRates(rates = {}) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.conversionRates, JSON.stringify(normalizeCurrencyRates(rates)));
}

export function getStoredCurrencyConversionRates() {
  if (typeof localStorage === "undefined") return normalizeCurrencyRates({});
  try {
    return normalizeCurrencyRates(JSON.parse(localStorage.getItem(STORAGE_KEYS.conversionRates) || "{}"));
  } catch {
    return normalizeCurrencyRates({});
  }
}

function getBrowserLocale() {
  if (typeof navigator === "undefined") return "en-IN";
  return navigator.languages?.[0] || navigator.language || "en-IN";
}

function getBrowserLanguages() {
  if (typeof navigator === "undefined") return ["en-IN"];
  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
    return navigator.languages;
  }
  return [navigator.language || "en-IN"];
}

function getBrowserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

function getRegionFromLocale(locale) {
  const match = String(locale || "").match(/-([A-Za-z]{2})$/);
  return match ? match[1].toUpperCase() : "";
}

function normalizeCountryRegion(country) {
  const value = String(country || "").trim();
  if (!value) return "";

  const upper = value.toUpperCase();
  if (REGION_TO_CURRENCY[upper]) {
    return upper;
  }

  return COUNTRY_NAME_TO_REGION[value.toLowerCase()] || "";
}

function isIndiaTimeZone(timeZone) {
  const tz = String(timeZone || "");
  return tz === "Asia/Kolkata" || tz === "Asia/Calcutta";
}

function isInIndiaBounds(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return false;
  return lat >= 6 && lat <= 38 && lon >= 68 && lon <= 98;
}

export function requestLocationPermissionForCurrency() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  if (!("geolocation" in navigator)) return;

  const alreadyPrompted = localStorage.getItem(STORAGE_KEYS.geoPrompted) === "1";
  if (alreadyPrompted) return;

  localStorage.setItem(STORAGE_KEYS.geoPrompted, "1");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const latitude = position?.coords?.latitude;
      const longitude = position?.coords?.longitude;

      if (isInIndiaBounds(latitude, longitude)) {
        localStorage.setItem(STORAGE_KEYS.geoCountry, "IN");
      } else {
        localStorage.setItem(STORAGE_KEYS.geoCountry, "OTHER");
      }
    },
    () => {
      localStorage.setItem(STORAGE_KEYS.geoCountry, "UNKNOWN");
    },
    {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 1000 * 60 * 60 * 12
    }
  );
}

export function getUserCurrency() {
  if (typeof localStorage !== "undefined") {
    const deliveryCountry = localStorage.getItem(STORAGE_KEYS.deliveryCountry);
    const deliveryRegion = normalizeCountryRegion(deliveryCountry);
    if (deliveryRegion && REGION_TO_CURRENCY[deliveryRegion]) {
      return REGION_TO_CURRENCY[deliveryRegion];
    }

    const saved = localStorage.getItem(STORAGE_KEYS.preferredCurrency);
    if (saved) return saved;

    const geoCountry = localStorage.getItem(STORAGE_KEYS.geoCountry);
    if (geoCountry === "IN") return "INR";
  }

  const languages = getBrowserLanguages();
  const hasIndiaLanguage = languages.some((lang) => String(lang).toUpperCase().includes("-IN"));
  if (hasIndiaLanguage) return "INR";

  const timeZone = getBrowserTimeZone();
  if (isIndiaTimeZone(timeZone)) return "INR";

  const locale = getBrowserLocale();
  const region = getRegionFromLocale(locale);
  return REGION_TO_CURRENCY[region] || "USD";
}

export function convertCurrencyAmount(value, options = {}) {
  const amount = Number(value || 0);
  const sourceCurrency = String(options.sourceCurrency || BASE_CURRENCY).toUpperCase();
  const targetCurrency = String(options.currency || getUserCurrency()).toUpperCase();
  const rates = normalizeCurrencyRates(options.rates || getStoredCurrencyConversionRates());

  if (!Number.isFinite(amount)) return 0;
  if (sourceCurrency === targetCurrency) return amount;

  const sourceRate = rates[sourceCurrency];
  const targetRate = rates[targetCurrency];
  if (!sourceRate || !targetRate) return amount;

  const inBaseCurrency = sourceCurrency === BASE_CURRENCY ? amount : amount / sourceRate;
  return inBaseCurrency * targetRate;
}

export function formatCurrencyForUser(value, options = {}) {
  const currency = options.currency || getUserCurrency();
  const amount = convertCurrencyAmount(value, {
    sourceCurrency: options.sourceCurrency || BASE_CURRENCY,
    currency
  });
  const browserLocale = getBrowserLocale();
  const locale =
    options.locale ||
    CURRENCY_TO_LOCALE[currency] ||
    (currency === "INR" && !String(browserLocale).toUpperCase().includes("-IN") ? "en-IN" : browserLocale);
  const maximumFractionDigits = options.maximumFractionDigits ?? 2;
  const minimumFractionDigits = options.minimumFractionDigits ?? Math.min(2, maximumFractionDigits);

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits,
    maximumFractionDigits
  }).format(amount);
}

export function formatCurrencyExact(value, currency = BASE_CURRENCY, options = {}) {
  const normalizedCurrency = String(currency || BASE_CURRENCY).trim().toUpperCase() || BASE_CURRENCY;
  return formatCurrencyForUser(value, {
    ...options,
    currency: normalizedCurrency,
    sourceCurrency: normalizedCurrency
  });
}

export function formatResolvedPrice(pricing, options = {}) {
  const amount = Number(pricing?.price || 0);
  const currency = String(pricing?.currency || BASE_CURRENCY).trim().toUpperCase() || BASE_CURRENCY;
  return formatCurrencyExact(amount, currency, options);
}

export function formatCurrencyINR(value) {
  return formatCurrencyForUser(value, { locale: "en-IN", currency: "INR" });
}

export function formatBaseCurrency(value, options = {}) {
  return formatCurrencyForUser(value, {
    locale: options.locale || "en-IN",
    currency: BASE_CURRENCY,
    sourceCurrency: BASE_CURRENCY,
    minimumFractionDigits: options.minimumFractionDigits,
    maximumFractionDigits: options.maximumFractionDigits
  });
}

export function formatOrderDisplayCurrency(order, amountKey = "total", fallbackValue = 0, options = {}) {
  const orderAmount = Number(order?.[amountKey]);
  const safeFallback = Number(fallbackValue || 0);
  const value = Number.isFinite(orderAmount) ? orderAmount : safeFallback;

  const displayCurrency = String(
    order?.currencyDisplay?.currency ||
      order?.displayCurrency ||
      order?.currency ||
      (options.fallbackToUserCurrency ? getUserCurrency() : BASE_CURRENCY)
  )
    .trim()
    .toUpperCase();

  // Only use stored display amount if we are requesting the 'total' key
  if (amountKey === "total") {
    const rawStoredDisplayAmount = order?.currencyDisplay?.amount;
    const hasStoredDisplayAmount =
      rawStoredDisplayAmount !== null &&
      rawStoredDisplayAmount !== undefined &&
      rawStoredDisplayAmount !== "";
    const storedDisplayAmount = hasStoredDisplayAmount ? Number(rawStoredDisplayAmount) : NaN;

    if (Number.isFinite(storedDisplayAmount) && displayCurrency) {
      return formatCurrencyForUser(storedDisplayAmount, {
        locale: options.locale,
        currency: displayCurrency,
        sourceCurrency: displayCurrency,
        minimumFractionDigits: options.minimumFractionDigits,
        maximumFractionDigits: options.maximumFractionDigits
      });
    }
  }

  if (!displayCurrency || displayCurrency === BASE_CURRENCY) {
    return formatBaseCurrency(value, options);
  }

  // Convert other fields from BASE_CURRENCY (INR) to display currency
  return formatCurrencyForUser(value, {
    locale: options.locale,
    currency: displayCurrency,
    sourceCurrency: BASE_CURRENCY,
    minimumFractionDigits: options.minimumFractionDigits,
    maximumFractionDigits: options.maximumFractionDigits
  });
}
