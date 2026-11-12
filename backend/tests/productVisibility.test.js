const { describe, it, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Product = require("../models/Product");
const { setProductVisibility } = require("../routes/productRoutes");

let saved;
const make = (fields) => new Product({ name: "Gita", price: 100, ...fields });

describe("show or hide a product in the shop", () => {
  beforeEach(() => {
    saved = [];
    mock.method(Product.prototype, "save", async function save() {
      saved.push(this.toObject());
      return this;
    });
  });
  afterEach(() => mock.restoreAll());

  it("hides and shows a normal product", async () => {
    const product = make({});
    mock.method(Product, "findById", async () => product);
    const hidden = await setProductVisibility(String(product._id), true, { name: "Admin", email: "a@x" });
    assert.equal(hidden.status, 200);
    assert.equal(product.hideFromListings, true);
    assert.equal(product.lastUpdatedByName, "Admin");
    const shown = await setProductVisibility(String(product._id), false);
    assert.equal(shown.status, 200);
    assert.equal(product.hideFromListings, false);
    assert.equal(saved.length, 2);
  });

  it("leaves formats and linked products to their main listing", async () => {
    const parent = new mongoose.Types.ObjectId();
    for (const fields of [{ bundleFormatKey: "print", optionParent: parent }, { optionParent: parent }]) {
      const product = make(fields);
      mock.method(Product, "findById", async () => product);
      const result = await setProductVisibility(String(product._id), false);
      assert.equal(result.status, 400);
      assert.match(result.message, /format of another product/);
    }
    assert.equal(saved.length, 0);
  });

  it("refuses bad input and missing or deleted products", async () => {
    assert.equal((await setProductVisibility("not-an-id", true)).status, 404);
    const product = make({});
    mock.method(Product, "findById", async () => product);
    assert.equal((await setProductVisibility(String(product._id), "yes")).status, 400);
    product.isDeleted = true;
    assert.equal((await setProductVisibility(String(product._id), true)).status, 404);
    mock.method(Product, "findById", async () => null);
    assert.equal((await setProductVisibility(String(new mongoose.Types.ObjectId()), true)).status, 404);
    assert.equal(saved.length, 0);
  });
});
