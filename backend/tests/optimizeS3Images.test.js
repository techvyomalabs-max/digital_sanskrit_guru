"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const {
  parseArgs,
  isOptimizableKey,
  backupKeyFor,
  originalKeyFor,
  resizeTarget,
  optimizeBuffer
} = require("../scripts/optimize-s3-images");

const PREFIX = "dsg/production";

describe("optimize-s3-images", () => {
  test("parseArgs requires a valid env and rejects apply+restore", () => {
    assert.throws(() => parseArgs([]), /--env/);
    assert.throws(() => parseArgs(["--env", "prod"]), /--env/);
    assert.throws(() => parseArgs(["--env", "production", "--apply", "--restore"]), /either/);
    const a = parseArgs(["--env", "production", "--apply", "--confirm-bucket", "b"]);
    assert.equal(a.apply, true);
    assert.equal(a.confirmBucket, "b");
  });

  test("only public images under the prefix are optimizable", () => {
    assert.equal(isOptimizableKey("dsg/production/migrated/abc.jpg", PREFIX), true);
    assert.equal(isOptimizableKey("dsg/production/product/u.PNG", PREFIX), true);
    assert.equal(isOptimizableKey("dsg/production/banner/u.webp", PREFIX), true);
    assert.equal(isOptimizableKey("dsg/production/_originals/migrated/abc.jpg", PREFIX), false);
    assert.equal(isOptimizableKey("dsg/production/private/return-evidence/u.jpg", PREFIX), false);
    assert.equal(isOptimizableKey("dsg/staging/migrated/abc.jpg", PREFIX), false);
    assert.equal(isOptimizableKey("dsg/production/downloads/book.pdf", PREFIX), false);
  });

  test("backup keys round-trip", () => {
    const key = "dsg/production/migrated/abc.jpg";
    const backup = backupKeyFor(key, PREFIX);
    assert.equal(backup, "dsg/production/_originals/migrated/abc.jpg");
    assert.equal(originalKeyFor(backup, PREFIX), key);
  });

  test("resize keeps banners wide and caps product images", () => {
    assert.deepEqual(resizeTarget(3000, 2000), { width: 1200, height: 1200 });
    assert.equal(resizeTarget(1000, 1000), null);
    assert.deepEqual(resizeTarget(2400, 400), { width: 1920 }); // banner
    assert.equal(resizeTarget(1200, 200), null); // banner already small
    assert.equal(resizeTarget(0, 0), null);
  });

  let sharp = null;
  try {
    sharp = require("sharp");
  } catch {
    sharp = null;
  }

  test("optimizeBuffer keeps the format and shrinks a large image", { skip: !sharp && "sharp not installed" }, async () => {
    const noise = Buffer.alloc(2400 * 1600 * 3);
    for (let i = 0; i < noise.length; i += 1) noise[i] = (i * 37 + (i >> 7)) & 255;
    const jpg = await sharp(noise, { raw: { width: 2400, height: 1600, channels: 3 } }).jpeg({ quality: 100 }).toBuffer();
    const out = await optimizeBuffer(sharp, jpg);
    assert.equal(out.format, "jpeg");
    assert.equal(out.resized, true);
    const meta = await sharp(out.output).metadata();
    assert.equal(meta.format, "jpeg");
    assert.equal(meta.width, 1200);
    assert.ok(out.output.length < jpg.length);

    const png = await sharp(noise, { raw: { width: 2400, height: 1600, channels: 3 } }).png().toBuffer();
    const outPng = await optimizeBuffer(sharp, png);
    assert.equal((await sharp(outPng.output).metadata()).format, "png");
  });
});
