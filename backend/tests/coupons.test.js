const { describe, it, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const Coupon = require("../models/Coupon");
const User = require("../models/User");
const { validateCoupon } = require("../utils/coupons");

describe("coupons utility (validateCoupon with mocks)", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  const samplePricedItems = [
    { it: { product: "prod_1", name: "Book 1" }, gross: 500, price: 500, quantity: 1 },
    { it: { product: "prod_2", name: "Book 2" }, gross: 300, price: 300, quantity: 1 }
  ];

  it("throws 400 error when coupon is not found, expired, or inactive", async () => {
    mock.method(Coupon, "findOne", () => ({
      lean: async () => null
    }));

    await assert.rejects(
      async () => {
        await validateCoupon({
          code: "INVALID_CODE",
          userId: "user_123",
          priced: samplePricedItems
        });
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.message, "Invalid, expired or fully used coupon code.");
        return true;
      }
    );
  });

  it("throws error when usageLimitPerUser is set but user is not signed in (userId is missing)", async () => {
    mock.method(Coupon, "findOne", () => ({
      lean: async () => ({
        code: "USER_LIMITED",
        usageLimitPerUser: 1,
        discountType: "percentage",
        discountValue: 10
      })
    }));

    await assert.rejects(
      async () => {
        await validateCoupon({
          code: "USER_LIMITED",
          userId: null,
          priced: samplePricedItems
        });
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.message, "Sign in to use coupons.");
        return true;
      }
    );
  });

  it("throws error when signed-in user has already used the coupon", async () => {
    mock.method(Coupon, "findOne", () => ({
      lean: async () => ({
        code: "ALREADY_USED",
        usedBy: ["user_123", "user_456"],
        discountType: "percentage",
        discountValue: 10
      })
    }));

    await assert.rejects(
      async () => {
        await validateCoupon({
          code: "ALREADY_USED",
          userId: "user_123",
          priced: samplePricedItems
        });
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.message, "You have already used this coupon code.");
        return true;
      }
    );
  });

  it("throws error when coupon is assigned to another user's email", async () => {
    mock.method(Coupon, "findOne", () => ({
      lean: async () => ({
        code: "ASSIGNED_ONLY",
        assignedUserEmail: "special.customer@example.com",
        discountType: "fixed",
        discountValue: 100
      })
    }));

    mock.method(User, "findById", () => ({
      select: () => ({
        lean: async () => ({ email: "different.user@example.com" })
      })
    }));

    await assert.rejects(
      async () => {
        await validateCoupon({
          code: "ASSIGNED_ONLY",
          userId: "user_789",
          priced: samplePricedItems
        });
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.message, "This coupon is assigned to another account.");
        return true;
      }
    );
  });

  it("allows assigned coupon when user email matches case-insensitively", async () => {
    mock.method(Coupon, "findOne", () => ({
      lean: async () => ({
        code: "ASSIGNED_MATCH",
        assignedUserEmail: "Student.Vyoma@Example.COM",
        discountType: "percentage",
        discountValue: 15
      })
    }));

    mock.method(User, "findById", () => ({
      select: () => ({
        lean: async () => ({ email: "student.vyoma@example.com" })
      })
    }));

    const result = await validateCoupon({
      code: "ASSIGNED_MATCH",
      userId: "user_789",
      priced: samplePricedItems
    });

    assert.equal(result.appliedCouponCode, "ASSIGNED_MATCH");
    assert.equal(result.discount, 120); // 15% of 800
  });

  it("throws error when coupon has applicableProducts restrictions and cart contains none of them", async () => {
    mock.method(Coupon, "findOne", () => ({
      lean: async () => ({
        code: "PRODUCT_RESTRICTED",
        applicableProducts: ["prod_999", "prod_888"],
        discountType: "percentage",
        discountValue: 10
      })
    }));

    await assert.rejects(
      async () => {
        await validateCoupon({
          code: "PRODUCT_RESTRICTED",
          userId: "user_123",
          priced: samplePricedItems // contains prod_1 and prod_2
        });
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.message, "Coupon not applicable to the products in this order.");
        return true;
      }
    );
  });

  it("throws error when order total is below minOrder requirement", async () => {
    mock.method(Coupon, "findOne", () => ({
      lean: async () => ({
        code: "MIN_ORDER_COUPON",
        minOrder: 1000,
        discountType: "fixed",
        discountValue: 100
      })
    }));

    await assert.rejects(
      async () => {
        await validateCoupon({
          code: "MIN_ORDER_COUPON",
          userId: "user_123",
          priced: samplePricedItems // total is 800
        });
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.message, "Minimum order value not met for this coupon.");
        return true;
      }
    );
  });

  it("calculates percentage discount accurately with 2-decimal rounding", async () => {
    mock.method(Coupon, "findOne", () => ({
      lean: async () => ({
        code: "PERCENT_15",
        discountType: "percentage",
        discountValue: 15.5
      })
    }));

    const result = await validateCoupon({
      code: "PERCENT_15",
      userId: "user_123",
      priced: samplePricedItems // 800 gross
    });

    assert.equal(result.appliedCouponCode, "PERCENT_15");
    // 800 * 15.5% = 124
    assert.equal(result.discount, 124);
  });

  it("caps fixed discount to eligible order total when discount exceeds cart total", async () => {
    mock.method(Coupon, "findOne", () => ({
      lean: async () => ({
        code: "BIG_FLAT_DISCOUNT",
        discountType: "fixed",
        discountValue: 1500 // higher than total 800
      })
    }));

    const result = await validateCoupon({
      code: "BIG_FLAT_DISCOUNT",
      userId: "user_123",
      priced: samplePricedItems
    });

    assert.equal(result.discount, 800); // capped at eligible total 800
  });

  it("converts fixed coupon discount when order is in a non-INR currency", async () => {
    mock.method(Coupon, "findOne", () => ({
      lean: async () => ({
        code: "USD_CONVERT_COUPON",
        discountType: "fixed",
        discountValue: 500 // 500 INR
      })
    }));

    // In USD, 500 INR * 0.02 = 10 USD
    const result = await validateCoupon({
      code: "USD_CONVERT_COUPON",
      userId: "user_123",
      priced: [{ it: { product: "prod_1" }, gross: 50, price: 50, quantity: 1 }],
      orderCurrency: "USD",
      rates: { INR: 1, USD: 0.02 }
    });

    assert.equal(result.discount, 10);
  });
});
