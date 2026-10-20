const { describe, it, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const Product = require("../models/Product");
const Coupon = require("../models/Coupon");
const User = require("../models/User");
const { computeOrderTotals, OrderTotalsError } = require("../utils/orderTotals");
const { roundMoney } = require("../utils/upgradePricing");

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

  describe("combo upgrade pricing integration in computeOrderTotals", () => {
    const comboProduct = {
      _id: "prod_combo_1",
      name: "Sanskrit Master Combo",
      price: 1500,
      productType: "bundle",
      isDigital: false,
      bundleItems: [
        {
          price: 1000,
          product: {
            _id: "prod_phys_1",
            name: "Printed Sanskrit Grammar Book",
            price: 1000,
            isDigital: false
          }
        },
        {
          price: 800,
          product: {
            _id: "prod_dig_1",
            name: "Sanskrit Web Grammar Reader",
            price: 800,
            isDigital: true
          }
        }
      ]
    };

    it("reduces combo price when user owns digital component; subtotal, GST, and total are consistent; upgradeCredit reported", async () => {
      mock.method(Product, "find", () => ({
        populate: () => ({
          lean: async () => [comboProduct]
        })
      }));

      const ownedDigitalIds = new Set(["prod_dig_1"]);
      const result = await computeOrderTotals({
        items: [{ product: "prod_combo_1", quantity: 1 }],
        shipping: { country: "India", state: "Karnataka" },
        userId: "user_logged_in_1",
        settings: defaultSettings,
        ownedDigitalIds
      });

      // Total value: 1800, owned: 800 -> credit: round(1500 * 800 / 1800) = 666.67
      assert.equal(result.upgradeCredit, 666.67);
      assert.deepEqual(result.upgradeCreditItems, [
        {
          name: "Sanskrit Master Combo",
          ownedItems: ["Sanskrit Web Grammar Reader"],
          credit: 666.67,
          ownedDetails: [
            {
              name: "Sanskrit Web Grammar Reader",
              amount: 666.67
            }
          ]
        }
      ]);

      const item = result.normalizedItems[0];
      assert.equal(item.upgradeCreditPerUnit, 666.67);
      assert.equal(item.upgradeCredit, 666.67);
      assert.deepEqual(item.upgradeOwnedItems, ["Sanskrit Web Grammar Reader"]);
      assert.deepEqual(item.upgradeOwnedDetails, [
        {
          name: "Sanskrit Web Grammar Reader",
          amountPerUnit: 666.67,
          amount: 666.67
        }
      ]);
      assert.equal(item.price, 833.33); // 1500 - 666.67

      // Discount remains coupon-only (0 here)
      assert.equal(result.discount, 0);

      // Verify mathematical consistency: subtotal + gstAmount + deliveryCharge === total
      const calculatedTotal = Math.round((result.subtotal + result.gstAmount + result.deliveryCharge) * 100) / 100;
      assert.equal(result.total, calculatedTotal);
    });

    it("applies coupon on the reduced combo price; discount stays coupon-only", async () => {
      mock.method(Product, "find", () => ({
        populate: () => ({
          lean: async () => [comboProduct]
        })
      }));

      mock.method(Coupon, "findOne", () => ({
        lean: async () => ({
          code: "SAVE10",
          discountType: "percentage",
          discountValue: 10
        })
      }));

      const ownedDigitalIds = new Set(["prod_dig_1"]);
      const result = await computeOrderTotals({
        items: [{ product: "prod_combo_1", quantity: 1 }],
        shipping: { country: "India", state: "Karnataka" },
        couponCode: "SAVE10",
        userId: "user_logged_in_1",
        settings: defaultSettings,
        ownedDigitalIds
      });

      // Combo price was reduced to 833.33. 10% coupon on 833.33 -> 83.33
      assert.equal(result.upgradeCredit, 666.67);
      assert.equal(result.discount, 83.33);
      assert.equal(result.appliedCouponCode, "SAVE10");

      // Verify subtotal, GST, and total are mathematically consistent
      const calculatedTotal = Math.round((result.subtotal + result.gstAmount + result.deliveryCharge) * 100) / 100;
      assert.equal(result.total, calculatedTotal);
    });

    it("guest gets no credit even if ownedDigitalIds are provided", async () => {
      mock.method(Product, "find", () => ({
        populate: () => ({
          lean: async () => [comboProduct]
        })
      }));

      const ownedDigitalIds = new Set(["prod_dig_1"]);
      const result = await computeOrderTotals({
        items: [{ product: "prod_combo_1", quantity: 1 }],
        shipping: { country: "India", state: "Karnataka" },
        userId: null, // Guest
        settings: defaultSettings,
        ownedDigitalIds
      });

      assert.equal(result.upgradeCredit, 0);
      assert.deepEqual(result.upgradeCreditItems, []);
      const item = result.normalizedItems[0];
      assert.equal(item.price, 1500);
      assert.equal(item.upgradeCreditPerUnit, 0);
      assert.equal(item.upgradeCredit, 0);
    });

    it("combo with owned digital component and userId present, but ownedDigitalIds passed as an EMPTY Set -> no credit (upgradeCredit 0, item price unchanged)", async () => {
      mock.method(Product, "find", () => ({
        populate: () => ({
          lean: async () => [comboProduct]
        })
      }));

      const ownedDigitalIds = new Set();
      const result = await computeOrderTotals({
        items: [{ product: "prod_combo_1", quantity: 1 }],
        shipping: { country: "India", state: "Karnataka" },
        userId: "user_logged_in_1",
        settings: defaultSettings,
        ownedDigitalIds
      });

      assert.equal(result.upgradeCredit, 0);
      assert.deepEqual(result.upgradeCreditItems, []);
      const item = result.normalizedItems[0];
      assert.equal(item.price, 1500);
      assert.equal(item.upgradeCreditPerUnit, 0);
      assert.equal(item.upgradeCredit, 0);
    });

    it("an exempt combo with an owned digital component gets no credit and keeps its full price", async () => {
      const exemptComboProduct = {
        ...comboProduct,
        _id: "prod_combo_exempt",
        skipOwnershipRules: true
      };

      mock.method(Product, "find", () => ({
        populate: () => ({
          lean: async () => [exemptComboProduct]
        })
      }));

      const ownedDigitalIds = new Set(["prod_dig_1"]);
      const result = await computeOrderTotals({
        items: [{ product: "prod_combo_exempt", quantity: 1 }],
        shipping: { country: "India", state: "Karnataka" },
        userId: "user_logged_in_1",
        settings: defaultSettings,
        ownedDigitalIds
      });

      assert.equal(result.upgradeCredit, 0);
      assert.deepEqual(result.upgradeCreditItems, []);
      const item = result.normalizedItems[0];
      assert.equal(item.price, 1500);
      assert.equal(item.upgradeCreditPerUnit, 0);
      assert.equal(item.upgradeCredit, 0);
      assert.deepEqual(item.upgradeOwnedItems, []);
      assert.deepEqual(item.upgradeOwnedDetails, []);
    });

    it("several owned parts and quantity 2: shares and line amounts add up exactly to credit, names are present, old fields unchanged", async () => {
      const multiPartCombo = {
        _id: "prod_combo_multi",
        name: "Sanskrit Mega Bundle",
        productType: "bundle",
        price: 2400,
        isDigital: false,
        bundleItems: [
          {
            price: 1000,
            product: {
              _id: "prod_phys_multi",
              name: "Hardcover Lexicon",
              price: 1000,
              isDigital: false
            }
          },
          {
            price: 600,
            product: {
              _id: "prod_dig_m1",
              name: "Digital Reader App",
              price: 600,
              isDigital: true
            }
          },
          {
            price: 400,
            product: {
              _id: "prod_dig_m2",
              name: "Chanting Audio Tracks",
              price: 400,
              isDigital: true
            }
          }
        ]
      };

      mock.method(Product, "find", () => ({
        populate: () => ({
          lean: async () => [multiPartCombo]
        })
      }));

      const ownedDigitalIds = new Set(["prod_dig_m1", "prod_dig_m2"]);
      const result = await computeOrderTotals({
        items: [{ product: "prod_combo_multi", quantity: 2 }],
        shipping: { country: "India", state: "Karnataka" },
        userId: "user_logged_in_1",
        settings: defaultSettings,
        ownedDigitalIds
      });

      // Old fields unchanged
      assert.equal(result.upgradeCredit, 2400);
      assert.equal(result.upgradeCreditItems.length, 1);
      const creditItem = result.upgradeCreditItems[0];
      assert.equal(creditItem.name, "Sanskrit Mega Bundle");
      assert.deepEqual(creditItem.ownedItems, ["Digital Reader App", "Chanting Audio Tracks"]);
      assert.equal(creditItem.credit, 2400);

      // Names present in ownedDetails and amounts add up exactly to credit
      assert.deepEqual(
        creditItem.ownedDetails.map((d) => d.name),
        ["Digital Reader App", "Chanting Audio Tracks"]
      );
      assert.deepEqual(creditItem.ownedDetails, [
        { name: "Digital Reader App", amount: 1440 },
        { name: "Chanting Audio Tracks", amount: 960 }
      ]);
      const sumCreditItemAmounts = roundMoney(
        creditItem.ownedDetails.reduce((sum, d) => sum + d.amount, 0)
      );
      assert.equal(sumCreditItemAmounts, creditItem.credit);

      // Item level assertions
      const item = result.normalizedItems[0];
      assert.equal(item.upgradeCreditPerUnit, 1200);
      assert.equal(item.upgradeCredit, 2400);
      assert.deepEqual(item.upgradeOwnedItems, ["Digital Reader App", "Chanting Audio Tracks"]);
      assert.deepEqual(item.upgradeOwnedDetails, [
        { name: "Digital Reader App", amountPerUnit: 720, amount: 1440 },
        { name: "Chanting Audio Tracks", amountPerUnit: 480, amount: 960 }
      ]);
      assert.equal(item.price, 1200); // 2400 - 1200

      const sumItemAmounts = roundMoney(
        item.upgradeOwnedDetails.reduce((sum, d) => sum + d.amount, 0)
      );
      assert.equal(sumItemAmounts, item.upgradeCredit);

      const sumItemShares = roundMoney(
        item.upgradeOwnedDetails.reduce((sum, d) => sum + d.amountPerUnit, 0)
      );
      assert.equal(sumItemShares, item.upgradeCreditPerUnit);
    });
  });
});
