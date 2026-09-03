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

  const googleKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (googleKey) {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(cleanQuery)}&key=${googleKey}`,
        { signal }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.status === "OK" && Array.isArray(data.results)) {
          return data.results.map((item, idx) => {
            const components = item.address_components || [];
            const getComp = (type) =>
              components.find((c) => Array.isArray(c.types) && c.types.includes(type))?.long_name || "";

            const houseNum = getComp("street_number") || getComp("premise") || getComp("subpremise");
            const route = getComp("route");
            const sublocality = getComp("sublocality_level_1") || getComp("sublocality") || getComp("neighborhood");
            const streetParts = [houseNum, route, sublocality].filter(Boolean);
            const streetAddress =
              streetParts.length > 0 ? streetParts.join(", ") : item.formatted_address || cleanQuery;

            return {
              id: String(item.place_id || idx),
              displayName: String(item.formatted_address || "").trim(),
              latitude: String(item.geometry?.location?.lat || ""),
              longitude: String(item.geometry?.location?.lng || ""),
              address: streetAddress,
              landmark: getComp("landmark") || getComp("point_of_interest") || sublocality || "",
              city: getComp("locality") || getComp("administrative_area_level_2") || sublocality || "",
              state: getComp("administrative_area_level_1") || "",
              pincode: getComp("postal_code") || "",
              country: getComp("country") || "India"
            };
          });
        }
      }
    } catch (err) {
      if (err.name === "AbortError") throw err;
      console.warn("Google Maps address search failed, falling back to Nominatim", err);
    }
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
