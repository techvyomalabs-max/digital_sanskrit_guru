const { describe, it, mock, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const webpush = require("web-push");
const PushSubscription = require("../models/PushSubscription");

const KEYS = webpush.generateVAPIDKeys();
const freshModule = () => {
  delete require.cache[require.resolve("../utils/webPush")];
  return require("../utils/webPush");
};
const subs = [
  { endpoint: "https://push.example/ok", keys: { p256dh: "a", auth: "b" } },
  { endpoint: "https://push.example/gone", keys: { p256dh: "a", auth: "b" } },
  { endpoint: "https://push.example/oldkey", keys: { p256dh: "a", auth: "b" } }
];
const pushError = (statusCode, body) => Object.assign(new Error("Received unexpected response code"), { statusCode, body });

describe("webPush", () => {
  let saved;
  beforeEach(() => {
    saved = { ...process.env };
    process.env.VAPID_PUBLIC_KEY = KEYS.publicKey;
    process.env.VAPID_PRIVATE_KEY = KEYS.privateKey;
    process.env.VAPID_EMAIL = "mailto:test@example.com";
    process.env.PUSH_ENABLED = "true";
  });
  afterEach(() => {
    process.env = saved;
    mock.restoreAll();
  });

  it("is ready when keys are set and push is on", () => {
    assert.deepEqual(freshModule().getPushStatus(), { ready: true, enabled: true, configured: true, reason: "" });
  });

  it("explains when keys are missing, invalid, or push is switched off", () => {
    delete process.env.VAPID_PRIVATE_KEY;
    assert.match(freshModule().getPushStatus().reason, /not set/);
    process.env.VAPID_PRIVATE_KEY = KEYS.privateKey;
    process.env.PUSH_ENABLED = "false";
    assert.match(freshModule().getPushStatus().reason, /PUSH_ENABLED=false/);
    process.env.PUSH_ENABLED = "true";
    process.env.VAPID_PUBLIC_KEY = '"quoted-key"';
    const bad = freshModule().getPushStatus();
    assert.equal(bad.ready, false);
    assert.match(bad.reason, /not valid/);
  });

  it("sends, removes expired and old-key devices, and reports a summary", async () => {
    const wp = freshModule();
    mock.method(PushSubscription, "find", () => ({ lean: async () => subs }));
    const deleted = [];
    mock.method(PushSubscription, "deleteOne", async (q) => deleted.push(q.endpoint));
    mock.method(webpush, "sendNotification", async (sub) => {
      if (sub.endpoint.endsWith("/gone")) throw pushError(410, "expired");
      if (sub.endpoint.endsWith("/oldkey")) throw pushError(403, "the VAPID credentials in the authorization header do not correspond to the credentials used to create the subscriptions.");
      return {};
    });
    const summary = await wp.broadcastPush({ title: "t", body: "b" });
    assert.equal(summary.devices, 3);
    assert.equal(summary.sent, 1);
    assert.equal(summary.failed, 2);
    assert.equal(summary.removed, 2);
    assert.deepEqual(deleted.sort(), ["https://push.example/gone", "https://push.example/oldkey"]);
  });

  it("keeps a device after a temporary failure", async () => {
    const wp = freshModule();
    mock.method(PushSubscription, "find", () => ({ lean: async () => [subs[0]] }));
    const deleted = [];
    mock.method(PushSubscription, "deleteOne", async (q) => deleted.push(q.endpoint));
    mock.method(webpush, "sendNotification", async () => { throw pushError(500, "server error"); });
    const summary = await wp.sendPushToUser("u1", { title: "t" });
    assert.equal(summary.failed, 1);
    assert.equal(summary.removed, 0);
    assert.deepEqual(deleted, []);
  });

  it("skips and says why when push is off, without calling the push service", async () => {
    process.env.PUSH_ENABLED = "false";
    const wp = freshModule();
    mock.method(PushSubscription, "find", () => ({ lean: async () => [subs[0]] }));
    const send = mock.method(webpush, "sendNotification", async () => ({}));
    const summary = await wp.sendPushToUser("u1", { title: "t" });
    assert.equal(summary.skipped, 1);
    assert.match(summary.reason, /switched off/);
    assert.equal(send.mock.callCount(), 0);
  });
});
