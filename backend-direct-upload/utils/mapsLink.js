function parseGoogleMapsCoordinates(value) {
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

function isAllowedGoogleMapsUrl(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    return [
      "maps.app.goo.gl",
      "goo.gl",
      "www.google.com",
      "google.com",
      "maps.google.com"
    ].includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

module.exports = {
  parseGoogleMapsCoordinates,
  isAllowedGoogleMapsUrl
};
