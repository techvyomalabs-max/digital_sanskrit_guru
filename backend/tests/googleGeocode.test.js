const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { buildGeocodeParams, trimResults, geocode } = require("../utils/googleGeocode");

const googleResult = {
  place_id: "abc",
  formatted_address: "12, 4th Cross, Vijayanagar, Bengaluru, Karnataka 560040, India",
  address_components: [
    { long_name: "560040", short_name: "560040", types: ["postal_code"] },
    { long_name: "Karnataka", short_name: "KA", types: ["administrative_area_level_1", "political"] }
  ],
  geometry: { location: { lat: 12.97, lng: 77.53 }, viewport: {} },
  types: ["street_address"]
};
const fakeFetch = (body, seen) => async (url) => {
  if (seen) seen.push(url);
  return { json: async () => body };
};

describe("googleGeocode", () => {
  let saved;
  beforeEach(() => { saved = { ...process.env }; process.env.GOOGLE_MAPS_API_KEY = "server-key"; });
  afterEach(() => { process.env = saved; });

  it("checks the lookup is a valid position or a search of sensible length", () => {
    assert.deepEqual(buildGeocodeParams({ lat: "12.97", lng: "77.53" }), { params: { latlng: "12.97,77.53" } });
    assert.deepEqual(buildGeocodeParams({ q: "  Jayanagar Bengaluru " }), { params: { address: "Jayanagar Bengaluru" } });
    assert.ok(buildGeocodeParams({ lat: "abc", lng: "1" }).error);
    assert.ok(buildGeocodeParams({ lat: "95", lng: "1" }).error);
    assert.ok(buildGeocodeParams({ q: "ab" }).error);
    assert.ok(buildGeocodeParams({}).error);
  });

  it("asks Google with the server key and returns Google's shape, trimmed", async () => {
    const seen = [];
    const out = await geocode({ lat: 12.97, lng: 77.53 }, { fetchImpl: fakeFetch({ status: "OK", results: [googleResult] }, seen) });
    assert.match(seen[0], /latlng=12\.97%2C77\.53/);
    assert.match(seen[0], /key=server-key/);
    assert.equal(out.status, "OK");
    assert.deepEqual(out.results[0].address_components[1], { long_name: "Karnataka", types: ["administrative_area_level_1", "political"] });
    assert.deepEqual(out.results[0].geometry, { location: { lat: 12.97, lng: 77.53 } });
    assert.equal(out.results[0].types, undefined);
  });

  it("tells the browser to fall back when there is no key, Google refuses, or the network fails", async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    assert.equal((await geocode({ lat: 1, lng: 1 }, { fetchImpl: fakeFetch({}) })).httpStatus, 503);
    process.env.GOOGLE_MAPS_API_KEY = "server-key";
    const denied = await geocode({ q: "Mysuru" }, { fetchImpl: fakeFetch({ status: "REQUEST_DENIED", error_message: "nope" }) });
    assert.equal(denied.httpStatus, 502);
    assert.equal(denied.googleStatus, "REQUEST_DENIED");
    const down = await geocode({ q: "Mysuru" }, { fetchImpl: async () => { throw new Error("timeout"); } });
    assert.equal(down.httpStatus, 502);
    assert.equal((await geocode({ q: "x" }, { fetchImpl: fakeFetch({}) })).httpStatus, 400);
  });

  it("accepts the key under the VITE_ name too, and treats no matches as an empty list", async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    process.env.VITE_GOOGLE_MAPS_API_KEY = "vite-named";
    const seen = [];
    const out = await geocode({ q: "Nowhere place" }, { fetchImpl: fakeFetch({ status: "ZERO_RESULTS", results: [] }, seen) });
    assert.match(seen[0], /key=vite-named/);
    assert.deepEqual(out, { status: "ZERO_RESULTS", results: [] });
    assert.deepEqual(trimResults(undefined), []);
  });
});
