const { describe, it, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Product = require("../models/Product");
const StoreSettings = require("../models/StoreSettings");
const orderRoutes = require("../routes/orderRoutes");

// Extract the handler from router stack
const estimateRoute = orderRoutes.stack.find((s) => s.route && s.route.path === "/delivery-estimate");
const estimateHandler = estimateRoute.route.stack[estimateRoute.route.stack.length - 1].handle;

describe("POST /api/orders/delivery-estimate endpoint", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  const defaultSettings = {
    deliveryCharge: 50,
    warehouseLocation: {
      latitude: 12.9716,
      longitude: 77.5946,
      state: "Karnataka",
      pincode: "560001"
    },
    distancePricing: {
      enabled: false
    },
    internationalDelivery: {
      enabled: true,
      domesticCountry: "India",
      defaultFee: 600,
      countryRates: [{ country: "United States", fee: 900 }]
    }
  };

  it("(c) a guest calling /delivery-estimate gets accurate delivery pricing", async () => {
    const validId = "507f1f77bcf86cd799439011";
    mock.method(StoreSettings, "findOne", () => ({
      lean: async () => defaultSettings
    }));

    mock.method(Product, "find", () => ({
      populate: () => ({
        lean: async () => [
          {
            _id: validId,
            name: "Three Books Combo",
            productType: "bundle",
            price: 999,
            weight: 0,
            bundleItems: [
              { quantity: 1, product: { _id: "507f1f77bcf86cd799439001", name: "B1", weight: 450, isDigital: false } },
              { quantity: 1, product: { _id: "507f1f77bcf86cd799439002", name: "B2", weight: 450, isDigital: false } },
              { quantity: 1, product: { _id: "507f1f77bcf86cd799439003", name: "B3", weight: 350, isDigital: false } }
            ]
          }
        ]
      })
    }));

    let jsonResponse = null;
    let statusCode = 200;
    const req = {
      body: {
        items: [{ product: validId, quantity: 1 }],
        shipping: { country: "India", state: "Maharashtra", pincode: "400001" }
      }
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonResponse = data;
        return this;
      }
    };

    await estimateHandler(req, res);

    assert.equal(statusCode, 200);
    assert.ok(jsonResponse);
    assert.equal(jsonResponse.deliveryCharge, 167.56);
    assert.equal(jsonResponse.pricingMode, "indiapost");
    assert.equal(jsonResponse.isDigitalOnly, false);
    assert.equal(typeof jsonResponse.distanceKm, "number");
  });

  it("(d) a digital-only cart -> deliveryCharge 0, pricingMode digital, isDigitalOnly true", async () => {
    const digitalId = "507f1f77bcf86cd799439012";
    mock.method(StoreSettings, "findOne", () => ({
      lean: async () => defaultSettings
    }));

    mock.method(Product, "find", () => ({
      populate: () => ({
        lean: async () => [
          {
            _id: digitalId,
            name: "Sanskrit Grammar Web Version",
            price: 499,
            isDigital: true,
            format: "Web Version"
          }
        ]
      })
    }));

    let jsonResponse = null;
    const req = {
      body: {
        items: [{ id: digitalId, quantity: 1 }],
        shipping: { country: "India" }
      }
    };
    const res = {
      json(data) {
        jsonResponse = data;
        return this;
      }
    };

    await estimateHandler(req, res);

    assert.deepEqual(jsonResponse, {
      deliveryCharge: 0,
      pricingMode: "digital",
      distanceKm: null,
      isDigitalOnly: true
    });
  });

  it("(e) the endpoint never exposes product fields, links or settings", async () => {
    const validId = "507f1f77bcf86cd799439013";
    mock.method(StoreSettings, "findOne", () => ({
      lean: async () => ({
        ...defaultSettings,
        secretAdminNote: "Top secret",
        dbCredentials: "password"
      })
    }));

    mock.method(Product, "find", () => ({
      populate: () => ({
        lean: async () => [
          {
            _id: validId,
            name: "Secret Manuscript",
            webReaderLink: "https://secret.cdn/reader",
            kindleLink: "https://amazon.com/kindle",
            stock: 42,
            costPrice: 50,
            price: 500,
            weight: 300
          }
        ]
      })
    }));

    let jsonResponse = null;
    const req = {
      body: {
        items: [{ _id: validId, quantity: 1 }],
        shipping: { country: "India", pincode: "560001" }
      }
    };
    const res = {
      json(data) {
        jsonResponse = data;
        return this;
      }
    };

    await estimateHandler(req, res);

    const keys = Object.keys(jsonResponse).sort();
    assert.deepEqual(keys, ["deliveryCharge", "distanceKm", "isDigitalOnly", "pricingMode"]);
    assert.equal(jsonResponse.name, undefined);
    assert.equal(jsonResponse.price, undefined);
    assert.equal(jsonResponse.webReaderLink, undefined);
    assert.equal(jsonResponse.kindleLink, undefined);
    assert.equal(jsonResponse.secretAdminNote, undefined);
  });

  it("caps at 50 items and ignores invalid ids", async () => {
    mock.method(StoreSettings, "findOne", () => ({
      lean: async () => defaultSettings
    }));

    let queriedIds = [];
    mock.method(Product, "find", (query) => {
      queriedIds = query._id.$in;
      return {
        populate: () => ({
          lean: async () => []
        })
      };
    });

    const items = [];
    // 60 valid items
    for (let i = 0; i < 60; i++) {
      items.push({
        product: new mongoose.Types.ObjectId().toString(),
        quantity: 1
      });
    }
    // and some invalid IDs
    items.unshift({ product: "invalid_id_not_an_object_id", quantity: 1 });
    items.push({ product: null, quantity: 1 });

    let jsonResponse = null;
    const req = {
      body: {
        items,
        shipping: { country: "India" }
      }
    };
    const res = {
      json(data) {
        jsonResponse = data;
        return this;
      }
    };

    await estimateHandler(req, res);

    // Queried IDs must be at most 50 and must NOT include "invalid_id_not_an_object_id"
    assert.ok(queriedIds.length <= 50);
    assert.ok(!queriedIds.includes("invalid_id_not_an_object_id"));
    // Since mock returned empty products, responds with deliveryCharge: null
    assert.deepEqual(jsonResponse, { deliveryCharge: null });
  });

  it("responds 200 with { deliveryCharge: null } on any error or missing items", async () => {
    let jsonResponse = null;
    let statusCode = 200;
    const req = {
      body: {}
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonResponse = data;
        return this;
      }
    };

    await estimateHandler(req, res);
    assert.equal(statusCode, 200);
    assert.deepEqual(jsonResponse, { deliveryCharge: null });

    // When StoreSettings throws
    mock.method(StoreSettings, "findOne", () => {
      throw new Error("DB connection timeout");
    });
    const req2 = {
      body: {
        items: [{ product: new mongoose.Types.ObjectId().toString(), quantity: 1 }]
      }
    };
    await estimateHandler(req2, res);
    assert.equal(statusCode, 200);
    assert.deepEqual(jsonResponse, { deliveryCharge: null });
  });
});
