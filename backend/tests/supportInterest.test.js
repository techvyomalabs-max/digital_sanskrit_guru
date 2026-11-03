const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SUPPORT_TYPES,
  validateSupportInterest,
  validateSupportInterestUpdate
} = require("../utils/supportInterest");

const valid = {
  name: "  Asha   Rao ",
  email: " Asha@Example.COM ",
  phone: "+91 98765 43210",
  organisation: "Sanskrit Bharati",
  supportType: "institution",
  message: "We would like to use your books in our school.\n\n\n\nThanks!",
  consent: true
};

test("a complete submission is accepted and cleaned", () => {
  const result = validateSupportInterest(valid);
  assert.equal(result.ok, true);
  assert.equal(result.value.name, "Asha Rao");
  assert.equal(result.value.email, "asha@example.com");
  assert.equal(result.value.message, "We would like to use your books in our school.\n\nThanks!");
  assert.equal(result.value.consent, true);
});

test("phone and organisation are optional", () => {
  const result = validateSupportInterest({ ...valid, phone: "", organisation: "" });
  assert.equal(result.ok, true);
});

test("each required field reports its own error", () => {
  const result = validateSupportInterest({});
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.errors).sort(), ["consent", "email", "message", "name", "supportType"]);
});

test("bad email, phone, type and short message are rejected", () => {
  const result = validateSupportInterest({ ...valid, email: "asha@", phone: "abc", supportType: "money", message: "hi" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.email && result.errors.phone && result.errors.supportType && result.errors.message);
});

test("consent must be given", () => {
  assert.equal(validateSupportInterest({ ...valid, consent: false }).ok, false);
  assert.equal(validateSupportInterest({ ...valid, consent: "true" }).ok, true);
});

test("only known fields are kept", () => {
  const result = validateSupportInterest({ ...valid, status: "closed", adminNote: "x", isAdmin: true });
  assert.deepEqual(Object.keys(result.value).sort(), ["consent", "email", "message", "name", "organisation", "phone", "supportType"]);
});

test("control characters are removed", () => {
  const result = validateSupportInterest({ ...valid, name: "Asha\u0000\u0007 Rao" });
  assert.equal(result.value.name, "Asha Rao");
});

test("every support type has a label", () => {
  assert.ok(SUPPORT_TYPES.length >= 3);
  for (const type of SUPPORT_TYPES) assert.ok(type.value && type.label);
});

test("admin updates allow only a known status and a note", () => {
  assert.deepEqual(validateSupportInterestUpdate({ status: "contacted" }), { ok: true, update: { status: "contacted" } });
  assert.equal(validateSupportInterestUpdate({ status: "deleted" }).ok, false);
  assert.equal(validateSupportInterestUpdate({}).ok, false);
  assert.equal(validateSupportInterestUpdate({ adminNote: "x".repeat(1001) }).ok, false);
  assert.deepEqual(validateSupportInterestUpdate({ adminNote: " Called back " }).update, { adminNote: "Called back" });
});
