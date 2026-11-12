const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const load = () => import("../../src/utils/pageTours.js");

function fakeWindow() {
  const store = new Map();
  const events = [];
  globalThis.window = {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key)
    },
    dispatchEvent: (event) => events.push(event.type)
  };
  return { store, events };
}

test.afterEach(() => {
  delete globalThis.window;
});

test("pageTours: each customer page maps to its tour", async () => {
  const { getTourKeyForPath, PAGE_TOURS } = await load();
  const expected = {
    "/": "home",
    "/product/abc-123": "product",
    "/collection": "collection",
    "/collection/": "collection",
    "/search": "search",
    "/cart": "cart",
    "/checkout": "checkout",
    "/wishlist": "wishlist",
    "/account": "account",
    "/my-orders": "orders",
    "/my-library": "library",
    "/redeem-gift": "redeem",
    "/faq": "faq",
    "/contact": "contact"
  };
  for (const [pathname, key] of Object.entries(expected)) {
    assert.equal(getTourKeyForPath(pathname), key, pathname);
    assert.ok(PAGE_TOURS[key], `tour config exists for ${key}`);
  }
});

test("pageTours: admin, sign-in, payment-link and policy pages have no tour", async () => {
  const { getTourKeyForPath } = await load();
  for (const pathname of [
    "/admin",
    "/admin/orders",
    "/login",
    "/register",
    "/reset-password/xyz",
    "/guest-buy/token",
    "/privacy-policy",
    "/terms-and-conditions",
    "/does-not-exist"
  ]) {
    assert.equal(getTourKeyForPath(pathname), null, pathname);
  }
});

test("pageTours: a tour shows once, and 'don't show again' turns all of them off", async () => {
  fakeWindow();
  const { shouldAutoStartTour, markTourSeen, turnOffTours, hasSeenTour } = await load();
  assert.equal(shouldAutoStartTour("home"), true);
  markTourSeen("home");
  assert.equal(hasSeenTour("home"), true);
  assert.equal(shouldAutoStartTour("home"), false);
  assert.equal(shouldAutoStartTour("product"), true, "other pages still show their tour");
  turnOffTours();
  assert.equal(shouldAutoStartTour("product"), false);
  assert.equal(shouldAutoStartTour(null), false);
  assert.equal(shouldAutoStartTour("unknown"), false);
});

test("pageTours: broken or blocked storage never throws", async () => {
  const { store } = fakeWindow();
  const { shouldAutoStartTour, markTourSeen } = await load();
  store.set("dsg_tours_seen", "{not json");
  assert.equal(shouldAutoStartTour("cart"), true);
  markTourSeen("cart");
  assert.equal(shouldAutoStartTour("cart"), false);

  globalThis.window = {
    get localStorage() {
      throw new Error("blocked");
    }
  };
  assert.equal(shouldAutoStartTour("cart"), true);
  assert.doesNotThrow(() => markTourSeen("cart"));
});

test("pageTours: the footer link asks for the current page's tour", async () => {
  const { events } = fakeWindow();
  const { requestPageTour, START_TOUR_EVENT } = await load();
  globalThis.CustomEvent ??= class CustomEvent extends Event {};
  requestPageTour();
  assert.deepEqual(events, [START_TOUR_EVENT]);
});

test("pageTours: every step has text, and every selector still exists in the site code", async () => {
  const { PAGE_TOURS } = await load();
  const srcDir = path.join(__dirname, "../../src");
  const sources = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(jsx|js)$/.test(entry.name) && !full.endsWith("pageTours.js")) sources.push(fs.readFileSync(full, "utf8"));
    }
  };
  walk(srcDir);
  const code = sources.join("\n");

  for (const [key, tour] of Object.entries(PAGE_TOURS)) {
    assert.ok(tour.steps.length > 0, `${key} has steps`);
    const selectors = [...(tour.requires || [])];
    for (const step of tour.steps) {
      assert.ok(step.title && step.description, `${key}: every step has a title and description`);
      selectors.push(...(step.selectors || []), ...(step.skipIfVisible || []));
    }
    for (const selector of selectors) {
      for (const [, kind, name] of selector.matchAll(/([.#])([a-zA-Z][\w-]*)/g)) {
        const pattern = kind === "#" ? `id="${name}"` : name;
        assert.ok(code.includes(pattern), `${key}: "${selector}" — ${kind}${name} is not used anywhere in src`);
      }
    }
  }
});
