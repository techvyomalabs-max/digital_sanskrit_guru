const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeMrpInput, mrpBelowPriceError } = require("../utils/productMrp");
const { normalizeBundleFormatsInput, buildSingleFormatChildFields } = require("../utils/bundleFormats");

describe("M.R.P.", () => {
  it("reads blank as cleared and keeps 'not sent' apart", () => {
    assert.deepEqual(normalizeMrpInput(undefined), { value: undefined });
    assert.deepEqual(normalizeMrpInput(""), { value: null });
    assert.deepEqual(normalizeMrpInput(null), { value: null });
    assert.deepEqual(normalizeMrpInput("250"), { value: 250 });
    assert.deepEqual(normalizeMrpInput(199.999), { value: 200 });
    assert.match(normalizeMrpInput("-1").error, /0 or more/);
    assert.match(normalizeMrpInput("abc").error, /0 or more/);
  });

  it("can't be lower than the selling price", () => {
    assert.match(mrpBelowPriceError(150, 199), /can't be lower than the selling price/);
    assert.equal(mrpBelowPriceError(199, 199), "");
    assert.equal(mrpBelowPriceError(250, 199), "");
    assert.equal(mrpBelowPriceError(null, 199), "");
  });

  it("each format of a single product keeps its own M.R.P.", () => {
    const { formats, error } = normalizeBundleFormatsInput([
      { label: "Print", type: "physical", price: 499, mrp: 550 },
      { label: "Web Version", type: "digital", price: 299, mrp: "" }
    ]);
    assert.equal(error, "");
    assert.equal(formats[0].mrp, 550);
    assert.equal(formats[1].mrp, null);
    const child = buildSingleFormatChildFields({ _id: "p1", name: "Book", mrp: 999 }, formats[0]);
    assert.equal(child.mrp, 550, "the format's own M.R.P., not the main product's");
    assert.equal(buildSingleFormatChildFields({ _id: "p1", name: "Book", mrp: 999 }, formats[1]).mrp, null);
    assert.match(
      normalizeBundleFormatsInput([{ label: "Print", type: "physical", price: 499, mrp: 400 }]).error,
      /M.R.P. can't be lower than its price/
    );
  });

  it("combo formats are unchanged (no M.R.P. key unless sent)", () => {
    const { formats } = normalizeBundleFormatsInput([{ label: "USB", type: "physical" }]);
    assert.equal("mrp" in formats[0], false);
  });
});
