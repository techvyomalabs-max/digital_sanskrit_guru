function normalizeCoordinate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeWarehouseLocation(input) {
  return {
    name: String(input?.name || "").trim(),
    address: String(input?.address || "").trim(),
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

function calculateDistanceKm(from, to) {
  const lat1 = normalizeCoordinate(from?.latitude);
  const lon1 = normalizeCoordinate(from?.longitude);
  const lat2 = normalizeCoordinate(to?.latitude);
  const lon2 = normalizeCoordinate(to?.longitude);

  if ([lat1, lon1, lat2, lon2].some((value) => value === null)) {
    return null;
  }

  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}

function resolveDeliveryCharge(settings, shipping) {
  const fallbackCharge = Math.max(0, Number(settings?.deliveryCharge || 0));
  const warehouseLocation = normalizeWarehouseLocation(settings?.warehouseLocation || {});
  const distancePricing = normalizeDistancePricing(settings?.distancePricing || {}, fallbackCharge);
  const internationalDelivery = normalizeInternationalDelivery(settings?.internationalDelivery || {}, fallbackCharge);
  const shippingCountry = String(shipping?.country || "").trim();
  const normalizedShippingCountry = normalizeCountryName(shippingCountry);
  const normalizedDomesticCountry = normalizeCountryName(internationalDelivery.domesticCountry);

  if (
    internationalDelivery.enabled &&
    normalizedShippingCountry &&
    normalizedShippingCountry !== normalizedDomesticCountry
  ) {
    const matchedRate = internationalDelivery.countryRates.find(
      (item) => normalizeCountryName(item.country) === normalizedShippingCountry
    );
    const internationalFee = matchedRate ? matchedRate.fee : internationalDelivery.defaultFee;
    return Math.round(Math.max(0, Number(internationalFee || 0)) * 100) / 100;
  }

  const distanceKm = calculateDistanceKm(warehouseLocation, shipping);

  if (!distancePricing.enabled || distanceKm === null) {
    return fallbackCharge;
  }

  const chargeableDistance = Math.max(0, distanceKm - distancePricing.freeRadiusKm);
  let deliveryCharge = distancePricing.baseFee + chargeableDistance * distancePricing.perKmCharge;

  if (distancePricing.maxCharge !== null) {
    deliveryCharge = Math.min(deliveryCharge, distancePricing.maxCharge);
  }

  return Math.round(Math.max(0, deliveryCharge) * 100) / 100;
}

module.exports = {
  normalizeWarehouseLocation,
  normalizeDistancePricing,
  normalizeInternationalDelivery,
  calculateDistanceKm,
  resolveDeliveryCharge
};
