function normalizeCoordinate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function normalizeWarehouseLocation(input) {
  return {
    name: String(input?.name || "").trim(),
    address: String(input?.address || "").trim(),
    mapUrl: String(input?.mapUrl || "").trim(),
    latitude: normalizeCoordinate(input?.latitude),
    longitude: normalizeCoordinate(input?.longitude)
  };
}

export function parseGoogleMapsCoordinates(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  const candidates = [text];

  try {
    const decoded = decodeURIComponent(text);
    if (decoded !== text) {
      candidates.push(decoded);
    }
  } catch {
    // Ignore malformed URI text and continue with raw input.
  }

  const exactPatterns = [
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&]center=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/
  ];

  const isValidCoordinatePair = (latitude, longitude) => {
    return !Number.isNaN(latitude) &&
      !Number.isNaN(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180;
  };

  for (const candidate of candidates) {
    for (const pattern of exactPatterns) {
      const match = candidate.match(pattern);
      if (!match) continue;

      const latitude = Number(match[1]);
      const longitude = Number(match[2]);
      if (isValidCoordinatePair(latitude, longitude)) {
        return { latitude, longitude };
      }
    }

    const genericMatches = candidate.match(/-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?/g) || [];
    for (const pairText of genericMatches) {
      const [latText, lonText] = pairText.split(",");
      const latitude = Number(String(latText || "").trim());
      const longitude = Number(String(lonText || "").trim());
      if (isValidCoordinatePair(latitude, longitude)) {
        return { latitude, longitude };
      }
    }
  }

  return null;
}

export function normalizeDistancePricing(input, fallbackDeliveryCharge = 0) {
  const rawMax = normalizeCoordinate(input?.maxCharge);
  return {
    enabled: input?.enabled !== false,
    baseFee: Math.max(0, Number(input?.baseFee ?? fallbackDeliveryCharge ?? 0)),
    perKmCharge: Math.max(0, Number(input?.perKmCharge || 0)),
    freeRadiusKm: Math.max(0, Number(input?.freeRadiusKm || 0)),
    maxCharge: rawMax === null ? null : Math.max(0, rawMax)
  };
}

export function calculateDistanceKm(from, to) {
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

export function getDeliveryPricingDetails(settings, shipping) {
  const fallbackCharge = Math.max(0, Number(settings?.deliveryCharge || 0));
  const warehouseLocation = normalizeWarehouseLocation(settings?.warehouseLocation || {});
  const distancePricing = normalizeDistancePricing(settings?.distancePricing || {}, fallbackCharge);
  const distanceKm = calculateDistanceKm(warehouseLocation, shipping);

  if (!distancePricing.enabled || distanceKm === null) {
    return {
      deliveryCharge: fallbackCharge,
      distanceKm: null,
      isDistanceBased: false
    };
  }

  const chargeableDistance = Math.max(0, distanceKm - distancePricing.freeRadiusKm);
  let deliveryCharge = distancePricing.baseFee + chargeableDistance * distancePricing.perKmCharge;

  if (distancePricing.maxCharge !== null) {
    deliveryCharge = Math.min(deliveryCharge, distancePricing.maxCharge);
  }

  return {
    deliveryCharge: Math.round(Math.max(0, deliveryCharge) * 100) / 100,
    distanceKm,
    isDistanceBased: true
  };
}

export function resolveDeliveryCharge(settings, shipping) {
  return getDeliveryPricingDetails(settings, shipping).deliveryCharge;
}
