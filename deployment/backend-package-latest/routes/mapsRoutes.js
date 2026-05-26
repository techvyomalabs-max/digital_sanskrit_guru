const express = require("express");
const { isAllowedGoogleMapsUrl, parseGoogleMapsCoordinates } = require("../utils/mapsLink");

const router = express.Router();

router.post("/resolve-link", async (req, res) => {
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
    const response = await fetch(rawUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const resolvedUrl = String(response.url || rawUrl);
    const coordinates = parseGoogleMapsCoordinates(resolvedUrl);

    if (!coordinates) {
      return res.status(422).json({
        message: "Could not read coordinates from that Google Maps link.",
        resolvedUrl
      });
    }

    return res.json({
      resolvedUrl,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude
    });
  } catch {
    return res.status(502).json({ message: "Could not resolve that Google Maps link right now." });
  }
});

module.exports = router;
