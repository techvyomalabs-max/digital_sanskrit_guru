const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parsePageParams } = require("../utils/paging");

describe("parsePageParams", () => {
  it("uses the defaults when nothing is given", () => {
    assert.deepEqual(parsePageParams({}, { defaultLimit: 50 }), { page: 1, limit: 50, skip: 0 });
  });

  it("caps the page size and works out the skip", () => {
    assert.deepEqual(parsePageParams({ page: "3", limit: "5000" }, { maxLimit: 100 }), { page: 3, limit: 100, skip: 200 });
  });

  it("ignores bad values", () => {
    assert.deepEqual(parsePageParams({ page: "-2", limit: "abc" }), { page: 1, limit: 25, skip: 0 });
    assert.deepEqual(parsePageParams({ page: "x", limit: "0" }), { page: 1, limit: 25, skip: 0 });
  });
});
