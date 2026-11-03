const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const zlib = require("node:zlib");
const express = require("express");
const { checkNodeVersion, isAtLeast, rejectBrotliBodies, PATCHED } = require("../utils/nodeSecurity");

describe("Node.js October 2026 security release", () => {
  it("knows the first patched version of each line", () => {
    assert.deepEqual(PATCHED, { 22: "22.23.4", 24: "24.22.1", 26: "26.12.1" });
    assert.equal(isAtLeast("v24.22.1", "24.22.1"), true);
    assert.equal(isAtLeast("v24.22.0", "24.22.1"), false);
    assert.equal(isAtLeast("v24.23.0", "24.22.1"), true);
  });

  it("flags unpatched and end-of-life versions", () => {
    assert.equal(checkNodeVersion("v24.22.2").ok, true);
    assert.equal(checkNodeVersion("v22.23.4").ok, true);
    assert.equal(checkNodeVersion("v26.13.0").ok, true);
    assert.match(checkNodeVersion("v22.22.0").message, /missing the October 2026 security fixes.*22\.23\.4/);
    assert.match(checkNodeVersion("v24.11.0").message, /24\.22\.1/);
    assert.match(checkNodeVersion("v20.19.0").message, /no longer receives security fixes/);
    assert.equal(checkNodeVersion("v25.4.0").ok, false);
  });
});

describe("Brotli request bodies are refused", () => {
  async function post(headers, body) {
    const app = express();
    app.use(rejectBrotliBodies);
    app.use(express.json());
    app.post("/x", (req, res) => res.json({ got: req.body }));
    const server = app.listen(0);
    try {
      return await new Promise((resolve, reject) => {
        const req = http.request({ port: server.address().port, path: "/x", method: "POST", headers }, (res) => {
          let data = "";
          res.on("data", (c) => { data += c; });
          res.on("end", () => resolve({ status: res.statusCode, body: data }));
        });
        req.on("error", reject);
        req.end(body);
      });
    } finally {
      server.close();
    }
  }

  it("turns away a Brotli body before it is decompressed", async () => {
    const body = zlib.brotliCompressSync(Buffer.from('{"a":1}'));
    const res = await post({ "Content-Type": "application/json", "Content-Encoding": "br" }, body);
    assert.equal(res.status, 415);
    const mixed = await post({ "Content-Type": "application/json", "Content-Encoding": "gzip, br" }, body);
    assert.equal(mixed.status, 415);
  });

  it("lets ordinary and gzip bodies through", async () => {
    const plain = await post({ "Content-Type": "application/json" }, '{"a":1}');
    assert.equal(plain.status, 200);
    assert.deepEqual(JSON.parse(plain.body), { got: { a: 1 } });
    const gz = await post({ "Content-Type": "application/json", "Content-Encoding": "gzip" }, zlib.gzipSync('{"a":2}'));
    assert.deepEqual(JSON.parse(gz.body), { got: { a: 2 } });
  });
});
