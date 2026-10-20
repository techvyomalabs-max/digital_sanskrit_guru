const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  computeComboWeightGrams,
  applyComboWeight,
  applyComboWeights
} = require("../utils/comboWeight");

describe("comboWeight utility (pure)", () => {
  it("three physical parts (450 g, 450 g, 350 g) -> 1250", () => {
    const combo = {
      productType: "bundle",
      weight: 0,
      bundleItems: [
        {
          quantity: 1,
          product: { weight: 450, isDigital: false }
        },
        {
          quantity: 1,
          product: { weight: 450, isDigital: false }
        },
        {
          quantity: 1,
          product: { weight: 350, isDigital: false }
        }
      ]
    };

    const weight = computeComboWeightGrams(combo);
    assert.equal(weight, 1250);
  });

  it("part quantity 2 counted twice", () => {
    const combo = {
      productType: "bundle",
      weight: 0,
      bundleItems: [
        {
          quantity: 2,
          product: { weight: 450, isDigital: false }
        },
        {
          quantity: 1,
          product: { weight: 350, isDigital: false }
        }
      ]
    };

    // 450 * 2 + 350 * 1 = 900 + 350 = 1250
    const weight = computeComboWeightGrams(combo);
    assert.equal(weight, 1250);
  });

  it("digital parts skipped", () => {
    const combo = {
      productType: "bundle",
      weight: 0,
      bundleItems: [
        {
          quantity: 1,
          isDigital: true, // marked on bundle item entry
          product: { weight: 450, isDigital: false }
        },
        {
          quantity: 1,
          product: { weight: 500, isDigital: true } // marked on component product
        },
        {
          quantity: 1,
          product: { weight: 300, isDigital: false }
        }
      ]
    };

    const weight = computeComboWeightGrams(combo);
    assert.equal(weight, 300);
  });

  it("volumetric weight beating actual weight per part", () => {
    // Dimension: 20cm x 10cm x 5cm -> volume = 1000 cm3
    // Volumetric weight: (1000 / 5000) * 1000 = 200 g
    // Actual weight: 100 g -> chargeable is max(100, 200) = 200 g
    const combo = {
      productType: "bundle",
      weight: 0,
      bundleItems: [
        {
          quantity: 1,
          product: {
            weight: 100,
            length: 20,
            width: 10,
            height: 5,
            isDigital: false
          }
        }
      ]
    };

    const weight = computeComboWeightGrams(combo);
    assert.equal(weight, 200);
  });

  it("a custom part adds 0", () => {
    const combo = {
      productType: "bundle",
      weight: 0,
      bundleItems: [
        {
          itemType: "custom",
          product: null,
          quantity: 1,
          name: "Bookmark souvenir"
        },
        {
          quantity: 1,
          product: { weight: 400, isDigital: false }
        }
      ]
    };

    const weight = computeComboWeightGrams(combo);
    assert.equal(weight, 400);
  });

  it("a non-combo -> 0", () => {
    const singleProduct = {
      productType: "single",
      weight: 500,
      bundleItems: []
    };

    assert.equal(computeComboWeightGrams(singleProduct), 0);
    assert.equal(computeComboWeightGrams(null), 0);
    assert.equal(computeComboWeightGrams({}), 0);
  });

  it("nothing weighed -> 0", () => {
    const combo = {
      productType: "bundle",
      weight: 0,
      bundleItems: [
        {
          quantity: 1,
          product: { weight: 0, length: 0, width: 0, height: 0, isDigital: false }
        },
        {
          quantity: 2,
          product: { isDigital: false }
        }
      ]
    };

    assert.equal(computeComboWeightGrams(combo), 0);
  });

  describe("applyComboWeight and applyComboWeights", () => {
    it("sets weight on combo item with own weight 0", () => {
      const productDoc = {
        _id: "combo_1",
        productType: "bundle",
        weight: 0,
        bundleItems: [
          { quantity: 1, product: { weight: 450, isDigital: false } },
          { quantity: 1, product: { weight: 450, isDigital: false } },
          { quantity: 1, product: { weight: 350, isDigital: false } }
        ]
      };
      const item = { product: "combo_1", weight: 0 };
      applyComboWeight(item, productDoc);
      assert.equal(item.weight, 1250);
    });

    it("leaves combo item with own weight > 0 untouched (keeps 800)", () => {
      const productDoc = {
        _id: "combo_2",
        productType: "bundle",
        weight: 800,
        bundleItems: [
          { quantity: 1, product: { weight: 450, isDigital: false } },
          { quantity: 1, product: { weight: 450, isDigital: false } },
          { quantity: 1, product: { weight: 350, isDigital: false } }
        ]
      };
      const item = { product: "combo_2", weight: 800 };
      applyComboWeight(item, productDoc);
      assert.equal(item.weight, 800);
    });

    it("leaves non-combo item weight untouched", () => {
      const productDoc = {
        _id: "single_1",
        productType: "single",
        weight: 350,
        bundleItems: []
      };
      const item = { product: "single_1", weight: 350 };
      applyComboWeight(item, productDoc);
      assert.equal(item.weight, 350);
    });
  });
});
