const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getMailmodoConfig,
  normalizeMarketingEmail,
  isMailmodoEligible,
  removalReason,
  buildContact,
  isRecentSignup,
  chunk,
  safeEqual,
  parseMailmodoWebhook,
  describeFailure
} = require("../utils/mailmodo");

function idAt(ms) {
  return Math.floor(ms / 1000).toString(16).padStart(8, "0") + "0000000000000000";
}

test("config needs both the API key and the list name", () => {
  assert.equal(getMailmodoConfig({}).configured, false);
  assert.equal(getMailmodoConfig({ MAILMODO_API_KEY: "k" }).configured, false);
  assert.equal(getMailmodoConfig({ MAILMODO_LIST_NAME: "DSG" }).configured, false);
  const config = getMailmodoConfig({ MAILMODO_API_KEY: " k ", MAILMODO_LIST_NAME: " DSG Customers " });
  assert.equal(config.configured, true);
  assert.equal(config.apiKey, "k");
  assert.equal(config.listName, "DSG Customers");
});

test("automatic sync is on unless switched off", () => {
  assert.equal(getMailmodoConfig({}).autoSync, true);
  assert.equal(getMailmodoConfig({ MAILMODO_AUTO_SYNC: "FALSE" }).autoSync, false);
});

test("emails are trimmed, lower-cased and validated", () => {
  assert.equal(normalizeMarketingEmail("  Ravi@Example.COM "), "ravi@example.com");
  assert.equal(normalizeMarketingEmail("not-an-email"), "");
  assert.equal(normalizeMarketingEmail("a b@example.com"), "");
  assert.equal(normalizeMarketingEmail(null), "");
});

test("only active, subscribed customers with an email are eligible", () => {
  const base = { email: "a@example.com" };
  assert.equal(isMailmodoEligible(base), true);
  assert.equal(isMailmodoEligible({ ...base, marketingOptOut: true }), false);
  assert.equal(isMailmodoEligible({ ...base, isDeleted: true }), false);
  assert.equal(isMailmodoEligible({ ...base, isBlocked: true }), false);
  assert.equal(isMailmodoEligible({ email: "" }), false);
  assert.equal(isMailmodoEligible(null), false);
});

test("an unsubscribe outranks a block or delete when choosing the removal reason", () => {
  assert.equal(removalReason({ marketingOptOut: true, isDeleted: true }), "opt-out");
  assert.equal(removalReason({ isDeleted: true }), "inactive");
  assert.equal(removalReason({ isBlocked: true }), "inactive");
});

test("contacts carry only the email and name", () => {
  const contact = buildContact({
    email: "Ravi@Example.com",
    name: "  Ravi Kumar Sharma ",
    phone: "9999999999",
    addresses: [{ city: "Bengaluru" }]
  });
  assert.deepEqual(contact, {
    email: "ravi@example.com",
    data: { first_name: "Ravi", last_name: "Kumar Sharma", name: "Ravi Kumar Sharma" }
  });
  assert.equal(buildContact({ email: "bad" }), null);
  assert.deepEqual(buildContact({ email: "x@example.com" }).data, { first_name: "", last_name: "", name: "" });
});

test("recent sign-ups are told apart from older customers by account age", () => {
  const now = Date.UTC(2026, 10, 4);
  const day = 24 * 60 * 60 * 1000;
  assert.equal(isRecentSignup({ _id: idAt(now - 2 * day) }, now), true);
  assert.equal(isRecentSignup({ _id: idAt(now - 30 * day) }, now), false);
  assert.equal(isRecentSignup({ _id: "not-an-id" }, now), false);
});

test("chunk splits into batches of at most the given size", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 2), []);
});

test("webhook token comparison rejects empty and wrong tokens", () => {
  assert.equal(safeEqual("secret", "secret"), true);
  assert.equal(safeEqual("secreT", "secret"), false);
  assert.equal(safeEqual("", ""), false);
  assert.equal(safeEqual("short", "longer-secret"), false);
});

test("webhook parsing finds unsubscribes and spam reports only", () => {
  assert.deepEqual(parseMailmodoWebhook({ email: "A@Example.com", event: "unsubscribed" }), [
    { email: "a@example.com", event: "unsubscribed", isOptOut: true }
  ]);
  const events = parseMailmodoWebhook([
    { recipient: "b@example.com", eventName: "Spam Complaint" },
    { contact: { email: "c@example.com" }, event_type: "opened" },
    { data: { email: "d@example.com" }, type: "unsubscribe" },
    { event: "unsubscribed" },
    "junk"
  ]);
  assert.deepEqual(events.map((e) => [e.email, e.isOptOut]), [
    ["b@example.com", true],
    ["c@example.com", false],
    ["d@example.com", true],
    ["", false]
  ]);
  assert.deepEqual(parseMailmodoWebhook({ events: [{ email: "e@example.com", status: "UNSUBSCRIBED" }] })[0].isOptOut, true);
  assert.deepEqual(parseMailmodoWebhook(null), []);
});

test("failure messages explain a bad API key without echoing it", () => {
  assert.match(describeFailure(401, null), /API key/);
  assert.match(describeFailure(500, { message: "boom" }), /500.*boom/);
});
