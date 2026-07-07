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

function normalizeCountryName(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeInternationalDelivery(input, fallbackDeliveryCharge = 0) {
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

function calculateIndiaPostCharge(distanceKm, items) {
  // 1. Calculate Total Chargeable Weight of the cart items
  let totalWeightGrams = 0;
  
  if (Array.isArray(items)) {
    items.forEach((item) => {
      const qty = Math.max(1, Number(item?.quantity || 1));
      const actualWeight = Number(item?.weight || 0); // weight in grams
      const l = Number(item?.length || 0); // in cm
      const w = Number(item?.width || 0); // in cm
      const h = Number(item?.height || 0); // in cm
      
      const volumetricWeightKg = (l * w * h) / 5000;
      const volumetricWeightGrams = volumetricWeightKg * 1000;
      
      const itemChargeableWeightGrams = Math.max(actualWeight, volumetricWeightGrams);
      totalWeightGrams += itemChargeableWeightGrams * qty;
    });
  }
  
  // Default to 250g if no weight is found in the cart (safety fallback)
  if (totalWeightGrams <= 0) {
    totalWeightGrams = 250;
  }
  
  // 2. Map distance to India Post distance slabs
  let zone = "above2000";
  const dist = distanceKm !== null ? distanceKm : 9999;
  
  if (dist <= 50) {
    zone = "local";
  } else if (dist <= 200) {
    zone = "upTo200";
  } else if (dist <= 500) {
    zone = "upTo500";
  } else if (dist <= 1000) {
    zone = "upTo1000";
  } else if (dist <= 2000) {
    zone = "upTo2000";
  } else {
    zone = "above2000";
  }
  
  // 3. Compute base rate & additional step fees (Speed Post domestic tariff revised)
  let baseRate = 0;
  
  if (totalWeightGrams <= 50) {
    // Up to 50g
    baseRate = zone === "local" ? 19 : 47;
  } else if (totalWeightGrams <= 250) {
    // 51g - 250g
    const rates = {
      local: 24,
      upTo200: 59,
      upTo500: 63,
      upTo1000: 68,
      upTo2000: 72,
      above2000: 77
    };
    baseRate = rates[zone];
  } else if (totalWeightGrams <= 500) {
    // 251g - 500g
    const rates = {
      local: 28,
      upTo200: 70,
      upTo500: 75,
      upTo1000: 82,
      upTo2000: 86,
      above2000: 93
    };
    baseRate = rates[zone];
  } else {
    // Above 500g
    const initialRates = {
      local: 28,
      upTo200: 70,
      upTo500: 75,
      upTo1000: 82,
      upTo2000: 86,
      above2000: 93
    };
    const initialRate = initialRates[zone];
    
    // Additional charge per 500g (or part thereof)
    const incrementalRates = {
      local: 10,
      upTo200: 15,
      upTo500: 30,
      upTo1000: 30, // 201 to 1000 km is ₹30
      upTo2000: 40,
      above2000: 50
    };
    const incrementalRate = incrementalRates[zone];
    
    const extraWeight = totalWeightGrams - 500;
    const extraSteps = Math.ceil(extraWeight / 500);
    
    baseRate = initialRate + (extraSteps * incrementalRate);
  }
  
  // Apply 18% GST
  const finalRateWithGst = baseRate * 1.18;
  return Math.round(finalRateWithGst * 100) / 100;
}

export function getDeliveryPricingDetails(settings, shipping, items) {
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
    const deliveryCharge = Math.round(
      Math.max(0, Number((matchedRate ? matchedRate.fee : internationalDelivery.defaultFee) || 0)) * 100
    ) / 100;

    return {
      deliveryCharge,
      distanceKm: null,
      isDistanceBased: false,
      pricingMode: "international",
      matchedCountry: matchedRate?.country || shippingCountry || ""
    };
  }

  const distanceKm = calculateDistanceKm(warehouseLocation, shipping);

  // If distance-based pricing is enabled, run the standard distance-based calculation
  if (distancePricing.enabled && distanceKm !== null) {
    const chargeableDistance = Math.max(0, distanceKm - distancePricing.freeRadiusKm);
    let deliveryCharge = distancePricing.baseFee + chargeableDistance * distancePricing.perKmCharge;

    if (distancePricing.maxCharge !== null) {
      deliveryCharge = Math.min(deliveryCharge, distancePricing.maxCharge);
    }

    return {
      deliveryCharge: Math.round(Math.max(0, deliveryCharge) * 100) / 100,
      distanceKm,
      isDistanceBased: true,
      pricingMode: "distance",
      matchedCountry: ""
    };
  }

  // Fallback / India Post calculation when distance pricing is disabled
  const indiaPostFee = calculateIndiaPostCharge(distanceKm, items);
  return {
    deliveryCharge: indiaPostFee,
    distanceKm,
    isDistanceBased: false,
    pricingMode: "indiapost",
    matchedCountry: ""
  };
}

export function resolveDeliveryCharge(settings, shipping, items) {
  return getDeliveryPricingDetails(settings, shipping, items).deliveryCharge;
}
