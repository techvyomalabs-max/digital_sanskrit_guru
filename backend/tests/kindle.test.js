const { describe, it, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const Product = require("../models/Product");
const { isKindleProduct } = require("../utils/kindle");
const { computeOrderTotals, OrderTotalsError } = require("../utils/orderTotals");

describe("Kindle product enforcement", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  describe("isKindleProduct helper", () => {
    it("returns true when product has a kindleLink", () => {
      assert.equal(
        isKindleProduct({ kindleLink: "https://www.amazon.in/dp/B0EXAMPLE" }),
        true
      );
    });

    it("returns true when digitalType contains 'kindle' (case-insensitive)", () => {
      assert.equal(
        isKindleProduct({ digitalType: "Kindle Edition" }),
        true
      );
      assert.equal(
        isKindleProduct({ digitalType: "kindle_ebook" }),
        true
      );
    });

    it("returns true when name contains 'kindle' (case-insensitive)", () => {
      assert.equal(
        isKindleProduct({ name: "Bhagavad Gita (Kindle Version)" }),
        true
      );
      assert.equal(
        isKindleProduct({ name: "Sanskrit Grammar KINDLE edition" }),
        true
      );
    });

    it("returns false for a normal web version product", () => {
      assert.equal(
        isKindleProduct({
          name: "Sanskrit Primer",
          isDigital: true,
          digitalType: "Web Version",
          webReaderLink: "https://reader.example.com"
        }),
        false
      );
    });

    it("returns false for a physical book", () => {
      assert.equal(
        isKindleProduct({
          name: "Printed Sanskrit Dictionary",
          isDigital: false,
          stock: 10
        }),
        false
      );
    });

    it("returns false for null, undefined or empty input", () => {
      assert.equal(isKindleProduct(null), false);
      assert.equal(isKindleProduct(undefined), false);
      assert.equal(isKindleProduct({}), false);
    });
  });

  describe("computeOrderTotals Kindle rejection", () => {
    const defaultSettings = {
      gstPercent: 18,
      deliveryCharge: 50,
      warehouseLocation: {
        latitude: 12.9716,
        longitude: 77.5946,
        state: "Karnataka",
        pincode: "560001"
      },
      businessDetails: {
        state: "Karnataka"
      }
    };

    it("rejects an order containing a Kindle product with status 400 and expected message", async () => {
      mock.method(Product, "find", () => ({
        populate: () => ({
          lean: async () => [
            {
              _id: "prod_kindle_1",
              name: "Sanskrit Reader (Kindle Edition)",
              price: 299,
              isDigital: true,
              digitalType: "Kindle",
              kindleLink: "https://www.amazon.in/dp/B0EXAMPLE"
            }
          ]
        })
      }));

      await assert.rejects(
        async () => {
          await computeOrderTotals({
            items: [{ product: "prod_kindle_1", quantity: 1 }],
            shipping: { country: "India", state: "Karnataka" },
            settings: defaultSettings
          });
        },
        (err) => {
          assert.ok(err instanceof OrderTotalsError);
          assert.equal(err.status, 400);
          assert.equal(err.message, "Kindle editions are sold on Amazon.");
          return true;
        }
      );
    });

    it("does not reject a normal digital product", async () => {
      mock.method(Product, "find", () => ({
        populate: () => ({
          lean: async () => [
            {
              _id: "prod_normal_web",
              name: "Sanskrit Web Primer",
              price: 199,
              isDigital: true,
              digitalType: "Web Version"
            }
          ]
        })
      }));

      const totals = await computeOrderTotals({
        items: [{ product: "prod_normal_web", quantity: 1 }],
        shipping: { country: "India", state: "Karnataka" },
        settings: defaultSettings
      });

      assert.equal(totals.normalizedItems.length, 1);
      assert.equal(totals.total, 199);
    });
  });
});
