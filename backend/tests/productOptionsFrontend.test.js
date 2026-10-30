const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("frontend productOptions utility (pure)", async () => {
  const {
    isOptionsParent,
    getOptionCount,
    isOptionAvailable,
    pickDefaultOptionId,
    getBuyProduct
  } = await import("../../src/utils/productOptions.js");

  const bookOpt = { _id: "opt-book", name: "Book", isDigital: false, stock: 5, price: 299 };
  const flipbookOpt = { _id: "opt-flip", name: "Flipbook", isDigital: true, stock: 0, price: 149 };
  const japaOpt = { _id: "opt-japa", name: "Japayantram", isDigital: false, stock: 0, price: 745 };

  describe("isOptionsParent", () => {
    it("identifies parent vs non-parent products", () => {
      assert.equal(isOptionsParent({ hasOptions: true }), true);
      assert.equal(isOptionsParent({ hasOptions: false }), false);
      assert.equal(isOptionsParent({}), false);
      assert.equal(isOptionsParent(null), false);
      assert.equal(isOptionsParent(undefined), false);
    });
  });

  describe("getOptionCount", () => {
    it("counts from publicOptions when present, otherwise options, otherwise 0", () => {
      assert.equal(
        getOptionCount({
          publicOptions: [{ label: "Book", product: bookOpt }, { label: "Flipbook", product: flipbookOpt }],
          options: [{ product: "opt-book", label: "Book" }]
        }),
        2
      );
      assert.equal(
        getOptionCount({
          options: [
            { product: "opt-book", label: "Book" },
            { product: "opt-flip", label: "Flipbook" },
            { product: "opt-japa", label: "Japayantram" }
          ]
        }),
        3
      );
      assert.equal(getOptionCount({}), 0);
      assert.equal(getOptionCount(null), 0);
    });
  });

  describe("isOptionAvailable", () => {
    it("treats digital with stock 0 as available and physical with stock 0 as unavailable", () => {
      assert.equal(isOptionAvailable(flipbookOpt), true);
      assert.equal(isOptionAvailable(bookOpt), true);
      assert.equal(isOptionAvailable(japaOpt), false);
      assert.equal(isOptionAvailable(null), false);
    });
  });

  describe("pickDefaultOptionId", () => {
    const publicOptions = [
      { label: "Book", product: bookOpt },
      { label: "Flipbook", product: flipbookOpt },
      { label: "Japayantram", product: japaOpt }
    ];

    it("returns preferredId when it matches one of the options", () => {
      assert.equal(pickDefaultOptionId(publicOptions, "opt-flip"), "opt-flip");
      assert.equal(pickDefaultOptionId(publicOptions, "opt-japa"), "opt-japa");
    });

    it("falls back to first available option when preferredId is unknown or empty", () => {
      assert.equal(pickDefaultOptionId(publicOptions, "unknown-id"), "opt-book");
      assert.equal(pickDefaultOptionId(publicOptions, ""), "opt-book");
    });

    it("skips out-of-stock first option and picks first available option", () => {
      const outThenIn = [
        { label: "Japayantram", product: japaOpt },
        { label: "Flipbook", product: flipbookOpt }
      ];
      assert.equal(pickDefaultOptionId(outThenIn, ""), "opt-flip");
    });

    it("picks first option when all options are out of stock", () => {
      const allOut = [
        { label: "Japayantram", product: japaOpt },
        { label: "Out Book", product: { _id: "opt-out-2", isDigital: false, stock: 0 } }
      ];
      assert.equal(pickDefaultOptionId(allOut, ""), "opt-japa");
    });

    it("returns empty string for an empty or invalid list", () => {
      assert.equal(pickDefaultOptionId([], "opt-book"), "");
      assert.equal(pickDefaultOptionId(null, "opt-book"), "");
    });
  });

  describe("getBuyProduct", () => {
    const parentProduct = {
      _id: "parent-1",
      name: "Ramanavami Offer",
      hasOptions: true,
      publicOptions: [
        { label: "Book", product: bookOpt },
        { label: "Flipbook", product: flipbookOpt }
      ]
    };

    it("returns matching option product for a parent or null when not found", () => {
      assert.deepEqual(getBuyProduct(parentProduct, "opt-flip"), flipbookOpt);
      assert.equal(getBuyProduct(parentProduct, "missing-id"), null);
      assert.equal(getBuyProduct(parentProduct, ""), null);
    });

    it("returns the product itself for a normal product", () => {
      const normalProduct = { _id: "norm-1", name: "Normal Book", hasOptions: false, price: 199 };
      assert.equal(getBuyProduct(normalProduct, "any-id"), normalProduct);
      assert.equal(getBuyProduct(normalProduct, ""), normalProduct);
    });
  });
});

