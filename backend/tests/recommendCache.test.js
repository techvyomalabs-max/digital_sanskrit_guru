const { describe, it, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Product = require("../models/Product");
const { appCache } = require("../utils/cache");
const productRoutes = require("../routes/productRoutes");

const layer = productRoutes.stack.find((l) => l.route?.path === "/recommend/:productId" && l.route.methods.get);
const handler = layer.route.stack[layer.route.stack.length - 1].handle;

function res() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    }
  };
}

describe("GET /api/products/recommend/:productId cache", () => {
  afterEach(() => mock.restoreAll());

  it("made-up ids get an empty list and never a cache entry", async () => {
    const before = appCache.keys().filter((k) => k.startsWith("recommend:")).length;
    const find = mock.method(Product, "findById", () => ({ select: async () => null }));

    const r1 = res();
    await handler({ params: { productId: "not-an-id-<script>" } }, r1);
    assert.deepEqual(r1.body, []);
    assert.equal(find.mock.callCount(), 0, "invalid ids don't reach the database");

    const r2 = res();
    await handler({ params: { productId: new mongoose.Types.ObjectId().toString() } }, r2);
    assert.deepEqual(r2.body, []);

    const after = appCache.keys().filter((k) => k.startsWith("recommend:")).length;
    assert.equal(after, before);
  });
});
