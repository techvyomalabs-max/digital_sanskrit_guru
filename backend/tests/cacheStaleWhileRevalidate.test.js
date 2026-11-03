const test = require("node:test");
const assert = require("node:assert/strict");
const { appCache, cacheStaleWhileRevalidate, invalidateProductCache } = require("../utils/cache");

const tick = () => new Promise((resolve) => setImmediate(resolve));

function counter(values) {
  let calls = 0;
  const fetch = async () => values[Math.min(calls++, values.length - 1)];
  return { fetch, calls: () => calls };
}

test("a miss loads once and later requests use the cache", async () => {
  const key = "products:test:miss";
  const source = counter(["first"]);
  assert.equal(await cacheStaleWhileRevalidate(key, 60, source.fetch), "first");
  assert.equal(await cacheStaleWhileRevalidate(key, 60, source.fetch), "first");
  assert.equal(source.calls(), 1);
  appCache.del(key);
});

test("concurrent misses share one load", async () => {
  const key = "products:test:concurrent";
  const source = counter(["only"]);
  const results = await Promise.all([1, 2, 3].map(() => cacheStaleWhileRevalidate(key, 60, source.fetch)));
  assert.deepEqual(results, ["only", "only", "only"]);
  assert.equal(source.calls(), 1);
  appCache.del(key);
});

test("an expired entry is served at once and refreshed in the background", async () => {
  const key = "products:test:stale";
  const source = counter(["old", "new"]);
  await cacheStaleWhileRevalidate(key, 0, source.fetch);
  assert.equal(await cacheStaleWhileRevalidate(key, 0, source.fetch), "old", "no waiting for the refresh");
  await tick();
  assert.equal(source.calls(), 2);
  assert.equal(appCache.get(key).value, "new");
  appCache.del(key);
});

test("a refresh that started before a product edit does not restore old data", async () => {
  const key = "products:test:edit";
  let release;
  const slow = () => new Promise((resolve) => { release = () => resolve("before edit"); });
  const pending = cacheStaleWhileRevalidate(key, 60, slow);
  await tick(); // the load is now in progress
  invalidateProductCache();
  release();
  assert.equal(await pending, "before edit", "that request still gets an answer");
  assert.equal(appCache.get(key), undefined, "but the cache stays empty for the next request");
});

test("a failed background refresh keeps serving the last good value", async () => {
  const key = "products:test:failure";
  await cacheStaleWhileRevalidate(key, 0, async () => "good");
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(await cacheStaleWhileRevalidate(key, 0, async () => { throw new Error("db down"); }), "good");
    await tick();
    assert.equal(appCache.get(key).value, "good");
  } finally {
    console.error = originalError;
    appCache.del(key);
  }
});

test("a failed first load reaches the caller and is not cached", async () => {
  const key = "products:test:first-failure";
  await assert.rejects(cacheStaleWhileRevalidate(key, 60, async () => { throw new Error("db down"); }), /db down/);
  assert.equal(appCache.get(key), undefined);
});
