const express = require("express");
const rateLimit = require("express-rate-limit");
const { isAllowedGoogleMapsUrl, parseGoogleMapsCoordinates } = require("../utils/mapsLink");
const { perWorker } = require("../utils/workerCount");

const router = express.Router();

const mapsRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: perWorker(30), // 30 requests per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many map link resolution requests. Please try again later." }
});

router.post("/resolve-link", mapsRateLimiter, async (req, res) => {
  const rawUrl = String(req.body?.url || "").trim();

  if (!rawUrl) {
    return res.status(400).json({ message: "Maps link is required." });
  }

  if (!isAllowedGoogleMapsUrl(rawUrl)) {
    return res.status(400).json({ message: "Only Google Maps links are supported." });
  }

  const directCoordinates = parseGoogleMapsCoordinates(rawUrl);
  if (directCoordinates) {
    return res.json({
      resolvedUrl: rawUrl,
      latitude: directCoordinates.latitude,
      longitude: directCoordinates.longitude
    });
  }

  try {
    let currentUrl = rawUrl;
    const maxHops = 5;

    for (let hop = 0; hop < maxHops; hop++) {
      if (!isAllowedGoogleMapsUrl(currentUrl)) {
        return res.status(400).json({ message: "Disallowed redirect destination detected." });
      }

      const response = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        }
      });

      const coords = parseGoogleMapsCoordinates(currentUrl);
      if (coords) {
        return res.json({
          resolvedUrl: currentUrl,
          latitude: coords.latitude,
          longitude: coords.longitude
        });
      }

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) break;

        const nextUrl = new URL(location, currentUrl).toString();
        if (!isAllowedGoogleMapsUrl(nextUrl)) {
          return res.status(400).json({ message: "Redirect target is not an allowed Google Maps URL." });
        }
        currentUrl = nextUrl;
        continue;
      }

      break;
    }

    const finalCoordinates = parseGoogleMapsCoordinates(currentUrl);
    if (!finalCoordinates) {
      return res.status(422).json({
        message: "Could not read coordinates from that Google Maps link.",
        resolvedUrl: currentUrl
      });
    }

    return res.json({
      resolvedUrl: currentUrl,
      latitude: finalCoordinates.latitude,
      longitude: finalCoordinates.longitude
    });
  } catch {
    return res.status(502).json({ message: "Could not resolve that Google Maps link right now." });
  }
});

module.exports = router;
