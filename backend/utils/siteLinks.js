/**
 * siteLinks.js — Pure utility for generating canonical real-path URLs.
 * Strips legacy hash routing artifacts (#/ or #) from URLs and paths.
 */

function getSiteUrl() {
  const raw = String(process.env.SITE_URL || process.env.VITE_SITE_URL || "http://localhost:5173").trim();
  return raw.replace(/(?:\/#|\/|#)+$/, "") || "http://localhost:5173";
}

function siteLink(path) {
  let p = String(path == null ? "" : path).trim();

  // Strip a leading "#" or "/#" from the input
  if (p.startsWith("/#")) {
    p = p.slice(2);
  } else if (p.startsWith("#")) {
    p = p.slice(1);
  }

  // Ensure it never contains "#/"
  while (p.includes("#/")) {
    p = p.replace(/#\//g, "/");
  }

  // Split path from query and anchor
  const qIdx = p.indexOf("?");
  const hIdx = p.indexOf("#");
  let splitIdx = -1;
  if (qIdx !== -1 && hIdx !== -1) {
    splitIdx = Math.min(qIdx, hIdx);
  } else if (qIdx !== -1) {
    splitIdx = qIdx;
  } else if (hIdx !== -1) {
    splitIdx = hIdx;
  }

  let pathPart = splitIdx !== -1 ? p.slice(0, splitIdx) : p;
  const rest = splitIdx !== -1 ? p.slice(splitIdx) : "";

  // Collapse repeated slashes inside the PATH part only
  pathPart = pathPart.replace(/\/+/g, "/");
  if (!pathPart.startsWith("/")) {
    pathPart = "/" + pathPart;
  }

  return getSiteUrl() + pathPart + rest;
}

module.exports = {
  getSiteUrl,
  siteLink
};
