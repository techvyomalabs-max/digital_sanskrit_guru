"use strict";

const crypto = require("crypto");

const DEFAULT_WP_HOSTS = Object.freeze([
  "digitalsanskritguru.com",
  "www.digitalsanskritguru.com",
  "3.108.166.236",
  "vyomalabs.in"
]);

const ALLOWED_DATA_SUBTYPES = new Set(["jpeg", "jpg", "png", "webp", "gif"]);
const ALLOWED_WP_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
const EXTERNAL_IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"]);

// Coarse token matcher: stops at whitespace, quotes, angle brackets, and parentheses.
// Relative /wp-content/uploads/ also matches after semicolon/comma (e.g. after &quot; or comma-joined URLs).
const COARSE_TOKEN_SOURCE =
  "(?:data:image\\/[^\\s\"'<>()]+)|(?:https?:\\/\\/[^\\s\"'<>()]+)|(?:(?<=^|[\\s\"'=(),;>])\\/wp-content\\/uploads\\/[^\\s\"'<>()]+)";

const HTML_ENCODED_DELIM_REGEX = /&(?:quot|#34|#39|apos|gt|lt);/gi;

function buildAllowedHostsSet(extraHosts = []) {
  const set = new Set(DEFAULT_WP_HOSTS);
  if (Array.isArray(extraHosts)) {
    for (const h of extraHosts) {
      if (typeof h === "string" && h.trim()) {
        set.add(h.trim().toLowerCase());
      }
    }
  }
  return set;
}

function normalizeCdnBase(mediaCdnUrl) {
  const raw = mediaCdnUrl !== undefined ? mediaCdnUrl : process.env.MEDIA_CDN_URL;
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\/+$/, "");
}

function getPathnameExtension(pathname) {
  if (typeof pathname !== "string") return null;
  const clean = pathname.split(/[?#]/)[0];
  const lastSegment = clean.split("/").pop() || "";
  const m = lastSegment.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Extracts candidate tokens with their exact [start, end] offsets in `value`.
 * Handles:
 * - stopping at HTML-encoded quotes/angle-brackets (&quot;, &#34;, &#39;, &apos;, &gt;, &lt;)
 * - splitting comma-joined URLs (",http://", ",https://", ",/wp-content/uploads/")
 * - stripping trailing punctuation (. , ; : ! ?) from http(s) and relative tokens
 * - detecting whitespace-broken data URLs (data:image/... followed by whitespace + base64 chars)
 */
function extractCandidateTokens(value) {
  if (typeof value !== "string" || value.length === 0) {
    return [];
  }

  const coarseRegex = new RegExp(COARSE_TOKEN_SOURCE, "gi");
  const results = [];

  let m;
  while ((m = coarseRegex.exec(value)) !== null) {
    const rawToken = m[0];
    const rawStart = m.index;

    // 1. Split on HTML-encoded delimiters (&quot;, &#34;, &#39;, &apos;, &gt;, &lt;)
    const entityPieces = [];
    HTML_ENCODED_DELIM_REGEX.lastIndex = 0;
    let lastIdx = 0;
    let em;
    while ((em = HTML_ENCODED_DELIM_REGEX.exec(rawToken)) !== null) {
      if (em.index > lastIdx) {
        entityPieces.push({
          text: rawToken.slice(lastIdx, em.index),
          start: rawStart + lastIdx,
          end: rawStart + em.index
        });
      }
      lastIdx = em.index + em[0].length;
    }
    if (lastIdx < rawToken.length) {
      entityPieces.push({
        text: rawToken.slice(lastIdx),
        start: rawStart + lastIdx,
        end: rawStart + rawToken.length
      });
    }

    for (const piece of entityPieces) {
      // Only consider pieces that begin with a recognised prefix
      if (
        !/^(?:data:image\/|https?:\/\/|\/wp-content\/uploads\/)/i.test(piece.text)
      ) {
        continue;
      }

      // Data URL handling (check for whitespace continuation if this piece reached the end of rawToken)
      if (/^data:image\//i.test(piece.text)) {
        let dataEnd = piece.end;
        let dataText = piece.text;
        let hasWhitespaceInData = false;

        if (piece.end === rawStart + rawToken.length) {
          const tail = value.slice(dataEnd);
          const wsMatch = /^(?:\s+[A-Za-z0-9+/=]+)+/.exec(tail);
          if (wsMatch) {
            let wsChunk = wsMatch[0];
            HTML_ENCODED_DELIM_REGEX.lastIndex = 0;
            const entityInWs = HTML_ENCODED_DELIM_REGEX.exec(wsChunk);
            if (entityInWs) {
              wsChunk = wsChunk.slice(0, entityInWs.index);
            }
            if (wsChunk.length > 0 && /^\s+[A-Za-z0-9+/=]/.test(wsChunk)) {
              dataEnd += wsChunk.length;
              dataText = value.slice(piece.start, dataEnd);
              hasWhitespaceInData = true;
              coarseRegex.lastIndex = dataEnd;
            }
          }
        }

        results.push({
          token: dataText,
          start: piece.start,
          end: dataEnd,
          hasWhitespaceInData
        });
        continue;
      }

      // 2. For http(s) and relative /wp-content/uploads/ tokens, split at ",http://" or ",https://" or ",/wp-content/uploads/"
      const commaSplitRegex = /,(?=https?:\/\/|\/wp-content\/uploads\/)/gi;
      const subPieces = [];
      let subLastIdx = 0;
      let cm;
      while ((cm = commaSplitRegex.exec(piece.text)) !== null) {
        if (cm.index > subLastIdx) {
          subPieces.push({
            text: piece.text.slice(subLastIdx, cm.index),
            start: piece.start + subLastIdx,
            end: piece.start + cm.index
          });
        }
        subLastIdx = cm.index + 1; // skip the comma
      }
      if (subLastIdx < piece.text.length) {
        subPieces.push({
          text: piece.text.slice(subLastIdx),
          start: piece.start + subLastIdx,
          end: piece.end
        });
      }

      // 3. Strip trailing punctuation (. , ; : ! ?) from each http(s) or relative sub-token
      for (const sub of subPieces) {
        let subText = sub.text;
        let subEnd = sub.end;
        const trailingPunct = /[.,;:!?]+$/.exec(subText);
        if (trailingPunct) {
          subText = subText.slice(0, -trailingPunct[0].length);
          subEnd -= trailingPunct[0].length;
        }
        if (subText.length > 0) {
          results.push({
            token: subText,
            start: sub.start,
            end: subEnd,
            hasWhitespaceInData: false
          });
        }
      }
    }
  }

  return results;
}

/**
 * Finds all image/upload references inside a string value.
 * Returns an array of { kind: "data"|"wp"|"cdn"|"unsupported"|"nonImageUpload"|"unrecognised", match, mime?, downloadUrl?, reason? }.
 */
function findImageRefs(value, { extraHosts = [], mediaCdnUrl } = {}) {
  if (typeof value !== "string" || value.length === 0) {
    return [];
  }

  const allowedHosts = buildAllowedHostsSet(extraHosts);
  const cdnBase = normalizeCdnBase(mediaCdnUrl);
  const cdnBaseLower = cdnBase.toLowerCase();
  const candidates = extractCandidateTokens(value);
  const refs = [];

  for (const { token, hasWhitespaceInData } of candidates) {
    // 1. Data URL: data:image/...
    if (/^data:image\//i.test(token)) {
      const subMatch = /^data:image\/([^;,\s"'<>()]+)/i.exec(token);
      const rawSubFromPrefix = subMatch ? subMatch[1].toLowerCase() : "";
      const normalizedMime = rawSubFromPrefix
        ? `image/${rawSubFromPrefix === "jpg" ? "jpeg" : rawSubFromPrefix}`
        : undefined;

      if (hasWhitespaceInData) {
        refs.push({
          kind: "unsupported",
          match: token,
          ...(normalizedMime ? { mime: normalizedMime } : {}),
          reason: "data URL contains whitespace"
        });
        continue;
      }

      const dataMatch = /^data:image\/([a-z0-9.+_-]+);base64,([a-z0-9+/=]+)$/i.exec(token);
      if (dataMatch) {
        const rawSub = dataMatch[1].toLowerCase();
        const b64Part = dataMatch[2];
        const mime = `image/${rawSub === "jpg" ? "jpeg" : rawSub}`;

        if (ALLOWED_DATA_SUBTYPES.has(rawSub)) {
          if (b64Part.length === 0 || b64Part.length % 4 !== 0) {
            refs.push({
              kind: "unsupported",
              match: token,
              mime,
              reason: "base64 length is not a multiple of 4"
            });
          } else {
            refs.push({
              kind: "data",
              match: token,
              mime
            });
          }
          continue;
        }

        // Other data:image/<type>;base64,... (e.g. svg+xml, avif)
        refs.push({
          kind: "unsupported",
          match: token,
          mime
        });
        continue;
      }

      // Non-base64 data:image/<type>,... for non-allowed subtypes (e.g. data:image/svg+xml;utf8,...)
      if (rawSubFromPrefix && !ALLOWED_DATA_SUBTYPES.has(rawSubFromPrefix) && /^data:image\/[^;,\s]+[,;]/i.test(token)) {
        refs.push({
          kind: "unsupported",
          match: token,
          ...(normalizedMime ? { mime: normalizedMime } : {})
        });
        continue;
      }

      // Any other data:image/ token that is not data or unsupported is unrecognised
      refs.push({
        kind: "unrecognised",
        match: token
      });
      continue;
    }

    // 2. Relative WordPress upload path: /wp-content/uploads/...
    if (/^\/wp-content\/uploads\//i.test(token)) {
      const ext = getPathnameExtension(token);
      if (ext && ALLOWED_WP_EXTS.has(ext)) {
        refs.push({
          kind: "wp",
          match: token,
          downloadUrl: `https://digitalsanskritguru.com${token}`
        });
      } else if (ext) {
        refs.push({
          kind: "nonImageUpload",
          match: token
        });
      } else {
        refs.push({
          kind: "unrecognised",
          match: token
        });
      }
      continue;
    }

    // 3. Absolute http(s) URL
    if (/^https?:\/\//i.test(token)) {
      const tokenLower = token.toLowerCase();

      // Check MEDIA_CDN_URL first
      if (cdnBaseLower) {
        if (tokenLower === cdnBaseLower || tokenLower.startsWith(`${cdnBaseLower}/`)) {
          refs.push({
            kind: "cdn",
            match: token
          });
          continue;
        }
      } else {
        try {
          const parsedCdn = new URL(token);
          if (parsedCdn.hostname.toLowerCase().endsWith(".cloudfront.net")) {
            refs.push({
              kind: "cdn",
              match: token
            });
            continue;
          }
        } catch {
          // Ignore malformed URL
        }
      }

      let parsed;
      try {
        parsed = new URL(token);
      } catch {
        continue;
      }

      const host = parsed.hostname.toLowerCase();
      const pathname = parsed.pathname || "";

      if (allowedHosts.has(host)) {
        if (pathname.toLowerCase().includes("/wp-content/uploads/")) {
          const ext = getPathnameExtension(pathname);
          if (ext && ALLOWED_WP_EXTS.has(ext)) {
            refs.push({
              kind: "wp",
              match: token,
              downloadUrl: token
            });
          } else if (ext) {
            refs.push({
              kind: "nonImageUpload",
              match: token
            });
          } else {
            refs.push({
              kind: "unrecognised",
              match: token
            });
          }
        } else {
          refs.push({
            kind: "unrecognised",
            match: token
          });
        }
      }
    }
  }

  return refs;
}

/**
 * Replaces matched image reference substrings in `value` using `mapOfMatchToNewUrl`
 * (supports Map or plain Object), leaving the rest of the string byte-for-byte unchanged.
 * Uses the exact same token extraction rule as findImageRefs.
 */
function replaceRefs(value, mapOfMatchToNewUrl) {
  if (typeof value !== "string" || value.length === 0 || !mapOfMatchToNewUrl) {
    return value;
  }

  const getNewUrl = (key) => {
    if (mapOfMatchToNewUrl instanceof Map) {
      return mapOfMatchToNewUrl.get(key);
    }
    if (
      typeof mapOfMatchToNewUrl === "object" &&
      Object.prototype.hasOwnProperty.call(mapOfMatchToNewUrl, key)
    ) {
      return mapOfMatchToNewUrl[key];
    }
    return undefined;
  };

  const candidates = extractCandidateTokens(value);
  if (candidates.length === 0) {
    return value;
  }

  let out = "";
  let cursor = 0;

  for (const { token, start, end } of candidates) {
    out += value.slice(cursor, start);
    const replacement = getNewUrl(token);
    out += typeof replacement === "string" ? replacement : token;
    cursor = end;
  }

  out += value.slice(cursor);
  return out;
}

function isNonWalkableObject(val) {
  if (!val || typeof val !== "object") return true;
  if (Buffer.isBuffer(val) || val instanceof Uint8Array) return true;
  if (val instanceof Date || val instanceof RegExp) return true;
  if (val._bsontype) return true;
  const ctorName = val.constructor && val.constructor.name;
  if (ctorName === "ObjectId" || ctorName === "ObjectID" || ctorName === "Binary") return true;
  if (typeof val.toHexString === "function" && val.toHexString !== Object.prototype.toString) return true;
  return false;
}

/**
 * Walks plain objects and arrays recursively and yields/returns { path, value }
 * for string values containing at least one ref.
 * Ignores keys starting with "$" or containing ".".
 * Does not walk Buffers, Dates, or ObjectIds.
 */
function walkDocument(doc, options = {}) {
  const results = [];

  function visit(current, currentPath) {
    if (typeof current === "string") {
      if (currentPath) {
        const refs = findImageRefs(current, options);
        if (refs.length > 0) {
          results.push({ path: currentPath, value: current });
        }
      }
      return;
    }

    if (!current || typeof current !== "object") {
      return;
    }

    if (Array.isArray(current)) {
      for (let i = 0; i < current.length; i++) {
        const nextPath = currentPath ? `${currentPath}.${i}` : String(i);
        visit(current[i], nextPath);
      }
      return;
    }

    if (isNonWalkableObject(current)) {
      return;
    }

    for (const key of Object.keys(current)) {
      if (key.startsWith("$") || key.includes(".")) {
        continue;
      }
      const nextPath = currentPath ? `${currentPath}.${key}` : key;
      visit(current[key], nextPath);
    }
  }

  if (doc && typeof doc === "object" && !Array.isArray(doc) && !isNonWalkableObject(doc)) {
    visit(doc, "");
  }

  let iterIdx = 0;
  Object.defineProperty(results, "next", {
    value() {
      if (iterIdx < results.length) {
        return { value: results[iterIdx++], done: false };
      }
      return { value: undefined, done: true };
    },
    enumerable: false,
    configurable: true
  });

  return results;
}

/**
 * Deterministic S3 object key: `${prefix}/migrated/${sha256hex(bytes).slice(0,32)}.${ext}`
 */
function contentHashKey({ prefix, bytes, ext } = {}) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  const cleanPrefix = String(prefix || "").trim().replace(/^\/+|\/+$/g, "");
  const cleanExt = String(ext || "").trim().replace(/^\.+/, "").toLowerCase();
  const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 32);
  return cleanPrefix ? `${cleanPrefix}/migrated/${hash}.${cleanExt}` : `migrated/${hash}.${cleanExt}`;
}

/**
 * Detects jpeg, png, webp, gif from magic bytes and returns { mime, ext } or null.
 * Always trusts magic bytes over response headers or file names.
 */
function sniffImageType(bytes) {
  if (!bytes || typeof bytes.length !== "number" || bytes.length < 3) {
    return null;
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mime: "image/png", ext: "png" };
  }

  // GIF: "GIF87a" (47 49 46 38 37 61) or "GIF89a" (47 49 46 38 39 61)
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return { mime: "image/gif", ext: "gif" };
  }

  // WebP: "RIFF" (52 49 46 46) .... "WEBP" (57 45 42 50)
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mime: "image/webp", ext: "webp" };
  }

  return null;
}

/**
 * Converts a collection name and dotted path (e.g. "images.2", "heroBanners.0.mobileImage")
 * into a field pattern (e.g. "products.images[]", "storesettings.heroBanners[].mobileImage").
 */
function toFieldPattern(collectionName, dottedPath) {
  const normalizedPath = String(dottedPath || "").replace(/\.(\d+)(?=\.|$)/g, "[]");
  return collectionName ? `${collectionName}.${normalizedPath}` : normalizedPath;
}

/**
 * Scans a document for external image URLs (hosts other than WP hosts and CDN) for reporting.
 */
function findExternalImageHostsInDoc(doc, { extraHosts = [], mediaCdnUrl } = {}) {
  const hosts = [];
  const allowedHosts = buildAllowedHostsSet(extraHosts);
  const cdnBase = normalizeCdnBase(mediaCdnUrl).toLowerCase();

  function visit(current) {
    if (typeof current === "string") {
      const candidates = extractCandidateTokens(current);
      for (const { token } of candidates) {
        if (!/^https?:\/\//i.test(token)) continue;
        const tokenLower = token.toLowerCase();
        if (cdnBase && (tokenLower === cdnBase || tokenLower.startsWith(`${cdnBase}/`))) {
          continue;
        }
        try {
          const parsed = new URL(token);
          const host = parsed.hostname.toLowerCase();
          if (!cdnBase && host.endsWith(".cloudfront.net")) continue;
          if (allowedHosts.has(host)) continue;
          const ext = getPathnameExtension(parsed.pathname);
          if (ext && EXTERNAL_IMAGE_EXTS.has(ext)) {
            hosts.push(host);
          }
        } catch {
          // ignore invalid URL
        }
      }
      return;
    }

    if (!current || typeof current !== "object") return;
    if (Array.isArray(current)) {
      for (const item of current) visit(item);
      return;
    }
    if (isNonWalkableObject(current)) return;
    for (const k of Object.keys(current)) {
      if (k.startsWith("$") || k.includes(".")) continue;
      visit(current[k]);
    }
  }

  if (doc && typeof doc === "object") {
    visit(doc);
  }
  return hosts;
}

/**
 * Parses a MongoDB connection URI to extract host(s) and database name without exposing credentials.
 */
function parseMongoUri(mongoUri) {
  if (typeof mongoUri !== "string" || !mongoUri.trim()) {
    return { host: "", dbName: "" };
  }
  const trimmed = mongoUri.trim();
  const m = /^mongodb(?:\+srv)?:\/\/(?:[^@/]+@)?([^/?#]+)(?:\/([^?#]*))?/i.exec(trimmed);
  if (!m) {
    return { host: "unknown-host", dbName: "" };
  }
  const host = m[1] || "";
  const rawDb = m[2] || "";
  let dbName = "";
  try {
    dbName = decodeURIComponent(rawDb);
  } catch {
    dbName = rawDb;
  }
  return { host, dbName };
}

/**
 * Returns a safe, masked description of the database host and database name.
 * Never includes credentials, passwords, query strings, or the full URI.
 */
function formatMaskedConnection(mongoUri, actualDbNameOverride) {
  const { host, dbName: parsedDb } = parseMongoUri(mongoUri);
  const dbName = actualDbNameOverride || parsedDb || "(default)";
  const safeHost = host || "unknown-host";
  return `Database host: ${safeHost} | Database name: ${dbName} (credentials masked)`;
}

/**
 * Parses CLI arguments for migrate-images-to-s3.js.
 */
function parseArgs(argv = []) {
  const args = {
    env: null,
    only: ["products", "settings", "orders"],
    limit: null,
    hosts: [],
    apply: false,
    backupDone: false,
    confirmDb: null,
    concurrency: 4
  };

  for (let i = 0; i < argv.length; i++) {
    const raw = String(argv[i]);
    const [flag, inlineVal] = raw.includes("=") ? raw.split(/=(.*)/s) : [raw, undefined];
    const nextVal = () => (inlineVal !== undefined ? inlineVal : argv[++i]);

    if (flag === "--env") {
      args.env = String(nextVal() || "").trim();
    } else if (flag === "--only") {
      const val = String(nextVal() || "").trim();
      args.only = val
        ? val.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
        : [];
    } else if (flag === "--limit") {
      const n = Number(nextVal());
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error("--limit must be a positive integer");
      }
      args.limit = n;
    } else if (flag === "--host") {
      const h = String(nextVal() || "").trim().toLowerCase();
      if (!h) {
        throw new Error("--host requires a non-empty hostname");
      }
      args.hosts.push(h);
    } else if (flag === "--apply") {
      args.apply = true;
    } else if (flag === "--backup-done") {
      args.backupDone = true;
    } else if (flag === "--confirm-db") {
      args.confirmDb = String(nextVal() || "").trim();
    } else if (flag === "--concurrency") {
      const c = Number(nextVal());
      if (!Number.isInteger(c) || c <= 0) {
        throw new Error("--concurrency must be a positive integer");
      }
      args.concurrency = c;
    } else if (flag.startsWith("-")) {
      throw new Error(`Unknown flag: ${flag}`);
    }
  }

  return args;
}

/**
 * Validates safety checks before connecting or migrating.
 * Throws an Error with a clear message on any failure.
 */
function validateSafetyChecks(input = {}, envOverride) {
  let args;
  let envObj;
  let actualDbName;

  if (Array.isArray(input)) {
    args = parseArgs(input);
    envObj = envOverride || process.env;
  } else if (input && typeof input === "object" && input.args) {
    args = Array.isArray(input.args) ? parseArgs(input.args) : { ...parseArgs([]), ...input.args };
    envObj = input.env || envOverride || process.env;
    actualDbName = input.actualDbName;
  } else {
    args = { ...parseArgs([]), ...input };
    envObj = envOverride || input.processEnv || process.env;
    actualDbName = input.actualDbName;
  }

  if (args.env !== "staging" && args.env !== "production") {
    throw new Error("Missing or invalid --env flag. Must be 'staging' or 'production'.");
  }

  const validOnly = new Set(["products", "product", "settings", "storesettings", "orders", "order"]);
  if (!Array.isArray(args.only) || args.only.length === 0) {
    throw new Error("--only must specify at least one collection (products,settings,orders).");
  }
  for (const item of args.only) {
    if (!validOnly.has(item)) {
      throw new Error(`Invalid collection '${item}' in --only. Allowed: products,settings,orders.`);
    }
  }

  const mongoUri = String(envObj.MONGO_URI || "").trim();
  if (!mongoUri) {
    throw new Error("Missing required environment variable: MONGO_URI");
  }

  const rawPrefix = String(envObj.S3_PREFIX || "").trim();
  const cleanPrefix = rawPrefix.replace(/^\/+|\/+$/g, "");
  const expectedPrefix = `dsg/${args.env}`;

  if (args.apply) {
    const requiredVars = [
      "MONGO_URI",
      "AWS_REGION",
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "S3_BUCKET",
      "S3_PREFIX",
      "MEDIA_CDN_URL"
    ];
    for (const key of requiredVars) {
      if (!String(envObj[key] || "").trim()) {
        throw new Error(`Missing required environment variable for --apply mode: ${key}`);
      }
    }

    if (cleanPrefix !== expectedPrefix) {
      throw new Error(
        `S3_PREFIX mismatch: expected '${expectedPrefix}' for --env ${args.env}, got '${cleanPrefix}'.`
      );
    }

    if (!args.backupDone) {
      throw new Error("--apply requires --backup-done to confirm a database backup was taken.");
    }

    if (!args.confirmDb) {
      throw new Error("--apply requires --confirm-db <DBNAME>.");
    }

    const { dbName: parsedDbName } = parseMongoUri(mongoUri);
    const effectiveDbName = actualDbName || parsedDbName;
    if (!effectiveDbName || args.confirmDb !== effectiveDbName) {
      throw new Error(
        `--confirm-db mismatch: '${args.confirmDb}' does not match actual database '${effectiveDbName || "(unknown)"}'.`
      );
    }
  } else {
    if (cleanPrefix && cleanPrefix !== expectedPrefix) {
      throw new Error(
        `S3_PREFIX mismatch: expected '${expectedPrefix}' for --env ${args.env}, got '${cleanPrefix}'.`
      );
    }
  }

  return {
    args,
    mongoUri,
    s3Prefix: cleanPrefix || expectedPrefix,
    s3Bucket: String(envObj.S3_BUCKET || "").trim(),
    awsRegion: String(envObj.AWS_REGION || "").trim(),
    awsAccessKeyId: String(envObj.AWS_ACCESS_KEY_ID || "").trim(),
    awsSecretAccessKey: String(envObj.AWS_SECRET_ACCESS_KEY || "").trim(),
    mediaCdnUrl: String(envObj.MEDIA_CDN_URL || "").trim().replace(/\/+$/, ""),
    maskedConnection: formatMaskedConnection(mongoUri, actualDbName)
  };
}

module.exports = {
  DEFAULT_WP_HOSTS,
  findImageRefs,
  replaceRefs,
  walkDocument,
  contentHashKey,
  sniffImageType,
  toFieldPattern,
  findExternalImageHostsInDoc,
  parseMongoUri,
  formatMaskedConnection,
  parseArgs,
  validateSafetyChecks
};
