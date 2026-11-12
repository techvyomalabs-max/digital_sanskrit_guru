#!/usr/bin/env node
"use strict";

/**
 * Shrinks the store's images in S3 *in place*: same key, same format, same URL.
 * No database record changes. Every original is copied to
 * <S3_PREFIX>/_originals/... first, so it can be undone with --restore.
 *
 * Needs sharp, which is not a project dependency (keeps deploys small):
 *   cd /var/www/ecommerce/backend && npm install --no-save sharp
 *
 * 1. Dry run (reads only; writes before/after samples to ./image-optimize-samples):
 *      node scripts/optimize-s3-images.js --env production
 * 2. Apply:
 *      node scripts/optimize-s3-images.js --env production --apply --confirm-bucket <S3_BUCKET>
 * 3. In CloudFront, create an invalidation for  /*
 *
 * Undo:
 *      node scripts/optimize-s3-images.js --env production --restore --confirm-bucket <S3_BUCKET>
 *   then invalidate CloudFront again.
 *
 * Uses AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET, S3_PREFIX
 * from backend/.env.
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

async function streamToBuffer(body) {
  const chunks = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function kb(n) {
  return `${Math.round(n / 1024)} KB`;
}

async function main() {
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
  const args = parseArgs(process.argv.slice(2));

  const env = process.env;
  for (const name of ["AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "S3_BUCKET", "S3_PREFIX"]) {
    if (!String(env[name] || "").trim()) throw new Error(`Missing environment variable: ${name}`);
  }
  const bucket = env.S3_BUCKET.trim();
  const prefix = env.S3_PREFIX.trim().replace(/^\/+|\/+$/g, "");
  if (prefix !== `dsg/${args.env}`) {
    throw new Error(`S3_PREFIX is '${prefix}', expected 'dsg/${args.env}' for --env ${args.env}.`);
  }
  const writing = args.apply || args.restore;
  if (writing && args.confirmBucket !== bucket) {
    throw new Error(`--confirm-bucket must match S3_BUCKET ('${bucket}').`);
  }

  const {
    S3Client,
    ListObjectsV2Command,
    GetObjectCommand,
    HeadObjectCommand,
    CopyObjectCommand,
    PutObjectCommand
  } = require("@aws-sdk/client-s3");
  const s3 = new S3Client({
    region: env.AWS_REGION.trim(),
    credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID.trim(), secretAccessKey: env.AWS_SECRET_ACCESS_KEY.trim() }
  });

  const listKeys = async (listPrefix) => {
    const objects = [];
    let token;
    do {
      const page = await s3.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: listPrefix, ContinuationToken: token })
      );
      for (const o of page.Contents || []) objects.push({ key: o.Key, size: o.Size });
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return objects;
  };
  const exists = async (key) => {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch (err) {
      if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") return false;
      throw err;
    }
  };

  console.log(`[optimize-s3-images] ${args.restore ? "RESTORE" : args.apply ? "APPLY" : "DRY-RUN"} | s3://${bucket}/${prefix}/`);

  // ── Restore: copy every backup over its original key ──────────────────────
  if (args.restore) {
    const backups = (await listKeys(`${prefix}/${BACKUP_DIR}/`)).filter((o) => IMAGE_EXT.test(o.key));
    for (const { key } of backups) {
      const target = originalKeyFor(key, prefix);
      await s3.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: target,
          CopySource: encodeURI(`${bucket}/${key}`),
          MetadataDirective: "COPY"
        })
      );
      console.log(`restored ${target}`);
    }
    console.log(`\nRestored ${backups.length} image(s). Now create a CloudFront invalidation for: /*`);
    return;
  }

  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    throw new Error("sharp is not installed. Run: npm install --no-save sharp   (inside backend/)");
  }

  let candidates = (await listKeys(`${prefix}/`)).filter((o) => isOptimizableKey(o.key, prefix) && o.size >= MIN_BYTES);
  candidates.sort((a, b) => b.size - a.size);
  if (args.limit > 0) candidates = candidates.slice(0, args.limit);
  console.log(`${candidates.length} image(s) of ${kb(MIN_BYTES)}+ to check.\n`);

  const sampleDir = path.join(process.cwd(), "image-optimize-samples");
  if (!writing && args.samples > 0) fs.mkdirSync(sampleDir, { recursive: true });

  let totalBefore = 0;
  let totalAfter = 0;
  let changed = 0;
  let samplesWritten = 0;
  const failures = [];

  for (const { key } of candidates) {
    try {
      const got = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const original = await streamToBuffer(got.Body);
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

      // Back up the original once; never overwrite an existing backup.
      const backupKey = backupKeyFor(key, prefix);
      if (!(await exists(backupKey))) {
        await s3.send(
          new CopyObjectCommand({
            Bucket: bucket,
            Key: backupKey,
            CopySource: encodeURI(`${bucket}/${key}`),
            MetadataDirective: "COPY"
          })
        );
      }
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: result.output,
          ContentType: got.ContentType || `image/${result.format}`,
          CacheControl: got.CacheControl || "public, max-age=31536000, immutable",
          Metadata: { ...(got.Metadata || {}), optimized: "1" }
        })
      );
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

module.exports = { parseArgs, isOptimizableKey, backupKeyFor, originalKeyFor, resizeTarget, optimizeBuffer };
