function pickFirstAddressValue(address, keys) {
  for (const key of keys) {
    const value = String(address?.[key] || "").trim();
    if (value) {
      return value;
    }
  }

  return "";
}

function buildStreetAddress(address) {
  const parts = [
    address?.house_number,
    address?.road,
    address?.pedestrian,
    address?.neighbourhood,
    address?.suburb
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  return parts.join(", ");
}

function normalizeSuggestion(item) {
  const address = item?.address || {};
  const streetAddress = buildStreetAddress(address);

  return {
    id: String(item?.place_id || `${item?.lat || ""}-${item?.lon || ""}`),
    displayName: String(item?.display_name || "").trim(),
    latitude: String(item?.lat || "").trim(),
    longitude: String(item?.lon || "").trim(),
    address: streetAddress || String(item?.name || "").trim() || String(item?.display_name || "").trim(),
    landmark: pickFirstAddressValue(address, ["building", "amenity", "shop", "tourism"]),
    city: pickFirstAddressValue(address, ["city", "town", "village", "municipality", "county"]),
    state: pickFirstAddressValue(address, ["state", "region", "state_district"]),
    pincode: pickFirstAddressValue(address, ["postcode"]),
    country: pickFirstAddressValue(address, ["country"]) || "India"
  };
}

export async function searchAddressSuggestions(query, signal) {
  const cleanQuery = String(query || "").trim();
  if (cleanQuery.length < 3) {
    return [];
  }

  const params = new URLSearchParams({
    q: cleanQuery,
    format: "jsonv2",
    addressdetails: "1",
    limit: "5"
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    method: "GET",
    signal,
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error("Address search failed");
  }

  const data = await response.json();
  return Array.isArray(data) ? data.map(normalizeSuggestion) : [];
}
