const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  getProductPriceDetails,
  isInternationalCountry,
  findMatchedMarket
} = require("../utils/productPricing");

describe("productPricing utility (pure)", () => {
  describe("isInternationalCountry", () => {
    it("recognizes domestic country variations (India, india, IN, bharat) as false", () => {
      assert.equal(isInternationalCountry("India"), false);
      assert.equal(isInternationalCountry("india"), false);
      assert.equal(isInternationalCountry(" IN "), false);
      assert.equal(isInternationalCountry("Bharat"), false);
    });

    it("returns false for empty or null country string", () => {
      assert.equal(isInternationalCountry(""), false);
      assert.equal(isInternationalCountry(null), false);
      assert.equal(isInternationalCountry(undefined), false);
    });

    it("recognizes international countries as true", () => {
      assert.equal(isInternationalCountry("United States"), true);
      assert.equal(isInternationalCountry("USA"), true);
      assert.equal(isInternationalCountry("United Kingdom"), true);
      assert.equal(isInternationalCountry("Germany"), true);
      assert.equal(isInternationalCountry("Australia"), true);
    });
  });

  describe("getProductPriceDetails", () => {
    const sampleProduct = {
      _id: "prod_1",
      name: "Bhagavad Gita Sanskrit Edition",
      price: 499,
      internationalPrice: 1200,
      marketPrices: [
        {
          market: "North America",
          regularPrice: 20,
          salePrice: 15,
          startDate: new Date("2026-06-01T00:00:00Z"),
          endDate: new Date("2026-06-30T23:59:59Z")
        }
      ]
    };

    const pricingConfig = {
      pricingMarkets: [
        {
          name: "North America",
          currency: "USD",
          countries: ["United States", "Canada"]
        },
        {
          name: "Europe",
          currency: "EUR",
          countries: ["Germany", "France"]
        }
      ],
      internationalPricingDefaults: {
        currency: "USD"
      },
      currencyConversionRates: {
        INR: 1,
        USD: 0.012,
        EUR: 0.011
      }
    };

    it("gives domestic Indian buyer the domestic INR price", () => {
      const details = getProductPriceDetails(sampleProduct, "India", pricingConfig);

      assert.equal(details.isInternational, false);
      assert.equal(details.currency, "INR");
      assert.equal(details.price, 499);
      assert.equal(details.basePrice, 499);
      assert.equal(details.priceType, "domestic");
    });

    it("applies market sale price only within active date window", () => {
      // During sale: June 15, 2026
      const duringSale = new Date("2026-06-15T12:00:00Z");
      const detailsDuring = getProductPriceDetails(sampleProduct, "United States", pricingConfig, duringSale);
      assert.equal(detailsDuring.isInternational, true);
      assert.equal(detailsDuring.currency, "USD");
      assert.equal(detailsDuring.basePrice, 15);
      // convertResolvedAmount converts basePrice 15 from INR to USD (15 * 0.012 = 0.18)
      assert.equal(detailsDuring.price, 15 * 0.012);
      assert.equal(detailsDuring.priceType, "international-market-sale");

      // Before sale: May 20, 2026
      const beforeSale = new Date("2026-05-20T12:00:00Z");
      const detailsBefore = getProductPriceDetails(sampleProduct, "United States", pricingConfig, beforeSale);
      assert.equal(detailsBefore.basePrice, 20);
      assert.equal(detailsBefore.price, 20 * 0.012);
      assert.equal(detailsBefore.priceType, "international-market-regular");

      // After sale: July 10, 2026
      const afterSale = new Date("2026-07-10T12:00:00Z");
      const detailsAfter = getProductPriceDetails(sampleProduct, "United States", pricingConfig, afterSale);
      assert.equal(detailsAfter.basePrice, 20);
      assert.equal(detailsAfter.price, 20 * 0.012);
      assert.equal(detailsAfter.priceType, "international-market-regular");
    });

    it("handles international buyer with no matching pricing market (falls back to internationalPrice converted to default currency)", () => {
      // Australia is not in pricingMarkets config
      const details = getProductPriceDetails(sampleProduct, "Australia", pricingConfig);

      assert.equal(details.isInternational, true);
      assert.equal(details.matchedMarket, "");
      assert.equal(details.currency, "USD");
      // 1200 INR converted to USD at 0.012 rate -> 14.4
      assert.equal(details.price, 1200 * 0.012);
      assert.equal(details.basePrice, 1200);
      assert.equal(details.priceType, "international");
    });

    it("handles country-specific fixed prices over market prices", () => {
      const productWithCountryPrice = {
        ...sampleProduct,
        internationalCountryPrices: [
          {
            country: "United States",
            price: 18
          }
        ]
      };

      const details = getProductPriceDetails(productWithCountryPrice, "United States", pricingConfig);
      assert.equal(details.isInternational, true);
      assert.equal(details.basePrice, 18);
      assert.equal(details.price, 18 * 0.012);
      assert.equal(details.priceType, "international-country");
    });

    it("applies festive discount percent correctly to base price", () => {
      const festiveProduct = {
        ...sampleProduct,
        festiveOffer: true,
        festiveDiscountPercent: 20 // 20% off 499 = 399.2
      };

      const details = getProductPriceDetails(festiveProduct, "India", pricingConfig);
      assert.equal(details.price, 499 * 0.8);
      assert.equal(details.basePrice, 499 * 0.8);
    });
  });
});
