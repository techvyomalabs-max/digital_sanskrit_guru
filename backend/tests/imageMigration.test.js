"use strict";

const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const {
  findImageRefs,
  replaceRefs,
  walkDocument,
  contentHashKey,
  sniffImageType,
  formatMaskedConnection,
  validateSafetyChecks
} = require("../utils/imageMigration");

const {
  runMigration,
  CACHE_CONTROL_HEADER
} = require("../scripts/migrate-images-to-s3");

// Small valid magic-byte buffers for testing
const VALID_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52
]);
const VALID_JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01
]);
const VALID_GIF87A_BYTES = Buffer.from("GIF87a\x01\x00\x01\x00", "binary");
const VALID_GIF89A_BYTES = Buffer.from("GIF89a\x01\x00\x01\x00", "binary");
const VALID_WEBP_BYTES = Buffer.from([
  0x52, 0x49, 0x46, 0x46, // "RIFF"
  0x24, 0x00, 0x00, 0x00, // size
  0x57, 0x45, 0x42, 0x50, // "WEBP"
  0x56, 0x50, 0x38, 0x20
]);

describe("imageMigration utilities and script", () => {
  const ENV_KEYS = [
    "MONGO_URI",
    "AWS_REGION",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "S3_BUCKET",
    "S3_PREFIX",
    "MEDIA_CDN_URL"
  ];
  let savedEnv = {};

  beforeEach(() => {
    savedEnv = {};
    for (const k of ENV_KEYS) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    process.env.MEDIA_CDN_URL = "https://cdn.digitalsanskritguru.com";
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] !== undefined) {
        process.env[k] = savedEnv[k];
      } else {
        delete process.env[k];
      }
    }
  });

  // 1. findImageRefs
  describe("1. findImageRefs", () => {
    test("whole-string data URL", () => {
      const b64 = VALID_PNG_BYTES.toString("base64");
      const val = `data:image/png;base64,${b64}`;
      const refs = findImageRefs(val);
      assert.equal(refs.length, 1);
      assert.equal(refs[0].kind, "data");
      assert.equal(refs[0].match, val);
      assert.equal(refs[0].mime, "image/png");
    });

    test("WordPress URL with https and http", () => {
      const httpsUrl = "https://digitalsanskritguru.com/wp-content/uploads/2022/08/book.jpg";
      const httpUrl = "http://3.108.166.236/wp-content/uploads/2021/05/cover.png";
      const vyomaUrl = "https://vyomalabs.in/wp-content/uploads/2020/01/item.webp";

      const r1 = findImageRefs(httpsUrl);
      assert.deepEqual(r1, [
        { kind: "wp", match: httpsUrl, downloadUrl: httpsUrl }
      ]);

      const r2 = findImageRefs(httpUrl);
      assert.deepEqual(r2, [
        { kind: "wp", match: httpUrl, downloadUrl: httpUrl }
      ]);

      const r3 = findImageRefs(vyomaUrl);
      assert.deepEqual(r3, [
        { kind: "wp", match: vyomaUrl, downloadUrl: vyomaUrl }
      ]);
    });

    test("WordPress URL and data URL embedded in description HTML with surrounding quotes", () => {
      const wpUrl = "https://www.digitalsanskritguru.com/wp-content/uploads/2022/08/a.jpg";
      const dataUrl = `data:image/jpeg;base64,${VALID_JPEG_BYTES.toString("base64")}`;
      const html = `<div class="desc"><img src="${wpUrl}" alt="cover" /><img src='${dataUrl}'></div>`;

      const refs = findImageRefs(html);
      assert.equal(refs.length, 2);
      assert.deepEqual(refs[0], {
        kind: "wp",
        match: wpUrl,
        downloadUrl: wpUrl
      });
      assert.deepEqual(refs[1], {
        kind: "data",
        match: dataUrl,
        mime: "image/jpeg"
      });
    });

    test(".pdf under wp-content/uploads classified as nonImageUpload", () => {
      const pdfUrl = "https://digitalsanskritguru.com/wp-content/uploads/2023/01/sample.pdf";
      const refs = findImageRefs(`<a href="${pdfUrl}">Download PDF</a>`);
      assert.equal(refs.length, 1);
      assert.deepEqual(refs[0], {
        kind: "nonImageUpload",
        match: pdfUrl
      });
    });

    test("uppercase .JPG and URL with query string", () => {
      const upperUrl = "https://digitalsanskritguru.com/wp-content/uploads/2022/09/PHOTO.JPG";
      const queryUrl = "https://digitalsanskritguru.com/wp-content/uploads/2022/09/pic.webp?resize=300%2C300&ssl=1";

      const rUpper = findImageRefs(upperUrl);
      assert.equal(rUpper.length, 1);
      assert.equal(rUpper[0].kind, "wp");
      assert.equal(rUpper[0].match, upperUrl);

      const rQuery = findImageRefs(queryUrl);
      assert.equal(rQuery.length, 1);
      assert.equal(rQuery[0].kind, "wp");
      assert.equal(rQuery[0].match, queryUrl);
      assert.equal(rQuery[0].downloadUrl, queryUrl);
    });

    test("CDN URL classified as cdn", () => {
      const cdnUrl = "https://cdn.digitalsanskritguru.com/dsg/staging/migrated/0123456789abcdef0123456789abcdef.jpg";
      const refs = findImageRefs(cdnUrl);
      assert.deepEqual(refs, [{ kind: "cdn", match: cdnUrl }]);
    });

    test("svg data URL classified as unsupported", () => {
      const svgData = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==";
      const refs = findImageRefs(svgData);
      assert.equal(refs.length, 1);
      assert.equal(refs[0].kind, "unsupported");
      assert.equal(refs[0].match, svgData);
    });

    test("data URL with line break or space is classified as unsupported with reason 'data URL contains whitespace', and base64 length not multiple of 4 is unsupported", () => {
      const brokenDataUrl = "data:image/png;base64,iVBORw0KGgo\nAAAANSUhEUg==";
      const refs = findImageRefs(brokenDataUrl);
      assert.equal(refs.length, 1);
      assert.equal(refs[0].kind, "unsupported");
      assert.equal(refs[0].match, brokenDataUrl);
      assert.equal(refs[0].reason, "data URL contains whitespace");

      // Nothing is replaced when unsupported
      const unreplaced = replaceRefs(brokenDataUrl, {});
      assert.equal(unreplaced, brokenDataUrl);

      // Base64 part length not a multiple of 4
      const badLenDataUrl = "data:image/png;base64,iVBOR";
      const badLenRefs = findImageRefs(badLenDataUrl);
      assert.equal(badLenRefs.length, 1);
      assert.equal(badLenRefs[0].kind, "unsupported");

      // Normal data URL inside <img src="..."> is still "data"
      const normalDataUrl = "data:image/png;base64,iVBORw0KGgo=";
      const normalHtml = `<img src="${normalDataUrl}" alt="ok">`;
      const normalRefs = findImageRefs(normalHtml);
      assert.equal(normalRefs.length, 1);
      assert.equal(normalRefs[0].kind, "data");
      assert.equal(normalRefs[0].match, normalDataUrl);
    });

    test("random https image URL on another host is ignored", () => {
      const externalUrl = "https://images.example.org/assets/photo.jpg";
      const refs = findImageRefs(`<img src="${externalUrl}" />`);
      assert.deepEqual(refs, []);
    });

    test("string with 3 refs of mixed kinds", () => {
      const wpUrl = "https://digitalsanskritguru.com/wp-content/uploads/2022/01/one.png";
      const cdnUrl = "https://cdn.digitalsanskritguru.com/dsg/production/migrated/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png";
      const pdfUrl = "https://digitalsanskritguru.com/wp-content/uploads/2022/01/brochure.pdf";
      const mixed = `<p><img src="${wpUrl}"><img src="${cdnUrl}"><a href="${pdfUrl}">PDF</a></p>`;

      const refs = findImageRefs(mixed);
      assert.equal(refs.length, 3);
      assert.equal(refs[0].kind, "wp");
      assert.equal(refs[0].match, wpUrl);
      assert.equal(refs[1].kind, "cdn");
      assert.equal(refs[1].match, cdnUrl);
      assert.equal(refs[2].kind, "nonImageUpload");
      assert.equal(refs[2].match, pdfUrl);
    });

    test("unrecognised kind for WordPress URL without file extension or malformed data:image/ token", () => {
      const noExtWp = "https://digitalsanskritguru.com/wp-content/uploads/2022/08/a";
      const refs = findImageRefs(noExtWp);
      assert.deepEqual(refs, [
        {
          kind: "unrecognised",
          match: noExtWp
        }
      ]);

      const badDataToken = "data:image/png;notbase64";
      const dataRefs = findImageRefs(badDataToken);
      assert.deepEqual(dataRefs, [
        {
          kind: "unrecognised",
          match: badDataToken
        }
      ]);
    });
  });

  // 2. replaceRefs
  describe("2. replaceRefs", () => {
    test("replaces only matched substrings and leaves rest of HTML byte-for-byte identical, keeps unmapped matches, and replaces duplicates", () => {
      const u1 = "http://digitalsanskritguru.com/wp-content/uploads/2022/08/a.jpg";
      const u2 = "https://digitalsanskritguru.com/wp-content/uploads/2022/08/unmapped.png";
      const newU1 = "https://cdn.digitalsanskritguru.com/dsg/staging/migrated/11111111111111111111111111111111.jpg";

      const originalHtml =
        `<div class="product-body" data-x="1">\n` +
        `  <img src="${u1}" alt="First" />\n` +
        `  <p>Some text &amp; entities</p>\n` +
        `  <img src="${u2}" alt="Keep me" />\n` +
        `  <a href="${u1}">Duplicate link</a>\n` +
        `</div>`;

      const expectedHtml =
        `<div class="product-body" data-x="1">\n` +
        `  <img src="${newU1}" alt="First" />\n` +
        `  <p>Some text &amp; entities</p>\n` +
        `  <img src="${u2}" alt="Keep me" />\n` +
        `  <a href="${newU1}">Duplicate link</a>\n` +
        `</div>`;

      const output = replaceRefs(originalHtml, { [u1]: newU1 });
      assert.equal(output, expectedHtml);
    });
  });

  // 3. Relative WP path, localhost ignored, extraHosts accepted
  describe("3. Relative WP path and host rules", () => {
    test("relative /wp-content/uploads/2022/08/a.jpg inside src is kind wp with downloadUrl on digitalsanskritguru.com", () => {
      const html = `<img src="/wp-content/uploads/2022/08/a.jpg" class="wp-image">`;
      const refs = findImageRefs(html);
      assert.deepEqual(refs, [
        {
          kind: "wp",
          match: "/wp-content/uploads/2022/08/a.jpg",
          downloadUrl: "https://digitalsanskritguru.com/wp-content/uploads/2022/08/a.jpg"
        }
      ]);

      const replaced = replaceRefs(html, {
        "/wp-content/uploads/2022/08/a.jpg": "https://cdn.digitalsanskritguru.com/dsg/staging/migrated/abc.jpg"
      });
      assert.equal(
        replaced,
        `<img src="https://cdn.digitalsanskritguru.com/dsg/staging/migrated/abc.jpg" class="wp-image">`
      );
    });

    test("localhost URLs are ignored", () => {
      const local1 = "http://localhost/wp-content/uploads/2022/08/a.jpg";
      const local2 = "http://localhost:8080/wp-content/uploads/2022/08/a.jpg";
      assert.deepEqual(findImageRefs(local1), []);
      assert.deepEqual(findImageRefs(local2), []);
    });

    test("host passed in extraHosts is accepted", () => {
      const customUrl = "https://staging-wp.vyoma.org/wp-content/uploads/2023/03/banner.png";
      assert.deepEqual(findImageRefs(customUrl), []);

      const refs = findImageRefs(customUrl, { extraHosts: ["staging-wp.vyoma.org"] });
      assert.deepEqual(refs, [
        {
          kind: "wp",
          match: customUrl,
          downloadUrl: customUrl
        }
      ]);
    });
  });

  // 4. Regex never swallows HTML, HTML-encoded quotes, or trailing punctuation / comma-joined URLs
  describe("4. Regex boundary handling, HTML-encoded quotes, and trailing punctuation", () => {
    test("stops at quotes, parentheses, whitespace, and angle brackets", () => {
      const url = "https://digitalsanskritguru.com/wp-content/uploads/a.jpg";

      const imgTag = `<img src="${url}" alt="x">`;
      assert.deepEqual(findImageRefs(imgTag), [{ kind: "wp", match: url, downloadUrl: url }]);

      const styleAttr = `<div style="background: url(${url}) no-repeat;"></div>`;
      assert.deepEqual(findImageRefs(styleAttr), [{ kind: "wp", match: url, downloadUrl: url }]);

      const spaceAndBracket = `<p>${url} and ${url}<br></p>`;
      const refs = findImageRefs(spaceAndBracket);
      assert.equal(refs.length, 2);
      assert.equal(refs[0].match, url);
      assert.equal(refs[1].match, url);
    });

    test("HTML-encoded quotes (&quot;, &#34;, &#39;, &apos;, &gt;, &lt;) stop token and are preserved by replaceRefs", () => {
      const url = "https://digitalsanskritguru.com/wp-content/uploads/2022/08/a.jpg";
      const newUrl = "https://cdn.digitalsanskritguru.com/dsg/staging/migrated/new.jpg";
      const encodedHtml = `<img src=&quot;${url}&quot;>`;

      const refs = findImageRefs(encodedHtml);
      assert.deepEqual(refs, [{ kind: "wp", match: url, downloadUrl: url }]);

      const replaced = replaceRefs(encodedHtml, { [url]: newUrl });
      assert.equal(replaced, `<img src=&quot;${newUrl}&quot;>`);
    });

    test("strips trailing punctuation (. , ; : ! ?) and splits comma-joined URLs while preserving punctuation in replaceRefs", () => {
      const urlA = "https://digitalsanskritguru.com/wp-content/uploads/2022/08/a.jpg";
      const urlB = "https://digitalsanskritguru.com/wp-content/uploads/2022/08/b.png";
      const newA = "https://cdn.digitalsanskritguru.com/dsg/staging/migrated/a.jpg";
      const newB = "https://cdn.digitalsanskritguru.com/dsg/staging/migrated/b.png";

      const sentence = `See ${urlA}.`;
      const sentenceRefs = findImageRefs(sentence);
      assert.deepEqual(sentenceRefs, [{ kind: "wp", match: urlA, downloadUrl: urlA }]);
      assert.equal(replaceRefs(sentence, { [urlA]: newA }), `See ${newA}.`);

      const commaJoined = `${urlA},${urlB}`;
      const commaRefs = findImageRefs(commaJoined);
      assert.deepEqual(commaRefs, [
        { kind: "wp", match: urlA, downloadUrl: urlA },
        { kind: "wp", match: urlB, downloadUrl: urlB }
      ]);
      assert.equal(
        replaceRefs(commaJoined, { [urlA]: newA, [urlB]: newB }),
        `${newA},${newB}`
      );
    });
  });

  // 5. walkDocument
  describe("5. walkDocument", () => {
    test("yields dotted paths for nested objects/arrays, skips $ and . keys, and ignores Buffer, Date, ObjectId, and plain text", () => {
      const wp1 = "https://digitalsanskritguru.com/wp-content/uploads/2022/08/p1.jpg";
      const wp2 = "https://digitalsanskritguru.com/wp-content/uploads/2022/08/p2.png";
      const wp3 = "https://digitalsanskritguru.com/wp-content/uploads/2022/08/p3.webp";

      const doc = {
        _id: new mongoose.Types.ObjectId(),
        name: "Plain string with no image refs",
        createdAt: new Date(),
        binaryData: Buffer.from(wp1, "utf8"),
        images: ["no-ref", "also-no-ref", wp1],
        heroBanners: [
          {
            title: "Hero 1",
            mobileImage: wp2
          }
        ],
        items: [
          { name: "Item 0", image: "plain-text" },
          { name: "Item 1", image: wp3 }
        ],
        $where: wp1,
        "bad.key": wp2,
        nested: {
          "$set": wp1,
          "a.b": wp2
        }
      };

      const walked = Array.from(walkDocument(doc));
      assert.deepEqual(walked, [
        { path: "images.2", value: wp1 },
        { path: "heroBanners.0.mobileImage", value: wp2 },
        { path: "items.1.image", value: wp3 }
      ]);
    });
  });

  // 6. contentHashKey
  describe("6. contentHashKey", () => {
    test("same bytes give same key, different bytes give different keys, format is <prefix>/migrated/<32 hex chars>.<ext>", () => {
      const k1 = contentHashKey({ prefix: "dsg/staging", bytes: VALID_PNG_BYTES, ext: "png" });
      const k2 = contentHashKey({ prefix: "/dsg/staging/", bytes: Buffer.from(VALID_PNG_BYTES), ext: ".PNG" });
      const k3 = contentHashKey({ prefix: "dsg/staging", bytes: VALID_JPEG_BYTES, ext: "jpg" });

      assert.equal(k1, k2);
      assert.notEqual(k1, k3);
      assert.match(k1, /^dsg\/staging\/migrated\/[0-9a-f]{32}\.png$/);
      assert.match(k3, /^dsg\/staging\/migrated\/[0-9a-f]{32}\.jpg$/);
    });
  });

  // 7. sniffImageType
  describe("7. sniffImageType", () => {
    test("detects jpeg, png, gif (87a and 89a), webp and returns null for PDF and HTML", () => {
      assert.deepEqual(sniffImageType(VALID_JPEG_BYTES), { mime: "image/jpeg", ext: "jpg" });
      assert.deepEqual(sniffImageType(VALID_PNG_BYTES), { mime: "image/png", ext: "png" });
      assert.deepEqual(sniffImageType(VALID_GIF87A_BYTES), { mime: "image/gif", ext: "gif" });
      assert.deepEqual(sniffImageType(VALID_GIF89A_BYTES), { mime: "image/gif", ext: "gif" });
      assert.deepEqual(sniffImageType(VALID_WEBP_BYTES), { mime: "image/webp", ext: "webp" });

      const pdfBytes = Buffer.from("%PDF-1.7\n1 0 obj\n", "utf8");
      const htmlBytes = Buffer.from("<!DOCTYPE html><html><body>Error</body></html>", "utf8");
      assert.equal(sniffImageType(pdfBytes), null);
      assert.equal(sniffImageType(htmlBytes), null);
      assert.equal(sniffImageType(Buffer.from([0x00, 0x01])), null);
    });
  });

  // 8. Safety checks
  describe("8. Safety checks", () => {
    const baseApplyEnv = {
      MONGO_URI: "mongodb+srv://dbAdmin:SuperSecretPass99@cluster0.example.mongodb.net/dsg_staging?retryWrites=true",
      AWS_REGION: "ap-south-1",
      AWS_ACCESS_KEY_ID: "AKIAFAKEKEY",
      AWS_SECRET_ACCESS_KEY: "FAKESECRETKEY",
      S3_BUCKET: "dsg-media-bucket",
      S3_PREFIX: "dsg/staging",
      MEDIA_CDN_URL: "https://cdn.digitalsanskritguru.com"
    };

    test("S3_PREFIX mismatch for the env aborts", () => {
      assert.throws(
        () =>
          validateSafetyChecks({
            args: { env: "staging", apply: true, backupDone: true, confirmDb: "dsg_staging" },
            env: { ...baseApplyEnv, S3_PREFIX: "dsg/production" }
          }),
        /S3_PREFIX mismatch/
      );

      assert.throws(
        () =>
          validateSafetyChecks({
            args: { env: "production", apply: true, backupDone: true, confirmDb: "dsg_staging" },
            env: { ...baseApplyEnv, S3_PREFIX: "dsg/staging" }
          }),
        /S3_PREFIX mismatch/
      );
    });

    test("--apply without --backup-done aborts", () => {
      assert.throws(
        () =>
          validateSafetyChecks({
            args: { env: "staging", apply: true, backupDone: false, confirmDb: "dsg_staging" },
            env: baseApplyEnv
          }),
        /--backup-done/
      );
    });

    test("--apply with a wrong --confirm-db aborts", () => {
      assert.throws(
        () =>
          validateSafetyChecks({
            args: { env: "staging", apply: true, backupDone: true, confirmDb: "wrong_db" },
            env: baseApplyEnv
          }),
        /--confirm-db mismatch/
      );
    });

    test("dry-run needs only MONGO_URI", () => {
      const res = validateSafetyChecks({
        args: { env: "staging", apply: false },
        env: {
          MONGO_URI: "mongodb://user:secretPass123@db.internal:27017/dsg_staging"
        }
      });
      assert.equal(res.args.apply, false);
      assert.equal(res.args.env, "staging");
    });

    test("masked connection description never contains the password or the full URI", () => {
      const uri = "mongodb+srv://adminUser:MyTopSecretPassword!@cluster0.abc.mongodb.net/dsg_prod?authSource=admin";
      const masked = formatMaskedConnection(uri);
      assert.ok(masked.includes("cluster0.abc.mongodb.net"));
      assert.ok(masked.includes("dsg_prod"));
      assert.equal(masked.includes("MyTopSecretPassword"), false);
      assert.equal(masked.includes("adminUser"), false);
      assert.equal(masked.includes("mongodb+srv://"), false);
      assert.equal(masked.includes(uri), false);
    });
  });

  // 9. Apply & Dry-Run logic with fakes
  describe("9. Apply and Dry-run execution with fakes", () => {
    const fakeEnv = {
      MONGO_URI: "mongodb://admin:pass@db.local:27017/dsg_staging",
      AWS_REGION: "ap-south-1",
      AWS_ACCESS_KEY_ID: "AKIAFAKE",
      AWS_SECRET_ACCESS_KEY: "SECRETFAKE",
      S3_BUCKET: "dsg-bucket",
      S3_PREFIX: "dsg/staging",
      MEDIA_CDN_URL: "https://cdn.digitalsanskritguru.com/"
    };

    function createFakeCollection(docs, { matchedCount = 1 } = {}) {
      const updates = [];
      let toArrayCalled = false;
      return {
        updates,
        get toArrayCalled() {
          return toArrayCalled;
        },
        find() {
          return {
            async *[Symbol.asyncIterator]() {
              for (const doc of docs) {
                yield doc;
              }
            },
            async toArray() {
              toArrayCalled = true;
              return docs;
            }
          };
        },
        async updateOne(filter, update) {
          updates.push({ filter, update });
          return { acknowledged: true, matchedCount, modifiedCount: matchedCount };
        }
      };
    }

    test("dry-run makes no fetch, no S3 call, and no updateOne, and records unrecognised refs", async () => {
      const b64Png = `data:image/png;base64,${VALID_PNG_BYTES.toString("base64")}`;
      const wpUrl = "https://digitalsanskritguru.com/wp-content/uploads/2022/08/a.jpg";
      const unrecUrl = "https://digitalsanskritguru.com/wp-content/uploads/2022/08/no-ext";

      const prodCol = createFakeCollection([
        { _id: "prod1", image: b64Png, images: [wpUrl, unrecUrl] }
      ]);

      let fetchCalls = 0;
      let s3Calls = 0;

      const { report } = await runMigration({
        args: { env: "staging", apply: false, only: ["products"] },
        env: { MONGO_URI: fakeEnv.MONGO_URI, MEDIA_CDN_URL: fakeEnv.MEDIA_CDN_URL },
        collections: [{ name: "products", collection: prodCol }],
        fetchFn: async () => {
          fetchCalls += 1;
          throw new Error("Should not fetch in dry-run");
        },
        s3Send: async () => {
          s3Calls += 1;
          throw new Error("Should not call S3 in dry-run");
        },
        logger: { log() {} }
      });

      assert.equal(fetchCalls, 0);
      assert.equal(s3Calls, 0);
      assert.equal(prodCol.updates.length, 0);
      assert.equal(prodCol.toArrayCalled, false);
      assert.equal(report.collections.products.base64Count, 1);
      assert.equal(report.collections.products.wpCount, 1);
      assert.deepEqual(report.unrecognised, [
        {
          collection: "products",
          id: "prod1",
          path: "images.1",
          value: unrecUrl
        }
      ]);
    });

    test("apply mode: updates dotted paths with original values in filter, skips doc where all refs fail, partially updates multi-ref string, deduplicates S3 uploads, records sha256 in manifest, and fails on 404/non-image/>10MB", async () => {
      const b64Png = `data:image/png;base64,${VALID_PNG_BYTES.toString("base64")}`;
      const wpGoodJpg = "https://digitalsanskritguru.com/wp-content/uploads/2022/08/good.jpg";
      const wpSamePng = "https://digitalsanskritguru.com/wp-content/uploads/2022/08/same-as-b64.png";
      const wp404 = "https://digitalsanskritguru.com/wp-content/uploads/2022/08/missing.jpg";
      const wpHtmlBody = "https://digitalsanskritguru.com/wp-content/uploads/2022/08/not-an-image.jpg";
      const wpTooBig = "https://digitalsanskritguru.com/wp-content/uploads/2022/08/huge.jpg";

      const doc1DescOriginal = `<p><img src="${wpGoodJpg}"> and <img src="${wp404}"></p>`;
      // Doc 1: base64 in image, and description has 2 refs (1 good, 1 404)
      const doc1 = {
        _id: "doc-1",
        image: b64Png,
        description: doc1DescOriginal
      };

      // Doc 2: identical PNG bytes fetched from WP (should deduplicate S3 upload) + order items array
      const doc2 = {
        _id: "doc-2",
        items: [
          { name: "Book", image: wpSamePng }
        ]
      };

      // Doc 3: all refs fail (404, non-image HTML body, and >10MB file) -> should get NO updateOne
      const doc3 = {
        _id: "doc-3",
        image: wp404,
        images: [wpHtmlBody, wpTooBig]
      };

      const prodCol = createFakeCollection([doc1, doc3]);
      const orderCol = createFakeCollection([doc2]);

      const s3Commands = [];
      const fakeS3Send = async (cmd) => {
        s3Commands.push(cmd.input);
        return {};
      };

      const fakeFetch = async (url) => {
        if (url === wpGoodJpg) {
          return {
            ok: true,
            status: 200,
            headers: new Map(),
            async arrayBuffer() {
              return VALID_JPEG_BYTES.buffer.slice(
                VALID_JPEG_BYTES.byteOffset,
                VALID_JPEG_BYTES.byteOffset + VALID_JPEG_BYTES.byteLength
              );
            }
          };
        }
        if (url === wpSamePng) {
          return {
            ok: true,
            status: 200,
            headers: new Map(),
            async arrayBuffer() {
              return VALID_PNG_BYTES.buffer.slice(
                VALID_PNG_BYTES.byteOffset,
                VALID_PNG_BYTES.byteOffset + VALID_PNG_BYTES.byteLength
              );
            }
          };
        }
        if (url === wp404) {
          return {
            ok: false,
            status: 404,
            headers: new Map(),
            async arrayBuffer() {
              return new ArrayBuffer(0);
            }
          };
        }
        if (url === wpHtmlBody) {
          const htmlBuf = Buffer.from("<html><body>Not an image</body></html>", "utf8");
          return {
            ok: true,
            status: 200,
            headers: new Map(),
            async arrayBuffer() {
              return htmlBuf.buffer.slice(htmlBuf.byteOffset, htmlBuf.byteOffset + htmlBuf.byteLength);
            }
          };
        }
        if (url === wpTooBig) {
          const bigBuf = Buffer.alloc(10 * 1024 * 1024 + 10, 0xff);
          return {
            ok: true,
            status: 200,
            headers: new Map([["content-length", String(bigBuf.length)]]),
            async arrayBuffer() {
              return bigBuf.buffer.slice(bigBuf.byteOffset, bigBuf.byteOffset + bigBuf.byteLength);
            }
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      };

      const { report } = await runMigration({
        args: {
          env: "staging",
          apply: true,
          backupDone: true,
          confirmDb: "dsg_staging",
          concurrency: 2
        },
        env: fakeEnv,
        collections: [
          { name: "products", collection: prodCol },
          { name: "orders", collection: orderCol }
        ],
        s3Send: fakeS3Send,
        fetchFn: fakeFetch,
        logger: { log() {} }
      });

      const expectedPngKey = contentHashKey({ prefix: "dsg/staging", bytes: VALID_PNG_BYTES, ext: "png" });
      const expectedJpgKey = contentHashKey({ prefix: "dsg/staging", bytes: VALID_JPEG_BYTES, ext: "jpg" });
      const expectedPngCdn = `https://cdn.digitalsanskritguru.com/${expectedPngKey}`;
      const expectedJpgCdn = `https://cdn.digitalsanskritguru.com/${expectedJpgKey}`;

      // 1. One updateOne per changed document with original field values in filter
      assert.equal(prodCol.updates.length, 1);
      assert.deepEqual(prodCol.updates[0].filter, {
        _id: "doc-1",
        image: b64Png,
        description: doc1DescOriginal
      });
      assert.deepEqual(prodCol.updates[0].update, {
        $set: {
          image: expectedPngCdn,
          description: `<p><img src="${expectedJpgCdn}"> and <img src="${wp404}"></p>`
        }
      });

      assert.equal(orderCol.updates.length, 1);
      assert.deepEqual(orderCol.updates[0].filter, {
        _id: "doc-2",
        "items.0.image": wpSamePng
      });
      assert.deepEqual(orderCol.updates[0].update, {
        $set: {
          "items.0.image": expectedPngCdn
        }
      });

      // 2. Identical PNG bytes across doc1 (base64) and doc2 (WP download) uploaded only ONCE;
      //    total distinct S3 objects uploaded = 2 (one PNG, one JPEG)
      assert.equal(s3Commands.length, 2);
      assert.equal(report.distinctS3ObjectsUploaded, 2);
      assert.equal(report.documentsChanged, 2);
      assert.equal(report.refsMigrated, 3);

      for (const cmdInput of s3Commands) {
        assert.equal(cmdInput.Bucket, "dsg-bucket");
        assert.equal(cmdInput.CacheControl, CACHE_CONTROL_HEADER);
      }

      // 3. Manifest records "data:sha256:<hash>" for base64 and never the base64 text
      assert.equal(report.manifest.length, 3);
      const base64ManifestEntry = report.manifest.find((m) => m.kind === "data");
      assert.ok(base64ManifestEntry);
      assert.match(base64ManifestEntry.sourceRef, /^data:sha256:[0-9a-f]{64}$/);
      assert.equal(JSON.stringify(report.manifest).includes(VALID_PNG_BYTES.toString("base64")), false);

      // 4. Failures recorded for doc1's 404 ref and doc3's 3 failing refs (404, non-image HTML, >10MB)
      assert.equal(report.failures.length, 4);
      const failureReasons = report.failures.map((f) => f.reason).join(" | ");
      assert.match(failureReasons, /404/);
      assert.match(failureReasons, /Magic byte/i);
      assert.match(failureReasons, /10 MB/i);
    });

    test("when updateOne returns matchedCount: 0, document is not counted, manifest is empty, and failures records 'changed since scan, skipped'", async () => {
      const wpUrl = "https://digitalsanskritguru.com/wp-content/uploads/2022/08/a.jpg";
      const doc = { _id: "race-doc", image: wpUrl };
      const prodCol = createFakeCollection([doc], { matchedCount: 0 });

      const { report } = await runMigration({
        args: {
          env: "staging",
          apply: true,
          backupDone: true,
          confirmDb: "dsg_staging"
        },
        env: fakeEnv,
        collections: [{ name: "products", collection: prodCol }],
        s3Send: async () => ({}),
        fetchFn: async () => ({
          ok: true,
          status: 200,
          headers: new Map(),
          async arrayBuffer() {
            return VALID_JPEG_BYTES.buffer.slice(
              VALID_JPEG_BYTES.byteOffset,
              VALID_JPEG_BYTES.byteOffset + VALID_JPEG_BYTES.byteLength
            );
          }
        }),
        logger: { log() {} }
      });

      assert.equal(prodCol.updates.length, 1);
      assert.deepEqual(prodCol.updates[0].filter, {
        _id: "race-doc",
        image: wpUrl
      });
      assert.equal(report.documentsChanged, 0);
      assert.equal(report.refsMigrated, 0);
      assert.deepEqual(report.manifest, []);
      assert.deepEqual(report.failures, [
        {
          collection: "products",
          id: "race-doc",
          path: "image",
          reason: "changed since scan, skipped"
        }
      ]);
    });

    test("streaming response over 10 MB in 1 MB chunks fails with 10 MB message, aborts signal, and stops reading early", async () => {
      const wpStreamUrl = "https://digitalsanskritguru.com/wp-content/uploads/2022/08/stream-11mb.jpg";
      const doc = { _id: "stream-doc", image: wpStreamUrl };
      const prodCol = createFakeCollection([doc]);

      // 11 chunks of 1.1 MB (or 11 chunks of 1 MB + extra chunks) - let's test 11 chunks where each chunk is 1.1 MB so it stops before chunk 11,
      // AND also verify that even with 1 MB chunks it aborts immediately on exceeding 10 MB without finishing the stream.
      let chunksRead = 0;
      let streamFinishedNaturally = false;
      let capturedSignal = null;
      const chunkSize = 1024 * 1024; // 1 MB
      const totalChunks = 11;

      const fakeStreamFetch = async (_url, options = {}) => {
        capturedSignal = options.signal;
        return {
          ok: true,
          status: 200,
          headers: new Map(),
          body: {
            async *[Symbol.asyncIterator]() {
              for (let i = 0; i < totalChunks; i++) {
                // Make chunk 0 have 1 MB + 1 byte so 10 chunks exceed 10 MB (stops at 10 of 11 chunks),
                // or each chunk 1 MB (stops inside 11th iteration before generator finishes)
                chunksRead += 1;
                yield Buffer.alloc(i === 0 ? chunkSize + 1 : chunkSize, 0xff);
              }
              streamFinishedNaturally = true;
            }
          }
        };
      };

      const { report } = await runMigration({
        args: {
          env: "staging",
          apply: true,
          backupDone: true,
          confirmDb: "dsg_staging"
        },
        env: fakeEnv,
        collections: [{ name: "products", collection: prodCol }],
        s3Send: async () => ({}),
        fetchFn: fakeStreamFetch,
        logger: { log() {} }
      });

      assert.ok(capturedSignal && capturedSignal.aborted, "AbortController signal should be aborted");
      assert.equal(streamFinishedNaturally, false, "Stream should be aborted before completion");
      assert.ok(chunksRead < totalChunks, `Expected early stop before all ${totalChunks} chunks, read ${chunksRead}`);
      assert.equal(prodCol.updates.length, 0);
      assert.equal(report.failures.length, 1);
      assert.match(report.failures[0].reason, /10 MB/i);
    });
  });
});
