const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/utils/accessStatus.js");

// A USB format of a combo: the name says "Web-version", the items are shipped copies.
const usbOrderItem = {
  name: "All Products Bundle Web-version – USB",
  productType: "bundle",
  isDigital: false,
  format: "",
  digitalDelivery: "onsite",
  bundleItems: [
    { name: "Starter's Kit to Indian Culture – Web Version", isDigital: false, digitalType: "USB", webReaderLink: "", kindleLink: "" },
    { name: "Ramayana Ratnamala – Digital Flipbook", isDigital: false, digitalType: "USB", webReaderLink: "", kindleLink: "" }
  ]
};

test("USB combo format is not digital even though its name says Web-version", async () => {
  const { itemGivesOnlineAccess } = await load();
  assert.equal(itemGivesOnlineAccess(usbOrderItem), false);
});

test("Web Version combo format is digital", async () => {
  const { itemGivesOnlineAccess } = await load();
  const web = {
    ...usbOrderItem,
    name: "All Products Bundle Web-version – Web Version",
    isDigital: true,
    bundleItems: usbOrderItem.bundleItems.map((c) => ({ ...c, isDigital: true, webReaderLink: "https://reader.test/x" }))
  };
  assert.equal(itemGivesOnlineAccess(web), true);
});

test("mixed combo (book + web version) still shows online access", async () => {
  const { itemGivesOnlineAccess } = await load();
  const mixed = {
    name: "Gita Kit",
    isDigital: false,
    bundleItems: [
      { name: "Gita Book", isDigital: false },
      { name: "Gita Web Version", isDigital: true, webReaderLink: "https://reader.test/g" }
    ]
  };
  assert.equal(itemGivesOnlineAccess(mixed), true);
});

test("single items: flags win; the name is only a guess for old items without a flag", async () => {
  const { itemGivesOnlineAccess } = await load();
  assert.equal(itemGivesOnlineAccess({ name: "Gita – Print", isDigital: false }), false);
  assert.equal(itemGivesOnlineAccess({ name: "Gita Web Version", isDigital: true }), true);
  assert.equal(itemGivesOnlineAccess({ name: "Gita Web Version" }), true); // old/imported item
  assert.equal(itemGivesOnlineAccess({ name: "Old Pack", bundleItems: [{ name: "Sandhi Flipbook" }] }), true);
  assert.equal(itemGivesOnlineAccess({ name: "Course", isDigital: false, digitalDelivery: "external" }), true);
  assert.equal(itemGivesOnlineAccess({ name: "Gita", isDigital: false, kindleLink: "https://amazon.in/k" }), true);
  assert.equal(itemGivesOnlineAccess(null), false);
});
