const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeBundleFormatsInput,
  normalizeItemFormats,
  applyFormatsToItems,
  computeFormatTotal,
  buildFormatChildFields,
  slugify
} = require("../utils/bundleFormats");

const WEB = "507f1f77bcf86cd799439011";
const AUDIO = "507f1f77bcf86cd799439012";
const PARENT = "507f1f77bcf86cd799439099";

// The Narayaneeyam example: one list, items tagged USB / Web
const items = [
  { itemType: "existing", product: WEB, quantity: 1, formats: ["web version"] },
  { itemType: "existing", product: AUDIO, quantity: 1, formats: ["usb"] },
  { _id: "6a0000000000000000000001", itemType: "custom", name: "OTG Pendrive", price: 1800, quantity: 1, formats: ["usb"] },
  { _id: "6a0000000000000000000002", itemType: "custom", name: "Paperback", price: 799, quantity: 1, formats: ["usb", "web version"] }
];
const prices = { [WEB]: 1500, [AUDIO]: 2000 };

describe("bundle formats (pure)", () => {
  describe("normalizeBundleFormatsInput", () => {
    it("keeps order, trims names, makes keys from names, reads price and stock", () => {
      const { formats, error } = normalizeBundleFormatsInput([
        { label: "  USB ", type: "Physical", price: "", stock: "10", weight: "180", length: "12", width: "8.5", height: "" },
        { label: "Web Version", type: "digital", price: "1999", stock: "" }
      ]);
      assert.equal(error, "");
      assert.deepEqual(formats, [
        { key: "usb", label: "USB", type: "physical", price: null, stock: 10, weight: 180, length: 12, width: 8.5, height: 0 },
        { key: "web-version", label: "Web Version", type: "digital", price: 1999, stock: null, weight: 0, length: 0, width: 0, height: 0 }
      ]);
    });

    it("rejects a negative package size", () => {
      assert.match(normalizeBundleFormatsInput([{ label: "USB", weight: -5 }]).error, /^Format 1: weight must be 0 or more/);
      assert.match(normalizeBundleFormatsInput([{ label: "USB", height: "x" }]).error, /^Format 1: height must be 0 or more/);
    });

    it("an unknown or missing type becomes '' (follow the items)", () => {
      const { formats } = normalizeBundleFormatsInput([{ label: "A", type: "boxed" }, { label: "B" }]);
      assert.equal(formats[0].type, "");
      assert.equal(formats[1].type, "");
    });

    it("keeps a valid key sent back by the form (so renaming a format keeps its product)", () => {
      const { formats } = normalizeBundleFormatsInput([{ key: "usb", label: "USB Drive" }]);
      assert.equal(formats[0].key, "usb");
      assert.equal(formats[0].label, "USB Drive");
    });

    it("rejects a missing name, a duplicate name, a negative price or stock, and more than 8", () => {
      assert.match(normalizeBundleFormatsInput([{ label: "" }]).error, /^Format 1: add a name/);
      assert.match(normalizeBundleFormatsInput([{ label: "USB" }, { label: "usb" }]).error, /^Format 2: "usb" is already listed/);
      assert.match(normalizeBundleFormatsInput([{ label: "USB", price: -1 }]).error, /price must be 0 or more/);
      assert.match(normalizeBundleFormatsInput([{ label: "USB", stock: -2 }]).error, /stock must be 0 or more/);
      const nine = Array.from({ length: 9 }, (_, i) => ({ label: `F${i}` }));
      assert.equal(normalizeBundleFormatsInput(nine).error, "At most 8 formats.");
    });

    it("no formats sent -> empty list without error", () => {
      assert.deepEqual(normalizeBundleFormatsInput(undefined), { formats: [], error: "" });
      assert.deepEqual(normalizeBundleFormatsInput([]), { formats: [], error: "" });
    });

    it("two names that make the same key still get different keys", () => {
      const { formats } = normalizeBundleFormatsInput([{ label: "Web Version" }, { label: "Web-Version!" }]);
      assert.equal(formats[0].key, "web-version");
      assert.equal(formats[1].key, "web-version-2");
    });
  });

  it("normalizeItemFormats trims, lower-cases and removes duplicates", () => {
    assert.deepEqual(normalizeItemFormats([" USB", "usb", "Web Version", ""]), ["usb", "web version"]);
    assert.deepEqual(normalizeItemFormats("usb"), []);
  });

  describe("applyFormatsToItems", () => {
    const { formats } = normalizeBundleFormatsInput([{ label: "USB" }, { label: "Web Version" }]);

    it("maps tags given as names or keys to keys and drops unknown tags", () => {
      const { items: mapped, error } = applyFormatsToItems(formats, [
        { name: "A", formats: ["usb", "pdf"] },
        { name: "B", formats: ["web-version"] }
      ]);
      assert.equal(error, "");
      assert.deepEqual(mapped.map((i) => i.formats), [["usb"], ["web-version"]]);
    });

    it("rejects a format with no items ticked", () => {
      const { error } = applyFormatsToItems(formats, [{ name: "A", formats: ["usb"] }]);
      assert.equal(error, 'Format "Web Version": tick at least one item for it.');
    });

    it("no formats -> every item's tags are cleared", () => {
      const { items: mapped } = applyFormatsToItems([], [{ name: "A", formats: ["usb"] }]);
      assert.deepEqual(mapped[0].formats, []);
    });
  });

  describe("computeFormatTotal", () => {
    const { formats } = normalizeBundleFormatsInput([{ label: "USB" }, { label: "Web Version" }]);
    const { items: mapped } = applyFormatsToItems(formats, items);

    it("USB = Audio Device 2000 + OTG 1800 + Paperback 799 = 4599", () => {
      assert.equal(computeFormatTotal(mapped, "usb", prices), 4599);
    });

    it("Web Version = Web 1500 + Paperback 799 = 2299", () => {
      assert.equal(computeFormatTotal(mapped, "web-version", prices), 2299);
    });

    it("counts quantity and uses the linked product's current price", () => {
      const twoBooks = [{ product: WEB, quantity: 2, price: 1, formats: ["usb"] }];
      assert.equal(computeFormatTotal(twoBooks, "usb", new Map([[WEB, 1500]])), 3000);
    });
  });

  describe("buildFormatChildFields", () => {
    const { formats } = normalizeBundleFormatsInput([
      { label: "USB", stock: 7 },
      { label: "Web Version", price: 1999 }
    ]);
    const { items: mapped } = applyFormatsToItems(formats, items);
    const parent = {
      _id: PARENT,
      name: "Complete Sriman Narayaneeyam",
      category: "Combos",
      image: "https://img/x.jpg",
      images: ["https://img/x.jpg"],
      description: "All formats",
      isDigital: false,
      festiveOffer: false,
      bundleItems: mapped
    };

    it("USB child: hidden combo with only the USB items, auto price, the given stock", () => {
      const f = buildFormatChildFields(parent, formats[0], mapped, prices);
      assert.equal(f.name, "Complete Sriman Narayaneeyam – USB");
      assert.equal(f.productType, "bundle");
      assert.equal(f.price, 4599);
      assert.equal(f.stock, 7);
      assert.equal(f.hideFromListings, true);
      assert.equal(f.optionParent, PARENT);
      assert.equal(f.bundleFormatKey, "usb");
      assert.equal(f.hasOptions, false);
      assert.equal(f.category, "Combos");
      assert.equal(f.image, "https://img/x.jpg");
      assert.deepEqual(f.bundleItems.map((i) => i.name || String(i.product)), [AUDIO, "OTG Pendrive", "Paperback"]);
      assert.ok(f.bundleItems.every((i) => i.formats === undefined), "format tags are not copied to the child");
    });

    it("custom items keep their id in the child (so past orders can still refresh their links)", () => {
      const f = buildFormatChildFields(parent, formats[0], mapped, prices);
      const otg = f.bundleItems.find((i) => i.name === "OTG Pendrive");
      assert.equal(otg._id, "6a0000000000000000000001");
    });

    it("Web child: manual price wins; no stock sent -> stock left out (child keeps its own)", () => {
      const f = buildFormatChildFields(parent, formats[1], mapped, prices);
      assert.equal(f.price, 1999);
      assert.equal("stock" in f, false);
      assert.deepEqual(f.bundleItems.map((i) => i.name || String(i.product)), [WEB, "Paperback"]);
    });
  });

  describe("digital or physical follows the format's own items (not the combo)", () => {
    // A combo marked digital with "team gives access" (like Learn Basic Sanskrit)
    const digitalCombo = {
      _id: PARENT,
      name: "Learn Basic Sanskrit",
      isDigital: true,
      digitalDelivery: "external",
      externalAccessLink: "https://sfh.example/access",
      externalAccessLabel: "Open course",
      externalAccessManual: true
    };
    const { formats } = normalizeBundleFormatsInput([{ label: "USB" }, { label: "Web version" }, { label: "Mixed" }]);
    const comboItems = [
      { itemType: "custom", name: "USB Stick", price: 900, quantity: 1, isDigital: false, formats: ["usb"] },
      { itemType: "custom", name: "Printed Workbook", price: 600, quantity: 1, isDigital: false, formats: ["usb", "mixed"] },
      { itemType: "existing", product: WEB, quantity: 1, formats: ["web version", "mixed"] }
    ];
    const { items: mapped } = applyFormatsToItems(formats, comboItems);
    const digitalById = { [WEB]: true };

    it("USB (only physical items): not digital, ships, no access link and no 24-48h note", () => {
      const f = buildFormatChildFields(digitalCombo, formats[0], mapped, prices, digitalById);
      assert.equal(f.isDigital, false);
      assert.equal(f.digitalDelivery, "onsite");
      assert.equal(f.externalAccessLink, "");
      assert.equal(f.externalAccessLabel, "");
      assert.equal(f.externalAccessManual, false);
    });

    it("Web version (only digital items): digital and keeps the combo's access settings", () => {
      const f = buildFormatChildFields(digitalCombo, formats[1], mapped, prices, digitalById);
      assert.equal(f.isDigital, true);
      assert.equal(f.digitalDelivery, "external");
      assert.equal(f.externalAccessLink, "https://sfh.example/access");
      assert.equal(f.externalAccessManual, true);
    });

    it("Mixed (book + web): ships (not digital) but keeps the access settings for its digital part", () => {
      const f = buildFormatChildFields(digitalCombo, formats[2], mapped, prices, digitalById);
      assert.equal(f.isDigital, false);
      assert.equal(f.digitalDelivery, "external");
      assert.equal(f.externalAccessManual, true);
    });

    it("a catalogue item uses the linked product's digital flag over the item's own copy", () => {
      const stale = [{ itemType: "existing", product: WEB, isDigital: false, quantity: 1, formats: ["usb"] }];
      const f = buildFormatChildFields(digitalCombo, formats[0], stale, prices, { [WEB]: true });
      assert.equal(f.isDigital, true);
    });
  });

  it("slugify makes simple keys", () => {
    assert.equal(slugify("Web Version"), "web-version");
    assert.equal(slugify("  ಪುಸ್ತಕ "), "format");
  });
});
