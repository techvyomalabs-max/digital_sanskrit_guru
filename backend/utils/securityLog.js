"use strict";

/**
 * Security threat log: where it lives, how big it may grow, and how the admin page reads it.
 * - The writer rotates the file at MAX_LOG_BYTES (the old one is kept once as .1), so it can
 *   no longer grow forever.
 * - The reader only reads the newest READ_WINDOW_BYTES from the end of the file, without
 *   blocking the server, and returns one page at a time.
 */

const fs = require("fs");
const path = require("path");

const LOG_FILE = path.join(__dirname, "../..", "logs", "security_threats.log");
const MAX_LOG_BYTES = 10 * 1024 * 1024; // 10 MB, then rotate
const READ_WINDOW_BYTES = 5 * 1024 * 1024; // the page reads at most the newest 5 MB
const MAX_PAGE_SIZE = 100;

/** Moves the log to .1 (replacing an older .1) once it reaches the size limit. */
function rotateIfNeeded(file = LOG_FILE, maxBytes = MAX_LOG_BYTES) {
  try {
    const { size } = fs.statSync(file);
    if (size >= maxBytes) fs.renameSync(file, `${file}.1`);
  } catch {
    // No file yet, or it could not be checked: nothing to rotate.
  }
}

/** Reads the last `windowBytes` of a file. Returns its lines, oldest first, and whether older lines were left out. */
async function readTail(file = LOG_FILE, windowBytes = READ_WINDOW_BYTES) {
  let handle;
  try {
    handle = await fs.promises.open(file, "r");
  } catch (err) {
    if (err.code === "ENOENT") return { lines: [], truncated: false };
    throw err;
  }
  try {
    const { size } = await handle.stat();
    const start = Math.max(0, size - windowBytes);
    const length = size - start;
    const buffer = Buffer.alloc(length);
    if (length > 0) await handle.read(buffer, 0, length, start);
    let lines = buffer.toString("utf8").split("\n");
    // When reading from the middle of the file, the first line is cut; drop it.
    if (start > 0) lines = lines.slice(1);
    return { lines: lines.filter((line) => line.trim().length > 0), truncated: start > 0 };
  } finally {
    await handle.close();
  }
}

/** One log line → { timestamp, ip, path, threat, details }, or null if it cannot be read. */
function parseLogLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    // Not JSON: try the text format below.
  }
  const match = String(line).match(/^\[(.*?)\]\s+IP=(.*?)\s+PATH=(.*?)\s+THREAT=(.*?)\s+DETAILS=(.*)$/);
  if (!match) return null;
  let details;
  try {
    details = JSON.parse(match[5]);
  } catch {
    details = { raw: match[5] };
  }
  return { timestamp: match[1], ip: match[2], path: match[3], threat: match[4], details };
}

const field = (log, key) => String(log?.[key] ?? log?.[key.toUpperCase()] ?? "");

/**
 * lines: oldest first (as in the file). Returns the newest-first page that matches the search
 * and threat filter, plus counts over everything that was read.
 */
function pageLogs(lines, { page = 1, limit = 50, search = "", threat = "" } = {}) {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(MAX_PAGE_SIZE, Number.parseInt(limit, 10) || 50));
  const query = String(search || "").trim().toLowerCase();
  const threatFilter = String(threat || "").trim();

  const all = [];
  const stats = { total: 0, nosql: 0, xss: 0 };
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const log = parseLogLine(lines[i]);
    if (!log) continue;
    stats.total += 1;
    const type = field(log, "threat");
    if (type === "NoSQL_INJECTION") stats.nosql += 1;
    if (type === "XSS_EXPLOIT") stats.xss += 1;
    if (threatFilter && type !== threatFilter) continue;
    if (query) {
      const haystack = `${field(log, "ip")} ${field(log, "path")} ${type}`.toLowerCase();
      if (!haystack.includes(query)) continue;
    }
    all.push(log);
  }

  const start = (safePage - 1) * safeLimit;
  return {
    logs: all.slice(start, start + safeLimit),
    page: safePage,
    limit: safeLimit,
    matching: all.length,
    hasMore: start + safeLimit < all.length,
    stats
  };
}

module.exports = {
  LOG_FILE,
  MAX_LOG_BYTES,
  READ_WINDOW_BYTES,
  rotateIfNeeded,
  readTail,
  parseLogLine,
  pageLogs
};
