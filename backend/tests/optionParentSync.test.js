const { describe, it, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const Product = require("../models/Product");
const { syncAllOptionParents } = require("../routes/productRoutes");

const PARENT_ID = "507f1f77bcf86cd799439099";
const ID_A = "507f1f77bcf86cd799439011";
const ID_B = "507f1f77bcf86cd799439012";
const ID_C = "507f1f77bcf86cd799439013";

describe("syncAllOptionParents", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("updates parent with lowest non-deleted price, its international fields, and computed stock", async () => {
    const parentDoc = {
      _id: PARENT_ID,
      hasOptions: true,
      options: [
        { product: ID_A, label: "Book" },
        { product: ID_B, label: "Flipbook" },
        { product: ID_C, label: "Deleted" }
      ]
    };

    const targets = [
      {
        _id: ID_A,
        price: 299,
        internationalPrice: 999,
        internationalCountryPrices: [{ country: "United States", price: 1100 }],
        marketPrices: [{ market: "US", regularPrice: 1100, salePrice: null }],
        isDeleted: false,
        hasOptions: false,
        isDigital: false,
        stock: 5
      },
      {
        _id: ID_B,
        price: 149,
        internationalPrice: 499,
        internationalCountryPrices: [{ country: "Canada", price: 550 }],
        marketPrices: [{ market: "CA", regularPrice: 550, salePrice: 500 }],
        isDeleted: false,
        hasOptions: false,
        isDigital: true,
        stock: 0
      },
      {
        _id: ID_C,
        price: 99,
        internationalPrice: 199,
        internationalCountryPrices: [],
        marketPrices: [],
        isDeleted: true,
        hasOptions: false,
        isDigital: false,
        stock: 10
      }
    ];

    let findCall = 0;
    mock.method(Product, "find", () => {
      findCall += 1;
      const result = findCall === 1 ? [parentDoc] : targets;
      return {
        select: () => ({
          lean: async () => result
        })
      };
    });

    const updateOneMock = mock.method(Product, "updateOne", async () => ({ modifiedCount: 1 }));

    await syncAllOptionParents();

    assert.equal(updateOneMock.mock.callCount(), 1);
    const [filterArg, updateArg] = updateOneMock.mock.calls[0].arguments;
    assert.deepEqual(filterArg, { _id: PARENT_ID });
    assert.deepEqual(updateArg, {
      $set: {
        price: 149,
        internationalPrice: 499,
        internationalCountryPrices: [{ country: "Canada", price: 550 }],
        marketPrices: [{ market: "CA", regularPrice: 550, salePrice: 500 }],
        stock: 6
      }
    });
  });

  it("sets only stock 0 when every option is deleted", async () => {
    const parentDoc = {
      _id: PARENT_ID,
      hasOptions: true,
      options: [{ product: ID_C, label: "Deleted" }]
    };

    const targets = [
      {
        _id: ID_C,
        price: 99,
        internationalPrice: 199,
        internationalCountryPrices: [],
        marketPrices: [],
        isDeleted: true,
        hasOptions: false,
        isDigital: false,
        stock: 10
      }
    ];

    let findCall = 0;
    mock.method(Product, "find", () => {
      findCall += 1;
      const result = findCall === 1 ? [parentDoc] : targets;
      return {
        select: () => ({
          lean: async () => result
        })
      };
    });

    const updateOneMock = mock.method(Product, "updateOne", async () => ({ modifiedCount: 1 }));

    await syncAllOptionParents();

    assert.equal(updateOneMock.mock.callCount(), 1);
    const [filterArg, updateArg] = updateOneMock.mock.calls[0].arguments;
    assert.deepEqual(filterArg, { _id: PARENT_ID });
    assert.deepEqual(updateArg, { $set: { stock: 0 } });
  });

  it("resolves without throwing when Product.find throws", async () => {
    mock.method(Product, "find", () => ({
      select: () => ({
        lean: async () => {
          throw new Error("DB failure");
        }
      })
    }));
    mock.method(console, "error", () => {});

    await assert.doesNotReject(async () => {
      await syncAllOptionParents();
    });
  });
});

