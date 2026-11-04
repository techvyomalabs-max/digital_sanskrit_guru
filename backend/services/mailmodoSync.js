/**
 * mailmodoSync.js — keeps the Mailmodo promotional list in step with our customers.
 *
 * Rules:
 *  - Only active customers who have not unsubscribed are added (utils/mailmodo.js decides).
 *  - Customers who unsubscribe, are blocked or are deleted are unsubscribed in Mailmodo.
 *  - We never resubscribe someone who unsubscribed. A customer taken off only because
 *    they were blocked or deleted is resubscribed if the account becomes active again.
 *  - Unsubscribes made in Mailmodo come back through the webhook and stop our own
 *    promotional emails too (applyMailmodoOptOut).
 *  - One worker runs the sync at a time, through a lease in the JobLock collection.
 */

const crypto = require("crypto");
const User = require("../models/User");
const JobLock = require("../models/JobLock");
const {
  BATCH_SIZE,
  getMailmodoConfig,
  normalizeMarketingEmail,
  eligibleUserFilter,
  ineligibleUserFilter,
  isMailmodoEligible,
  removalReason,
  buildContact,
  isRecentSignup,
  addContact,
  addContactsBatch,
  unsubscribeContact,
  resubscribeContact
} = require("../utils/mailmodo");

const LOCK_ID = "mailmodo-sync";
const LOCK_TTL_MS = 20 * 60 * 1000;
const SYNC_INTERVAL_MS = 60 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 2 * 60 * 1000;
const MAX_CONSECUTIVE_FAILURES = 5;
const USER_FIELDS = "_id email name isDeleted isBlocked marketingOptOut mailmodo";

// ── Lease ────────────────────────────────────────────────────────────────────

async function acquireLock() {
  const now = new Date();
  const owner = `${process.pid}-${crypto.randomBytes(6).toString("hex")}`;
  try {
    const doc = await JobLock.findOneAndUpdate(
      { _id: LOCK_ID, $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }] },
      { $set: { owner, lockedUntil: new Date(now.getTime() + LOCK_TTL_MS) } },
      { upsert: true, returnDocument: "after" }
    ).lean();
    return doc?.owner === owner ? owner : null;
  } catch (err) {
    // Another worker holds the lease, so the upsert collided with its document
    if (err?.code === 11000) return null;
    throw err;
  }
}

function renewLock(owner) {
  return JobLock.updateOne(
    { _id: LOCK_ID, owner },
    { $set: { lockedUntil: new Date(Date.now() + LOCK_TTL_MS) } }
  );
}

function releaseLock(owner, result) {
  return JobLock.updateOne(
    { _id: LOCK_ID, owner },
    { $set: { owner: "", lockedUntil: null, lastRunAt: new Date(), lastResult: result } }
  );
}

// ── Sync passes ──────────────────────────────────────────────────────────────

function markSynced(ids) {
  return User.updateMany(
    { _id: { $in: ids } },
    {
      $set: {
        "mailmodo.syncedAt": new Date(),
        "mailmodo.removedAt": null,
        "mailmodo.removedReason": null,
        "mailmodo.lastError": ""
      }
    }
  );
}

function recordUserError(userId, message) {
  return User.updateOne({ _id: userId }, { $set: { "mailmodo.lastError": String(message || "").slice(0, 300) } });
}

function isFatal(err) {
  return err?.status === 401 || err?.status === 403;
}

async function addEligibleContacts(config, owner, full, result) {
  let lastId = null;
  let consecutiveFailures = 0;

  for (;;) {
    const filter = eligibleUserFilter();
    if (!full) filter["mailmodo.syncedAt"] = null;
    if (lastId) filter._id = { $gt: lastId };

    const users = await User.find(filter).sort({ _id: 1 }).limit(BATCH_SIZE).select(USER_FIELDS).lean();
    if (users.length === 0) return;
    lastId = users[users.length - 1]._id;
    await renewLock(owner);

    const batchUsers = [];
    for (const user of users) {
      if (!isMailmodoEligible(user)) continue;
      // They unsubscribed before; only they can opt back in, so leave them out
      if (user.mailmodo?.removedReason === "opt-out") {
        result.skipped += 1;
        continue;
      }
      const contact = buildContact(user);
      if (!contact) continue;

      const wasRemovedAsInactive = user.mailmodo?.removedReason === "inactive";
      const addOneByOne = wasRemovedAsInactive || (!user.mailmodo?.syncedAt && isRecentSignup(user));
      if (!addOneByOne) {
        batchUsers.push({ user, contact });
        continue;
      }

      try {
        if (wasRemovedAsInactive) {
          await resubscribeContact(contact.email, config);
          result.resubscribed += 1;
        }
        await addContact(contact, config);
        await markSynced([user._id]);
        result.added += 1;
        consecutiveFailures = 0;
      } catch (err) {
        if (isFatal(err)) throw err;
        result.failed += 1;
        consecutiveFailures += 1;
        await recordUserError(user._id, err.message);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) throw err;
      }
    }

    if (batchUsers.length > 0) {
      // A failed batch stops the run; the same customers are picked up next time
      await addContactsBatch(batchUsers.map((entry) => entry.contact), config);
      await markSynced(batchUsers.map((entry) => entry.user._id));
      result.added += batchUsers.length;
      consecutiveFailures = 0;
    }
  }
}

async function removeIneligibleContacts(config, owner, result) {
  let lastId = null;
  let consecutiveFailures = 0;

  for (;;) {
    const filter = { ...ineligibleUserFilter(), "mailmodo.syncedAt": { $ne: null } };
    if (lastId) filter._id = { $gt: lastId };

    const users = await User.find(filter).sort({ _id: 1 }).limit(BATCH_SIZE).select(USER_FIELDS).lean();
    if (users.length === 0) return;
    lastId = users[users.length - 1]._id;
    await renewLock(owner);

    for (const user of users) {
      const email = normalizeMarketingEmail(user.email);
      try {
        if (email) await unsubscribeContact(email, config);
        await User.updateOne(
          { _id: user._id },
          {
            $set: {
              "mailmodo.syncedAt": null,
              "mailmodo.removedAt": new Date(),
              "mailmodo.removedReason": removalReason(user),
              "mailmodo.lastError": ""
            }
          }
        );
        result.removed += 1;
        consecutiveFailures = 0;
      } catch (err) {
        if (isFatal(err)) throw err;
        result.failed += 1;
        consecutiveFailures += 1;
        await recordUserError(user._id, err.message);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) throw err;
      }
    }
  }
}

/**
 * Runs one sync. full=true also re-sends customers already on the list (to refresh names).
 */
async function runMailmodoSync({ full = false, trigger = "schedule" } = {}) {
  const config = getMailmodoConfig();
  if (!config.configured) {
    return { skipped: true, reason: "Mailmodo is not configured." };
  }

  const owner = await acquireLock();
  if (!owner) {
    return { skipped: true, reason: "A Mailmodo sync is already running." };
  }

  const result = {
    trigger,
    full: Boolean(full),
    startedAt: new Date(),
    finishedAt: null,
    added: 0,
    resubscribed: 0,
    removed: 0,
    skipped: 0,
    failed: 0,
    error: ""
  };

  try {
    // Removals run even when adding fails, so unsubscribes are never held up
    try {
      await addEligibleContacts(config, owner, full, result);
    } catch (err) {
      result.error = err.message;
      if (isFatal(err)) throw err;
    }
    await removeIneligibleContacts(config, owner, result);
  } catch (err) {
    result.error = result.error || err.message;
  } finally {
    result.finishedAt = new Date();
    await releaseLock(owner, result).catch((err) => {
      console.error("[Mailmodo] Failed to release sync lock:", err.message);
    });
  }

  if (result.added || result.removed || result.failed || result.error) {
    console.log(
      `[Mailmodo] Sync (${trigger}${full ? ", full" : ""}): ${result.added} added, ${result.removed} removed, ` +
      `${result.failed} failed${result.error ? ` — ${result.error}` : ""}`
    );
  }
  return result;
}

// ── Single-customer updates ──────────────────────────────────────────────────

/**
 * Called right after a customer unsubscribes on our site.
 */
async function syncOptOutToMailmodo(userId) {
  const config = getMailmodoConfig();
  if (!config.configured || !userId) return;

  const user = await User.findById(userId).select("email mailmodo").lean();
  const email = normalizeMarketingEmail(user?.email);
  if (!email) return;

  try {
    await unsubscribeContact(email, config);
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          "mailmodo.syncedAt": null,
          "mailmodo.removedAt": new Date(),
          "mailmodo.removedReason": "opt-out",
          "mailmodo.lastError": ""
        }
      }
    );
  } catch (err) {
    console.warn("[Mailmodo] Could not unsubscribe contact; the next sync will retry:", err.message);
    // Keep (or set) syncedAt so the removal pass retries this customer
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          "mailmodo.syncedAt": user?.mailmodo?.syncedAt || new Date(),
          "mailmodo.lastError": String(err.message || "").slice(0, 300)
        }
      }
    );
  }
}

/**
 * Called by the Mailmodo webhook when a contact unsubscribes or reports spam there.
 * Returns true when a customer account matched.
 */
async function applyMailmodoOptOut(email) {
  const normalized = normalizeMarketingEmail(email);
  if (!normalized) return false;

  const now = new Date();
  const setOptOut = { $set: { marketingOptOut: true, marketingOptOutAt: now } };
  const setMailmodo = {
    $set: {
      "mailmodo.syncedAt": null,
      "mailmodo.removedAt": now,
      "mailmodo.removedReason": "opt-out",
      "mailmodo.lastError": ""
    }
  };

  let match = { email: normalized };
  let found = await User.exists(match);
  if (!found) {
    // Accounts migrated from WordPress may have mixed-case emails
    const legacy = await User.findOne({ email: normalized })
      .collation({ locale: "en", strength: 2 })
      .select("_id")
      .lean();
    if (!legacy) return false;
    match = { _id: legacy._id };
  }

  // Keep the original opt-out date if they had already unsubscribed
  await User.updateOne({ ...match, marketingOptOut: { $ne: true } }, setOptOut);
  await User.updateOne(match, setMailmodo);
  return true;
}

// ── Status & scheduler ───────────────────────────────────────────────────────

async function getMailmodoStatus() {
  const config = getMailmodoConfig();
  const [eligibleCount, syncedCount, pendingCount, optedOutCount, lock] = await Promise.all([
    User.countDocuments(eligibleUserFilter()),
    User.countDocuments({ ...eligibleUserFilter(), "mailmodo.syncedAt": { $ne: null } }),
    User.countDocuments({ ...eligibleUserFilter(), "mailmodo.syncedAt": null, "mailmodo.removedReason": { $ne: "opt-out" } }),
    User.countDocuments({ isDeleted: { $ne: true }, marketingOptOut: true }),
    JobLock.findById(LOCK_ID).lean()
  ]);

  return {
    configured: config.configured,
    listName: config.listName,
    autoSync: config.configured && config.autoSync,
    webhookConfigured: Boolean(config.webhookSecret),
    eligibleCount,
    syncedCount,
    pendingCount,
    optedOutCount,
    running: Boolean(lock?.lockedUntil && new Date(lock.lockedUntil) > new Date()),
    lastRunAt: lock?.lastRunAt || null,
    lastResult: lock?.lastResult || null
  };
}

function initMailmodoScheduler() {
  const config = getMailmodoConfig();
  if (!config.configured) return;
  if (!config.autoSync) {
    console.log("[Mailmodo] Automatic sync is off (MAILMODO_AUTO_SYNC=false).");
    return;
  }

  const run = () => runMailmodoSync({ trigger: "schedule" }).catch((err) => {
    console.error("[Mailmodo] Scheduled sync error:", err.message);
  });

  setTimeout(run, FIRST_RUN_DELAY_MS).unref?.();
  setInterval(run, SYNC_INTERVAL_MS).unref?.();
  console.log("[Mailmodo] Contact sync scheduled (hourly).");
}

module.exports = {
  runMailmodoSync,
  syncOptOutToMailmodo,
  applyMailmodoOptOut,
  getMailmodoStatus,
  initMailmodoScheduler
};
