const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const productRoutes = require("../routes/productRoutes");
const normalizeBundleItems = productRoutes.normalizeBundleItems;
const { computeComboWeightGrams } = require("../utils/comboWeight");
const { normalizeOrderItem } = require("../utils/orderItems");

describe("bundleCustomItems tests (pure, no DB)", () => {
  it("physical custom item keeps weight/sizes and drops links/digital fields", () => {
    const raw = [
      {
        itemType: "custom",
        name: "Sandalwood Incense",
        isDigital: false,
        weight: 150,
        length: 20,
        width: 5,
        height: 2,
        digitalType: "Web Version",
        digitalDelivery: "external",
        externalAccessLink: "https://example.com/bad",
        externalAccessLabel: "Open",
        externalAccessManual: true,
        webReaderLink: "https://reader.com/test",
        kindleLink: "https://amazon.com/kindle",
        quantity: 2
      }
    ];

    const result = normalizeBundleItems(raw);
    assert.equal(result.length, 1);
    const item = result[0];
    assert.equal(item.itemType, "custom");
    assert.equal(item.name, "Sandalwood Incense");
    assert.equal(item.isDigital, false);
    assert.equal(item.weight, 150);
    assert.equal(item.length, 20);
    assert.equal(item.width, 5);
    assert.equal(item.height, 2);
    assert.equal(item.digitalType, "");
    assert.equal(item.digitalDelivery, "onsite");
    assert.equal(item.externalAccessLink, "");
    assert.equal(item.externalAccessLabel, "");
    assert.equal(item.externalAccessManual, false);
    assert.equal(item.webReaderLink, "");
    assert.equal(item.kindleLink, "");
    assert.equal(item.quantity, 2);
  });

  it("digital onsite custom item keeps webReaderLink and digitalType, sizes 0", () => {
    const raw = [
      {
        itemType: "custom",
        name: "Interactive Sanskrit Primer",
        isDigital: true,
        digitalDelivery: "onsite",
        digitalType: "Flipbook",
        webReaderLink: "https://example.com/primer-flipbook",
        kindleLink: "https://example.com/primer-kindle",
        weight: 350,
        length: 25,
        width: 15,
        height: 3,
        quantity: 1
      }
    ];

    const result = normalizeBundleItems(raw);
    assert.equal(result.length, 1);
    const item = result[0];
    assert.equal(item.itemType, "custom");
    assert.equal(item.isDigital, true);
    assert.equal(item.digitalType, "Flipbook");
    assert.equal(item.digitalDelivery, "onsite");
    assert.equal(item.webReaderLink, "https://example.com/primer-flipbook");
    assert.equal(item.kindleLink, "https://example.com/primer-kindle");
    assert.equal(item.externalAccessLink, "");
    assert.equal(item.externalAccessLabel, "");
    assert.equal(item.externalAccessManual, false);
    assert.equal(item.weight, 0);
    assert.equal(item.length, 0);
    assert.equal(item.width, 0);
    assert.equal(item.height, 0);
  });

  it("digital external custom item keeps link/label/manual, clears webReaderLink", () => {
    const raw = [
      {
        itemType: "custom",
        name: "Sanskrit Portal Access",
        isDigital: true,
        digitalDelivery: "external",
        digitalType: "Web Version",
        externalAccessLink: "https://learn.sanskrit.org/portal",
        externalAccessLabel: "Launch Portal",
        externalAccessManual: true,
        webReaderLink: "https://reader.com/should-be-cleared",
        weight: 100,
        quantity: 1
      }
    ];

    const result = normalizeBundleItems(raw);
    assert.equal(result.length, 1);
    const item = result[0];
    assert.equal(item.itemType, "custom");
    assert.equal(item.isDigital, true);
    assert.equal(item.digitalDelivery, "external");
    assert.equal(item.externalAccessLink, "https://learn.sanskrit.org/portal");
    assert.equal(item.externalAccessLabel, "Launch Portal");
    assert.equal(item.externalAccessManual, true);
    assert.equal(item.webReaderLink, "");
    assert.equal(item.weight, 0);
  });

  it("digital external custom item with invalid link throws error", () => {
    const invalidItems = [
      {
        itemType: "custom",
        name: "Broken Custom Portal",
        isDigital: true,
        digitalDelivery: "external",
        externalAccessLink: "not-a-valid-url"
      }
    ];

    assert.throws(
      () => normalizeBundleItems(invalidItems),
      (err) => {
        assert.match(err.message, /Custom item "Broken Custom Portal":/);
        return true;
      }
    );
  });

  it("comboWeight: a physical custom item 500 g qty 2 + an existing physical 300 g -> 1300", () => {
    const combo = {
      productType: "bundle",
      weight: 0,
      bundleItems: [
        {
          itemType: "custom",
          product: null,
          isDigital: false,
          weight: 500,
          quantity: 2
        },
        {
          itemType: "existing",
          quantity: 1,
          product: { weight: 300, isDigital: false }
        }
      ]
    };

    const totalWeight = computeComboWeightGrams(combo);
    assert.equal(totalWeight, 1300);
  });

  it("comboWeight: a digital custom item adds 0", () => {
    const combo = {
      productType: "bundle",
      weight: 0,
      bundleItems: [
        {
          itemType: "custom",
          product: null,
          isDigital: true,
          weight: 500,
          quantity: 2
        },
        {
          itemType: "existing",
          quantity: 1,
          product: { weight: 300, isDigital: false }
        }
      ]
    };

    const totalWeight = computeComboWeightGrams(combo);
    assert.equal(totalWeight, 300);
  });

  it("normalizeOrderItem: a combo with a custom external manual item -> component accessManual true and line accessManual true", () => {
    const comboProduct = {
      _id: "combo_123",
      name: "Grammar Master Combo",
      productType: "bundle",
      isDigital: false,
      digitalDelivery: "onsite",
      bundleItems: [
        {
          _id: "sub_1",
          itemType: "custom",
          product: null,
          name: "LMS Interactive Portal",
          isDigital: true,
          digitalType: "Web Version",
          digitalDelivery: "external",
          externalAccessLink: "https://lms.example.com",
          externalAccessLabel: "Go to LMS",
          externalAccessManual: true,
          quantity: 1
        }
      ]
    };

    const orderItem = normalizeOrderItem(comboProduct, { quantity: 1 });
    assert.equal(orderItem.accessManual, true);
    assert.equal(orderItem.bundleItems.length, 1);
    const subItem = orderItem.bundleItems[0];
    assert.equal(subItem.accessManual, true);
    assert.equal(subItem.digitalDelivery, "external");
    assert.equal(subItem.externalAccessLink, "https://lms.example.com");
    assert.equal(subItem.externalAccessLabel, "Go to LMS");
  });

  it("normalizeOrderItem: a custom onsite web item -> its webReaderLink and digitalType saved on the component", () => {
    const comboProduct = {
      _id: "combo_456",
      name: "Vedic Chanting Package",
      productType: "bundle",
      isDigital: false,
      bundleItems: [
        {
          _id: "sub_2",
          itemType: "custom",
          product: null,
          name: "Chanting Audio Flipbook",
          isDigital: true,
          digitalType: "Flipbook",
          digitalDelivery: "onsite",
          webReaderLink: "https://flipbook.example.com/chanting",
          kindleLink: "",
          quantity: 1
        }
      ]
    };

    const orderItem = normalizeOrderItem(comboProduct, { quantity: 1 });
    assert.equal(orderItem.bundleItems.length, 1);
    const subItem = orderItem.bundleItems[0];
    assert.equal(subItem.digitalType, "Flipbook");
    assert.equal(subItem.digitalDelivery, "onsite");
    assert.equal(subItem.webReaderLink, "https://flipbook.example.com/chanting");
    assert.equal(subItem.accessManual, false);
  });
});

