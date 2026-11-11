const { describe, it, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Product = require("../models/Product");
const productRoutes = require("../routes/productRoutes");

const {
  resolveBundleFormatsForSave,
  reconcileBundleFormats,
  setFormatChildrenDeleted,
  resolveLinkedOptions,
  reconcileSingleFormats,
  setLinkedOptionsActive
} = productRoutes;

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
  // Link-name (slug) checks made by the Product model before saving.
  const slugUser = (filter) => {
    const [bySlug, byHistory] = filter.$or;
    return [...store.values()].find((row) => idOf(row._id) !== idOf(filter._id.$ne) &&
      (row.slug === bySlug.slug || (row.slugHistory || []).includes(byHistory.slugHistory))) || null;
  };
  mock.method(Product, "exists", async (filter) => (slugUser(filter) ? { _id: slugUser(filter)._id } : null));
  mock.method(Product, "findOne", (filter) => ({ select() { return this; }, lean: async () => slugUser(filter) }));
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
  it("bulk products -> no formats", () => {
    assert.deepEqual(resolveBundleFormatsForSave([{ label: "USB" }], "bulk", items).formats, []);
  });
  it("single products: formats need a price and a type, and keep their own tax settings", () => {
    assert.equal(
      resolveBundleFormatsForSave([{ label: "Print", type: "physical" }], "single", []).error,
      'Format "Print": enter a price.'
    );
    assert.equal(
      resolveBundleFormatsForSave([{ label: "Print", price: 500 }], "single", []).error,
      'Format "Print": choose Physical or Digital.'
    );
    assert.match(
      resolveBundleFormatsForSave([{ label: "Print", type: "physical", price: 500, hsnSac: "49" }], "single", []).error,
      /HSN\/SAC code must be 4 to 8 digits/
    );
    const ok = resolveBundleFormatsForSave(
      [{ label: "Print", type: "physical", price: 500, hsnSac: "4901", gstRate: 0, position: 1 }],
      "single",
      []
    );
    assert.equal(ok.error, "");
    assert.equal(ok.formats[0].hsnSac, "4901");
    assert.equal(ok.formats[0].gstRate, 0);
    assert.equal(ok.formats[0].position, 1);
  });
  it("a format with no items -> clear message", () => {
    assert.equal(resolveBundleFormatsForSave([{ label: "USB" }, { label: "Web" }], "bundle", items).error, 'Format "Web": tick at least one item for it.');
  });
});

// ── Formats of a single product (e.g. a book sold as Print and Web Version) ──
describe("single product formats", () => {
  const book = () =>
    seed({
      name: "Learn Sanskrit Level 1",
      price: 450,
      productType: "single",
      category: "Books",
      description: "Beginner course book",
      image: "https://img/ls1.jpg",
      hsnSac: "4901",
      gstRate: 0,
      webReaderLink: "https://reader/ls1",
      digitalType: "Web Version",
      digitalDelivery: "onsite"
    });
  const print = { key: "", label: "Print", type: "physical", price: 500, stock: 20, weight: 400, length: 24, width: 18, height: 2, hsnSac: "4901", gstRate: 0, position: 0 };
  const web = { key: "", label: "Web Version", type: "digital", price: 300, stock: null, weight: 0, length: 0, width: 0, height: 0, hsnSac: "", gstRate: null, position: 2 };
  const formatsOf = (list) => resolveBundleFormatsForSave(list, "single", []).formats;

  it("creates a hidden product per format with its own price, stock, package and tax", async () => {
    const parent = await book();
    const saved = await reconcileSingleFormats(parent, formatsOf([print, web]), [], {});
    assert.equal(saved.hasOptions, true);
    assert.deepEqual(saved.options.map((o) => o.label), ["Print", "Web Version"]);
    assert.equal(saved.price, 300, "the listing shows the lowest format price");

    const children = [...store.values()].filter((d) => idOf(d.optionParent) === idOf(parent._id));
    const printChild = children.find((c) => c.bundleFormatKey === "print");
    const webChild = children.find((c) => c.bundleFormatKey === "web-version");
    assert.equal(printChild.name, "Learn Sanskrit Level 1 – Print");
    assert.equal(printChild.productType, "single");
    assert.equal(printChild.hideFromListings, true);
    assert.equal(printChild.isDigital, false);
    assert.equal(printChild.stock, 20);
    assert.equal(printChild.weight, 400);
    assert.equal(printChild.webReaderLink, "", "a printed copy never gives online access");
    assert.equal(printChild.hsnSac, "4901");
    assert.equal(printChild.gstRate, 0);

    assert.equal(webChild.isDigital, true);
    assert.equal(webChild.webReaderLink, "https://reader/ls1", "the web version uses the book's access settings");
    assert.equal(webChild.weight, 0);
    assert.equal(webChild.hsnSac, "", "the book's 4901 / 0% is never copied to the web version");
    assert.equal(webChild.gstRate, null);
    assert.equal(webChild.description, "Beginner course book");
  });

  it("links existing products in the admin's order and hides them from the shop", async () => {
    const parent = await book();
    const kindle = await seed({ name: "Learn Sanskrit Level 1 (Kindle)", price: 250, isDigital: true });
    const saved = await reconcileSingleFormats(
      parent,
      formatsOf([print, web]),
      [{ product: String(kindle._id), label: "Kindle", position: 1 }],
      {}
    );
    assert.deepEqual(saved.options.map((o) => o.label), ["Print", "Kindle", "Web Version"]);
    assert.equal(saved.price, 250);
    const linked = store.get(String(kindle._id));
    assert.equal(idOf(linked.optionParent), idOf(parent._id));
    assert.equal(linked.hideFromListings, true);
    assert.equal(linked.price, 250, "the linked product itself is not changed");
  });

  it("unlinking puts the product back in the shop; null keeps a part as it is", async () => {
    const parent = await book();
    const kindle = await seed({ name: "Kindle edition", price: 250, isDigital: true });
    let saved = await reconcileSingleFormats(parent, formatsOf([print]), [{ product: String(kindle._id), label: "Kindle" }], {});

    // Formats not sent: links are updated, formats stay
    saved = await reconcileSingleFormats(saved, null, [], {});
    assert.deepEqual(saved.options.map((o) => o.label), ["Print"]);
    const unlinked = store.get(String(kindle._id));
    assert.equal(unlinked.optionParent, null);
    assert.equal(unlinked.hideFromListings, false);

    // Links not sent: formats are updated, links stay
    saved = await reconcileSingleFormats(saved, formatsOf([print, web]), [{ product: String(kindle._id), label: "Kindle" }], {});
    saved = await reconcileSingleFormats(saved, formatsOf([web]), null, {});
    assert.deepEqual(saved.options.map((o) => o.label).sort(), ["Kindle", "Web Version"]);
    const printChild = [...store.values()].find((d) => d.bundleFormatKey === "print");
    assert.equal(printChild.isDeleted, true, "a removed format goes to the Recycle Bin");
  });

  it("removing every format and link turns the product back into a plain product", async () => {
    const parent = await book();
    let saved = await reconcileSingleFormats(parent, formatsOf([print]), [], {});
    saved = await reconcileSingleFormats(saved, [], [], {});
    assert.equal(saved.hasOptions, false);
    assert.deepEqual(saved.options, []);
    assert.deepEqual(saved.bundleFormats, []);
  });

  it("refuses links that would mix up other listings", async () => {
    const parent = await book();
    const other = await seed({ name: "Other listing", price: 1 });
    const takenElsewhere = await seed({ name: "Already linked", price: 10, optionParent: other._id });
    const comboFormat = await seed({ name: "Combo – USB", price: 10, bundleFormatKey: "usb", optionParent: other._id });
    const withOptions = await seed({ name: "Has options", price: 10, hasOptions: true });

    assert.match(
      (await resolveLinkedOptions([{ product: String(takenElsewhere._id), label: "Print" }], String(parent._id))).error,
      /already a format of another product/
    );
    assert.match(
      (await resolveLinkedOptions([{ product: String(comboFormat._id), label: "USB" }], String(parent._id))).error,
      /format of another product and can't be linked/
    );
    assert.match(
      (await resolveLinkedOptions([{ product: String(withOptions._id), label: "X" }], String(parent._id))).error,
      /options cannot be nested/
    );
    assert.match(
      (await resolveLinkedOptions([{ product: String(parent._id), label: "Self" }], String(parent._id))).error,
      /cannot be an option of itself/
    );
    assert.deepEqual((await resolveLinkedOptions([], String(parent._id))).linked, []);
    assert.equal((await resolveLinkedOptions(undefined, String(parent._id))).linked, undefined);
  });

  it("Recycle Bin: linked products go back to the shop, and are linked again on restore", async () => {
    const parent = await book();
    const kindle = await seed({ name: "Kindle edition", price: 250, isDigital: true });
    const saved = await reconcileSingleFormats(parent, formatsOf([print]), [{ product: String(kindle._id), label: "Kindle" }], {});

    await setLinkedOptionsActive(saved, false);
    assert.equal(store.get(String(kindle._id)).hideFromListings, false);
    assert.equal(store.get(String(kindle._id)).optionParent, null);

    await setLinkedOptionsActive(saved, true);
    assert.equal(store.get(String(kindle._id)).hideFromListings, true);
    assert.equal(idOf(store.get(String(kindle._id)).optionParent), idOf(parent._id));
  });
});
