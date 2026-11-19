const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeBundleFormatsInput, buildSingleFormatChildFields } = require("../utils/bundleFormats");

const parent = {
  _id: "p".repeat(24),
  name: "Gita Dhyanam",
  image: "https://cdn.test/main.jpg",
  images: ["https://cdn.test/main.jpg", "https://cdn.test/back.jpg"],
  webReaderLink: "https://reader.test/main",
  digitalType: "Web Version",
  category: "Books"
};

test("formats accept a product type, own image, overseas price and online access", () => {
  const { formats, error } = normalizeBundleFormatsInput([
    { label: "Audio Book", type: "digital", price: 249, typeKey: "audio-book", image: "https://cdn.test/audio.jpg", internationalPrice: "6.5", digital: { digitalType: "Audio Book", webReaderLink: "https://cdn.test/gita.mp3" } }
  ]);
  assert.equal(error, "");
  assert.equal(formats[0].typeKey, "audio-book");
  assert.equal(formats[0].internationalPrice, 6.5);
  assert.equal(formats[0].digital.webReaderLink, "https://cdn.test/gita.mp3");
  assert.equal(formats[0].digital.digitalDelivery, "onsite");
});

test("format checks: image must be https, links must be web addresses, prices 0 or more", () => {
  assert.ok(normalizeBundleFormatsInput([{ label: "A", type: "digital", price: 1, image: "http://x.test/a.jpg" }]).error);
  assert.ok(normalizeBundleFormatsInput([{ label: "A", type: "digital", price: 1, internationalPrice: -1 }]).error);
  assert.ok(normalizeBundleFormatsInput([{ label: "A", type: "digital", price: 1, digital: { webReaderLink: "javascript:alert(1)" } }]).error);
  assert.ok(normalizeBundleFormatsInput([{ label: "A", type: "digital", price: 1, digital: { digitalDelivery: "external" } }]).error, "external needs a link");
  assert.ok(normalizeBundleFormatsInput([{ label: "A", type: "digital", price: 1, typeKey: "Bad Key!" }]).error);
});

test("older saves without the new fields work as before", () => {
  const { formats } = normalizeBundleFormatsInput([{ label: "Web Version", type: "digital", price: 99 }]);
  assert.equal(formats[0].typeKey, undefined);
  assert.equal(formats[0].digital, undefined);
  const child = buildSingleFormatChildFields(parent, formats[0]);
  assert.equal(child.webReaderLink, "https://reader.test/main", "uses the main product's access");
  assert.equal(child.internationalPrice, null);
  assert.equal(child.image, parent.image);
  assert.equal(child.formatTypeKey, "");
});

test("two digital formats get their own access, image and tax", () => {
  const { formats } = normalizeBundleFormatsInput([
    { label: "Web Version", type: "digital", price: 169, typeKey: "web-version", digital: { webReaderLink: "https://reader.test/gita" } },
    { label: "Audio Book", type: "digital", price: 249, typeKey: "audio-book", image: "https://cdn.test/audio.jpg", digital: { digitalType: "Audio Book", webReaderLink: "https://cdn.test/gita.mp3" } }
  ]);
  const web = buildSingleFormatChildFields(parent, formats[0], { hsnSac: "998433", gstRate: 18 });
  const audio = buildSingleFormatChildFields(parent, formats[1], { hsnSac: "998433", gstRate: 18 });
  assert.equal(web.webReaderLink, "https://reader.test/gita");
  assert.equal(audio.webReaderLink, "https://cdn.test/gita.mp3");
  assert.equal(audio.digitalType, "Audio Book");
  assert.equal(audio.image, "https://cdn.test/audio.jpg");
  assert.deepEqual(audio.images, ["https://cdn.test/audio.jpg", "https://cdn.test/main.jpg", "https://cdn.test/back.jpg"]);
  assert.deepEqual([audio.hsnSac, audio.gstRate, audio.formatTypeKey], ["998433", 18, "audio-book"]);
});

test("a physical format never gets online access, even if some was sent", () => {
  const { formats } = normalizeBundleFormatsInput([{ label: "Paper", type: "physical", price: 299, weight: 400, typeKey: "paper", digital: { webReaderLink: "https://reader.test/x" } }]);
  const child = buildSingleFormatChildFields(parent, formats[0], { hsnSac: "4901", gstRate: 0 });
  assert.equal(child.isDigital, false);
  assert.equal(child.webReaderLink, "");
  assert.equal(child.weight, 400);
  assert.deepEqual([child.hsnSac, child.gstRate], ["4901", 0]);
});

test("a digital format with no link of its own uses the main product's link", () => {
  const { formats } = normalizeBundleFormatsInput([{ label: "Web Version", type: "digital", price: 99, typeKey: "web-version", digital: { webReaderLink: "" } }]);
  const child = buildSingleFormatChildFields(parent, formats[0]);
  assert.equal(child.webReaderLink, "https://reader.test/main");
});
