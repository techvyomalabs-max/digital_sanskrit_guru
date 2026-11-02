"use strict";

/**
 * Google Geocoding from the server. Google's Geocoding web service does not accept keys that are
 * restricted to websites, so the key lives on the server (GOOGLE_MAPS_API_KEY, restricted to the
 * server's IP addresses and the Geocoding API) and never reaches the browser.
 */

const GOOGLE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const MAX_RESULTS = 5;

function getServerKey() {
  // VITE_GOOGLE_MAPS_API_KEY is accepted too, in case it was added to the server under that name
  return String(process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();
}

/** Validated query for Google, or { error } for a bad request. */
function buildGeocodeParams({ lat, lng, q } = {}) {
  if (q !== undefined && q !== null && String(q).trim() !== "") {
    const address = String(q).trim();
    if (address.length < 3 || address.length > 200) return { error: "Search text must be 3 to 200 characters." };
    return { params: { address } };
  }
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return { error: "A valid latitude and longitude are required." };
  }
  return { params: { latlng: `${latitude},${longitude}` } };
}

/** Keeps only what the address form uses, in Google's own shape so the browser code reads it unchanged. */
function trimResults(results = []) {
  return (Array.isArray(results) ? results : []).slice(0, MAX_RESULTS).map((r) => ({
    place_id: r?.place_id || "",
    formatted_address: r?.formatted_address || "",
    address_components: Array.isArray(r?.address_components)
      ? r.address_components.map((c) => ({ long_name: c?.long_name || "", types: Array.isArray(c?.types) ? c.types : [] }))
      : [],
    geometry: { location: { lat: r?.geometry?.location?.lat ?? null, lng: r?.geometry?.location?.lng ?? null } }
  }));
}

/**
 * Asks Google. Returns { status, results } on success, or { httpStatus, message } when the caller
 * should fall back (no key on the server, Google refused, network problem).
 */
async function geocode(query, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const key = getServerKey();
  if (!key) return { httpStatus: 503, message: "Address lookup is not set up on the server." };
  const built = buildGeocodeParams(query);
  if (built.error) return { httpStatus: 400, message: built.error };

  const url = `${GOOGLE_URL}?${new URLSearchParams({ ...built.params, key }).toString()}`;
  let data;
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    data = await response.json();
  } catch (err) {
    console.warn("[Geocode] Google request failed:", err?.message);
    return { httpStatus: 502, message: "Address lookup is unavailable right now." };
  }

  const status = String(data?.status || "UNKNOWN_ERROR");
  if (status === "OK" || status === "ZERO_RESULTS") {
    return { status, results: trimResults(data?.results) };
  }
  // REQUEST_DENIED, OVER_QUERY_LIMIT, ... : log Google's reason for the team, never the key
  console.warn(`[Geocode] Google said ${status}: ${data?.error_message || ""}`);
  return { httpStatus: 502, message: "Address lookup is unavailable right now.", googleStatus: status };
}

module.exports = { getServerKey, buildGeocodeParams, trimResults, geocode };
