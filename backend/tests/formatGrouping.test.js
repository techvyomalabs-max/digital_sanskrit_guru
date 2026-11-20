const test = require("node:test");
const assert = require("node:assert/strict");
const { splitTypeFromName, suggestFormatGroups, normalizeGroupApproval } = require("../utils/formatGrouping");
const { DEFAULT_PRODUCT_FORMAT_TYPES } = require("../utils/productFormatTypes");

const p = (id, name, extra = {}) => ({ _id: id.padStart(24, "0"), name, productType: "single", price: 100, ...extra });

test("splitTypeFromName finds the type words and the plain title", () => {
  assert.deepEqual(splitTypeFromName({ name: "Sanskrit Vocabulary Builder Part 1 - Web Version" }), { typeKey: "web-version", baseName: "Sanskrit Vocabulary Builder Part 1" });
  assert.deepEqual(splitTypeFromName({ name: "Gita Dhyanam (Kindle Edition)" }), { typeKey: "kindle", baseName: "Gita Dhyanam" });
  assert.deepEqual(splitTypeFromName({ name: "Gita Dhyanam Audio Book" }), { typeKey: "audio-book", baseName: "Gita Dhyanam" });
  assert.deepEqual(splitTypeFromName({ name: "Gita Dhyanam – USB" }), { typeKey: "pendrive", baseName: "Gita Dhyanam" });
  assert.deepEqual(splitTypeFromName({ name: "Gita Dhyanam Paperback" }), { typeKey: "paper", baseName: "Gita Dhyanam" });
  assert.equal(splitTypeFromName({ name: "Gita Dhyanam Flipbook" }).typeKey, "flipbook");
  assert.deepEqual(splitTypeFromName({ name: "Gita Dhyanam – Digital Flipbook" }), { typeKey: "flipbook", baseName: "Gita Dhyanam" });
  assert.deepEqual(splitTypeFromName({ name: "Gita Dhyanam – Web Audio" }), { typeKey: "audio-book", baseName: "Gita Dhyanam" });
});

test("splitTypeFromName guesses from digital/physical when the name has no type words", () => {
  assert.equal(splitTypeFromName({ name: "Gita Dhyanam" }).typeKey, "paper");
  assert.equal(splitTypeFromName({ name: "Gita Dhyanam", isDigital: true }).typeKey, "web-version");
  assert.equal(splitTypeFromName({ name: "Gita Dhyanam" }).guessed, true);
});

test("suggestFormatGroups groups one title's types and skips everything else", () => {
  const groups = suggestFormatGroups([
    p("1", "Gita Dhyanam"),
    p("2", "Gita Dhyanam - Web Version", { isDigital: true }),
    p("3", "Gita Dhyanam (Kindle)", { isDigital: true }),
    p("4", "Amarakosha"),
    p("5", "Amarakosha Web Version", { isDigital: true, isDeleted: true }),
    p("6", "Ramayana Combo - Web Version", { productType: "bundle" }),
    p("7", "Panchatantra Web Version", { hasOptions: true }),
    p("8", "Panchatantra", { optionParent: "x" })
  ], DEFAULT_PRODUCT_FORMAT_TYPES);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, "Gita Dhyanam");
  assert.deepEqual(groups[0].members.map((m) => [m.typeKey, m.label]), [["paper", "Paper"], ["web-version", "Web Version"], ["kindle", "Kindle"]]);
  assert.deepEqual(groups[0].conflicts, []);
});

test("suggestFormatGroups needs at least one product named with its type, and flags duplicates", () => {
  assert.equal(suggestFormatGroups([p("1", "Same Title"), p("2", "Same Title")]).length, 0, "two identical plain names are not types");
  const [group] = suggestFormatGroups([p("1", "Title Web Version", { isDigital: true }), p("2", "Title E-Book", { isDigital: true }), p("3", "Title")]);
  assert.deepEqual(group.conflicts, ["web-version"]);
});

test("normalizeGroupApproval checks the admin's choice", () => {
  const ok = normalizeGroupApproval({ name: " Gita  Dhyanam ", members: [{ product: "a".repeat(24), label: "Paper", typeKey: "paper" }, { product: "b".repeat(24), label: "Web Version" }] });
  assert.equal(ok.name, "Gita Dhyanam");
  assert.equal(ok.members.length, 2);
  assert.ok(normalizeGroupApproval({ name: "X", members: [] }).error);
  assert.ok(normalizeGroupApproval({ name: "Gita", members: [{ product: "a".repeat(24), label: "Paper" }] }).error);
  assert.ok(normalizeGroupApproval({ name: "Gita", members: [{ product: "a".repeat(24), label: "Paper" }, { product: "b".repeat(24), label: "paper" }] }).error);
  assert.ok(normalizeGroupApproval({ name: "Gita", members: [{ product: "bad", label: "Paper" }, { product: "b".repeat(24), label: "Web" }] }).error);
});

test("real names: brackets kept, devices are not audio books, all type words removed", () => {
  assert.deepEqual(splitTypeFromName({ name: "Saptaha Stotra Sangraha (Saptāhastotrasaṅgrahaḥ) – Audio Device" }), { typeKey: "audio-device", baseName: "Saptaha Stotra Sangraha (Saptāhastotrasaṅgrahaḥ)" });
  assert.deepEqual(splitTypeFromName({ name: "Saptaha Stotra Sangraha (Saptāhastotrasaṅgrahaḥ) – Kindle Edition" }), { typeKey: "kindle", baseName: "Saptaha Stotra Sangraha (Saptāhastotrasaṅgrahaḥ)" });
  assert.deepEqual(splitTypeFromName({ name: "Sanskrit Vocabulary Builder (Kindle Edition) eBook" }), { typeKey: "kindle", baseName: "Sanskrit Vocabulary Builder" });
  assert.equal(splitTypeFromName({ name: "Saptaha Stotra Sangraha (Saptāhastotrasaṅgrahaḥ)" }).baseName, "Saptaha Stotra Sangraha (Saptāhastotrasaṅgrahaḥ)");
});

test("titles match with or without the Sanskrit name in brackets and offer notes", () => {
  const { suggestFormatGroups } = require("../utils/formatGrouping");
  const id = (n) => String(n).padStart(24, "0");
  const groups = suggestFormatGroups([
    { _id: id(1), name: "Dhaturupa Paricaya (Dhāturūpaparicayaḥ) – Paperback", productType: "single" },
    { _id: id(2), name: "Dhaturupa Paricaya – Web Version", productType: "single", isDigital: true },
    { _id: id(3), name: "Srimad Bhagavadgita (Śrīmadbhagavadgītā) – Audio Device - Festival Offer", productType: "single" },
    { _id: id(4), name: "Srimad Bhagavadgita - Pendrive", productType: "single" }
  ]);
  assert.deepEqual(
    groups.map((g) => [g.name, g.members.length]),
    [
      ["Dhaturupa Paricaya (Dhāturūpaparicayaḥ)", 2],
      ["Srimad Bhagavadgita (Śrīmadbhagavadgītā)", 2]
    ]
  );
});

test("different parts never match", () => {
  const { suggestFormatGroups } = require("../utils/formatGrouping");
  const groups = suggestFormatGroups([
    { _id: "1".padStart(24, "0"), name: "Vocabulary Builder Part 1", productType: "single" },
    { _id: "2".padStart(24, "0"), name: "Vocabulary Builder Part 2 - Web Version", productType: "single", isDigital: true }
  ]);
  assert.equal(groups.length, 0);
});
