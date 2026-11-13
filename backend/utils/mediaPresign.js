"use strict";

const crypto = require("crypto");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { createPresignedPost } = require("@aws-sdk/s3-presigned-post");

// "return-evidence": customers' photos of a damaged or defective item (see orderRoutes). These
// are private: stored under <prefix>/private/..., never given a public link, and only shown
// through the API to the order's owner and admins.
// "review-photo": customers' own photos in a product review (public, shown on the product page).
const ALLOWED_KINDS = ["product", "banner", "site", "return-evidence", "review-photo"];
const PRIVATE_KINDS = new Set(["return-evidence"]);

const ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

const MAX_BYTES = 2 * 1024 * 1024; // 2MB

/**
 * Reads Amazon S3 & CDN configuration from process.env at call time.
 * Strips a trailing slash from MEDIA_CDN_URL and slashes from both ends of S3_PREFIX.
 * Returns { configured: boolean, ...values }.
 */
function getMediaConfig() {
  const region = (process.env.AWS_REGION || "").trim();
  const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || "").trim();
  const bucket = (process.env.S3_BUCKET || "").trim();
  const rawPrefix = (process.env.S3_PREFIX || "").trim();
  const prefix = rawPrefix.replace(/^\/+|\/+$/g, "");
  const rawCdnUrl = (process.env.MEDIA_CDN_URL || "").trim();
  const mediaCdnUrl = rawCdnUrl.replace(/\/+$/, "");

  const configured = Boolean(
    region &&
    accessKeyId &&
    secretAccessKey &&
    bucket &&
    prefix &&
    mediaCdnUrl
  );

  return {
    configured,
    region,
    bucket,
    prefix,
    mediaCdnUrl
  };
}

/**
 * Builds a unique object key for S3.
 * File name is always a server-generated UUID and never derived from client input.
 */
function buildObjectKey({ prefix, kind, contentType } = {}) {
  if (!kind || !ALLOWED_KINDS.includes(kind)) {
    const err = new Error(`Invalid kind: '${kind}'. Allowed kinds: ${ALLOWED_KINDS.join(", ")}`);
    err.status = 400;
    throw err;
  }

  const ext = ALLOWED_TYPES[contentType];
  if (!ext) {
    const err = new Error(`Invalid content type: '${contentType}'. Allowed types: ${Object.keys(ALLOWED_TYPES).join(", ")}`);
    err.status = 400;
    throw err;
  }

  const cleanPrefix = typeof prefix === "string" ? prefix.replace(/^\/+|\/+$/g, "") : "";
  const uuid = crypto.randomUUID();
  const folder = PRIVATE_KINDS.has(kind) ? `private/${kind}` : kind;

  return cleanPrefix ? `${cleanPrefix}/${folder}/${uuid}.${ext}` : `${folder}/${uuid}.${ext}`;
}

/**
 * Creates presigned POST credentials for direct client-to-S3 upload.
 * Builds S3Client lazily inside the function.
 */
async function createPresignedUpload({ kind, contentType } = {}) {
  if (!kind || !ALLOWED_KINDS.includes(kind)) {
    const err = new Error(`Invalid kind: '${kind}'. Allowed kinds: ${ALLOWED_KINDS.join(", ")}`);
    err.status = 400;
    throw err;
  }

  if (!contentType || !ALLOWED_TYPES[contentType]) {
    const err = new Error(`Invalid content type: '${contentType}'. Allowed types: ${Object.keys(ALLOWED_TYPES).join(", ")}`);
    err.status = 400;
    throw err;
  }

  const config = getMediaConfig();
  if (!config.configured) {
    const err = new Error("Image storage is not configured yet.");
    err.status = 503;
    throw err;
  }

  const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || "").trim();

  const s3Client = new S3Client({
    region: config.region,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });

  const key = buildObjectKey({
    prefix: config.prefix,
    kind,
    contentType
  });

  const presigned = await createPresignedPost(s3Client, {
    Bucket: config.bucket,
    Key: key,
    Conditions: [
      ["content-length-range", 1, MAX_BYTES],
      ["eq", "$Content-Type", contentType]
    ],
    Fields: {
      "Content-Type": contentType
    },
    Expires: 300
  });

  // Private files get no public link; they are read back through the API
  const publicUrl = PRIVATE_KINDS.has(kind) ? null : `${config.mediaCdnUrl}/${key}`;

  return {
    url: presigned.url,
    fields: presigned.fields,
    key,
    publicUrl
  };
}

/**
 * True when a storage key is one of our private return-evidence uploads
 * (<prefix>/private/return-evidence/<uuid>.<ext>), so a customer can't attach anything else.
 */
function isReturnEvidenceKey(key, config = getMediaConfig()) {
  if (typeof key !== "string") return false;
  const base = `${config?.prefix ? `${config.prefix}/` : ""}private/return-evidence/`;
  if (!key.startsWith(base)) return false;
  return /^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(key.slice(base.length));
}

/**
 * True when a link is one of our review photo uploads
 * (<cdn>/<prefix>/review-photo/<uuid>.<ext>), so a review can't show pictures from anywhere else.
 */
function isReviewPhotoUrl(url, config = getMediaConfig()) {
  if (typeof url !== "string" || !config?.mediaCdnUrl) return false;
  const base = `${config.mediaCdnUrl}/${config.prefix ? `${config.prefix}/` : ""}review-photo/`;
  if (!url.startsWith(base)) return false;
  return /^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(url.slice(base.length));
}

/** Reads a private stored file: { body (stream), contentType, contentLength }. */
async function getPrivateObject(key) {
  const config = getMediaConfig();
  if (!config.configured) {
    const err = new Error("Image storage is not configured yet.");
    err.status = 503;
    throw err;
  }
  const s3Client = new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: (process.env.AWS_ACCESS_KEY_ID || "").trim(),
      secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || "").trim()
    }
  });
  const out = await s3Client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
  return { body: out.Body, contentType: out.ContentType || "application/octet-stream", contentLength: out.ContentLength };
}

module.exports = {
  isReturnEvidenceKey,
  isReviewPhotoUrl,
  getPrivateObject,
  PRIVATE_KINDS,
  getMediaConfig,
  ALLOWED_KINDS,
  ALLOWED_TYPES,
  MAX_BYTES,
  buildObjectKey,
  createPresignedUpload
};
