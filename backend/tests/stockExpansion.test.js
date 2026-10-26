const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { expandItemsForStock } = require("../utils/stock");

describe("expandItemsForStock utility (pure, no DB)", () => {
  it("a single item -> one entry", () => {
    const items = [
      { product: "prod_1", quantity: 3, name: "Sanskrit Primer" }
    ];
    const result = expandItemsForStock(items);

    assert.equal(result.length, 1);
    assert.deepEqual(result[0], {
      product: "prod_1",
      quantity: 3,
      name: "Sanskrit Primer"
    });
  });

  it("a bundle (qty 2) with 2 existing physical components (qty 1 and 3) -> bundle (2) + components (2 and 6)", () => {
    const items = [
      {
        product: "bundle_combo",
        productType: "bundle",
        quantity: 2,
        name: "Super Combo",
        bundleItems: [
          { product: "book_a", quantity: 1, name: "Book A", isDigital: false },
          { product: "book_b", quantity: 3, name: "Book B", isDigital: false }
        ]
      }
    ];

    const result = expandItemsForStock(items, { includeComponents: true });
    assert.equal(result.length, 3);

    const byId = new Map(result.map((r) => [String(r.product), r]));
    assert.equal(byId.get("bundle_combo")?.quantity, 2);
    assert.equal(byId.get("bundle_combo")?.name, "Super Combo");
    assert.equal(byId.get("book_a")?.quantity, 2);
    assert.equal(byId.get("book_a")?.name, "Book A");
    assert.equal(byId.get("book_b")?.quantity, 6);
    assert.equal(byId.get("book_b")?.name, "Book B");
  });

  it("digital and custom components are skipped", () => {
    const items = [
      {
        product: "bundle_mixed",
        productType: "bundle",
        quantity: 2,
        name: "Mixed Bundle",
        bundleItems: [
          { product: "physical_item", quantity: 1, name: "Physical Item", isDigital: false },
          { product: "digital_item", quantity: 1, name: "Digital PDF", isDigital: true },
          { product: null, itemType: "custom", quantity: 1, name: "Custom Bookmark", isDigital: false },
          { product: "custom_with_id", itemType: "custom", quantity: 1, name: "Custom Tag", isDigital: false }
        ]
      }
    ];

    const result = expandItemsForStock(items, { includeComponents: true });
    assert.equal(result.length, 2);

    const byId = new Map(result.map((r) => [String(r.product), r]));
    assert.equal(byId.has("bundle_mixed"), true);
    assert.equal(byId.has("physical_item"), true);
    assert.equal(byId.has("digital_item"), false);
    assert.equal(byId.has("custom_with_id"), false);
    assert.equal(byId.get("physical_item")?.quantity, 2);
  });

  it("includeComponents: false -> only the items themselves", () => {
    const items = [
      {
        product: "bundle_1",
        productType: "bundle",
        quantity: 2,
        name: "Combo Pack",
        bundleItems: [
          { product: "component_1", quantity: 1, name: "Component 1", isDigital: false }
        ]
      }
    ];

    const result = expandItemsForStock(items, { includeComponents: false });
    assert.equal(result.length, 1);
    assert.equal(result[0].product, "bundle_1");
    assert.equal(result[0].quantity, 2);
  });

  it("a single book X (qty 1) + a bundle (qty 1) containing X (qty 1) -> X merged to 2", () => {
    const items = [
      { product: "book_x", quantity: 1, name: "Book X" },
      {
        product: "bundle_1",
        productType: "bundle",
        quantity: 1,
        name: "Combo Pack",
        bundleItems: [
          { product: "book_x", quantity: 1, name: "Book X", isDigital: false }
        ]
      }
    ];

    const result = expandItemsForStock(items, { includeComponents: true });
    assert.equal(result.length, 2);

    const byId = new Map(result.map((r) => [String(r.product), r]));
    assert.equal(byId.get("book_x")?.quantity, 2);
    assert.equal(byId.get("bundle_1")?.quantity, 1);
  });

  it("invalid entries (no product, quantity 0) are skipped", () => {
    const items = [
      { product: null, quantity: 2, name: "Null product" },
      { product: "", quantity: 2, name: "Empty product" },
      { product: "item_zero", quantity: 0, name: "Zero quantity" },
      { product: "item_neg", quantity: -1, name: "Negative quantity" },
      { product: "item_float", quantity: 1.5, name: "Float quantity" },
      { product: "item_nan", quantity: NaN, name: "NaN quantity" },
      null,
      undefined,
      { product: "valid_item", quantity: 4, name: "Valid Item" }
    ];

    const result = expandItemsForStock(items);
    assert.equal(result.length, 1);
    assert.equal(result[0].product, "valid_item");
    assert.equal(result[0].quantity, 4);

    assert.deepEqual(expandItemsForStock(null), []);
    assert.deepEqual(expandItemsForStock(undefined), []);
    assert.deepEqual(expandItemsForStock([]), []);
  });

  it("an order with a digital item (isDigital true) and a physical item -> only the physical item is returned", () => {
    const items = [
      { product: "digital_book", isDigital: true, quantity: 1, name: "E-Book PDF" },
      { product: "physical_book", isDigital: false, quantity: 2, name: "Hardcover Book" }
    ];

    const result = expandItemsForStock(items);
    assert.equal(result.length, 1);
    assert.equal(result[0].product, "physical_book");
    assert.equal(result[0].quantity, 2);
    assert.equal(result[0].name, "Hardcover Book");
  });
});
