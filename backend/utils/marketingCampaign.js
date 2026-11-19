/**
 * marketingCampaign.js — pure rules for promotional campaigns sent from the admin dashboard.
 *
 * Campaigns go out through Mailmodo, using ONE triggered campaign (MAILMODO_CAMPAIGN_ID)
 * whose template has these slots, filled in for every send:
 *   {{heading}} {{body}} {{body_html}} {{image_url}} {{button_text}} {{button_link}}
 *
 * Nothing here touches the database or the network, so it is covered by node:test.
 */

const AUDIENCE_TYPES = ["all", "category", "product", "minSpend"];

// Only real, paid, not-cancelled orders make someone a "buyer" for targeting
const PAID_ORDER_MATCH = Object.freeze({ status: { $ne: "Cancelled" }, paymentStatus: "Paid" });

const LIMITS = Object.freeze({
  subject: 150,
  heading: 150,
  body: 5000,
  buttonText: 40,
  url: 500
});

const OBJECT_ID = /^[0-9a-f]{24}$/i;

function cleanLine(value, max) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max + 1);
}

function cleanText(value, max) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max + 1);
}

/** Reads {filterType, filterValue} from a request body. */
function parseAudience(body = {}) {
  const filterType = String(body?.filterType || "all").trim();
  const filterValue = String(body?.filterValue ?? "").trim();
  if (!AUDIENCE_TYPES.includes(filterType)) {
    return { error: "Choose who should get this email." };
  }
  if (filterType === "category" && !filterValue) return { error: "Choose a category." };
  if (filterType === "product" && !OBJECT_ID.test(filterValue)) return { error: "Choose a product." };
  if (filterType === "minSpend") {
    const amount = Number(filterValue);
    if (!Number.isFinite(amount) || amount < 0) return { error: "Enter a minimum spend of 0 or more." };
    return { audience: { filterType, filterValue: String(amount) } };
  }
  return { audience: { filterType, filterValue: filterType === "all" ? "" : filterValue } };
}

/** Plain-English description of an audience for the campaign history. */
function describeAudience(audience = {}, productName = "") {
  const value = String(audience.filterValue || "");
  switch (audience.filterType) {
    case "category":
      return `Bought from "${value}"`;
    case "product":
      return `Bought "${productName || value}"`;
    case "minSpend":
      return `Spent at least ₹${Number(value || 0).toLocaleString("en-IN")}`;
    default:
      return "All customers";
  }
}

/**
 * The user filter for a campaign audience. userIds null means everyone.
 * With testEmails (team-only mode) only those addresses can ever match.
 */
function audienceUserFilter(userIds = null, testEmails = []) {
  const filter = {
    isDeleted: { $ne: true },
    isBlocked: { $ne: true },
    marketingOptOut: { $ne: true },
    email: { $type: "string", $gt: "" }
  };
  if (Array.isArray(userIds)) filter._id = { $in: userIds };
  if (Array.isArray(testEmails) && testEmails.length > 0) {
    return { $and: [filter, { email: { $in: testEmails } }] };
  }
  return filter;
}

function isAllowedLink(value) {
  if (!value) return true;
  if (/^\/(?!\/)/.test(value)) return true; // a path on our own site
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Turns a site path into a full address; full https addresses are kept. */
function absoluteLink(value, siteUrl) {
  if (!value) return "";
  if (value.startsWith("/")) return `${String(siteUrl || "").replace(/\/+$/, "")}${value}`;
  return value;
}

/**
 * Checks what the admin wrote. Returns {content} or {error} (a message for the admin).
 * content: {subject, heading, body, imageUrl, buttonText, buttonLink}
 */
function validateCampaignContent(input = {}) {
  const content = {
    subject: cleanLine(input.subject, LIMITS.subject),
    heading: cleanLine(input.heading, LIMITS.heading),
    body: cleanText(input.body, LIMITS.body),
    imageUrl: cleanLine(input.imageUrl, LIMITS.url),
    buttonText: cleanLine(input.buttonText, LIMITS.buttonText),
    buttonLink: cleanLine(input.buttonLink, LIMITS.url)
  };

  if (!content.subject) return { error: "Add a subject line." };
  if (content.subject.length > LIMITS.subject) return { error: `Keep the subject under ${LIMITS.subject} characters.` };
  if (content.heading.length > LIMITS.heading) return { error: `Keep the heading under ${LIMITS.heading} characters.` };
  if (!content.body) return { error: "Write the message." };
  if (content.body.length > LIMITS.body) return { error: `Keep the message under ${LIMITS.body} characters.` };
  if (content.imageUrl && !/^https:\/\//i.test(content.imageUrl)) return { error: "The image must be an https:// address." };
  if (content.buttonText.length > LIMITS.buttonText) return { error: `Keep the button text under ${LIMITS.buttonText} characters.` };
  if (Boolean(content.buttonText) !== Boolean(content.buttonLink)) {
    return { error: "Fill in both the button text and the button link, or leave both empty." };
  }
  if (!isAllowedLink(content.buttonLink)) {
    return { error: "The button link must start with https:// or be a page on this site, like /collection." };
  }
  return { content };
}

const escapeHtml = (value) =>
  String(value || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Paragraphs and line breaks as safe HTML, for a template slot that renders HTML. */
function bodyToHtml(body) {
  return String(body || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** The values Mailmodo fills into the template slots. */
function buildCampaignData(content, siteUrl) {
  return {
    heading: content.heading || content.subject,
    body: content.body,
    body_html: bodyToHtml(content.body),
    image_url: content.imageUrl || "",
    button_text: content.buttonText || "",
    button_link: absoluteLink(content.buttonLink, siteUrl)
  };
}

/** A Mailmodo list name for one campaign's recipients, unique per campaign. */
function campaignListName(subject, date = new Date(), campaignId = "") {
  const day = new Date(date).toISOString().slice(0, 10);
  const shortSubject = cleanLine(subject, 40).replace(/[^\p{L}\p{N} &-]/gu, "").trim().slice(0, 40);
  const suffix = String(campaignId).slice(-6);
  return `DSG Campaign ${day} ${shortSubject}${suffix ? ` ${suffix}` : ""}`.trim();
}

/** Same key for the same campaign, so a retry can never send it twice. */
function campaignIdempotencyKey(campaignId) {
  return `dsg-campaign-${String(campaignId)}`;
}

/** The admin must confirm the exact number that will be sent to. */
function confirmCountMatches(confirmCount, actualCount) {
  const confirmed = Number(confirmCount);
  return Number.isInteger(confirmed) && confirmed > 0 && confirmed === Number(actualCount);
}

function pickNumber(source, keys) {
  for (const key of keys) {
    const value = Number(source?.[key]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

/** Reads a Mailmodo campaign report into the numbers the dashboard shows. */
function parseCampaignReport(body) {
  const source = body?.data && typeof body.data === "object" && !Array.isArray(body.data)
    ? body.data
    : body?.report || body?.summary || body || {};
  const stats = {
    sent: pickNumber(source, ["sent", "totalSent", "total_sent", "sentCount"]),
    delivered: pickNumber(source, ["delivered", "totalDelivered", "total_delivered", "deliveredCount"]),
    opened: pickNumber(source, ["opened", "uniqueOpens", "unique_opens", "opens", "openCount"]),
    clicked: pickNumber(source, ["clicked", "uniqueClicks", "unique_clicks", "clicks", "clickCount"]),
    unsubscribed: pickNumber(source, ["unsubscribed", "unsubscribes", "unsubscribeCount"]),
    bounced: pickNumber(source, ["bounced", "bounces", "bounceCount"])
  };
  const found = Object.values(stats).some((value) => value !== null);
  return found ? stats : null;
}

module.exports = {
  AUDIENCE_TYPES,
  PAID_ORDER_MATCH,
  LIMITS,
  parseAudience,
  describeAudience,
  audienceUserFilter,
  validateCampaignContent,
  bodyToHtml,
  buildCampaignData,
  campaignListName,
  campaignIdempotencyKey,
  confirmCountMatches,
  parseCampaignReport
};
