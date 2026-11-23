const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PAID_ORDER_MATCH,
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
} = require("../utils/marketingCampaign");
const { parseContactLists, getMailmodoConfig } = require("../utils/mailmodo");

const validContent = { subject: "Diwali offer", heading: "Shubh Deepavali", body: "Hello\n\n20% off all books", buttonText: "Shop now", buttonLink: "/collection" };

test("buyers are paid, not-cancelled orders only", () => {
  assert.deepEqual(PAID_ORDER_MATCH, { status: { $ne: "Cancelled" }, paymentStatus: "Paid" });
});

test("parseAudience accepts the four groups and rejects bad input", () => {
  assert.deepEqual(parseAudience({}).audience, { filterType: "all", filterValue: "" });
  assert.deepEqual(parseAudience({ filterType: "all", filterValue: "x" }).audience, { filterType: "all", filterValue: "" });
  assert.equal(parseAudience({ filterType: "category", filterValue: "Books" }).audience.filterValue, "Books");
  assert.ok(parseAudience({ filterType: "category" }).error);
  assert.ok(parseAudience({ filterType: "product", filterValue: "not-an-id" }).error);
  assert.equal(parseAudience({ filterType: "product", filterValue: "64b7f0c2a1b2c3d4e5f60718" }).audience.filterType, "product");
  assert.equal(parseAudience({ filterType: "minSpend", filterValue: "500" }).audience.filterValue, "500");
  assert.ok(parseAudience({ filterType: "minSpend", filterValue: "-1" }).error);
  assert.ok(parseAudience({ filterType: "everyone" }).error);
});

test("describeAudience reads plainly", () => {
  assert.equal(describeAudience({ filterType: "all" }), "All customers");
  assert.equal(describeAudience({ filterType: "category", filterValue: "Books" }), 'Bought from "Books"');
  assert.equal(describeAudience({ filterType: "product", filterValue: "id" }, "Vocabulary Builder"), 'Bought "Vocabulary Builder"');
  assert.match(describeAudience({ filterType: "minSpend", filterValue: "1500" }), /1,500/);
});

test("audienceUserFilter leaves out deleted, blocked and unsubscribed customers", () => {
  const filter = audienceUserFilter();
  assert.deepEqual(filter.isDeleted, { $ne: true });
  assert.deepEqual(filter.isBlocked, { $ne: true });
  assert.deepEqual(filter.marketingOptOut, { $ne: true });
  assert.equal(filter._id, undefined);
  assert.deepEqual(audienceUserFilter(["a", "b"])._id, { $in: ["a", "b"] });
});

test("audienceUserFilter in team-only mode can match only team addresses", () => {
  const filter = audienceUserFilter(null, ["team@example.com"]);
  assert.deepEqual(filter.$and[1], { email: { $in: ["team@example.com"] } });
  assert.deepEqual(filter.$and[0].isBlocked, { $ne: true });
});

test("validateCampaignContent accepts good content and cleans it", () => {
  const { content, error } = validateCampaignContent({ ...validContent, subject: "  Diwali\noffer " });
  assert.equal(error, undefined);
  assert.equal(content.subject, "Diwali offer");
  assert.equal(content.buttonLink, "/collection");
});

test("validateCampaignContent rejects missing or unsafe content", () => {
  assert.ok(validateCampaignContent({ ...validContent, subject: "" }).error);
  assert.ok(validateCampaignContent({ ...validContent, body: "  " }).error);
  assert.ok(validateCampaignContent({ ...validContent, subject: "x".repeat(151) }).error);
  assert.ok(validateCampaignContent({ ...validContent, imageUrl: "http://example.com/a.png" }).error);
  assert.ok(validateCampaignContent({ ...validContent, buttonLink: "" }).error, "button text without link");
  assert.ok(validateCampaignContent({ ...validContent, buttonLink: "javascript:alert(1)" }).error);
  assert.ok(validateCampaignContent({ ...validContent, buttonLink: "//evil.example" }).error);
  assert.ok(validateCampaignContent({ ...validContent, buttonLink: "http://example.com" }).error);
  assert.equal(validateCampaignContent({ ...validContent, buttonText: "", buttonLink: "" }).error, undefined);
  assert.equal(validateCampaignContent({ ...validContent, buttonLink: "https://example.com/x" }).error, undefined);
});

test("bodyToHtml makes safe paragraphs", () => {
  assert.equal(bodyToHtml("Hi <b>all</b>\nline two\n\nNext"), "<p>Hi &lt;b&gt;all&lt;/b&gt;<br>line two</p><p>Next</p>");
});

test("buildCampaignData fills every template slot", () => {
  const data = buildCampaignData(validateCampaignContent(validContent).content, "https://digitalsanskritguru.com/");
  assert.deepEqual(Object.keys(data).sort(), ["body", "body_html", "button_link", "button_text", "heading", "image_url"]);
  assert.equal(data.button_link, "https://digitalsanskritguru.com/collection");
  assert.equal(data.heading, "Shubh Deepavali");
  const noHeading = buildCampaignData({ ...validContent, heading: "" }, "https://x.test");
  assert.equal(noHeading.heading, "Diwali offer");
});

test("campaign list names and keys are unique per campaign", () => {
  const name = campaignListName("Diwali offer! 🎉", new Date("2026-11-18T10:00:00Z"), "64b7f0c2a1b2c3d4e5f60718");
  assert.equal(name, "DSG Campaign 2026-11-18 Diwali offer f60718");
  assert.equal(campaignIdempotencyKey("abc"), "dsg-campaign-abc");
});

test("confirmCountMatches needs the exact positive count", () => {
  assert.equal(confirmCountMatches(12, 12), true);
  assert.equal(confirmCountMatches("12", 12), true);
  assert.equal(confirmCountMatches(11, 12), false);
  assert.equal(confirmCountMatches(undefined, 12), false);
  assert.equal(confirmCountMatches(0, 0), false);
});

test("parseCampaignReport reads common shapes and returns null when empty", () => {
  assert.deepEqual(parseCampaignReport({ data: { sent: 10, uniqueOpens: 4, uniqueClicks: 1 } }), {
    sent: 10, delivered: null, opened: 4, clicked: 1, unsubscribed: null, bounced: null
  });
  assert.equal(parseCampaignReport({ success: true }), null);
  assert.equal(parseCampaignReport(null), null);
});

test("parseContactLists reads Mailmodo's list reply", () => {
  const lists = parseContactLists({ listDetails: [{ id: "L1", name: "DSG Test", contacts_count: 2 }, { name: "no id" }] });
  assert.deepEqual(lists, [{ id: "L1", name: "DSG Test", count: 2 }]);
});

test("campaign id must look like an id", () => {
  assert.equal(getMailmodoConfig({ MAILMODO_CAMPAIGN_ID: "9ebaed1f-86cb-44d1" }).campaignId, "9ebaed1f-86cb-44d1");
  assert.equal(getMailmodoConfig({ MAILMODO_CAMPAIGN_ID: "../bad" }).campaignId, "");
});
