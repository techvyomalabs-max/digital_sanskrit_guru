const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  isDigitalItem,
  resolveDeliveryCharge,
  getDeliveryPricingDetails
} = require("../utils/deliveryPricing");

describe("deliveryPricing utility (pure)", () => {
  describe("isDigitalItem", () => {
    it("identifies items with isDigital: true directly or on product object as digital", () => {
      assert.equal(isDigitalItem({ isDigital: true }), true);
      assert.equal(isDigitalItem({ product: { isDigital: true } }), true);
    });

    it("treats items without isDigital: true as physical regardless of keywords in name, category, or format", () => {
      assert.equal(isDigitalItem({ name: "Digital Sanskrit Guru Notebook" }), false);
      assert.equal(isDigitalItem({ name: "Sanskrit Grammar PDF Study Guide" }), false);
      assert.equal(isDigitalItem({ name: "Digital Sanskrit Guru Notebook", isDigital: false }), false);
      assert.equal(isDigitalItem({ name: "Sanskrit Grammar PDF Study Guide", isDigital: false }), false);
      assert.equal(isDigitalItem({ format: "Web Version" }), false);
      assert.equal(isDigitalItem({ category: "eBook" }), false);
    });

    it("identifies physical products as non-digital", () => {
      assert.equal(isDigitalItem({ name: "Hardcover Printed Book", format: "Hardcover" }), false);
      assert.equal(isDigitalItem({ name: "Paperback Edition", binding: "Paperback" }), false);
      assert.equal(isDigitalItem(null), false);
      assert.equal(isDigitalItem(undefined), false);
    });
  });

  describe("resolveDeliveryCharge & getDeliveryPricingDetails", () => {
    const defaultSettings = {
      deliveryCharge: 60,
      warehouseLocation: {
        latitude: 12.9716,
        longitude: 77.5946,
        state: "Karnataka",
        pincode: "560001"
      },
      distancePricing: {
        enabled: true,
        baseFee: 40,
        freeRadiusKm: 5,
        perKmCharge: 2,
        maxCharge: 150
      },
      internationalDelivery: {
        enabled: true,
        domesticCountry: "India",
        defaultFee: 500,
        countryRates: [
          { country: "United States", fee: 800 }
        ]
      }
    };

    it("returns 0 delivery charge for an all-digital cart", () => {
      const digitalItems = [
        { name: "Sanskrit Video Course", isDigital: true },
        { name: "Grammar Web Edition", isDigital: true }
      ];

      const charge = resolveDeliveryCharge(defaultSettings, { country: "India", pincode: "560001" }, digitalItems);
      assert.equal(charge, 0);

      const details = getDeliveryPricingDetails(defaultSettings, { country: "India" }, digitalItems);
      assert.equal(details.isDigitalOnly, true);
      assert.equal(details.deliveryCharge, 0);
      assert.equal(details.pricingMode, "digital");
    });

    it("calculates distance-based delivery charge for physical items when distance pricing is enabled", () => {
      const physicalItems = [{ name: "Printed Book", isDigital: false, weight: 300 }];
      const shippingAddress = {
        latitude: 12.9816,
        longitude: 77.6046,
        country: "India",
        pincode: "560002"
      };

      const charge = resolveDeliveryCharge(defaultSettings, shippingAddress, physicalItems);
      assert.equal(typeof charge, "number");
      assert.ok(charge >= 40 && charge <= 150);
    });

    it("applies international delivery rate for international physical deliveries", () => {
      const physicalItems = [{ name: "Hardcover Book", isDigital: false }];
      const usShipping = { country: "United States", city: "New York" };

      const charge = resolveDeliveryCharge(defaultSettings, usShipping, physicalItems);
      assert.equal(charge, 800);

      const canadaShipping = { country: "Canada", city: "Toronto" };
      const fallbackIntlCharge = resolveDeliveryCharge(defaultSettings, canadaShipping, physicalItems);
      assert.equal(fallbackIntlCharge, 500);
    });

    it("falls back gracefully and returns a number without throwing when settings are empty or null", () => {
      const items = [{ name: "Book", isDigital: false }];
      assert.doesNotThrow(() => {
        const charge = resolveDeliveryCharge(null, {}, items);
        assert.equal(typeof charge, "number");
        assert.ok(Number.isFinite(charge));
      });

      assert.doesNotThrow(() => {
        const charge = resolveDeliveryCharge({}, null, []);
        assert.equal(typeof charge, "number");
      });
    });
  });
});
