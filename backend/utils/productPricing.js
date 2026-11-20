const COUNTRY_ALIASES = {
  in: "india",
  india: "india",
  bharat: "india",
  us: "united states",
  usa: "united states",
  "u s a": "united states",
  "u s": "united states",
  america: "united states",
  "united states": "united states",
  "united states of america": "united states",
  gb: "united kingdom",
  uk: "united kingdom",
  "u k": "united kingdom",
  "great britain": "united kingdom",
  britain: "united kingdom",
  england: "united kingdom",
  scotland: "united kingdom",
  wales: "united kingdom",
  "united kingdom": "united kingdom",
  ca: "canada",
  canada: "canada",
  au: "australia",
  australia: "australia",
  ae: "united arab emirates",
  uae: "united arab emirates",
  "united arab emirates": "united arab emirates"
};
const { convertCurrencyAmount, normalizeCurrencyRates } = require("./currency");

const DEFAULT_INTERNATIONAL_CURRENCY = "USD";
const SUPPORTED_PRICING_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "CAD", "AUD"];

function normalizeCountryName(country) {
  const compact = String(country || "")
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ");

  return COUNTRY_ALIASES[compact] || compact;
}

function isInternationalCountry(country) {
  const normalizedCountry = normalizeCountryName(country);
  if (!normalizedCountry) return false;
  return normalizedCountry !== "india";
}

function normalizePricingMarkets(pricingMarkets = []) {
  return Array.isArray(pricingMarkets)
    ? pricingMarkets.map((market) => ({
        name: String(market?.name || "").trim(),
        currency: normalizeCurrencyCode(market?.currency, ""),
        countries: Array.isArray(market?.countries)
          ? market.countries.map((country) => String(country || "").trim()).filter(Boolean)
          : []
      }))
    : [];
}

function normalizeCurrencyCode(value, fallback = DEFAULT_INTERNATIONAL_CURRENCY) {
  const normalized = String(value || "").trim().toUpperCase();
  if (SUPPORTED_PRICING_CURRENCIES.includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function normalizeInternationalPricingDefaults(defaults = {}) {
  return {
    currency: normalizeCurrencyCode(defaults?.currency, DEFAULT_INTERNATIONAL_CURRENCY)
  };
}

function normalizeCurrencyConversionRates(rates = {}) {
  return normalizeCurrencyRates(rates || {});
}

function normalizePricingConfig(pricingConfig = {}) {
  if (Array.isArray(pricingConfig)) {
    return {
      pricingMarkets: normalizePricingMarkets(pricingConfig),
      internationalPricingDefaults: normalizeInternationalPricingDefaults({}),
      currencyConversionRates: normalizeCurrencyConversionRates({})
    };
  }

  return {
    pricingMarkets: normalizePricingMarkets(pricingConfig?.pricingMarkets || []),
    internationalPricingDefaults: normalizeInternationalPricingDefaults(
      pricingConfig?.internationalPricingDefaults || {}
    ),
    currencyConversionRates: normalizeCurrencyConversionRates(pricingConfig?.currencyConversionRates || {})
  };
}

function findMatchedMarket(country, pricingMarkets = []) {
  const normalizedCountry = normalizeCountryName(country);
  if (!normalizedCountry) return null;

  return (
    normalizePricingMarkets(pricingMarkets).find((market) =>
      market.countries.some((countryName) => normalizeCountryName(countryName) === normalizedCountry)
    ) || null
  );
}

function isActiveDateRange(startDate, endDate, now = new Date()) {
  const nowTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (Number.isNaN(nowTime)) return false;

  const startTime = startDate ? new Date(startDate).getTime() : null;
  const endTime = endDate ? new Date(endDate).getTime() : null;

  if (startTime !== null && !Number.isNaN(startTime) && nowTime < startTime) return false;
  if (endTime !== null && !Number.isNaN(endTime) && nowTime > endTime) return false;
  return true;
}

function getMarketPriceDetails(product, matchedMarketName, now = new Date()) {
  if (!matchedMarketName) return null;
  const marketPriceList = Array.isArray(product?.marketPrices) ? product.marketPrices : [];
  const matchedMarketPrice = marketPriceList.find(
    (item) => normalizeCountryName(item?.market) === normalizeCountryName(matchedMarketName)
  );
  if (!matchedMarketPrice) return null;

  const regularPrice =
    Number.isFinite(Number(matchedMarketPrice?.regularPrice)) && Number(matchedMarketPrice?.regularPrice) > 0
      ? Math.max(0, Number(matchedMarketPrice.regularPrice))
    : null;
  const salePrice =
    Number.isFinite(Number(matchedMarketPrice?.salePrice)) && Number(matchedMarketPrice?.salePrice) > 0
      ? Math.max(0, Number(matchedMarketPrice.salePrice))
    : null;
  const hasSalePrice = salePrice !== null;

  return {
    regularPrice,
    salePrice,
    saleActive: hasSalePrice && isActiveDateRange(matchedMarketPrice?.startDate, matchedMarketPrice?.endDate, now)
  };
}

function resolvePricingCurrency(useInternationalPrice, matchedMarket, internationalPricingDefaults) {
  if (!useInternationalPrice) {
    return "INR";
  }

  const marketCurrency = normalizeCurrencyCode(matchedMarket?.currency, "");
  if (marketCurrency) {
    return marketCurrency;
  }

  return normalizeCurrencyCode(internationalPricingDefaults?.currency, DEFAULT_INTERNATIONAL_CURRENCY);
}

function convertResolvedAmount(amount, currency, shouldConvert = true, currencyConversionRates = {}) {
  if (amount === null || amount === undefined) return null;
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return null;
  const normalizedCurrency = normalizeCurrencyCode(currency, "INR");
  if (!shouldConvert || normalizedCurrency === "INR") {
    return Math.max(0, numericAmount);
  }

  return Math.max(
    0,
    convertCurrencyAmount(numericAmount, {
      sourceCurrency: "INR",
      currency: normalizedCurrency,
      rates: currencyConversionRates
    })
  );
}

function getProductPriceDetails(product, country, pricingConfig = [], now = new Date()) {
  const resolvedPricingConfig = normalizePricingConfig(pricingConfig);
  const pricingMarkets = resolvedPricingConfig.pricingMarkets;
  const internationalPricingDefaults = resolvedPricingConfig.internationalPricingDefaults;
  const currencyConversionRates = resolvedPricingConfig.currencyConversionRates;
  const domesticPrice = Number(product?.price || 0);
  const rawInternationalPrice = product?.internationalPrice;
  const hasInternationalPrice =
    rawInternationalPrice !== null &&
    rawInternationalPrice !== undefined &&
    rawInternationalPrice !== "" &&
    Number.isFinite(Number(rawInternationalPrice)) &&
    Number(rawInternationalPrice) > 0;
  const internationalPrice = hasInternationalPrice ? Number(rawInternationalPrice) : domesticPrice;
  const useInternationalPrice = isInternationalCountry(country);
  const normalizedCountry = normalizeCountryName(country);
  const countryPriceList = Array.isArray(product?.internationalCountryPrices) ? product.internationalCountryPrices : [];
  const matchedCountryPrice = useInternationalPrice
    ? countryPriceList.find((item) => normalizeCountryName(item?.country) === normalizedCountry)
    : null;
  const countrySpecificPrice =
    matchedCountryPrice && Number.isFinite(Number(matchedCountryPrice.price)) && Number(matchedCountryPrice.price) > 0
      ? Math.max(0, Number(matchedCountryPrice.price))
      : null;
  const matchedMarket = useInternationalPrice ? findMatchedMarket(normalizedCountry, pricingMarkets) : null;
  const marketPriceDetails = useInternationalPrice
    ? getMarketPriceDetails(product, matchedMarket?.name || "", now)
    : null;
  const marketRegularPrice = marketPriceDetails?.regularPrice ?? null;
  const marketSalePrice = marketPriceDetails?.salePrice ?? null;
  const marketResolvedPrice = marketPriceDetails
    ? (marketPriceDetails.saleActive ? marketPriceDetails.salePrice : marketPriceDetails.regularPrice)
    : null;
  const resolvedInternationalPrice = countrySpecificPrice ?? marketResolvedPrice ?? internationalPrice;
  const hasCountrySpecific = countrySpecificPrice !== null;
  const hasMarketPrice = marketResolvedPrice !== null;
  const usedMarketSale = hasMarketPrice && marketPriceDetails?.saleActive === true && marketSalePrice !== null;
  const currency = resolvePricingCurrency(useInternationalPrice, matchedMarket, internationalPricingDefaults);
  const shouldConvert = useInternationalPrice;
  let resolvedBasePrice = useInternationalPrice ? resolvedInternationalPrice : domesticPrice;
  if (product?.festiveOffer === true && product?.festiveDiscountPercent > 0) {
    const festiveDiscountPercent = Math.min(95, Math.max(0, Number(product.festiveDiscountPercent || 0)));
    resolvedBasePrice = resolvedBasePrice * (1 - festiveDiscountPercent / 100);
  }

  return {
    domesticPrice: convertResolvedAmount(domesticPrice, currency, shouldConvert, currencyConversionRates),
    internationalPrice: convertResolvedAmount(internationalPrice, currency, shouldConvert, currencyConversionRates),
    countrySpecificPrice: convertResolvedAmount(countrySpecificPrice, currency, shouldConvert, currencyConversionRates),
    marketRegularPrice: convertResolvedAmount(marketRegularPrice, currency, shouldConvert, currencyConversionRates),
    marketSalePrice: convertResolvedAmount(marketSalePrice, currency, shouldConvert, currencyConversionRates),
    basePrice: Math.max(0, Number(resolvedBasePrice || 0)),
    price: convertResolvedAmount(resolvedBasePrice, currency, shouldConvert, currencyConversionRates),
    currency,
    priceType: useInternationalPrice
      ? hasCountrySpecific
        ? "international-country"
        : hasMarketPrice
          ? (usedMarketSale ? "international-market-sale" : "international-market-regular")
          : "international"
      : "domestic",
    matchedCountry: matchedCountryPrice?.country || "",
    matchedMarket: matchedMarket?.name || "",
    isInternational: useInternationalPrice,
    internationalPricingDefaults
  };
}

module.exports = {
  getProductPriceDetails,
  isInternationalCountry,
  findMatchedMarket
};
