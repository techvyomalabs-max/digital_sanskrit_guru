const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/utils/chatbotApi.js");

const user = (text, extra = {}) => ({ id: text, role: "user", text, ...extra });
const bot = (text, extra = {}) => ({ id: `bot-${text}`, role: "bot", text, ...extra });

test("order, account, payment and personal questions stay on the site", async () => {
  const { getPrivateTopicReply } = await load();
  for (const question of [
    "Track my order",
    "where is my order DSG1234",
    "Access my digital products",
    "I forgot my password",
    "money got deducted but no confirmation",
    "my email is someone@example.com",
    "call me on +91 98765 43210"
  ]) {
    assert.ok(getPrivateTopicReply(question), question);
  }
});

test("public questions go to the chatbot", async () => {
  const { getPrivateTopicReply } = await load();
  for (const question of [
    "Shipping & delivery",
    "Help me choose a book",
    "What Sanskrit books do you have for beginners?",
    "Do you have flash cards?",
    "How do I order a book?"
  ]) {
    assert.equal(getPrivateTopicReply(question), null, question);
  }
});

test("the request uses the API's field names and sends nothing extra", async () => {
  const { buildChatRequest } = await load();
  const body = buildChatRequest(
    [user("Do you have Gita books?"), bot("Yes, several."), user("How much are they?")],
    "session-1"
  );
  assert.deepEqual(body, {
    platform_id: "all",
    message: "How much are they?",
    session_id: "session-1",
    history: [
      { role: "user", message: "Do you have Gita books?" },
      { role: "assistant", message: "Yes, several." }
    ]
  });
});

test("history leaves out the personal greeting, errors and private questions", async () => {
  const { buildChatRequest } = await load();
  const { history } = buildChatRequest(
    [
      bot("Namaste Asha!", { id: "welcome" }),
      user("Track my order"),
      bot("See your Orders page.", { isLocal: true }),
      user("Do you ship to Pune?"),
      bot("Sorry, I couldn't reach the assistant.", { isError: true }),
      user("Which book is best?")
    ],
    "session-1"
  );
  assert.deepEqual(history, [{ role: "user", message: "Do you ship to Pune?" }]);
});

test("history keeps the last 6 turns and long text is cut to the API limit", async () => {
  const { buildChatRequest } = await load();
  const turns = Array.from({ length: 8 }, (_, i) => user(`question ${i}`));
  const body = buildChatRequest([...turns, user("x".repeat(3000))], "s".repeat(200));
  assert.equal(body.history.length, 6);
  assert.equal(body.history[0].message, "question 2");
  assert.equal(body.message.length, 2000);
  assert.equal(body.session_id.length, 128);
});

test("reply parsing keeps safe, new source links only", async () => {
  const { parseChatReply } = await load();
  const reply = parseChatReply({
    message: "See [the FAQ](https://example.com/faq).",
    sources: [
      { title: "FAQ", url: "https://example.com/faq" },
      { title: "Books", url: "https://example.com/books" },
      { title: "Books again", url: "https://example.com/books" },
      { title: "Bad", url: "javascript:alert(1)" }
    ]
  });
  assert.deepEqual(reply.links, [{ label: "Books", to: "https://example.com/books" }]);
});

test("an empty reply falls back to help links", async () => {
  const { parseChatReply } = await load();
  const reply = parseChatReply({ status: "ready", message: "  " });
  assert.ok(reply.text.length > 0);
  assert.ok(reply.links.some((link) => link.to === "/contact"));
});

test("error text uses detail only where the API makes it visitor-friendly", async () => {
  const { getChatErrorMessage } = await load();
  assert.equal(getChatErrorMessage(429, "Please slow down."), "Please slow down.");
  assert.equal(getChatErrorMessage(503, "Back soon."), "Back soon.");
  assert.doesNotMatch(getChatErrorMessage(422, [{ loc: ["body"], msg: "bad" }]), /bad/);
  assert.doesNotMatch(getChatErrorMessage(422, "internal text"), /internal/);
  assert.ok(getChatErrorMessage(undefined, undefined).length > 0);
});

test("markdown becomes paragraphs, lists, bold and links", async () => {
  const { parseChatMarkdown } = await load();
  const blocks = parseChatMarkdown("Try **these** books:\n\n- [One](https://example.com/1)\n- Two\n\n1. Three");
  assert.equal(blocks[0].type, "paragraph");
  assert.deepEqual(blocks[0].segments[1], { type: "bold", children: [{ type: "text", text: "these" }] });
  assert.equal(blocks[1].type, "bullets");
  assert.equal(blocks[1].items.length, 2);
  assert.deepEqual(blocks[1].items[0], [{ type: "link", text: "One", url: "https://example.com/1" }]);
  assert.equal(blocks[2].type, "numbers");
});

test("markdown never produces an unsafe link or live HTML", async () => {
  const { parseChatMarkdown } = await load();
  const [block] = parseChatMarkdown("[click](javascript:alert(1)) <img src=x onerror=alert(1)>");
  assert.ok(block.segments.every((segment) => segment.type === "text"));
  assert.match(block.segments.map((segment) => segment.text).join(""), /<img src=x/);
});

test("the live reply format with a link inside a sentence parses", async () => {
  const { parseChatMarkdown } = await load();
  const [block] = parseChatMarkdown("Such as a book [FAQ - Digital Sanskrit Guru](https://www.digitalsanskritguru.com/faq/)?");
  assert.deepEqual(block.segments.map((segment) => segment.type), ["text", "link", "text"]);
});
