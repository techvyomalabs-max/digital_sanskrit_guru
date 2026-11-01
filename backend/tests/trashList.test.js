const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { formatTrashItem, trashFilter, parsePaging, mergeTrashPage } = require("../utils/trashList");

const day = (n) => new Date(Date.UTC(2026, 9, n));

describe("trashList", () => {
  it("formats each kind of deleted item as before", () => {
    const p = formatTrashItem("product", { _id: "p1", name: "Gita", price: 499, category: "Books", deletedAt: day(3), deletedBy: { name: "Asha", email: "a@x.com" } });
    assert.equal(p.name, "Gita");
    assert.equal(p.deletedBy, "Asha (a@x.com)");
    assert.equal(p.details, "Price: ₹499 | Category: Books");
    const c = formatTrashItem("coupon", { _id: "c1", code: "DIWALI", type: "percent", value: 10, updatedAt: day(2) });
    assert.equal(c.name, "Coupon Code: DIWALI");
    assert.equal(c.deletedBy, "Admin");
    assert.deepEqual(c.deletedAt, day(2));
    const u = formatTrashItem("user", { _id: "u1", name: "Ravi", email: "r@x.com", isAdmin: true, adminRole: "Custom Sub-Admin" });
    assert.equal(u.category, "Admin User");
    assert.equal(u.details, "Email: r@x.com | Role: Custom Sub-Admin");
  });

  it("builds a safe search filter per collection", () => {
    assert.deepEqual(trashFilter("product", ""), { isDeleted: true });
    const f = trashFilter("user", "a.b+c");
    assert.equal(f.isDeleted, true);
    assert.equal(f.$or[0].name.$regex, "a\\.b\\+c");
    assert.ok(f.$or.some((c) => c.email));
    assert.ok(trashFilter("coupon", "x").$or.some((c) => c.code));
  });

  it("reads paging options and caps the page size", () => {
    assert.deepEqual(parsePaging({}), { page: 1, limit: 25, type: "all", search: "" });
    assert.deepEqual(parsePaging({ page: "3", limit: "999", type: "coupon", search: " x " }), { page: 3, limit: 100, type: "coupon", search: "x" });
    assert.equal(parsePaging({ type: "orders" }).type, "all");
  });

  it("merges the three kinds newest first and cuts the requested page", () => {
    const lists = {
      product: [{ _id: "p5", deletedAt: day(5) }, { _id: "p2", deletedAt: day(2) }],
      coupon: [{ _id: "c4", code: "A", deletedAt: day(4) }, { _id: "c1", code: "B", deletedAt: day(1) }],
      user: [{ _id: "u3", deletedAt: day(3) }]
    };
    const first = mergeTrashPage(lists, { page: 1, limit: 2, matching: 5 });
    assert.deepEqual(first.trash.map((t) => t._id), ["p5", "c4"]);
    assert.equal(first.hasMore, true);
    const second = mergeTrashPage(lists, { page: 2, limit: 2, matching: 5 });
    assert.deepEqual(second.trash.map((t) => t._id), ["u3", "p2"]);
    const third = mergeTrashPage(lists, { page: 3, limit: 2, matching: 5 });
    assert.deepEqual(third.trash.map((t) => t._id), ["c1"]);
    assert.equal(third.hasMore, false);
  });
});
