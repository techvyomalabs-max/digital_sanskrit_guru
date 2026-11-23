const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { detectVisitorCountry, countryFromHeaders, countryFromIp } = require("../utils/visitorCountry");

describe("detectVisitorCountry", () => {
  it("uses a CDN country header first", () => {
    assert.equal(detectVisitorCountry({ headers: { "cf-ipcountry": "de" }, ip: "49.207.0.1" }), "DE");
    assert.equal(countryFromHeaders({ "x-vercel-ip-country": "NL" }), "NL");
  });

  it("ignores Cloudflare's unknown and Tor values", () => {
    assert.equal(countryFromHeaders({ "cf-ipcountry": "XX" }), "");
    assert.equal(countryFromHeaders({ "cf-ipcountry": "T1" }), "");
  });

  it("looks up the visitor IP when there is no header (production behind nginx)", () => {
    assert.equal(detectVisitorCountry({ headers: {}, ip: "8.8.8.8" }), "US");
    assert.equal(detectVisitorCountry({ headers: {}, ip: "::ffff:81.2.69.142" }), "GB");
    assert.equal(countryFromIp("2a00:1450:4001:80b::200e"), "DE");
  });

  it("falls back to IN for local, private or unknown addresses", () => {
    for (const ip of ["127.0.0.1", "::1", "10.0.0.5", "192.168.1.10", "172.26.8.54", "", undefined]) {
      assert.equal(detectVisitorCountry({ headers: {}, ip }), "IN", String(ip));
    }
  });
});
