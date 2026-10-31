const test = require("node:test");
const assert = require("node:assert/strict");

test("couponMatching (frontend): product coupons follow the server's cart-line rule", async (t) => {
  const {
    couponProductIds,
    isProductCoupon,
    couponEligibleItems,
    couponEligibleTotal,
    couponsForProduct
  } = await import("../../src/utils/couponMatching.js");

  const storewide = { code: "ALL10", applicableProducts: [] };
  const legacyStorewide = { code: "OLD" };
  const bookCoupon = { code: "BOOK", applicableProducts: [{ _id: "p1", name: "Book" }] };
  const twoProducts = { code: "PAIR", applicableProducts: [{ _id: "p1", name: "Book" }, { _id: "p3", name: "Audio" }] };
  const removedProduct = { code: "GONE", applicableProducts: [{ _id: "p9", name: "" }] };

  const cart = [
    { _id: "p1", id: "p1", name: "Book", price: 300, quantity: 2 },
    { id: "p2", name: "Pen", price: 50, quantity: 1 }
  ];

  await t.test("storewide coupons have no product list and cover every line", () => {
    assert.equal(isProductCoupon(storewide), false);
    assert.equal(isProductCoupon(legacyStorewide), false);
    assert.equal(couponEligibleItems(storewide, cart).length, 2);
    assert.equal(couponEligibleTotal(storewide, cart), 650);
  });

  await t.test("a product coupon only covers its own products", () => {
    assert.deepEqual(couponProductIds(bookCoupon), ["p1"]);
    assert.deepEqual(couponEligibleItems(bookCoupon, cart).map((i) => i.name), ["Book"]);
    assert.equal(couponEligibleTotal(bookCoupon, cart), 600);
    assert.equal(couponEligibleTotal(twoProducts, cart), 600);
  });

  await t.test("a product coupon is not offered when its product is not in the cart", () => {
    assert.equal(couponEligibleItems(bookCoupon, [{ _id: "p2", price: 50, quantity: 1 }]).length, 0);
  });

  await t.test("a coupon whose product was removed never looks storewide", () => {
    assert.equal(isProductCoupon(removedProduct), true);
    assert.equal(couponEligibleItems(removedProduct, cart).length, 0);
  });

  await t.test("plain id strings are accepted as well as {_id, name}", () => {
    assert.deepEqual(couponProductIds({ applicableProducts: ["p1", { _id: "p3" }] }), ["p1", "p3"]);
  });

  await t.test("couponsForProduct lists only coupons made for that product", () => {
    const all = [storewide, bookCoupon, twoProducts, removedProduct];
    assert.deepEqual(couponsForProduct(all, "p1").map((c) => c.code), ["BOOK", "PAIR"]);
    assert.deepEqual(couponsForProduct(all, "p3").map((c) => c.code), ["PAIR"]);
    assert.deepEqual(couponsForProduct(all, "p2"), []);
    assert.deepEqual(couponsForProduct(all, ""), []);
  });
});
