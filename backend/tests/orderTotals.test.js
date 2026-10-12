const { describe, it, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const Product = require("../models/Product");
const Coupon = require("../models/Coupon");
const User = require("../models/User");
const { computeOrderTotals, OrderTotalsError } = require("../utils/orderTotals");

describe("orderTotals utility (computeOrderTotals with mocks)", () => {
  afterEach(() => {
    mock.restoreAll();
  });

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
    },
    distancePricing: {
      enabled: false
    },
    internationalDelivery: {
      enabled: true,
      domesticCountry: "India",
      defaultFee: 600,
      countryRates: [
        { country: "United States", fee: 900 }
      ]
    },
    pricingMarkets: [
      {
        name: "North America",
        currency: "USD",
        countries: ["United States", "Canada"]
      }
    ],
    internationalPricingDefaults: {
      currency: "USD"
    },
    currencyConversionRates: {
      INR: 1,
      USD: 0.012
    }
  };

  it("SECURITY REGRESSION: ignores client-provided price tampering and uses database product price", async () => {
    // Database product is priced at 199 INR
    mock.method(Product, "find", () => ({
      populate: () => ({
        lean: async () => [
          {
            _id: "prod_secure_1",
            name: "Sanskrit Primer",
            price: 199,
            isDigital: true
          }
        ]
      })
    }));

    // Malicious client sends price: 1
    const result = await computeOrderTotals({
      items: [{ product: "prod_secure_1", price: 1, quantity: 1 }],
      shipping: { country: "India", state: "Karnataka" },
      settings: defaultSettings
    });

    assert.equal(result.normalizedItems[0].price, 199);
    assert.equal(result.total, 199);
    assert.equal(result.chargeAmount, 199);
  });

  it("throws OrderTotalsError 400 when items array is empty or contains only invalid entries", async () => {
    await assert.rejects(
      async () => {
        await computeOrderTotals({
          items: [],
          shipping: { country: "India" },
          settings: defaultSettings
        });
      },
      (err) => {
        assert.ok(err instanceof OrderTotalsError);
        assert.equal(err.status, 400);
        assert.equal(err.message, "No valid items in the cart.");
        return true;
      }
    );
  });

  it("throws OrderTotalsError 400 when requested products are not found in the database", async () => {
    mock.method(Product, "find", () => ({
      populate: () => ({
        lean: async () => [] // Deleted or non-existent in DB
      })
    }));

    await assert.rejects(
      async () => {
        await computeOrderTotals({
          items: [{ product: "non_existent_prod_id", quantity: 2 }],
          shipping: { country: "India" },
          settings: defaultSettings
        });
      },
      (err) => {
        assert.ok(err instanceof OrderTotalsError);
        assert.equal(err.status, 400);
        assert.equal(err.message, "No valid products found for this order.");
        return true;
      }
    );
  });

  it("merges duplicate item entries for the same product and sums quantities", async () => {
    mock.method(Product, "find", () => ({
      populate: () => ({
        lean: async () => [
          {
            _id: "prod_dup_1",
            name: "Vedic Chants Book",
            price: 250,
            isDigital: true
          }
        ]
      })
    }));

    const result = await computeOrderTotals({
      items: [
        { product: "prod_dup_1", quantity: 2 },
        { product: "prod_dup_1", quantity: 3 }
      ],
      shipping: { country: "India", state: "Karnataka" },
      settings: defaultSettings
    });

    assert.equal(result.normalizedItems.length, 1);
    assert.equal(result.normalizedItems[0].quantity, 5);
    assert.equal(result.total, 1250); // 250 * 5
  });

  it("returns expected schema properties (normalizedItems, chargeAmount, taxDetails, etc.)", async () => {
    mock.method(Product, "find", () => ({
      populate: () => ({
        lean: async () => [
          {
            _id: "prod_schema_1",
            name: "Ramayana Hardcover",
            price: 500,
            isDigital: false,
            weight: 400
          }
        ]
      })
    }));

    const result = await computeOrderTotals({
      items: [{ product: "prod_schema_1", quantity: 1 }],
      shipping: { country: "India", state: "Karnataka" },
      settings: defaultSettings
    });

    assert.ok(Array.isArray(result.normalizedItems));
    assert.equal(result.items, undefined); // Confirms 'normalizedItems', not 'items'
    assert.equal(typeof result.chargeAmount, "number");
    assert.equal(typeof result.chargeCurrency, "string");
    assert.equal(typeof result.subtotal, "number");
    assert.equal(typeof result.gstAmount, "number");
    assert.equal(typeof result.total, "number");
    assert.ok(result.taxDetails);
  });

  it("sets delivery charge to 0 and matches chargeAmount to INR total for digital-only orders in India", async () => {
    mock.method(Product, "find", () => ({
      populate: () => ({
        lean: async () => [
          {
            _id: "prod_digital_1",
            name: "Sanskrit Grammar Web Reader",
            price: 350,
            isDigital: true,
            format: "Web Version"
          }
        ]
      })
    }));

    const result = await computeOrderTotals({
      items: [{ product: "prod_digital_1", quantity: 1 }],
      shipping: { country: "India", state: "Karnataka" },
      settings: defaultSettings
    });

    assert.equal(result.deliveryCharge, 0);
    assert.equal(result.total, 350);
    assert.equal(result.chargeAmount, 350);
    assert.equal(result.chargeCurrency, "INR");
    assert.equal(result.orderCurrency, "INR");
  });

  it("applies valid coupon discount and reduces the total", async () => {
    mock.method(Product, "find", () => ({
      populate: () => ({
        lean: async () => [
          {
            _id: "prod_coupon_1",
            name: "Audio Stotra Course",
            price: 1000,
            isDigital: true
          }
        ]
      })
    }));

    mock.method(Coupon, "findOne", () => ({
      lean: async () => ({
        code: "DISCOUNT20",
        discountType: "percentage",
        discountValue: 20
      })
    }));

    const result = await computeOrderTotals({
      items: [{ product: "prod_coupon_1", quantity: 1 }],
      shipping: { country: "India", state: "Karnataka" },
      couponCode: "DISCOUNT20",
      userId: "user_valid_1",
      settings: defaultSettings
    });

    assert.equal(result.discount, 200);
    assert.equal(result.appliedCouponCode, "DISCOUNT20");
    assert.equal(result.total, 800);
  });

  it("throws OrderTotalsError when signed-in user provides an invalid coupon code", async () => {
    mock.method(Product, "find", () => ({
      populate: () => ({
        lean: async () => [
          {
            _id: "prod_coupon_2",
            name: "Audio Course",
            price: 500,
            isDigital: true
          }
        ]
      })
    }));

    mock.method(Coupon, "findOne", () => ({
      lean: async () => null // Coupon not found
    }));

    await assert.rejects(
      async () => {
        await computeOrderTotals({
          items: [{ product: "prod_coupon_2", quantity: 1 }],
          shipping: { country: "India", state: "Karnataka" },
          couponCode: "EXPIRED_CODE",
          userId: "user_valid_1",
          settings: defaultSettings
        });
      },
      (err) => {
        assert.ok(err instanceof OrderTotalsError);
        assert.equal(err.status, 400);
        assert.equal(err.message, "Invalid, expired or fully used coupon code.");
        return true;
      }
    );
  });

  it("throws error when shipping physical items internationally and internationalDelivery is disabled", async () => {
    mock.method(Product, "find", () => ({
      populate: () => ({
        lean: async () => [
          {
            _id: "prod_phys_1",
            name: "Heavy Sanskrit Dictionary",
            price: 1500,
            isDigital: false,
            weight: 1200
          }
        ]
      })
    }));

    const disabledIntlSettings = {
      ...defaultSettings,
      internationalDelivery: {
        ...defaultSettings.internationalDelivery,
        enabled: false
      }
    };

    await assert.rejects(
      async () => {
        await computeOrderTotals({
          items: [{ product: "prod_phys_1", quantity: 1 }],
          shipping: { country: "United States", city: "Chicago" },
          settings: disabledIntlSettings
        });
      },
      (err) => {
        assert.ok(err instanceof OrderTotalsError);
        assert.equal(err.status, 400);
        assert.equal(
          err.message,
          "Physical product delivery is currently disabled for international locations."
        );
        return true;
      }
    );
  });
});
