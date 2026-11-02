// Pure helpers for the Vyoma chatbot API (POST /v1/chat). Kept free of browser and
// Vite APIs so backend/tests can import them directly.
//
// The chatbot answers from public website pages only. It must never receive account,
// order, payment or password data, so those questions are answered here instead and
// are left out of the history sent with later questions.

// "all" searches the Digital Sanskrit Guru, Vyoma and Sanskrit From Home websites
export const CHATBOT_PLATFORM_ID = "all";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_TURNS = 6;
const MAX_SOURCE_LINKS = 3;

const CONTACT_LINK = { label: "Contact Us", to: "/contact" };

const PRIVATE_TOPICS = [
  {
    // Personal details typed into the question
    match: /[^\s@]+@[^\s@]+\.[^\s@]+|(?:\+?\d[\s-]?){10,}/,
    text: "For your privacy, please don't share email addresses or phone numbers here. Our Customer Seva Team can help you directly.",
    links: [CONTACT_LINK]
  },
  {
    match: /\b(password|otp|log ?in|sign ?in|my account|my profile)\b/i,
    text: "I can't help with account details here. You can sign in or reset your password from the login page, or contact our Customer Seva Team.",
    links: [{ label: "Go to login", to: "/login" }, CONTACT_LINK]
  },
  {
    match: /\b(my (digital )?(library|products?|purchases?)|access my|my (web version|e-?books?))\b/i,
    text: "Web versions and other on-site digital products appear in My Digital Library once your payment is confirmed. Kindle editions are delivered through Amazon.",
    links: [{ label: "Open My Digital Library", to: "/my-library" }]
  },
  {
    match: /\b(payments?|paid|charged|transaction|money (was |got )?deducted)\b/i,
    text: "I can't see payment details here. Our Customer Seva Team can check this for you.",
    links: [CONTACT_LINK]
  },
  {
    match: /\b(track|tracking|invoice|my (orders?|parcel|package|delivery)|orders? (status|id|number|no))\b/i,
    text: "You can see the status and tracking details of every order on your Orders page. If you checked out as a guest, use the link in your order confirmation email.",
    links: [{ label: "Go to My Orders", to: "/my-orders" }]
  }
];

function findPrivateTopic(text) {
  return PRIVATE_TOPICS.find((topic) => topic.match.test(String(text || "")));
}

/** Returns a local reply when a question must not go to the chatbot API, else null. */
export function getPrivateTopicReply(text) {
  const topic = findPrivateTopic(text);
  return topic ? { text: topic.text, links: topic.links, quickReplies: [] } : null;
}

function buildHistory(messages) {
  return messages
    .filter((message) => {
      if (message.id === "welcome" || message.isError || message.isLocal) return false;
      return message.role === "user" ? !findPrivateTopic(message.text) : message.role === "bot";
    })
    .slice(-MAX_HISTORY_TURNS)
    .map((message) => ({
      role: message.role === "user" ? "user" : "assistant",
      message: String(message.text || "").slice(0, MAX_MESSAGE_LENGTH)
    }))
    .filter((turn) => turn.message.trim());
}

/** Builds the /v1/chat body. `messages` is the conversation, ending with the new question. */
export function buildChatRequest(messages, sessionId) {
  const previous = messages.slice(0, -1);
  const question = messages[messages.length - 1];
  return {
    platform_id: CHATBOT_PLATFORM_ID,
    message: String(question?.text || "").slice(0, MAX_MESSAGE_LENGTH),
    session_id: String(sessionId || "").slice(0, 128),
    history: buildHistory(previous)
  };
}

const isWebUrl = (url) => /^https?:\/\//i.test(String(url || ""));

/** Turns a /v1/chat response into the widget's message shape. */
export function parseChatReply(data) {
  const text = String(data?.message || "").trim();
  const seen = new Set();
  const links = [];
  for (const source of Array.isArray(data?.sources) ? data.sources : []) {
    const url = String(source?.url || "");
    if (!isWebUrl(url) || seen.has(url) || text.includes(url)) continue;
    seen.add(url);
    links.push({ label: String(source?.title || "").trim() || "Read more", to: url });
  }
  return {
    text: text || "Sorry, I don't have an answer for that yet. Our FAQ covers most questions.",
    links: text ? links.slice(0, MAX_SOURCE_LINKS) : [{ label: "Read the FAQ", to: "/faq" }, CONTACT_LINK],
    quickReplies: []
  };
}

/** The message to show for a failed request. `detail` is only visitor-friendly on 429 and 503. */
export function getChatErrorMessage(status, detail) {
  if ((status === 429 || status === 503) && typeof detail === "string" && detail.trim()) {
    return detail.trim();
  }
  if (status === 429) return "We're getting a lot of questions right now. Please try again in a moment.";
  return "Sorry, I couldn't reach the assistant just now. Please try again in a moment.";
}

function parseInline(text) {
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|\*([^*\s][^*]*)\*|(https?:\/\/[^\s)]+)/g;
  const segments = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > cursor) segments.push({ type: "text", text: text.slice(cursor, match.index) });
    const [whole, label, url, bold, italic, bareUrl] = match;
    if (label !== undefined) {
      // Only web links become clickable; anything else stays as its plain label
      segments.push(isWebUrl(url) ? { type: "link", text: label, url } : { type: "text", text: label });
    } else if (bold !== undefined) {
      segments.push({ type: "bold", children: parseInline(bold) });
    } else if (italic !== undefined) {
      segments.push({ type: "italic", children: parseInline(italic) });
    } else {
      segments.push({ type: "link", text: bareUrl, url: bareUrl });
    }
    cursor = match.index + whole.length;
  }
  if (cursor < text.length) segments.push({ type: "text", text: text.slice(cursor) });
  return segments;
}

/**
 * Parses reply Markdown into plain data that the widget renders as React elements.
 * No HTML is ever produced, so a reply cannot inject markup into the page.
 */
export function parseChatMarkdown(markdown) {
  const blocks = [];
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", segments: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };

  const addListItem = (type, text) => {
    flushParagraph();
    const last = blocks[blocks.length - 1];
    const list = last?.type === type ? last : { type, items: [] };
    if (list !== last) blocks.push(list);
    list.items.push(parseInline(text));
  };

  for (const rawLine of String(markdown || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (!line) {
      flushParagraph();
    } else if (bullet) {
      addListItem("bullets", bullet[1]);
    } else if (numbered) {
      addListItem("numbers", numbered[1]);
    } else if (heading) {
      flushParagraph();
      blocks.push({ type: "paragraph", segments: [{ type: "bold", children: parseInline(heading[1]) }] });
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();
  return blocks;
}
