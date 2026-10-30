#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const Product = require("../models/Product");
const StoreSettings = require("../models/StoreSettings");
const Order = require("../models/Order");

const {
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
} = require("../utils/imageMigration");

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const FETCH_TIMEOUT_MS = 30000; // 30 seconds
const MAX_FETCH_RETRIES = 2;
const CACHE_CONTROL_HEADER = "public, max-age=31536000, immutable";

function createEmptyStats() {
  return {
    base64Count: 0,
    base64Bytes: 0,
    base64MB: 0,
    wpCount: 0,
    wpDistinctCount: 0,
    cdnCount: 0,
    unsupportedCount: 0,
    _wpDistinctSet: new Set()
  };
}

function finalizeStats(stats) {
  return {
    base64Count: stats.base64Count,
    base64Bytes: stats.base64Bytes,
    base64MB: Number((stats.base64Bytes / (1024 * 1024)).toFixed(4)),
    wpCount: stats.wpCount,
    wpDistinctCount: stats._wpDistinctSet.size,
    cdnCount: stats.cdnCount,
    unsupportedCount: stats.unsupportedCount
  };
}

function estimateBase64Bytes(dataUrl) {
  const idx = dataUrl.indexOf(";base64,");
  if (idx === -1) return 0;
  const b64 = dataUrl.slice(idx + 8);
  try {
    return Buffer.from(b64, "base64").length;
  } catch {
    return 0;
  }
}

/**
 * Iterates documents from a collection using a streaming cursor (for await).
 * Falls back to .toArray() only for test fakes that do not implement an iterator.
 */
async function* iterateCollectionDocuments(collection) {
  const cursorOrDocs = await collection.find({});
  if (!cursorOrDocs) return;

  if (
    typeof cursorOrDocs[Symbol.asyncIterator] === "function" ||
    typeof cursorOrDocs[Symbol.iterator] === "function"
  ) {
    for await (const doc of cursorOrDocs) {
      yield doc;
    }
    return;
  }

  if (typeof cursorOrDocs.toArray === "function") {
    const docs = await cursorOrDocs.toArray();
    if (Array.isArray(docs)) {
      for (const doc of docs) {
        yield doc;
      }
    }
  }
}

function createSizeLimitError(totalBytes) {
  const err = new Error(`File exceeds 10 MB limit (${totalBytes} bytes)`);
  err.noRetry = true;
  return err;
}

function isReadableStreamBody(body) {
  if (!body || typeof body !== "object") return false;
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) return false;
  return (
    typeof body.getReader === "function" ||
    typeof body[Symbol.asyncIterator] === "function" ||
    typeof body[Symbol.iterator] === "function"
  );
}

async function readStreamBodyWithLimit(body, controller) {
  const chunks = [];
  let totalBytes = 0;

  if (typeof body.getReader === "function") {
    const reader = body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
      totalBytes += buf.length;
      if (totalBytes > MAX_IMAGE_BYTES) {
        controller.abort();
        if (typeof reader.cancel === "function") {
          try {
            await reader.cancel();
          } catch {
            // ignore cancel error
          }
        }
        throw createSizeLimitError(totalBytes);
      }
      chunks.push(buf);
    }
    return Buffer.concat(chunks, totalBytes);
  }

  for await (const chunk of body) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > MAX_IMAGE_BYTES) {
      controller.abort();
      throw createSizeLimitError(totalBytes);
    }
    chunks.push(buf);
  }

  return Buffer.concat(chunks, totalBytes);
}

async function fetchSingleAttempt(url, fetchFn, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Fetch timeout after 30s")), timeoutMs);

  try {
    const res = await fetchFn(url, {
      signal: controller.signal,
      redirect: "follow"
    });

    if (!res || !res.ok) {
      const status = res ? res.status : "unknown";
      throw new Error(`HTTP ${status} for ${url}`);
    }

    const contentLengthHeader =
      res.headers && typeof res.headers.get === "function"
        ? res.headers.get("content-length")
        : null;
    if (contentLengthHeader && Number(contentLengthHeader) > MAX_IMAGE_BYTES) {
      controller.abort();
      throw createSizeLimitError(Number(contentLengthHeader));
    }

    let bytes;
    if (isReadableStreamBody(res.body)) {
      bytes = await readStreamBodyWithLimit(res.body, controller);
    } else if (typeof res.arrayBuffer === "function") {
      const ab = await res.arrayBuffer();
      bytes = Buffer.from(ab);
    } else if (Buffer.isBuffer(res.body)) {
      bytes = res.body;
    } else if (res.body instanceof Uint8Array) {
      bytes = Buffer.from(res.body);
    } else {
      throw new Error("Unsupported response body format");
    }

    if (bytes.length === 0) {
      throw new Error("Downloaded image body is empty");
    }

    if (bytes.length > MAX_IMAGE_BYTES) {
      controller.abort();
      throw createSizeLimitError(bytes.length);
    }

    return bytes;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetries(
  url,
  fetchFn,
  { timeoutMs = FETCH_TIMEOUT_MS, maxRetries = MAX_FETCH_RETRIES, retryDelayMs = 0 } = {}
) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchSingleAttempt(url, fetchFn, timeoutMs);
    } catch (err) {
      lastErr = err;
      if (err && err.noRetry) {
        throw err;
      }
      if (attempt < maxRetries && retryDelayMs > 0) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
    }
  }
  throw lastErr;
}

/**
 * Downloads a WordPress image URL:
 * Tries https first; if that fails and the original URL was http, tries the original http URL.
 */
async function downloadWpImage(downloadUrl, fetchFn, fetchOptions = {}) {
  const isHttp = /^http:\/\//i.test(downloadUrl);
  const httpsUrl = isHttp ? downloadUrl.replace(/^http:\/\//i, "https://") : downloadUrl;

  try {
    return await fetchWithRetries(httpsUrl, fetchFn, fetchOptions);
  } catch (httpsErr) {
    if (!isHttp || (httpsErr && httpsErr.noRetry)) {
      throw httpsErr;
    }
    return await fetchWithRetries(downloadUrl, fetchFn, fetchOptions);
  }
}

function decodeDataUrlBytes(dataUrl) {
  const idx = dataUrl.indexOf(";base64,");
  if (idx === -1) {
    throw new Error("Invalid base64 data URL");
  }
  const base64Payload = dataUrl.slice(idx + 8);
  const bytes = Buffer.from(base64Payload, "base64");
  if (bytes.length === 0) {
    throw new Error("Decoded base64 image is empty");
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Error(`Decoded base64 image exceeds 10 MB limit (${bytes.length} bytes)`);
  }
  return bytes;
}

function resolveCollectionsToScan(onlyList, customCollections) {
  if (Array.isArray(customCollections)) {
    return customCollections;
  }

  const normalized = new Set((onlyList || ["products", "settings", "orders"]).map((s) => s.toLowerCase()));
  const result = [];

  if (normalized.has("products") || normalized.has("product")) {
    result.push({
      name: "products",
      collection: customCollections?.products || Product.collection
    });
  }
  if (normalized.has("settings") || normalized.has("storesettings")) {
    result.push({
      name: "storesettings",
      collection: customCollections?.storesettings || customCollections?.settings || StoreSettings.collection
    });
  }
  if (normalized.has("orders") || normalized.has("order")) {
    result.push({
      name: "orders",
      collection: customCollections?.orders || Order.collection
    });
  }

  return result;
}

async function runWithConcurrency(items, concurrency, workerFn) {
  const poolSize = Math.max(1, Number(concurrency) || 4);
  let index = 0;

  async function next() {
    while (index < items.length) {
      const currentIdx = index++;
      const shouldContinue = await workerFn(items[currentIdx], currentIdx);
      if (shouldContinue === false) {
        break;
      }
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(poolSize, items.length); i++) {
    workers.push(next());
  }
  await Promise.all(workers);
}

/**
 * Runs the image migration scan (and optional apply) against the provided collections.
 * Can be called directly in tests with fake collections, fake S3 client/send, and fake fetch.
 */
async function runMigration({
  args: rawArgs = {},
  env = process.env,
  actualDbName,
  collections: customCollections,
  s3Client: customS3Client,
  s3Send: customS3Send,
  fetchFn = global.fetch,
  fetchOptions = {},
  logger = console,
  writeReport = false,
  reportDir
} = {}) {
  const validated = validateSafetyChecks({
    args: rawArgs,
    env,
    actualDbName
  });

  const {
    args,
    s3Prefix,
    s3Bucket,
    awsRegion,
    awsAccessKeyId,
    awsSecretAccessKey,
    mediaCdnUrl,
    maskedConnection
  } = validated;

  if (logger && typeof logger.log === "function") {
    logger.log(`[migrate-images-to-s3] Mode: ${args.apply ? "APPLY" : "DRY-RUN"} | Env: ${args.env}`);
    logger.log(`[migrate-images-to-s3] ${maskedConnection}`);
  }

  const s3Send =
    customS3Send ||
    (customS3Client && typeof customS3Client.send === "function"
      ? (cmd) => customS3Client.send(cmd)
      : args.apply
      ? (() => {
          const client = new S3Client({
            region: awsRegion,
            credentials: {
              accessKeyId: awsAccessKeyId,
              secretAccessKey: awsSecretAccessKey
            }
          });
          return (cmd) => client.send(cmd);
        })()
      : null);

  const targets = resolveCollectionsToScan(args.only, customCollections);
  const refOptions = {
    extraHosts: args.hosts || [],
    mediaCdnUrl
  };

  const perCollectionStats = {};
  const perFieldPatternStats = {};
  const nonImageUploads = [];
  const unrecognised = [];
  const externalHostCounts = new Map();
  const migratableDocsQueue = [];

  for (const target of targets) {
    const colName = target.name;
    perCollectionStats[colName] = createEmptyStats();

    for await (const doc of iterateCollectionDocuments(target.collection)) {
      if (!doc || typeof doc !== "object") continue;
      const docId = doc._id !== undefined ? String(doc._id) : "";

      // Collect external image hosts (info only)
      const extHosts = findExternalImageHostsInDoc(doc, refOptions);
      for (const h of extHosts) {
        externalHostCounts.set(h, (externalHostCounts.get(h) || 0) + 1);
      }

      const walkedFields = walkDocument(doc, refOptions);
      if (walkedFields.length === 0) continue;

      const docMigratableFields = [];

      for (const field of walkedFields) {
        const refs = findImageRefs(field.value, refOptions);
        if (refs.length === 0) continue;

        const patternKey = toFieldPattern(colName, field.path);
        if (!perFieldPatternStats[patternKey]) {
          perFieldPatternStats[patternKey] = createEmptyStats();
        }
        const colStat = perCollectionStats[colName];
        const patStat = perFieldPatternStats[patternKey];

        let hasMigratableInField = false;

        for (const ref of refs) {
          if (ref.kind === "data") {
            const bytesLen = estimateBase64Bytes(ref.match);
            colStat.base64Count += 1;
            colStat.base64Bytes += bytesLen;
            patStat.base64Count += 1;
            patStat.base64Bytes += bytesLen;
            hasMigratableInField = true;
          } else if (ref.kind === "wp") {
            colStat.wpCount += 1;
            colStat._wpDistinctSet.add(ref.downloadUrl || ref.match);
            patStat.wpCount += 1;
            patStat._wpDistinctSet.add(ref.downloadUrl || ref.match);
            hasMigratableInField = true;
          } else if (ref.kind === "cdn") {
            colStat.cdnCount += 1;
            patStat.cdnCount += 1;
          } else if (ref.kind === "unsupported") {
            colStat.unsupportedCount += 1;
            patStat.unsupportedCount += 1;
          } else if (ref.kind === "nonImageUpload") {
            nonImageUploads.push({
              collection: colName,
              id: docId,
              path: field.path,
              url: ref.match
            });
          } else if (ref.kind === "unrecognised") {
            unrecognised.push({
              collection: colName,
              id: docId,
              path: field.path,
              value: ref.match.slice(0, 200)
            });
          }
        }

        if (hasMigratableInField) {
          docMigratableFields.push({
            path: field.path,
            value: field.value,
            refs: refs.filter((r) => r.kind === "data" || r.kind === "wp")
          });
        }
      }

      if (docMigratableFields.length > 0) {
        // Store only { _id, fields } (plus collection metadata), never the full document
        migratableDocsQueue.push({
          _id: doc._id,
          fields: docMigratableFields,
          collectionName: colName,
          collection: target.collection
        });
      }
    }
  }

  let documentsChanged = 0;
  let refsMigrated = 0;
  let distinctS3ObjectsUploaded = 0;
  let totalBytesUploaded = 0;
  const failures = [];
  const manifest = [];

  // Map from S3 object key -> Promise<{ key, newUrl, bytesLength }>
  const uploadCache = new Map();

  async function uploadBytesOnce(bytes, sniffed) {
    const key = contentHashKey({
      prefix: s3Prefix,
      bytes,
      ext: sniffed.ext
    });
    const newUrl = `${mediaCdnUrl}/${key}`;

    if (uploadCache.has(key)) {
      return await uploadCache.get(key);
    }

    const uploadPromise = (async () => {
      const cmd = new PutObjectCommand({
        Bucket: s3Bucket,
        Key: key,
        Body: bytes,
        ContentType: sniffed.mime,
        CacheControl: CACHE_CONTROL_HEADER
      });
      await s3Send(cmd);
      distinctS3ObjectsUploaded += 1;
      totalBytesUploaded += bytes.length;
      return { key, newUrl, bytesLength: bytes.length };
    })();

    uploadCache.set(key, uploadPromise);

    try {
      return await uploadPromise;
    } catch (err) {
      uploadCache.delete(key);
      throw err;
    }
  }

  if (args.apply && migratableDocsQueue.length > 0) {
    const effectiveConcurrency = args.limit ? 1 : args.concurrency;

    await runWithConcurrency(migratableDocsQueue, effectiveConcurrency, async (item) => {
      if (args.limit && documentsChanged >= args.limit) {
        return false;
      }

      const { _id, fields, collectionName, collection } = item;
      const docId = _id !== undefined ? String(_id) : "";
      const setPaths = {};
      const originalPathValues = {};
      const docManifestEntries = [];
      let docMigratedRefsCount = 0;

      for (const field of fields) {
        const replacementMap = new Map();
        const fieldManifestEntries = [];

        for (const ref of field.refs) {
          try {
            let bytes;
            let sourceRef;

            if (ref.kind === "data") {
              bytes = decodeDataUrlBytes(ref.match);
              const fullSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
              sourceRef = `data:sha256:${fullSha256}`;
            } else {
              bytes = await downloadWpImage(ref.downloadUrl, fetchFn, fetchOptions);
              sourceRef = ref.match;
            }

            const sniffed = sniffImageType(bytes);
            if (!sniffed) {
              throw new Error("Magic byte check failed: unsupported or invalid image content");
            }

            const { newUrl } = await uploadBytesOnce(bytes, sniffed);
            replacementMap.set(ref.match, newUrl);
            fieldManifestEntries.push({
              collection: collectionName,
              id: docId,
              path: field.path,
              kind: ref.kind,
              sourceRef,
              newUrl
            });
          } catch (err) {
            failures.push({
              collection: collectionName,
              id: docId,
              path: field.path,
              reason: err && err.message ? err.message : String(err)
            });
          }
        }

        if (replacementMap.size > 0) {
          const updatedValue = replaceRefs(field.value, replacementMap);
          if (updatedValue !== field.value) {
            setPaths[field.path] = updatedValue;
            originalPathValues[field.path] = field.value;
            docManifestEntries.push(...fieldManifestEntries);
            docMigratedRefsCount += fieldManifestEntries.length;
          }
        }
      }

      const updatedFieldNames = Object.keys(setPaths);
      if (updatedFieldNames.length > 0) {
        if (args.limit && documentsChanged >= args.limit) {
          return false;
        }

        const filter = {
          _id,
          ...originalPathValues
        };

        const updateResult = await collection.updateOne(filter, { $set: setPaths });
        if (updateResult && updateResult.matchedCount === 0) {
          for (const changedPath of updatedFieldNames) {
            failures.push({
              collection: collectionName,
              id: docId,
              path: changedPath,
              reason: "changed since scan, skipped"
            });
          }
        } else {
          documentsChanged += 1;
          refsMigrated += docMigratedRefsCount;
          manifest.push(...docManifestEntries);
        }
      }

      return !(args.limit && documentsChanged >= args.limit);
    });
  }

  const formattedCollections = {};
  for (const [k, v] of Object.entries(perCollectionStats)) {
    formattedCollections[k] = finalizeStats(v);
  }

  const formattedFieldPatterns = {};
  for (const [k, v] of Object.entries(perFieldPatternStats)) {
    formattedFieldPatterns[k] = finalizeStats(v);
  }

  const topExternalImageHosts = Array.from(externalHostCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([host, count]) => ({ host, count }));

  const report = {
    env: args.env,
    mode: args.apply ? "apply" : "dry-run",
    timestamp: new Date().toISOString(),
    database: maskedConnection,
    collections: formattedCollections,
    fieldPatterns: formattedFieldPatterns,
    nonImageUploads,
    unrecognised,
    topExternalImageHosts,
    ...(args.apply
      ? {
          documentsChanged,
          refsMigrated,
          distinctS3ObjectsUploaded,
          totalBytesUploaded,
          failures
        }
      : {}),
    manifest
  };

  if (logger && typeof logger.log === "function") {
    printConsoleReport(report, logger);
  }

  let reportFilePath = null;
  if (writeReport) {
    reportFilePath = writeReportJsonFile(report, reportDir);
    if (logger && typeof logger.log === "function") {
      logger.log(`[migrate-images-to-s3] Report written to ${reportFilePath}`);
    }
  }

  return { report, reportFilePath };
}

function printConsoleReport(report, logger) {
  logger.log("=== Image Migration Summary ===");
  logger.log("Per Collection:");
  for (const [col, stats] of Object.entries(report.collections)) {
    logger.log(
      `  ${col}: base64=${stats.base64Count} (${stats.base64MB} MB), wp=${stats.wpCount} (distinct=${stats.wpDistinctCount}), cdn=${stats.cdnCount}, unsupported=${stats.unsupportedCount}`
    );
  }

  logger.log("Per Field Pattern:");
  for (const [pat, stats] of Object.entries(report.fieldPatterns)) {
    logger.log(
      `  ${pat}: base64=${stats.base64Count} (${stats.base64MB} MB), wp=${stats.wpCount} (distinct=${stats.wpDistinctCount}), cdn=${stats.cdnCount}, unsupported=${stats.unsupportedCount}`
    );
  }

  const cappedUploads = report.nonImageUploads.slice(0, 200);
  logger.log(`Non-image uploads still referenced (${report.nonImageUploads.length} total, showing up to 200):`);
  for (const item of cappedUploads) {
    logger.log(`  [${item.collection}] id=${item.id} path=${item.path} url=${item.url}`);
  }

  const cappedUnrecognised = report.unrecognised.slice(0, 200);
  logger.log(`Unrecognised refs (${report.unrecognised.length} total, showing up to 200):`);
  for (const item of cappedUnrecognised) {
    logger.log(`  [${item.collection}] id=${item.id} path=${item.path} value=${item.value}`);
  }

  logger.log("Top 10 other external image hosts:");
  for (const item of report.topExternalImageHosts) {
    logger.log(`  ${item.host}: ${item.count}`);
  }

  if (report.mode === "apply") {
    logger.log(
      `Apply Results: documentsChanged=${report.documentsChanged}, refsMigrated=${report.refsMigrated}, distinctS3ObjectsUploaded=${report.distinctS3ObjectsUploaded}, totalBytesUploaded=${report.totalBytesUploaded}, failures=${report.failures.length}`
    );
  }
}

function writeReportJsonFile(report, customReportDir) {
  const dir = customReportDir || path.resolve(__dirname, "..", "..", "scratch");
  fs.mkdirSync(dir, { recursive: true });

  const safeIso = report.timestamp.replace(/[:.]/g, "-");
  let candidate = path.join(dir, `migration-report-${report.env}-${safeIso}.json`);
  let counter = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `migration-report-${report.env}-${safeIso}-${counter++}.json`);
  }

  fs.writeFileSync(candidate, JSON.stringify(report, null, 2), { encoding: "utf8", flag: "wx" });
  return candidate;
}

async function main() {
  try {
    const parsedArgs = parseArgs(process.argv.slice(2));
    const precheck = validateSafetyChecks({ args: parsedArgs, env: process.env });

    await mongoose.connect(precheck.mongoUri);
    try {
      const actualDbName =
        (mongoose.connection && mongoose.connection.name) ||
        (mongoose.connection && mongoose.connection.db && mongoose.connection.db.databaseName) ||
        parseMongoUri(precheck.mongoUri).dbName;

      validateSafetyChecks({
        args: parsedArgs,
        env: process.env,
        actualDbName
      });

      await runMigration({
        args: parsedArgs,
        env: process.env,
        actualDbName,
        writeReport: true
      });
    } finally {
      await mongoose.disconnect();
    }
    process.exit(0);
  } catch (err) {
    console.error(`[migrate-images-to-s3] ERROR: ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  MAX_IMAGE_BYTES,
  FETCH_TIMEOUT_MS,
  MAX_FETCH_RETRIES,
  CACHE_CONTROL_HEADER,
  parseArgs,
  parseMongoUri,
  formatMaskedConnection,
  validateSafetyChecks,
  downloadWpImage,
  runMigration
};
