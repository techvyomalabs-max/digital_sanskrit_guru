const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { readTail, parseLogLine, pageLogs, rotateIfNeeded } = require("../utils/securityLog");

const line = (i, threat = "NoSQL_INJECTION", ip = "1.2.3.4") =>
  `[2026-10-${String((i % 28) + 1).padStart(2, "0")}T10:00:00.000Z] IP=${ip} PATH=/api/item/${i} THREAT=${threat} DETAILS={"n":${i}}`;

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "seclog-")), "security_threats.log");

describe("securityLog", () => {
  it("reads both the text and the JSON line formats", () => {
    assert.deepEqual(parseLogLine(line(1)), {
      timestamp: "2026-10-02T10:00:00.000Z",
      ip: "1.2.3.4",
      path: "/api/item/1",
      threat: "NoSQL_INJECTION",
      details: { n: 1 }
    });
    assert.equal(parseLogLine('{"ip":"9.9.9.9","threat":"XSS_EXPLOIT"}').ip, "9.9.9.9");
    assert.equal(parseLogLine("garbage"), null);
    assert.deepEqual(parseLogLine("[t] IP=a PATH=/b THREAT=X DETAILS=not-json").details, { raw: "not-json" });
  });

  it("returns newest first, one page at a time, with counts over everything read", () => {
    const lines = Array.from({ length: 130 }, (_, i) => line(i, i % 3 === 0 ? "XSS_EXPLOIT" : "NoSQL_INJECTION"));
    const first = pageLogs(lines, { page: 1, limit: 50 });
    assert.equal(first.logs.length, 50);
    assert.equal(first.logs[0].path, "/api/item/129");
    assert.equal(first.hasMore, true);
    assert.equal(first.stats.total, 130);
    assert.equal(first.stats.xss, 44);
    assert.equal(first.stats.nosql, 86);
    const last = pageLogs(lines, { page: 3, limit: 50 });
    assert.equal(last.logs.length, 30);
    assert.equal(last.hasMore, false);
    assert.equal(pageLogs(lines, { limit: 5000 }).limit, 100);
  });

  it("filters by search text and threat type on the server", () => {
    const lines = [line(1, "XSS_EXPLOIT", "5.5.5.5"), line(2, "NoSQL_INJECTION", "5.5.5.5"), line(3, "XSS_EXPLOIT", "7.7.7.7")];
    assert.equal(pageLogs(lines, { search: "5.5.5" }).matching, 2);
    assert.equal(pageLogs(lines, { threat: "XSS_EXPLOIT" }).matching, 2);
    assert.equal(pageLogs(lines, { search: "/api/item/3", threat: "XSS_EXPLOIT" }).matching, 1);
    assert.equal(pageLogs(lines, { search: "nothing" }).stats.total, 3);
  });

  it("reads only the end of a big file and drops the cut first line", async () => {
    const file = tmpFile();
    fs.writeFileSync(file, Array.from({ length: 200 }, (_, i) => line(i)).join("\n") + "\n");
    const { lines, truncated } = await readTail(file, 1000);
    assert.equal(truncated, true);
    assert.ok(lines.length > 0 && lines.length < 200);
    assert.ok(lines.every((l) => parseLogLine(l)));
    assert.match(lines[lines.length - 1], /item\/199 /);
    const whole = await readTail(file, 10 * 1024 * 1024);
    assert.equal(whole.truncated, false);
    assert.equal(whole.lines.length, 200);
    assert.deepEqual(await readTail(path.join(path.dirname(file), "missing.log")), { lines: [], truncated: false });
  });

  it("rotates the file once it reaches the size limit", () => {
    const file = tmpFile();
    fs.writeFileSync(file, "x".repeat(50));
    rotateIfNeeded(file, 100);
    assert.equal(fs.existsSync(file), true);
    fs.writeFileSync(file, "y".repeat(150));
    rotateIfNeeded(file, 100);
    assert.equal(fs.existsSync(file), false);
    assert.equal(fs.readFileSync(`${file}.1`, "utf8").length, 150);
  });
});
