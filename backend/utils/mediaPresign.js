"use strict";

const crypto = require("crypto");
const { S3Client } = require("@aws-sdk/client-s3");
const { createPresignedPost } = require("@aws-sdk/s3-presigned-post");

const ALLOWED_KINDS = ["product", "banner", "site"];

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

  return cleanPrefix ? `${cleanPrefix}/${kind}/${uuid}.${ext}` : `${kind}/${uuid}.${ext}`;
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

  const publicUrl = `${config.mediaCdnUrl}/${key}`;

  return {
    url: presigned.url,
    fields: presigned.fields,
    key,
    publicUrl
  };
}

module.exports = {
  getMediaConfig,
  ALLOWED_KINDS,
  ALLOWED_TYPES,
  MAX_BYTES,
  buildObjectKey,
  createPresignedUpload
};
