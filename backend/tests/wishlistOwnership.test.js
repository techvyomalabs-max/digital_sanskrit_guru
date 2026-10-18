const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("wishlistOwnership utility (pure)", async () => {
  const { resolveInitialWishlist } = await import("../../src/utils/wishlistOwnership.js");

  it("guest with a user-owned stored list -> cleared", () => {
    const storedList = [{ _id: "p1", name: "Product 1" }];
    const result = resolveInitialWishlist({
      hasToken: false,
      currentUserId: null,
      owner: "user_12345",
      storedList
    });

    assert.deepEqual(result.list, []);
    assert.equal(result.owner, "guest");
    assert.equal(result.shouldClearStorage, true);
  });

  it("guest with guest/null owner -> kept", () => {
    const storedList = [{ _id: "p1", name: "Product 1" }];

    // owner = "guest"
    const resGuest = resolveInitialWishlist({
      hasToken: false,
      currentUserId: null,
      owner: "guest",
      storedList
    });
    assert.deepEqual(resGuest.list, storedList);
    assert.equal(resGuest.owner, "guest");
    assert.equal(resGuest.shouldClearStorage, false);

    // owner = null
    const resNull = resolveInitialWishlist({
      hasToken: false,
      currentUserId: null,
      owner: null,
      storedList
    });
    assert.deepEqual(resNull.list, storedList);
    assert.equal(resNull.owner, "guest");
    assert.equal(resNull.shouldClearStorage, false);

    // owner = ""
    const resEmpty = resolveInitialWishlist({
      hasToken: false,
      currentUserId: null,
      owner: "",
      storedList
    });
    assert.deepEqual(resEmpty.list, storedList);
    assert.equal(resEmpty.owner, "guest");
    assert.equal(resEmpty.shouldClearStorage, false);
  });

  it("logged-in user A with a list owned by user B -> cleared", () => {
    const storedList = [{ _id: "p1", name: "Product 1" }];
    const result = resolveInitialWishlist({
      hasToken: true,
      currentUserId: "userA",
      owner: "userB",
      storedList
    });

    assert.deepEqual(result.list, []);
    assert.equal(result.owner, "userB");
    assert.equal(result.shouldClearStorage, true);
  });

  it("logged-in A with a list owned by A -> kept", () => {
    const storedList = [{ _id: "p1", name: "Product 1" }];
    const result = resolveInitialWishlist({
      hasToken: true,
      currentUserId: "userA",
      owner: "userA",
      storedList
    });

    assert.deepEqual(result.list, storedList);
    assert.equal(result.owner, "userA");
    assert.equal(result.shouldClearStorage, false);
  });

  it('"guest" owner with a logged-in user -> kept for merging', () => {
    const storedList = [{ _id: "p1", name: "Product 1" }];
    const result = resolveInitialWishlist({
      hasToken: true,
      currentUserId: "userA",
      owner: "guest",
      storedList
    });

    assert.deepEqual(result.list, storedList);
    assert.equal(result.owner, "guest");
    assert.equal(result.shouldClearStorage, false);

    // null owner with logged in user -> kept for merging
    const resNull = resolveInitialWishlist({
      hasToken: true,
      currentUserId: "userA",
      owner: null,
      storedList
    });
    assert.deepEqual(resNull.list, storedList);
    assert.equal(resNull.owner, null);
    assert.equal(resNull.shouldClearStorage, false);
  });

  it("logged-in with unknown currentUserId -> kept", () => {
    const storedList = [{ _id: "p1", name: "Product 1" }];
    const result = resolveInitialWishlist({
      hasToken: true,
      currentUserId: null,
      owner: "userB",
      storedList
    });

    assert.deepEqual(result.list, storedList);
    assert.equal(result.owner, "userB");
    assert.equal(result.shouldClearStorage, false);
  });

  it("garbage storedList -> []", () => {
    const nonArrayInputs = [null, undefined, "invalid-json", 12345, {}, true];

    for (const input of nonArrayInputs) {
      const resGuest = resolveInitialWishlist({
        hasToken: false,
        owner: "guest",
        storedList: input
      });
      assert.deepEqual(resGuest.list, []);
      assert.equal(Array.isArray(resGuest.list), true);

      const resUser = resolveInitialWishlist({
        hasToken: true,
        currentUserId: "userA",
        owner: "userA",
        storedList: input
      });
      assert.deepEqual(resUser.list, []);
      assert.equal(Array.isArray(resUser.list), true);
    }
  });
});
