const { describe, it, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const Product = require("../models/Product");
const {
  MAX_OPTIONS,
  MAX_LABEL_LENGTH,
  normalizeOptionsInput,
  validateOptionTargets,
  pickPricingFromOptions,
  computeOptionsStock,
  summarizeOptionsForPublic
} = require("../utils/productOptions");
const { computeOrderTotals, OrderTotalsError } = require("../utils/orderTotals");

const ID1 = "507f1f77bcf86cd799439011";
const ID2 = "507f1f77bcf86cd799439012";
const ID3 = "507f1f77bcf86cd799439013";
const SELF_ID = "507f1f77bcf86cd799439099";

describe("Product with options", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  describe("normalizeOptionsInput", () => {
    it("exports MAX_OPTIONS = 12 and MAX_LABEL_LENGTH = 40", () => {
      assert.equal(MAX_OPTIONS, 12);
      assert.equal(MAX_LABEL_LENGTH, 40);
    });

    it("keeps order and trims labels for a valid list", () => {
      const res = normalizeOptionsInput([
        { product: ID2, label: "  Book  " },
        { productId: ID1, label: "Flipbook" }
      ]);
      assert.equal(res.error, "");
      assert.deepEqual(res.options, [
        { product: ID2, label: "Book" },
        { product: ID1, label: "Flipbook" }
      ]);
    });

    it("cuts a 41-char label to 40 characters without error", () => {
      const longLabel = "A".repeat(41);
      const res = normalizeOptionsInput([{ product: ID1, label: longLabel }]);
      assert.equal(res.error, "");
      assert.equal(res.options[0].label.length, 40);
      assert.equal(res.options[0].label, "A".repeat(40));
    });

    it("returns error naming the option number when label is empty", () => {
      const res = normalizeOptionsInput([
        { product: ID1, label: "Book" },
        { product: ID2, label: "   " }
      ]);
      assert.deepEqual(res.options, []);
      assert.equal(res.error, "Option 2: add a label (for example Book or Flipbook).");
    });

    it("returns error when product id is invalid", () => {
      const res = normalizeOptionsInput([
        { product: "not-an-object-id", label: "Book" }
      ]);
      assert.deepEqual(res.options, []);
      assert.equal(res.error, "Option 1: choose a product.");
    });

    it("returns error when product equals selfId", () => {
      const res = normalizeOptionsInput(
        [
          { product: ID1, label: "Book" },
          { product: SELF_ID, label: "Self" }
        ],
        SELF_ID
      );
      assert.deepEqual(res.options, []);
      assert.equal(res.error, "Option 2: a product cannot be an option of itself.");
    });

    it("returns error when the same product appears twice", () => {
      const res = normalizeOptionsInput([
        { product: ID1, label: "Book" },
        { product: ID2, label: "Flipbook" },
        { product: ID1, label: "Hardcover" }
      ]);
      assert.deepEqual(res.options, []);
      assert.equal(res.error, "Option 3: this product is already an option.");
    });

    it("returns error when more than 12 options are given", () => {
      const thirteen = Array.from({ length: 13 }, (_, i) => ({
        product: `507f1f77bcf86cd7994390${String(i + 10).padStart(2, "0")}`,
        label: `Opt ${i + 1}`
      }));
      const res = normalizeOptionsInput(thirteen);
      assert.deepEqual(res.options, []);
      assert.equal(res.error, "At most 12 options.");
    });

    it("returns error when input is empty array or not an array", () => {
      assert.deepEqual(normalizeOptionsInput([]), {
        options: [],
        error: "Add at least one option."
      });
      assert.deepEqual(normalizeOptionsInput(null), {
        options: [],
        error: "Add at least one option."
      });
    });
  });

  describe("validateOptionTargets", () => {
    it("rejects missing target with the option label in the message", () => {
      const res = validateOptionTargets(
        [
          { product: ID1, label: "Book" },
          { product: ID2, label: "Flipbook" }
        ],
        [{ _id: ID1, isDeleted: false, hasOptions: false }]
      );
      assert.equal(res.ok, false);
      assert.equal(res.error, "Flipbook: product not found.");
    });

    it("rejects deleted target with the option label in the message", () => {
      const res = validateOptionTargets(
        [{ product: ID1, label: "Pendrive" }],
        [{ _id: ID1, isDeleted: true, hasOptions: false }]
      );
      assert.equal(res.ok, false);
      assert.equal(res.error, "Pendrive: that product is in the Recycle Bin.");
    });

    it("rejects nested hasOptions target with the option label in the message", () => {
      const res = validateOptionTargets(
        [{ product: ID1, label: "Combo Parent" }],
        [{ _id: ID1, isDeleted: false, hasOptions: true }]
      );
      assert.equal(res.ok, false);
      assert.equal(res.error, "Combo Parent: that product has its own options; options cannot be nested.");
    });

    it("accepts a good list of targets", () => {
      const res = validateOptionTargets(
        [
          { product: ID1, label: "Book" },
          { product: ID2, label: "Flipbook" }
        ],
        [
          { _id: ID1, isDeleted: false, hasOptions: false },
          { _id: ID2, isDeleted: false, hasOptions: false }
        ]
      );
      assert.deepEqual(res, { ok: true, error: "" });
    });
  });

  describe("pickPricingFromOptions", () => {
    it("picks the lowest domestic price and copies its international fields while ignoring deleted", () => {
      const targets = [
        {
          _id: ID1,
          price: 299,
          internationalPrice: 999,
          internationalCountryPrices: [{ country: "United States", price: 1200 }],
          marketPrices: [{ market: "US", regularPrice: 1200, salePrice: null }],
          isDeleted: false
        },
        {
          _id: ID2,
          price: 99,
          internationalPrice: 199,
          internationalCountryPrices: [{ country: "United Kingdom", price: 250 }],
          marketPrices: [{ market: "UK", regularPrice: 250, salePrice: 220 }],
          isDeleted: true
        },
        {
          _id: ID3,
          price: 149,
          internationalPrice: 499,
          internationalCountryPrices: [{ country: "Canada", price: 550 }],
          marketPrices: [{ market: "CA", regularPrice: 550, salePrice: 500 }],
          isDeleted: false
        }
      ];

      const picked = pickPricingFromOptions(targets);
      assert.ok(picked);
      assert.equal(picked.price, 149);
      assert.equal(picked.internationalPrice, 499);
      assert.deepEqual(picked.internationalCountryPrices, [{ country: "Canada", price: 550 }]);
      assert.deepEqual(picked.marketPrices, [{ market: "CA", regularPrice: 550, salePrice: 500 }]);
    });

    it("returns null when there are no non-deleted targets", () => {
      assert.equal(pickPricingFromOptions([]), null);
      assert.equal(pickPricingFromOptions([{ _id: ID1, price: 100, isDeleted: true }]), null);
    });
  });

  describe("computeOptionsStock", () => {
    it("sums physical 5 + physical 0 + digital (stock 0) as 6 and ignores deleted", () => {
      const total = computeOptionsStock([
        { _id: ID1, isDigital: false, stock: 5, isDeleted: false },
        { _id: ID2, isDigital: false, stock: 0, isDeleted: false },
        { _id: ID3, isDigital: true, stock: 0, isDeleted: false },
        { _id: SELF_ID, isDigital: false, stock: 20, isDeleted: true }
      ]);
      assert.equal(total, 6);
    });
  });

  describe("summarizeOptionsForPublic", () => {
    it("keeps saved order, skips missing/deleted, and strips private fields", () => {
      const parent = {
        hasOptions: true,
        options: [
          { product: ID2, label: "Flipbook" },
          { product: ID3, label: "Deleted Option" },
          { product: "507f1f77bcf86cd799439088", label: "Missing Option" },
          { product: ID1, label: "Book" }
        ]
      };

      const byId = new Map([
        [
          ID1,
          {
            _id: ID1,
            name: "Ramanavami Book",
            price: 299,
            isDigital: false,
            stock: 5,
            webReaderLink: "https://secret.example.com/book",
            externalAccessLink: "https://secret.example.com/ext",
            digitalInstructions: "Secret instructions"
          }
        ],
        [
          ID2,
          {
            _id: ID2,
            name: "Ramanavami Flipbook",
            price: 149,
            isDigital: true,
            stock: 0,
            webReaderLink: "https://secret.example.com/flipbook",
            externalAccessLink: "https://secret.example.com/ext-flip",
            digitalInstructions: "Private reader key"
          }
        ],
        [
          ID3,
          {
            _id: ID3,
            name: "Deleted Product",
            price: 99,
            isDeleted: true
          }
        ]
      ]);

      const pub = summarizeOptionsForPublic(parent, byId);
      assert.equal(pub.length, 2);
      assert.equal(pub[0].label, "Flipbook");
      assert.equal(pub[0].product._id, ID2);
      assert.equal(pub[1].label, "Book");
      assert.equal(pub[1].product._id, ID1);

      for (const entry of pub) {
        assert.equal("webReaderLink" in entry.product, false);
        assert.equal("externalAccessLink" in entry.product, false);
        assert.equal("digitalInstructions" in entry.product, false);
      }
    });
  });

  describe("computeOrderTotals hasOptions guard", () => {
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

    it("rejects an order containing a hasOptions parent product with status 400 and expected message", async () => {
      mock.method(Product, "find", () => ({
        populate: () => ({
          lean: async () => [
            {
              _id: "prod_parent_1",
              name: "Ramanavami Offer",
              price: 149,
              hasOptions: true,
              isDigital: false,
              stock: 6
            }
          ]
        })
      }));

      await assert.rejects(
        async () => {
          await computeOrderTotals({
            items: [{ product: "prod_parent_1", quantity: 1 }],
            shipping: { country: "India", state: "Karnataka" },
            settings: defaultSettings
          });
        },
        (err) => {
          assert.ok(err instanceof OrderTotalsError);
          assert.equal(err.status, 400);
          assert.equal(err.message, "Please choose a format first.");
          return true;
        }
      );
    });

    it("allows a normal option product without hasOptions", async () => {
      mock.method(Product, "find", () => ({
        populate: () => ({
          lean: async () => [
            {
              _id: "prod_flipbook_1",
              name: "Ramanavami Flipbook",
              price: 149,
              hasOptions: false,
              isDigital: true,
              digitalType: "Web Version"
            }
          ]
        })
      }));

      const totals = await computeOrderTotals({
        items: [{ product: "prod_flipbook_1", quantity: 1 }],
        shipping: { country: "India", state: "Karnataka" },
        settings: defaultSettings
      });

      assert.equal(totals.normalizedItems.length, 1);
      assert.equal(totals.total, 149);
    });
  });
});

