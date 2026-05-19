import { getUserCurrency } from "./currency";

const COUNTRY_ALIASES = {
  in: "india",
  india: "india",
  bharat: "india",
  us: "united states",
  usa: "united states",
  "u.s.a": "united states",
  "u.s": "united states",
  america: "united states",
  "united states": "united states",
  "united states of america": "united states",
  gb: "united kingdom",
  uk: "united kingdom",
  "u.k": "united kingdom",
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

function normalizeCountry(country) {
  const compact = String(country || "")
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ");

  return COUNTRY_ALIASES[compact] || compact;
}

export function isInternationalCountry(country) {
  const normalizedCountry = normalizeCountry(country);
  if (!normalizedCountry) return false;
  return normalizedCountry !== "india";
}

export function getFallbackPricingCountry() {
  if (typeof localStorage !== "undefined") {
    const selectedDeliveryCountry = localStorage.getItem("selectedDeliveryCountry");
    if (selectedDeliveryCountry) {
      return selectedDeliveryCountry;
    }

    const geoCountry = String(localStorage.getItem("geoCountry") || "").trim().toUpperCase();
    if (geoCountry === "IN") return "India";
    if (geoCountry === "OTHER") return "International";
  }

  return getUserCurrency() === "INR" ? "India" : "International";
}

export function getPricingCountry(explicitCountry) {
  const normalizedExplicitCountry = String(explicitCountry || "").trim();
  if (normalizedExplicitCountry) return normalizedExplicitCountry;
  return getFallbackPricingCountry();
}

export function getProductPriceDetails(product, country) {
  const domesticPrice = Number(product?.price || 0);
  const rawInternationalPrice = product?.internationalPrice;
  const hasInternationalPrice =
    rawInternationalPrice !== null &&
    rawInternationalPrice !== undefined &&
    rawInternationalPrice !== "" &&
    Number.isFinite(Number(rawInternationalPrice)) &&
    Number(rawInternationalPrice) > 0;
  const internationalPrice = hasInternationalPrice ? Number(rawInternationalPrice) : domesticPrice;
  const pricingCountry = getPricingCountry(country);
  const useInternationalPrice = isInternationalCountry(pricingCountry);
  const normalizedCountry = normalizeCountry(pricingCountry);
  const countryPriceList = Array.isArray(product?.internationalCountryPrices) ? product.internationalCountryPrices : [];
  const matchedCountryPrice = useInternationalPrice
    ? countryPriceList.find((item) => normalizeCountry(item?.country) === normalizedCountry)
    : null;
  const countrySpecificPrice =
    matchedCountryPrice && Number.isFinite(Number(matchedCountryPrice.price))
      ? Math.max(0, Number(matchedCountryPrice.price))
      : null;
  const resolvedInternationalPrice = countrySpecificPrice ?? internationalPrice;

  return {
    domesticPrice,
    internationalPrice,
    countrySpecificPrice,
    price: useInternationalPrice ? resolvedInternationalPrice : domesticPrice,
    priceType: useInternationalPrice
      ? (countrySpecificPrice !== null ? "international-country" : "international")
      : "domestic",
    matchedCountry: matchedCountryPrice?.country || "",
    pricingCountry,
    isInternational: useInternationalPrice
  };
}
