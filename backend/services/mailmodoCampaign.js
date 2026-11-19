/**
 * mailmodoCampaign.js — sends admin-written promotions through Mailmodo.
 *
 * How one campaign goes out:
 *  1. The chosen customers are copied into a new Mailmodo list just for this campaign.
 *  2. Mailmodo is asked to send the template campaign (MAILMODO_CAMPAIGN_ID) to that list,
 *     with this campaign's subject and slot values.
 *  3. The MarketingCampaign record keeps the status, the list and any error.
 * Only name and email go to Mailmodo. A fixed idempotency key per campaign means a retry
 * can never send the same campaign twice.
 */

const MarketingCampaign = require("../models/MarketingCampaign");
const {
  BATCH_SIZE,
  MailmodoError,
  getMailmodoConfig,
  buildContact,
  chunk,
  isInMailmodoScope,
  addContactsBatchToList,
  findListByName,
  triggerCampaignEmail,
  bulkTriggerCampaign,
  getCampaignReport
} = require("../utils/mailmodo");
const {
  buildCampaignData,
  campaignListName,
  campaignIdempotencyKey,
  parseCampaignReport
} = require("../utils/marketingCampaign");
const { getSeoSiteUrl } = require("../utils/seo");

const LIST_LOOKUP_ATTEMPTS = 6;
const LIST_LOOKUP_DELAY_MS = 5000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function campaignStatus(config = getMailmodoConfig()) {
  return {
    ready: Boolean(config.apiKey && config.campaignId),
    hasApiKey: Boolean(config.apiKey),
    hasCampaignId: Boolean(config.campaignId),
    teamOnly: config.teamOnly,
    teamEmails: config.testEmails
  };
}

/**
 * Sends the campaign to the team addresses only (or the admin's own address when
 * team-only mode is off). Returns {sentTo: [], failed: [{email, error}]}.
 */
async function sendCampaignTest(content, { adminEmail = "" } = {}, config = getMailmodoConfig()) {
  const recipients = config.testEmails.length > 0 ? config.testEmails : [String(adminEmail || "").trim().toLowerCase()].filter(Boolean);
  if (recipients.length === 0) throw new MailmodoError("There is no team address to send the test to.");

  const data = buildCampaignData(content, getSeoSiteUrl());
  const result = { sentTo: [], failed: [] };
  for (const email of recipients) {
    try {
      await triggerCampaignEmail({ email, subject: `[TEST] ${content.subject}`, data }, config);
      result.sentTo.push(email);
    } catch (err) {
      if (err?.status === 401 || err?.status === 403) throw err;
      result.failed.push({ email, error: err.message });
    }
  }
  return result;
}

async function waitForList(listName, config) {
  for (let attempt = 1; attempt <= LIST_LOOKUP_ATTEMPTS; attempt += 1) {
    const list = await findListByName(listName, config);
    if (list) return list;
    await sleep(LIST_LOOKUP_DELAY_MS);
  }
  throw new MailmodoError(`Mailmodo didn't create the list "${listName}" in time. Nothing was sent; try again.`);
}

/**
 * Runs a campaign that already has a MarketingCampaign record in "preparing".
 * recipients: users from resolveRecipientsList. Never throws; the record holds the outcome.
 */
async function runMailmodoCampaign(campaignId, recipients, config = getMailmodoConfig()) {
  const campaign = await MarketingCampaign.findById(campaignId);
  if (!campaign || campaign.status !== "preparing") return;

  try {
    const contacts = recipients
      .filter((user) => user?.marketingOptOut !== true && isInMailmodoScope(user?.email, config.testEmails))
      .map(buildContact)
      .filter(Boolean);
    if (contacts.length === 0) throw new MailmodoError("No customers to send to.");

    const listName = campaign.listName || campaignListName(campaign.subject, campaign.createdAt, campaign._id);
    campaign.listName = listName;
    await campaign.save();

    let added = 0;
    for (const batch of chunk(contacts, BATCH_SIZE)) {
      await addContactsBatchToList(listName, batch, config);
      added += batch.length;
      await MarketingCampaign.updateOne({ _id: campaign._id }, { $set: { addedToList: added } });
    }

    const list = await waitForList(listName, config);
    const idempotencyKey = campaignIdempotencyKey(campaign._id);
    const reply = await bulkTriggerCampaign({
      listId: list.id,
      subject: campaign.subject,
      idempotencyKey,
      campaignData: buildCampaignData(campaign, getSeoSiteUrl())
    }, config);

    if (reply && reply.success === false) {
      throw new MailmodoError(String(reply.message || "Mailmodo refused the send.").slice(0, 300));
    }

    await MarketingCampaign.updateOne(
      { _id: campaign._id },
      {
        $set: {
          status: "sent",
          sentAt: new Date(),
          listId: list.id,
          addedToList: added,
          mailmodoCampaignId: config.campaignId,
          mailmodoRef: String(reply?.ref || ""),
          idempotencyKey,
          error: ""
        }
      }
    );
  } catch (err) {
    console.error("[Mailmodo] Campaign failed:", err.message);
    await MarketingCampaign.updateOne(
      { _id: campaign._id },
      { $set: { status: "failed", error: String(err.message || "Unknown error").slice(0, 300) } }
    );
  }
}

const dayString = (date) => new Date(date).toISOString().slice(0, 10);

/**
 * Fetches results from Mailmodo for a sent campaign. All campaigns share one template,
 * so the report is for the day it was sent (accurate when one campaign goes out per day).
 */
async function refreshCampaignStats(campaignId, config = getMailmodoConfig()) {
  const campaign = await MarketingCampaign.findById(campaignId);
  if (!campaign) return null;
  if (campaign.channel !== "mailmodo" || campaign.status !== "sent" || !campaign.sentAt) return campaign;

  try {
    const day = dayString(campaign.sentAt);
    const body = await getCampaignReport({ fromDate: day, toDate: day }, config);
    const stats = parseCampaignReport(body);
    campaign.stats = stats
      ? { ...stats, fetchedAt: new Date(), error: "" }
      : { ...(campaign.stats?.toObject?.() || {}), fetchedAt: new Date(), error: "Mailmodo didn't return results yet." };
  } catch (err) {
    campaign.stats = { ...(campaign.stats?.toObject?.() || {}), fetchedAt: new Date(), error: String(err.message).slice(0, 200) };
  }
  await campaign.save();
  return campaign;
}

module.exports = {
  campaignStatus,
  sendCampaignTest,
  runMailmodoCampaign,
  refreshCampaignStats
};
