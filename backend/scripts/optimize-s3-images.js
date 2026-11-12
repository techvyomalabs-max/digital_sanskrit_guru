#!/usr/bin/env node
"use strict";

/**
 * Shrinks the store's images in S3 *in place*: same key, same format, same URL.
 * No database record changes. Every original is saved to
 * <S3_PREFIX>/_originals/... first, so it can be undone with --restore.
 *
 * Works with an upload-only AWS user (s3:PutObject): the image list comes from
 * the database (products and store settings, read-only) and the current files
 * are downloaded through the public CDN (MEDIA_CDN_URL).
 *
 * Needs sharp, which is not a project dependency (keeps deploys small):
 *   cd /var/www/ecommerce/backend && npm install --no-save sharp
 *
 * 1. Dry run (no writes; saves before/after samples to ./image-optimize-samples):
 *      node scripts/optimize-s3-images.js --env production
 * 2. Apply:
 *      node scripts/optimize-s3-images.js --env production --apply --confirm-bucket <S3_BUCKET>
 * 3. In CloudFront, create an invalidation for  /*
 *
 * Undo:
 *      node scripts/optimize-s3-images.js --env production --restore --confirm-bucket <S3_BUCKET>
 *   then invalidate CloudFront again.
 *
 * Uses MONGO_URI, MEDIA_CDN_URL, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
 * S3_BUCKET and S3_PREFIX from backend/.env.
 */

const fs = require("fs");
const path = require("path");

const BACKUP_DIR = "_originals";
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const MIN_BYTES = 80 * 1024; // smaller files aren't worth touching
const MIN_SAVING = 0.15; // only replace when at least 15% smaller
const PRODUCT_MAX = 1200; // longest side for product/site images (2x a ~600px product page)
const BANNER_MAX_WIDTH = 1920; // wide hero banners keep full desktop width
const BANNER_RATIO = 2.5; // width/height at or above this counts as a banner

function parseArgs(argv) {
  const args = { env: "", apply: false, restore: false, confirmBucket: "", samples: 12, limit: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--env") args.env = argv[++i] || "";
    else if (a === "--apply") args.apply = true;
    else if (a === "--restore") args.restore = true;
    else if (a === "--confirm-bucket") args.confirmBucket = argv[++i] || "";
    else if (a === "--samples") args.samples = Number(argv[++i]) || 0;
    else if (a === "--limit") args.limit = Number(argv[++i]) || 0;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!["staging", "production"].includes(args.env)) {
    throw new Error("--env must be 'staging' or 'production'.");
  }
  if (args.apply && args.restore) throw new Error("Use either --apply or --restore, not both.");
  return args;
}

/** Keys this script may optimize: public images under the prefix, not backups or private files. */
function isOptimizableKey(key, prefix) {
  if (!key.startsWith(`${prefix}/`)) return false;
  const rest = key.slice(prefix.length + 1);
  if (rest.startsWith(`${BACKUP_DIR}/`)) return false;
  if (rest.startsWith("private/") || rest.includes("/private/")) return false;
  return IMAGE_EXT.test(key);
}

function backupKeyFor(key, prefix) {
  return `${prefix}/${BACKUP_DIR}/${key.slice(prefix.length + 1)}`;
}

function originalKeyFor(backupKey, prefix) {
  return `${prefix}/${backupKey.slice(`${prefix}/${BACKUP_DIR}/`.length)}`;
}

/** Target box for sharp's resize (fit: inside), or null when no resize is needed. */
function resizeTarget(width, height) {
  if (!width || !height) return null;
  if (width / height >= BANNER_RATIO) {
    return width > BANNER_MAX_WIDTH ? { width: BANNER_MAX_WIDTH } : null;
  }
  return Math.max(width, height) > PRODUCT_MAX ? { width: PRODUCT_MAX, height: PRODUCT_MAX } : null;
}

async function optimizeBuffer(sharp, input) {
  const image = sharp(input, { failOn: "none" }).rotate(); // apply EXIF orientation
  const meta = await image.metadata();
  const target = resizeTarget(meta.autoOrient?.width || meta.width, meta.autoOrient?.height || meta.height);
  if (target) image.resize({ ...target, fit: "inside", withoutEnlargement: true });

  if (meta.format === "jpeg") {
    image.jpeg({ quality: 80, mozjpeg: true, progressive: true });
  } else if (meta.format === "png") {
    image.png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 });
  } else if (meta.format === "webp") {
    image.webp({ quality: 80, effort: 6 });
  } else {
    return null;
  }
  const output = await image.toBuffer();
  return { output, format: meta.format, before: [meta.width, meta.height], resized: Boolean(target) };
}

/** Every string in a document (nested objects/arrays included). */
function* walkStrings(value, depth = 0) {
  if (depth > 12 || value == null) return;
  if (typeof value === "string") {
    yield value;
  } else if (Array.isArray(value)) {
    for (const item of value) yield* walkStrings(item, depth + 1);
  } else if (typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    for (const v of Object.values(value)) yield* walkStrings(v, depth + 1);
  }
}

/** S3 keys referenced by CDN URLs inside a document. */
function keysFromDocument(doc, cdnUrl, prefix) {
  const keys = new Set();
  const base = `${cdnUrl}/`;
  for (const str of walkStrings(doc)) {
    if (!str.startsWith(base)) continue;
    const key = decodeURIComponent(str.slice(base.length).split(/[?#\s]/)[0]);
    if (isOptimizableKey(key, prefix)) keys.add(key);
  }
  return keys;
}

async function fetchFromCdn(url, method = "GET") {
  const res = await fetch(url, { method, headers: { "Cache-Control": "no-cache" } });
  if (!res.ok) return { ok: false, status: res.status };
  const body = method === "HEAD" ? null : Buffer.from(await res.arrayBuffer());
  return {
    ok: true,
    body,
    contentType: res.headers.get("content-type") || "",
    cacheControl: res.headers.get("cache-control") || "",
    optimized: res.headers.get("x-amz-meta-optimized") === "1"
  };
}

function kb(n) {
  return `${Math.round(n / 1024)} KB`;
}

async function main() {
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
  const args = parseArgs(process.argv.slice(2));

  const env = process.env;
  for (const name of ["MONGO_URI", "MEDIA_CDN_URL", "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "S3_BUCKET", "S3_PREFIX"]) {
    if (!String(env[name] || "").trim()) throw new Error(`Missing environment variable: ${name}`);
  }
  const bucket = env.S3_BUCKET.trim();
  const prefix = env.S3_PREFIX.trim().replace(/^\/+|\/+$/g, "");
  const cdnUrl = env.MEDIA_CDN_URL.trim().replace(/\/+$/, "");
  if (prefix !== `dsg/${args.env}`) {
    throw new Error(`S3_PREFIX is '${prefix}', expected 'dsg/${args.env}' for --env ${args.env}.`);
  }
  const writing = args.apply || args.restore;
  if (writing && args.confirmBucket !== bucket) {
    throw new Error(`--confirm-bucket must match S3_BUCKET ('${bucket}').`);
  }

  console.log(
    `[optimize-s3-images] ${args.restore ? "RESTORE" : args.apply ? "APPLY" : "DRY-RUN"} | s3://${bucket}/${prefix}/ via ${cdnUrl}`
  );

  // ── Image list from the database (read-only) ──────────────────────────────
  const mongoose = require("mongoose");
  await mongoose.connect(env.MONGO_URI);
  const keySet = new Set();
  try {
    for (const name of ["products", "storesettings"]) {
      for await (const doc of mongoose.connection.db.collection(name).find({})) {
        for (const key of keysFromDocument(doc, cdnUrl, prefix)) keySet.add(key);
      }
    }
  } finally {
    await mongoose.disconnect();
  }
  let keys = [...keySet].sort();
  if (args.limit > 0) keys = keys.slice(0, args.limit);
  console.log(`${keys.length} image(s) referenced by products and store settings.\n`);

  const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
  const s3 = writing
    ? new S3Client({
        region: env.AWS_REGION.trim(),
        credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID.trim(), secretAccessKey: env.AWS_SECRET_ACCESS_KEY.trim() }
      })
    : null;
  const put = (key, body, contentType, cacheControl, metadata = {}) =>
    s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: cacheControl || "public, max-age=31536000, immutable",
        Metadata: metadata
      })
    );

  // ── Restore: put each backup back over its original key ───────────────────
  if (args.restore) {
    let restored = 0;
    for (const key of keys) {
      const backup = await fetchFromCdn(`${cdnUrl}/${backupKeyFor(key, prefix)}`);
      if (!backup.ok) continue;
      await put(key, backup.body, backup.contentType, backup.cacheControl);
      restored += 1;
      console.log(`restored ${key}`);
    }
    console.log(`\nRestored ${restored} image(s). Now create a CloudFront invalidation for: /*`);
    return;
  }

  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    throw new Error("sharp is not installed. Run: npm install --no-save sharp   (inside backend/)");
  }

  const sampleDir = path.join(process.cwd(), "image-optimize-samples");
  if (!writing && args.samples > 0) fs.mkdirSync(sampleDir, { recursive: true });

  let totalBefore = 0;
  let totalAfter = 0;
  let changed = 0;
  let samplesWritten = 0;
  const failures = [];

  for (const key of keys) {
    try {
      const current = await fetchFromCdn(`${cdnUrl}/${key}`);
      if (!current.ok) {
        console.log(`missing  ${key} (CDN returned ${current.status})`);
        continue;
      }
      if (current.optimized) {
        console.log(`skip     ${key} (already optimized)`);
        continue;
      }
      const original = current.body;
      if (original.length < MIN_BYTES) continue;
      const result = await optimizeBuffer(sharp, original);
      if (!result || result.output.length > original.length * (1 - MIN_SAVING)) {
        console.log(`skip     ${key}  ${kb(original.length)} (already small enough)`);
        continue;
      }

      totalBefore += original.length;
      totalAfter += result.output.length;
      changed += 1;
      const pct = Math.round((1 - result.output.length / original.length) * 100);
      console.log(
        `${args.apply ? "replace" : "would   "} ${key}  ${kb(original.length)} -> ${kb(result.output.length)} (-${pct}%)` +
          `${result.resized ? `, was ${result.before.join("x")}` : ""}`
      );

      if (!args.apply) {
        if (samplesWritten < args.samples) {
          const base = path.basename(key).replace(IMAGE_EXT, "");
          const ext = path.extname(key);
          fs.writeFileSync(path.join(sampleDir, `${base}.before${ext}`), original);
          fs.writeFileSync(path.join(sampleDir, `${base}.after${ext}`), result.output);
          samplesWritten += 1;
        }
        continue;
      }

      const contentType = current.contentType || `image/${result.format}`;
      // Save the original once; an existing backup is never overwritten.
      const backupKey = backupKeyFor(key, prefix);
      const existing = await fetchFromCdn(`${cdnUrl}/${backupKey}`, "HEAD");
      if (!existing.ok) await put(backupKey, original, contentType, current.cacheControl);
      await put(key, result.output, contentType, current.cacheControl, { optimized: "1" });
    } catch (err) {
      failures.push(key);
      console.error(`FAILED   ${key}: ${err.message}`);
    }
  }

  console.log(
    `\n${changed} image(s) ${args.apply ? "replaced" : "would be replaced"}: ` +
      `${kb(totalBefore)} -> ${kb(totalAfter)} (saves ${kb(totalBefore - totalAfter)}).`
  );
  if (failures.length) console.log(`${failures.length} failed (left unchanged).`);
  if (args.apply) {
    console.log(`Originals are in s3://${bucket}/${prefix}/${BACKUP_DIR}/`);
    console.log(`Now create a CloudFront invalidation for: /*`);
  } else if (samplesWritten) {
    console.log(`Before/after samples: ${sampleDir}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[optimize-s3-images] ${err.message}`);
    process.exit(1);
  });
}

module.exports = { parseArgs, isOptimizableKey, backupKeyFor, originalKeyFor, resizeTarget, optimizeBuffer, keysFromDocument };
