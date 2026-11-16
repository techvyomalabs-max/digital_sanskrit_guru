const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeFormatNotes, MAX_NOTES, MAX_NOTE_LENGTH } = require("../utils/formatNotes");

test("formatNotes: keeps label and note, trimmed and single-spaced", () => {
  assert.deepEqual(normalizeFormatNotes([{ label: "  Flipbook ", note: "  Page-turn   reading online.  " }]), [
    { label: "Flipbook", note: "Page-turn reading online." }
  ]);
});

test("formatNotes: drops empty notes, empty labels and repeated labels (any case)", () => {
  const out = normalizeFormatNotes([
    { label: "Book", note: "" },
    { label: "", note: "No label" },
    { label: "USB", note: "Plug and play." },
    { label: "usb", note: "Duplicate" },
    null,
    "junk"
  ]);
  assert.deepEqual(out, [{ label: "USB", note: "Plug and play." }]);
});

test("formatNotes: caps length and count; non-lists become empty", () => {
  const long = "x".repeat(500);
  assert.equal(normalizeFormatNotes([{ label: "A", note: long }])[0].note.length, MAX_NOTE_LENGTH);
  const many = Array.from({ length: 30 }, (_, i) => ({ label: `F${i}`, note: "ok" }));
  assert.equal(normalizeFormatNotes(many).length, MAX_NOTES);
  assert.deepEqual(normalizeFormatNotes("nope"), []);
  assert.deepEqual(normalizeFormatNotes(undefined), []);
});

test("formatNotes: labels with dots are fine (stored as a list, not a map)", () => {
  assert.deepEqual(normalizeFormatNotes([{ label: "Vol. 1", note: "First volume." }]), [{ label: "Vol. 1", note: "First volume." }]);
});
