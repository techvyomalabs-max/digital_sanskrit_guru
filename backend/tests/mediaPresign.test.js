"use strict";

const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  getMediaConfig,
  ALLOWED_KINDS,
  ALLOWED_TYPES,
  MAX_BYTES,
  buildObjectKey,
  createPresignedUpload
} = require("../utils/mediaPresign");

const mediaRoutes = require("../routes/mediaRoutes");
const admin = require("../middleware/adminMiddleware");
const { requireAdminPage, requireAnyAdminPage } = require("../middleware/adminMiddleware");
const User = require("../models/User");

describe("Amazon S3 Media Presign", () => {
  const ENV_VARS = [
    "AWS_REGION",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "S3_BUCKET",
    "S3_PREFIX",
    "MEDIA_CDN_URL"
  ];

  let originalEnv = {};

  beforeEach(() => {
    originalEnv = {};
    for (const k of ENV_VARS) {
      originalEnv[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ENV_VARS) {
      if (originalEnv[k] !== undefined) {
        process.env[k] = originalEnv[k];
      } else {
        delete process.env[k];
      }
    }
  });

  function setFakeEnv() {
    process.env.AWS_REGION = "ap-south-1";
    process.env.AWS_ACCESS_KEY_ID = "fake-access-key-id";
    process.env.AWS_SECRET_ACCESS_KEY = "fake-secret-access-key";
    process.env.S3_BUCKET = "test-media-bucket";
    process.env.S3_PREFIX = "/media/uploads/";
    process.env.MEDIA_CDN_URL = "https://cdn.example.com/";
  }

  function createMockRes() {
    return {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        return this;
      }
    };
  }

  // (a) getMediaConfig reports configured false when any one variable is missing,
  // true when all are set, and strips slashes.
  describe("(a) getMediaConfig", () => {
    test("reports configured true when all six are set and strips slashes", () => {
      setFakeEnv();
      const config = getMediaConfig();
      assert.equal(config.configured, true);
      assert.equal(config.region, "ap-south-1");
      assert.equal(config.bucket, "test-media-bucket");
      // Slashes stripped from both ends of S3_PREFIX
      assert.equal(config.prefix, "media/uploads");
      // Trailing slash stripped from MEDIA_CDN_URL
      assert.equal(config.mediaCdnUrl, "https://cdn.example.com");

      // Verify removed duplicate alias keys and credential keys
      assert.equal(config.AWS_REGION, undefined);
      assert.equal(config.AWS_ACCESS_KEY_ID, undefined);
      assert.equal(config.AWS_SECRET_ACCESS_KEY, undefined);
      assert.equal(config.S3_BUCKET, undefined);
      assert.equal(config.S3_PREFIX, undefined);
      assert.equal(config.MEDIA_CDN_URL, undefined);
      assert.equal(config.cdnUrl, undefined);
      assert.equal(config.accessKeyId, undefined);
      assert.equal(config.secretAccessKey, undefined);
    });

    test("reports configured false when any one variable is missing", () => {
      setFakeEnv();
      for (const varName of ENV_VARS) {
        const temp = process.env[varName];
        delete process.env[varName];
        const configMissing = getMediaConfig();
        assert.equal(
          configMissing.configured,
          false,
          `Expected configured to be false when ${varName} is missing`
        );
        process.env[varName] = temp;
      }
    });

    test("reports configured false when all are empty", () => {
      const config = getMediaConfig();
      assert.equal(config.configured, false);
    });
  });

  // (b) buildObjectKey gives prefix/kind/uuid.ext, two calls differ,
  // and the name never contains the client content type string.
  describe("(b) buildObjectKey", () => {
    test("gives prefix/kind/uuid.ext, two calls differ, and never contains client content type string", () => {
      const prefix = "my-media";
      const kind = "product";
      const contentType = "image/png";

      const key1 = buildObjectKey({ prefix, kind, contentType });
      const key2 = buildObjectKey({ prefix, kind, contentType });

      // Pattern: prefix/kind/uuid.png
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const parts1 = key1.split("/");
      assert.equal(parts1.length, 3);
      assert.equal(parts1[0], "my-media");
      assert.equal(parts1[1], "product");

      const [uuidPart1, ext1] = parts1[2].split(".");
      assert.ok(uuidRegex.test(uuidPart1), `UUID part should match UUID regex, got: ${uuidPart1}`);
      assert.equal(ext1, "png");

      // Two calls differ
      assert.notEqual(key1, key2);

      // Never contains the client content type string ("image/png" or "image")
      assert.equal(key1.includes("image/png"), false);
      assert.equal(key1.includes("image"), false);
      assert.equal(key2.includes("image/png"), false);
      assert.equal(key2.includes("image"), false);
    });

    test("correctly maps extensions for all allowed types", () => {
      for (const [mime, expectedExt] of Object.entries(ALLOWED_TYPES)) {
        const key = buildObjectKey({ prefix: "uploads", kind: "banner", contentType: mime });
        assert.ok(key.endsWith(`.${expectedExt}`));
      }
    });
  });

  // (c) createPresignedUpload with fake credentials returns a url, fields containing
  // the key and Policy, and a publicUrl under MEDIA_CDN_URL; decode the base64 policy
  // and assert it contains content-length-range with max 2097152 and the exact Content-Type condition.
  describe("(c) createPresignedUpload with fake credentials", () => {
    test("returns url, fields with key and Policy (no lowercase policy), publicUrl, and verified conditions", async () => {
      setFakeEnv();
      const upload = await createPresignedUpload({
        kind: "product",
        contentType: "image/jpeg"
      });

      assert.ok(typeof upload.url === "string" && upload.url.length > 0);
      assert.ok(upload.fields && typeof upload.fields === "object");
      assert.equal(upload.fields.key, upload.key);
      assert.ok(upload.key.startsWith("media/uploads/product/"));
      assert.ok(upload.key.endsWith(".jpg"));

      // publicUrl under MEDIA_CDN_URL
      assert.equal(upload.publicUrl, `https://cdn.example.com/${upload.key}`);

      // Policy decode and verify: read fields.Policy only; no lowercase policy key
      assert.ok(upload.fields.Policy, "Presigned fields must contain Policy");
      assert.equal(upload.fields.policy, undefined, "Presigned fields must NOT contain lowercase policy");
      assert.equal("policy" in upload.fields, false, "Fields should not have lowercase policy key");

      const decodedPolicy = JSON.parse(Buffer.from(upload.fields.Policy, "base64").toString("utf-8"));
      assert.ok(Array.isArray(decodedPolicy.conditions), "Policy must contain conditions array");

      // Verify content-length-range with max 2097152 (MAX_BYTES)
      const rangeCondition = decodedPolicy.conditions.find(
        (c) => Array.isArray(c) && c[0] === "content-length-range"
      );
      assert.ok(rangeCondition, "Policy must include content-length-range condition");
      assert.equal(rangeCondition[1], 1);
      assert.equal(rangeCondition[2], 2097152);
      assert.equal(rangeCondition[2], MAX_BYTES);

      // Verify exact Content-Type condition
      const typeCondition = decodedPolicy.conditions.find(
        (c) => Array.isArray(c) && c[0] === "eq" && c[1] === "$Content-Type"
      );
      assert.ok(typeCondition, "Policy must include exact Content-Type condition");
      assert.equal(typeCondition[2], "image/jpeg");
    });
  });

  // (d) rejects image/gif, application/pdf, and an unknown kind with status 400.
  describe("(d) invalid inputs", () => {
    test("rejects image/gif with status 400", async () => {
      setFakeEnv();
      await assert.rejects(
        async () => {
          await createPresignedUpload({ kind: "product", contentType: "image/gif" });
        },
        (err) => {
          assert.equal(err.status, 400);
          assert.ok(err.message.includes("content type"));
          return true;
        }
      );
    });

    test("rejects application/pdf with status 400", async () => {
      setFakeEnv();
      await assert.rejects(
        async () => {
          await createPresignedUpload({ kind: "product", contentType: "application/pdf" });
        },
        (err) => {
          assert.equal(err.status, 400);
          assert.ok(err.message.includes("content type"));
          return true;
        }
      );
    });

    test("rejects unknown kind with status 400", async () => {
      setFakeEnv();
      await assert.rejects(
        async () => {
          await createPresignedUpload({ kind: "avatar", contentType: "image/png" });
        },
        (err) => {
          assert.equal(err.status, 400);
          assert.ok(err.message.includes("kind"));
          return true;
        }
      );
    });
  });

  // (e) with no env, throws status 503.
  describe("(e) unconfigured storage", () => {
    test("throws status 503 and 'Image storage is not configured yet.'", async () => {
      // Env variables are all cleared by beforeEach
      await assert.rejects(
        async () => {
          await createPresignedUpload({ kind: "product", contentType: "image/png" });
        },
        (err) => {
          assert.equal(err.status, 503);
          assert.equal(err.message, "Image storage is not configured yet.");
          return true;
        }
      );
    });
  });

  // (f) the route handler: a non-admin gets rejected by the middleware pattern you used; 503 passes through as 503.
  describe("(f) route handler & middleware protection", () => {
    test("non-admin is rejected by admin middleware with 403", async () => {
      const origFindById = User.findById;
      try {
        // Mock User.findById returning a non-admin user
        User.findById = () => ({
          select: () => ({
            lean: async () => ({ isAdmin: false, email: "user@test.com" })
          })
        });

        const req = { user: "mock-user-id" };
        const res = createMockRes();
        let nextCalled = false;

        await admin(req, res, () => {
          nextCalled = true;
        });

        assert.equal(nextCalled, false);
        assert.equal(res.statusCode, 403);
        assert.equal(res.body?.message, "Admin access denied");
      } finally {
        User.findById = origFindById;
      }
    });

    describe("requireAnyAdminPage helper", () => {
      const anyMiddleware = requireAnyAdminPage(
        "products",
        "add-products",
        "marketing",
        "theme",
        "settings"
      );

      test("Level 1 passes", () => {
        const req = {
          adminUser: { isAdmin: true },
          adminLevel: 1,
          allowedPages: []
        };
        const res = createMockRes();
        let nextCalled = false;

        anyMiddleware(req, res, () => {
          nextCalled = true;
        });

        assert.equal(nextCalled, true);
        assert.equal(res.statusCode, null);
      });

      test("an admin with only 'theme' passes", () => {
        const req = {
          adminUser: { isAdmin: true },
          adminLevel: 2,
          allowedPages: ["theme"]
        };
        const res = createMockRes();
        let nextCalled = false;

        anyMiddleware(req, res, () => {
          nextCalled = true;
        });

        assert.equal(nextCalled, true);
        assert.equal(res.statusCode, null);
      });

      test("an admin with only 'add-products' passes", () => {
        const req = {
          adminUser: { isAdmin: true },
          adminLevel: 2,
          allowedPages: ["add-products"]
        };
        const res = createMockRes();
        let nextCalled = false;

        anyMiddleware(req, res, () => {
          nextCalled = true;
        });

        assert.equal(nextCalled, true);
        assert.equal(res.statusCode, null);
      });

      test("an admin with only 'orders' gets 403", () => {
        const req = {
          adminUser: { isAdmin: true },
          adminLevel: 2,
          allowedPages: ["orders"]
        };
        const res = createMockRes();
        let nextCalled = false;

        anyMiddleware(req, res, () => {
          nextCalled = true;
        });

        assert.equal(nextCalled, false);
        assert.equal(res.statusCode, 403);
        assert.ok(res.body?.message.includes("Access denied"));
      });
    });

    test("503 passes through as 503 when storage is not configured", async () => {
      // With env cleared
      const req = {
        body: { kind: "product", contentType: "image/png" }
      };
      const res = createMockRes();

      await mediaRoutes.handlePresign(req, res);

      assert.equal(res.statusCode, 503);
      assert.equal(res.body?.message, "Image storage is not configured yet.");
    });

    test("400 passes through as 400 when kind or contentType is invalid", async () => {
      setFakeEnv();
      const req = {
        body: { kind: "invalid-kind", contentType: "image/png" }
      };
      const res = createMockRes();

      await mediaRoutes.handlePresign(req, res);

      assert.equal(res.statusCode, 400);
      assert.ok(res.body?.message.includes("Invalid kind"));
    });

    test("200 is returned with url, fields, key, and publicUrl when valid and configured", async () => {
      setFakeEnv();
      const req = {
        body: { kind: "product", contentType: "image/png" }
      };
      const res = createMockRes();

      await mediaRoutes.handlePresign(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(res.body?.url);
      assert.ok(res.body?.fields);
      assert.ok(res.body?.key);
      assert.ok(res.body?.publicUrl);
      assert.equal(res.body.key, res.body.fields.key);
      assert.equal(res.body.publicUrl, `https://cdn.example.com/${res.body.key}`);
    });
  });
});
