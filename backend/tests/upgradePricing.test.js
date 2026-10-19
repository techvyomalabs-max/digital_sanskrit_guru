const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildComponentsFromProduct,
  computeUpgradeCreditPerUnit,
  roundMoney
} = require("../utils/upgradePricing");

describe("upgradePricing utility (pure tests)", () => {
  it("1500 combo with components valued 1000 (physical) and 800 (digital, owned) -> credit 666.67 per unit", () => {
    const components = [
      { productId: "phys_1", name: "Printed Book", isDigital: false, value: 1000 },
      { productId: "dig_1", name: "Web Flipbook", isDigital: true, value: 800 }
    ];
    const ownedIds = new Set(["dig_1"]);

    const res = computeUpgradeCreditPerUnit({
      unitPrice: 1500,
      components,
      ownedIds
    });

    assert.equal(res.totalValue, 1800);
    assert.equal(res.ownedValue, 800);
    assert.deepEqual(res.ownedItems, ["Web Flipbook"]);
    assert.equal(res.creditPerUnit, 666.67);
    assert.deepEqual(res.ownedDetails, [{ name: "Web Flipbook", creditPerUnit: 666.67 }]);
  });

  it("no component values -> no credit", () => {
    const components = [
      { productId: "comp_1", name: "Empty Part 1", isDigital: true, value: 0 },
      { productId: "comp_2", name: "Empty Part 2", isDigital: false, value: 0 }
    ];
    const ownedIds = new Set(["comp_1"]);

    const res = computeUpgradeCreditPerUnit({
      unitPrice: 1000,
      components,
      ownedIds
    });

    assert.equal(res.creditPerUnit, 0);
    assert.deepEqual(res.ownedItems, []);
    assert.equal(res.totalValue, 0);
    assert.equal(res.ownedValue, 0);
  });

  it("nothing owned -> no credit", () => {
    const components = [
      { productId: "phys_1", name: "Printed Book", isDigital: false, value: 500 },
      { productId: "dig_1", name: "Web Version", isDigital: true, value: 500 }
    ];
    const ownedIds = new Set(); // nothing owned

    const res = computeUpgradeCreditPerUnit({
      unitPrice: 800,
      components,
      ownedIds
    });

    assert.equal(res.creditPerUnit, 0);
    assert.deepEqual(res.ownedItems, []);
    assert.equal(res.totalValue, 1000);
    assert.equal(res.ownedValue, 0);
  });

  it("owned physical component -> no credit", () => {
    const components = [
      { productId: "phys_1", name: "Printed Book", isDigital: false, value: 1000 },
      { productId: "dig_1", name: "Web Flipbook", isDigital: true, value: 500 }
    ];
    // User owns the physical component, but it is not digital
    const ownedIds = new Set(["phys_1"]);

    const res = computeUpgradeCreditPerUnit({
      unitPrice: 1200,
      components,
      ownedIds
    });

    assert.equal(res.creditPerUnit, 0);
    assert.deepEqual(res.ownedItems, []);
    assert.equal(res.ownedValue, 0);
    assert.equal(res.totalValue, 1500);
  });

  it("owned digital with price 0 -> no credit", () => {
    const components = [
      { productId: "phys_1", name: "Printed Book", isDigital: false, value: 1000 },
      { productId: "dig_free", name: "Free Web Companion", isDigital: true, value: 0 }
    ];
    const ownedIds = new Set(["dig_free"]);

    const res = computeUpgradeCreditPerUnit({
      unitPrice: 900,
      components,
      ownedIds
    });

    assert.equal(res.creditPerUnit, 0);
    assert.deepEqual(res.ownedItems, []);
    assert.equal(res.ownedValue, 0);
    assert.equal(res.totalValue, 1000);
  });

  it("never free: credit is capped at unitPrice - 0.01; creditPerUnit * quantity equals total credit; 2-decimal rounding", () => {
    const components = [
      { productId: "dig_1", name: "Digital Part 1", isDigital: true, value: 500 },
      { productId: "dig_2", name: "Digital Part 2", isDigital: true, value: 500 }
    ];
    // User owns all components in 100% digital combo
    const ownedIds = new Set(["dig_1", "dig_2"]);

    const unitPrice = 800;
    const res = computeUpgradeCreditPerUnit({
      unitPrice,
      components,
      ownedIds
    });

    // 100% owned -> raw credit would be 800, but capped at 800 - 0.01 = 799.99
    assert.equal(res.creditPerUnit, 799.99);
    assert.equal(roundMoney(unitPrice - res.creditPerUnit), 0.01);
    assert.deepEqual(res.ownedDetails, [
      { name: "Digital Part 1", creditPerUnit: 400 },
      { name: "Digital Part 2", creditPerUnit: 399.99 }
    ]);
    const sumShares = roundMoney(res.ownedDetails.reduce((sum, d) => sum + d.creditPerUnit, 0));
    assert.equal(sumShares, res.creditPerUnit);

    const quantity = 3;
    const totalCredit = roundMoney(res.creditPerUnit * quantity);
    assert.equal(totalCredit, roundMoney(799.99 * 3));
    assert.equal(totalCredit, 2399.97);

    // Quantity 2 check: per-component line amounts add up exactly to total credit for quantity 2
    const qty2 = 2;
    const totalCreditQty2 = roundMoney(res.creditPerUnit * qty2);
    const sumLineAmountsQty2 = roundMoney(
      res.ownedDetails.reduce((sum, d) => sum + roundMoney(d.creditPerUnit * qty2), 0)
    );
    assert.equal(sumLineAmountsQty2, totalCreditQty2);
  });

  it("several owned parts: shares add up exactly to creditPerUnit, quantity 2 total matches, names are present, old fields unchanged", () => {
    const components = [
      { productId: "phys_1", name: "Printed Text", isDigital: false, value: 1000 },
      { productId: "dig_1", name: "Grammar Guide", isDigital: true, value: 500 },
      { productId: "dig_2", name: "Vocabulary Builder", isDigital: true, value: 500 },
      { productId: "dig_3", name: "Audio Chants", isDigital: true, value: 500 }
    ];
    const ownedIds = new Set(["dig_1", "dig_2", "dig_3"]);

    const unitPrice = 1400;
    const res = computeUpgradeCreditPerUnit({
      unitPrice,
      components,
      ownedIds
    });

    // totalValue = 2500, ownedValue = 1500
    // rawCredit = roundMoney(1400 * 1500 / 2500) = 840
    assert.equal(res.totalValue, 2500);
    assert.equal(res.ownedValue, 1500);
    assert.deepEqual(res.ownedItems, ["Grammar Guide", "Vocabulary Builder", "Audio Chants"]);
    assert.equal(res.creditPerUnit, 840);

    // Names are present
    assert.equal(res.ownedDetails.length, 3);
    assert.deepEqual(
      res.ownedDetails.map((d) => d.name),
      ["Grammar Guide", "Vocabulary Builder", "Audio Chants"]
    );

    // Shares add up exactly to creditPerUnit
    const sumShares = roundMoney(res.ownedDetails.reduce((sum, d) => sum + d.creditPerUnit, 0));
    assert.equal(sumShares, res.creditPerUnit);

    // Quantity 2 check: line-level amounts add up exactly to total credit
    const quantity = 2;
    const totalCredit = roundMoney(res.creditPerUnit * quantity);
    const sumLineAmounts = roundMoney(
      res.ownedDetails.reduce((sum, d) => sum + roundMoney(d.creditPerUnit * quantity), 0)
    );
    assert.equal(sumLineAmounts, totalCredit);
  });

  it("several owned parts with rounding difference: shares add up exactly to creditPerUnit (including last share adjustment)", () => {
    const components = [
      { productId: "phys_1", name: "Printed Book", isDigital: false, value: 100 },
      { productId: "dig_1", name: "Digital Part 1", isDigital: true, value: 100 },
      { productId: "dig_2", name: "Digital Part 2", isDigital: true, value: 100 }
    ];
    const ownedIds = new Set(["dig_1", "dig_2"]);

    // unitPrice = 100, totalValue = 300, ownedValue = 200
    // rawCredit = roundMoney(100 * 200 / 300) = 66.67
    // share 1 = roundMoney(100 * 100 / 300) = 33.33
    // share 2 = roundMoney(100 * 100 / 300) = 33.33 -> adjusted to 33.34
    const res = computeUpgradeCreditPerUnit({
      unitPrice: 100,
      components,
      ownedIds
    });

    assert.equal(res.creditPerUnit, 66.67);
    assert.deepEqual(res.ownedDetails, [
      { name: "Digital Part 1", creditPerUnit: 33.33 },
      { name: "Digital Part 2", creditPerUnit: 33.34 }
    ]);
    const sumShares = roundMoney(res.ownedDetails.reduce((sum, d) => sum + d.creditPerUnit, 0));
    assert.equal(sumShares, res.creditPerUnit);

    // Quantity 2
    const quantity = 2;
    const totalCredit = roundMoney(res.creditPerUnit * quantity);
    const sumLineAmounts = roundMoney(
      res.ownedDetails.reduce((sum, d) => sum + roundMoney(d.creditPerUnit * quantity), 0)
    );
    assert.equal(sumLineAmounts, totalCredit);
  });

  it("buildComponentsFromProduct: component whose bundleItem.price is 0 falls back to its product price", () => {
    const productDoc = {
      productType: "bundle",
      bundleItems: [
        {
          price: 0,
          product: {
            _id: "comp_prod_1",
            name: "Component With Zero Bundle Price",
            price: 450,
            isDigital: true
          }
        },
        {
          price: 200,
          product: {
            _id: "comp_prod_2",
            name: "Component With Bundle Price Override",
            price: 350,
            isDigital: true
          }
        },
        {
          price: 0,
          product: {
            _id: "comp_prod_3",
            name: "Component With Zero In Both",
            price: 0,
            isDigital: false
          }
        }
      ]
    };

    const comps = buildComponentsFromProduct(productDoc);
    assert.equal(comps.length, 3);

    // Comp 1: bundleItem.price = 0 -> falls back to product.price (450)
    assert.equal(comps[0].productId, "comp_prod_1");
    assert.equal(comps[0].name, "Component With Zero Bundle Price");
    assert.equal(comps[0].isDigital, true);
    assert.equal(comps[0].value, 450);

    // Comp 2: bundleItem.price = 200 -> uses bundleItem.price (200) despite product.price 350
    assert.equal(comps[1].productId, "comp_prod_2");
    assert.equal(comps[1].name, "Component With Bundle Price Override");
    assert.equal(comps[1].isDigital, true);
    assert.equal(comps[1].value, 200);

    // Comp 3: both 0 -> value 0
    assert.equal(comps[2].productId, "comp_prod_3");
    assert.equal(comps[2].value, 0);
  });

  it("buildComponentsFromProduct returns [] for null or non-bundle productDoc", () => {
    assert.deepEqual(buildComponentsFromProduct(null), []);
    assert.deepEqual(buildComponentsFromProduct({}), []);
    assert.deepEqual(buildComponentsFromProduct({ bundleItems: null }), []);
  });
});
