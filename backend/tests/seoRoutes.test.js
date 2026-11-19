const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { APP_ROUTES, isKnownPagePath } = require("../utils/seo");

test("every page route in App.jsx is a known page (so it never answers 404)", () => {
  const appJsx = fs.readFileSync(path.join(__dirname, "../../src/App.jsx"), "utf8");
  const routes = [...appJsx.matchAll(/path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== "*");
  assert.ok(routes.length > 20);
  const missing = routes.filter((route) => !APP_ROUTES.includes(route));
  assert.deepEqual(missing, [], "Add these new App.jsx routes to APP_ROUTES in backend/utils/seo.js");
});

test("known pages, with ids, trailing slashes and any letter case", () => {
  for (const p of [
    "/",
    "/collection",
    "/collection/",
    "/Collection",
    "/product/srimad-bhagavadgita",
    "/admin/orders/66f1a2b3c4d5e6f7a8b9c0d1",
    "/my-library/pack/abc/2",
    "/buy/123",
    "/terms"
  ]) {
    assert.equal(isKnownPagePath(p), true, p);
  }
});

test("anything else is a missing page", () => {
  for (const p of [
    "/does-not-exist",
    "/product",
    "/product/a/b",
    "/admin/orders/1/extra",
    "/wp-admin",
    "/collection/old-category",
    "/my-library/pack/abc",
    "/%E0%A4%"
  ]) {
    assert.equal(isKnownPagePath(p), false, p);
  }
});
