export async function reverseGeocodeCoordinates(latitude, longitude) {
  const googleKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const radarKey = import.meta.env.VITE_RADAR_PUBLISHABLE_KEY;

  if (googleKey) {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${googleKey}`
      );

      if (response.ok) {
        const data = await response.json();
        if (data.status === "OK" && Array.isArray(data.results) && data.results.length > 0) {
          const firstResult = data.results[0];
          const components = firstResult.address_components || [];

          const getComp = (type) =>
            components.find((c) => Array.isArray(c.types) && c.types.includes(type))?.long_name || "";

          const houseNum = getComp("street_number") || getComp("premise") || getComp("subpremise");
          const route = getComp("route");
          const sublocality = getComp("sublocality_level_1") || getComp("sublocality") || getComp("neighborhood");
          const landmark = getComp("landmark") || getComp("point_of_interest") || sublocality;
          const city = getComp("locality") || getComp("administrative_area_level_2") || sublocality;
          const state = getComp("administrative_area_level_1");
          const pincode = getComp("postal_code");
          const country = getComp("country") || "India";

          const streetParts = [houseNum, route, sublocality].filter(Boolean);
          const streetAddress =
            streetParts.length > 0 ? streetParts.join(", ") : firstResult.formatted_address || "Current location";

          return {
            address: streetAddress,
            landmark: landmark || "",
            city: city || "",
            state: state || "",
            pincode: pincode || "",
            country: country || "India",
            latitude: Number(latitude),
            longitude: Number(longitude)
          };
        }
      }
    } catch (err) {
      console.warn("Google Maps reverse geocoding failed, falling back to Radar / Nominatim", err);
    }
  }

  if (radarKey) {
    try {
      const response = await fetch(
        `https://api.radar.io/v1/geocode/reverse?coordinates=${latitude},${longitude}`,
        {
          method: "GET",
          headers: {
            Authorization: radarKey
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        const addressObj = data?.addresses?.[0] || {};
        return {
          address: addressObj.formattedAddress || "Current location",
          landmark: addressObj.placeLabel || "",
          city: addressObj.city || addressObj.sublocality || "",
          state: addressObj.state || addressObj.stateCode || "",
          pincode: addressObj.postalCode || "",
          country: addressObj.country || "India",
          latitude: Number(latitude),
          longitude: Number(longitude)
        };
      }
    } catch (err) {
      console.warn("Radar reverse geocoding failed, falling back to Nominatim", err);
    }
  }

  // Fallback to Nominatim
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: "jsonv2",
    addressdetails: "1"
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error("Could not resolve your location.");
  }

  const data = await response.json();
  const address = data?.address || {};
  const streetParts = [address?.house_number, address?.road, address?.neighbourhood, address?.suburb].filter(Boolean);
  const streetAddress = streetParts.join(", ") || String(data?.name || "").trim();

  const firstAddressValue = (keys) => {
    for (const key of keys) {
      const val = String(address?.[key] || "").trim();
      if (val) return val;
    }
    return "";
  };

  const city = firstAddressValue(["city", "town", "village", "municipality", "county"]);
  const state = firstAddressValue(["state", "region", "state_district"]);
  const pincode = firstAddressValue(["postcode"]);
  const country = firstAddressValue(["country"]) || "India";

  return {
    address: streetAddress || String(data?.display_name || "").trim() || "Current location",
    landmark: firstAddressValue(["building", "amenity", "shop"]),
    city,
    state,
    pincode,
    country,
    latitude: Number(latitude),
    longitude: Number(longitude)
  };
}

export function getCurrentDevicePosition() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is not supported by your browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000
    });
  });
}
