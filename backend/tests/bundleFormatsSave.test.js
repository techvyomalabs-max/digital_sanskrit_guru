const { describe, it, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Product = require("../models/Product");
const productRoutes = require("../routes/productRoutes");

const { resolveBundleFormatsForSave, reconcileBundleFormats, setFormatChildrenDeleted } = productRoutes;

// ── A tiny in-memory stand-in for the products collection (real Product documents, no database) ──
let store;
const idOf = (v) => String(v?._id || v || "");
const matches = (doc, filter = {}) =>
  Object.entries(filter).every(([field, cond]) => {
    const value = doc[field];
    if (cond && typeof cond === "object" && !(cond instanceof mongoose.Types.ObjectId)) {
      if (cond.$in) return cond.$in.map(String).includes(String(value));
      if (cond.$nin) return !cond.$nin.map((x) => (x === null ? "null" : String(x))).includes(value === null || value === undefined ? "null" : String(value));
      if (cond.$ne !== undefined) return String(value) !== String(cond.$ne);
    }
    return idOf(value) === idOf(cond);
  });

class FakeQuery {
  constructor(filter) { this.filter = filter; this.isLean = false; }
  select() { return this; }
  lean() { this.isLean = true; return this; }
  then(resolve, reject) {
    try {
      const rows = [...store.values()].filter((d) => matches(d, this.filter));
      resolve(this.isLean ? rows.map((r) => JSON.parse(JSON.stringify(r))) : rows.map((r) => Product.hydrate(JSON.parse(JSON.stringify(r)))));
    } catch (e) { reject(e); }
  }
}

const put = async (doc) => {
  await doc.validate();
  store.set(String(doc._id), JSON.parse(JSON.stringify(doc.toObject())));
  return doc;
};

beforeEach(() => {
  store = new Map();
  mock.method(Product, "find", (filter) => new FakeQuery(filter));
  mock.method(Product, "findById", (id) => ({ lean: async () => JSON.parse(JSON.stringify(store.get(String(id)) || null)) }));
  mock.method(Product, "create", async (fields) => put(new Product(fields)));
  mock.method(Product.prototype, "save", async function save() { return put(this); });
  mock.method(Product, "updateOne", async (filter, update) => {
    const row = store.get(idOf(filter._id));
    Object.assign(row, JSON.parse(JSON.stringify(update.$set)));
    await put(Product.hydrate(row));
    return { modifiedCount: 1 };
  });
  mock.method(Product, "updateMany", async (filter, update) => {
    let n = 0;
    for (const row of store.values()) {
      if (matches(row, filter)) { Object.assign(row, JSON.parse(JSON.stringify(update.$set))); n += 1; }
    }
    return { modifiedCount: n };
  });
});
afterEach(() => mock.restoreAll());

const seed = (fields) => put(new Product({ price: 0, ...fields }));

async function setup() {
  const web = await seed({ name: "Narayaneeyam Companion: Web Version", price: 1500, isDigital: true });
  const audio = await seed({ name: "Sriman Narayaneeyam Audio Device", price: 2000, stock: 9 });
  const items = [
    { itemType: "existing", product: web._id, quantity: 1, formats: ["Web Version", "Online"] },
    { itemType: "existing", product: audio._id, quantity: 1, formats: ["USB"] },
    { itemType: "custom", name: "OTG Pendrive", price: 1800, quantity: 1, formats: ["USB"] },
    { itemType: "custom", name: "Hard Copy Paperback Book", price: 799, quantity: 1, formats: ["USB", "Web Version"] }
  ];
  return { web, audio, items };
}

async function saveCombo(items, rawFormats, existing = null) {
  const res = resolveBundleFormatsForSave(rawFormats, "bundle", items);
  assert.equal(res.error, "");
  let combo;
  if (existing) {
    existing.bundleItems = res.items;
    combo = await existing.save();
  } else {
    combo = await Product.create({ name: "Complete Sriman Narayaneeyam", productType: "bundle", price: 6099, category: "Combos", bundleItems: res.items });
  }
  const saved = await reconcileBundleFormats(combo, res.formats, { name: "Admin", email: "a@x.in" });
  return { saved, combo };
}

const children = () => [...store.values()].filter((d) => d.bundleFormatKey);

describe("combo formats: saving creates one hidden combo per format", () => {
  it("first save: USB ₹4599 (stock 7), Web Version ₹2299, Online ₹1500 (digital); combo shows 'from' ₹1500", async () => {
    const { items } = await setup();
    const { saved } = await saveCombo(items, [
      { label: "USB", stock: 7 },
      { label: "Web Version", stock: 5 },
      { label: "Online" }
    ]);

    const kids = children();
    assert.equal(kids.length, 3);
    const usb = kids.find((k) => k.bundleFormatKey === "usb");
    const webF = kids.find((k) => k.bundleFormatKey === "web-version");
    const online = kids.find((k) => k.bundleFormatKey === "online");

    assert.equal(usb.name, "Complete Sriman Narayaneeyam – USB");
    assert.equal(usb.price, 4599);
    assert.equal(usb.stock, 7);
    assert.equal(usb.productType, "bundle");
    assert.equal(usb.hideFromListings, true);
    assert.equal(String(usb.optionParent), String(saved._id));
    assert.deepEqual(usb.bundleItems.map((i) => i.name || "linked"), ["linked", "OTG Pendrive", "Hard Copy Paperback Book"]);

    assert.equal(webF.price, 2299);
    assert.equal(webF.isDigital, false, "a format with a paperback is not digital-only");
    assert.equal(online.price, 1500);
    assert.equal(online.isDigital, true, "a format with only digital items is digital");

    assert.equal(saved.hasOptions, true);
    assert.deepEqual(saved.options.map((o) => o.label), ["USB", "Web Version", "Online"]);
    assert.deepEqual(saved.bundleFormats.map((f) => [f.key, f.label, f.price]), [["usb", "USB", null], ["web-version", "Web Version", null], ["online", "Online", null]]);
    assert.equal(String(saved.bundleFormats[0].product), String(usb._id));
    assert.equal(saved.price, 1500, "combo 'from' price = cheapest format");
    assert.equal(saved.stock, 7 + 5 + 1, "stock = USB 7 + Web 5 + digital Online counts 1");
  });

  it("second save: rename + manual price keep the same USB product; a removed format is hidden; past ids stay", async () => {
    const { items } = await setup();
    const first = await saveCombo(items, [{ label: "USB", stock: 7 }, { label: "Web Version", stock: 5 }, { label: "Online" }]);
    const usbId = String(children().find((k) => k.bundleFormatKey === "usb")._id);
    const webId = String(children().find((k) => k.bundleFormatKey === "web-version")._id);

    const comboDoc = Product.hydrate(JSON.parse(JSON.stringify(store.get(String(first.saved._id)))));
    const itemsAgain = comboDoc.bundleItems.map((i) => {
      const o = i.toObject();
      return { ...o, product: o.product || null, formats: o.formats.filter((f) => f !== "web-version") };
    });
    const { saved } = await saveCombo(itemsAgain, [{ key: "usb", label: "USB Drive", price: 3999, stock: 4 }, { key: "online", label: "Online" }], comboDoc);

    const usb = store.get(usbId);
    assert.equal(usb.name, "Complete Sriman Narayaneeyam – USB Drive");
    assert.equal(usb.price, 3999);
    assert.equal(usb.stock, 4);
    assert.equal(usb.isDeleted, false);
    assert.equal(store.get(webId).isDeleted, true, "Web Version product is hidden, not removed (orders keep working)");
    assert.deepEqual(saved.options.map((o) => o.label), ["USB Drive", "Online"]);
    assert.equal(saved.price, 1500);
  });

  it("a later save without a stock keeps the format's current stock (e.g. after sales)", async () => {
    const { items } = await setup();
    const first = await saveCombo(items, [{ label: "USB", stock: 7 }, { label: "Web Version", stock: 5 }, { label: "Online" }]);
    const usbId = String(children().find((k) => k.bundleFormatKey === "usb")._id);
    store.get(usbId).stock = 3; // two sets sold
    const comboDoc = Product.hydrate(JSON.parse(JSON.stringify(store.get(String(first.saved._id)))));
    const again = comboDoc.bundleItems.map((i) => i.toObject());
    await saveCombo(again, [{ key: "usb", label: "USB" }, { key: "web-version", label: "Web Version" }, { key: "online", label: "Online" }], comboDoc);
    assert.equal(store.get(usbId).stock, 3);
  });

  it("a combo marked digital with team access: the physical USB format is not digital and has no 24-48h access", async () => {
    const { items } = await setup();
    const res = resolveBundleFormatsForSave([{ label: "USB", stock: 7 }, { label: "Online" }], "bundle",
      items.map((i) => ({ ...i, formats: i.formats.filter((f) => ["USB", "Online"].includes(f)) })));
    assert.equal(res.error, "");
    const combo = await Product.create({
      name: "Learn Basic Sanskrit", productType: "bundle", price: 2500, bundleItems: res.items,
      isDigital: true, digitalDelivery: "external", externalAccessLink: "https://sfh.example/a", externalAccessManual: true
    });
    await reconcileBundleFormats(combo, res.formats, {});
    const usb = children().find((k) => k.bundleFormatKey === "usb");
    const online = children().find((k) => k.bundleFormatKey === "online");
    assert.equal(usb.isDigital, false);
    assert.equal(usb.digitalDelivery, "onsite");
    assert.equal(usb.externalAccessManual, false);
    assert.equal(usb.externalAccessLink, "");
    assert.equal(online.isDigital, true);
    assert.equal(online.digitalDelivery, "external");
    assert.equal(online.externalAccessManual, true);
  });

  it("the same web products ticked for USB and Web: USB (Physical) is shipped, keeps no web link, Web gets access", async () => {
    const level1 = await seed({ name: "Learn Sanskrit - Level 1", image: "l1.png", price: 1000, isDigital: true, webReaderLink: "https://reader/l1" });
    const vocab = await seed({ name: "Sanskrit Vocabulary Builder 1", image: "v1.png", price: 1500, isDigital: true });
    const items = [
      { itemType: "existing", product: level1._id, quantity: 1, formats: ["USB", "Web version"] },
      { itemType: "existing", product: vocab._id, quantity: 1, formats: ["USB", "Web version"] }
    ];
    const res = resolveBundleFormatsForSave(
      [{ label: "USB", type: "physical", price: 2375, stock: 12, weight: 150, length: 15, width: 10, height: 3 },
        { label: "Web version", type: "digital", price: 1900, weight: 999 }],
      "bundle", items);
    assert.equal(res.error, "");
    const combo = await Product.create({
      name: "Learn Basic Sanskrit", productType: "bundle", price: 2500, bundleItems: res.items,
      isDigital: true, digitalDelivery: "external", externalAccessLink: "https://sfh.example/a", externalAccessManual: true
    });
    const saved = await reconcileBundleFormats(combo, res.formats, {});
    const usb = children().find((k) => k.bundleFormatKey === "usb");
    const webF = children().find((k) => k.bundleFormatKey === "web-version");

    assert.equal(usb.isDigital, false);
    assert.equal(usb.digitalDelivery, "onsite");
    assert.equal(usb.externalAccessManual, false);
    assert.equal(usb.stock, 12);
    assert.equal(usb.price, 2375);
    assert.deepEqual(
      usb.bundleItems.map((i) => [i.itemType, i.product, i.name, i.image, i.price, i.isDigital, i.webReaderLink, i.digitalType]),
      [
        ["custom", null, "Learn Sanskrit - Level 1", "l1.png", 1000, false, "", "USB"],
        ["custom", null, "Sanskrit Vocabulary Builder 1", "v1.png", 1500, false, "", "USB"]
      ],
      "USB keeps plain copies, so buying it gives no reader access and doesn't touch the web products"
    );

    assert.deepEqual([usb.weight, usb.length, usb.width, usb.height], [150, 15, 10, 3], "USB package size is used for delivery");

    assert.equal(webF.isDigital, true);
    assert.equal(webF.weight, 0, "a digital format never has a shipping weight");
    assert.equal(webF.externalAccessManual, true);
    assert.deepEqual(webF.bundleItems.map((i) => String(i.product)), [String(level1._id), String(vocab._id)]);
    assert.deepEqual(saved.bundleFormats.map((f) => [f.key, f.type, f.weight]), [["usb", "physical", 150], ["web-version", "digital", 999]]);
  });

  it("a Physical format keeps physical catalogue products linked (their stock still goes down)", async () => {
    const { items } = await setup();
    const res = resolveBundleFormatsForSave([{ label: "USB", type: "physical", stock: 4 }, { label: "Online", type: "digital" }], "bundle",
      items.map((i) => ({ ...i, formats: i.formats.filter((f) => ["USB", "Online"].includes(f)).concat(i.formats.includes("Web Version") && i.product ? ["USB"] : []) })));
    assert.equal(res.error, "");
    const combo = await Product.create({ name: "Combo", productType: "bundle", price: 1, bundleItems: res.items });
    await reconcileBundleFormats(combo, res.formats, {});
    const usb = children().find((k) => k.bundleFormatKey === "usb");
    const byName = (n) => usb.bundleItems.find((i) => i.name === n);
    const linkedAudio = usb.bundleItems.find((i) => i.product);
    assert.equal(linkedAudio.itemType, "existing", "the audio device stays linked");
    assert.equal(byName("Narayaneeyam Companion: Web Version").itemType, "custom", "the web product becomes a shipped copy");
    assert.equal(byName("Narayaneeyam Companion: Web Version").isDigital, false);
    assert.equal(byName("OTG Pendrive").itemType, "custom");
    assert.equal(usb.isDigital, false);
  });

  it("removing every format turns the combo back into one set", async () => {
    const { items } = await setup();
    const first = await saveCombo(items, [{ label: "USB", stock: 7 }, { label: "Web Version" }, { label: "Online" }]);
    const comboDoc = Product.hydrate(JSON.parse(JSON.stringify(store.get(String(first.saved._id)))));
    const { saved } = await saveCombo(comboDoc.bundleItems.map((i) => i.toObject()), [], comboDoc);
    assert.equal(saved.hasOptions, false);
    assert.deepEqual(saved.options, []);
    assert.deepEqual(saved.bundleFormats, []);
    assert.ok(children().every((k) => k.isDeleted === true));
  });

  it("deleting / restoring the combo hides / brings back its formats", async () => {
    const { items } = await setup();
    const { saved } = await saveCombo(items, [{ label: "USB", stock: 7 }, { label: "Web Version" }, { label: "Online" }]);
    await setFormatChildrenDeleted(saved, true, { name: "Admin" });
    assert.ok(children().every((k) => k.isDeleted === true));
    await setFormatChildrenDeleted(saved, false);
    assert.ok(children().every((k) => k.isDeleted === false));
  });
});

describe("resolveBundleFormatsForSave", () => {
  const items = [{ name: "A", formats: ["USB"] }, { name: "B", formats: [] }];
  it("not sent -> formats undefined (left as they are)", () => {
    assert.equal(resolveBundleFormatsForSave(undefined, "bundle", items).formats, undefined);
  });
  it("not a combo -> no formats", () => {
    assert.deepEqual(resolveBundleFormatsForSave([{ label: "USB" }], "single", items).formats, []);
  });
  it("a format with no items -> clear message", () => {
    assert.equal(resolveBundleFormatsForSave([{ label: "USB" }, { label: "Web" }], "bundle", items).error, 'Format "Web": tick at least one item for it.');
  });
});
