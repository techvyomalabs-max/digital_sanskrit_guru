"use strict";

/**
 * Keeps the store's currency rates (Store Settings → currencyConversionRates) up to date from a
 * live source, so US prices and the INR value of US orders use today's rate instead of a number
 * typed in once. Runs every 6 hours; with several server workers only one runs it (JobLock).
 * Turn off with FX_AUTO_UPDATE=false; choose currencies with FX_AUTO_CURRENCIES (default USD).
 */

const crypto = require("crypto");
const StoreSettings = require("../models/StoreSettings");
const JobLock = require("../models/JobLock");
const { invalidateProductCache } = require("../utils/cache");
const { FX_SOURCE_NAME, getFxConfig, planRateUpdate, fetchInrRates, describeRate } = require("../utils/fxRates");

const LOCK_ID = "fx-rate-sync";
const LOCK_TTL_MS = 2 * 60 * 1000;
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 60 * 1000;

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
    if (err?.code === 11000) return null;
    throw err;
  }
}

function releaseLock(owner, result) {
  return JobLock.updateOne(
    { _id: LOCK_ID, owner },
    { $set: { owner: "", lockedUntil: null, lastRunAt: new Date(), lastResult: result } }
  );
}

/** Fetches live rates and saves the ones that changed. Returns a short result. */
async function runFxRateSync({ trigger = "schedule", fetchImpl } = {}) {
  const config = getFxConfig();
  if (!config.enabled || config.currencies.length === 0) return { status: "disabled" };

  const owner = await acquireLock();
  if (!owner) return { status: "busy" };

  let result = { status: "error" };
  try {
    const settings = await StoreSettings.findOne().select("currencyConversionRates currencyRatesMeta").lean();
    const current = settings?.currencyConversionRates || {};
    const previousLive = settings?.currencyRatesMeta?.lastLiveRates || {};
    const now = new Date();
    try {
      const { rates, sourceUpdatedAt } = await fetchInrRates({ fetchImpl });
      const { updates, skipped } = planRateUpdate(current, rates, { currencies: config.currencies, previousLive });

      const set = {
        "currencyRatesMeta.source": FX_SOURCE_NAME,
        "currencyRatesMeta.lastCheckedAt": now,
        "currencyRatesMeta.sourceUpdatedAt": sourceUpdatedAt,
        "currencyRatesMeta.lastError": skipped.length
          ? skipped.map((s) => (s.reason === "change-too-large" ? `${s.currency} moved ${s.changePct}%, not applied` : `${s.currency} not in source`)).join("; ")
          : ""
      };
      for (const [currency, rate] of Object.entries(updates)) {
        set[`currencyConversionRates.${currency}`] = rate;
      }
      // Remember the live rates applied, for the next run's sanity check
      for (const currency of config.currencies) {
        const applied = updates[currency] ?? (skipped.some((s) => s.currency === currency) ? null : current[currency]);
        if (Number.isFinite(Number(applied)) && Number(applied) > 0) {
          set[`currencyRatesMeta.lastLiveRates.${currency}`] = Number(applied);
        }
      }
      if (Object.keys(updates).length) set["currencyRatesMeta.updatedAt"] = now;

      await StoreSettings.updateOne({}, { $set: set }, { upsert: true });
      if (Object.keys(updates).length) {
        invalidateProductCache();
        console.log(`[FX] Rates updated (${trigger}): ${Object.entries(updates).map(([c, r]) => describeRate(c, r)).join(", ")}`);
      }
      if (skipped.length) console.warn(`[FX] Not applied: ${set["currencyRatesMeta.lastError"]}`);
      result = { status: "ok", updated: updates, skipped };
    } catch (err) {
      await StoreSettings.updateOne(
        {},
        { $set: { "currencyRatesMeta.lastCheckedAt": now, "currencyRatesMeta.lastError": String(err.message || err).slice(0, 200) } }
      );
      console.warn(`[FX] Rate update failed (${trigger}): ${err.message}`);
      result = { status: "error", message: err.message };
    }
    return result;
  } finally {
    await releaseLock(owner, result.status).catch(() => {});
  }
}

function initFxRateScheduler() {
  const config = getFxConfig();
  if (!config.enabled) {
    console.log("[FX] Automatic currency rates are off (FX_AUTO_UPDATE=false).");
    return;
  }
  const run = () => runFxRateSync({ trigger: "schedule" }).catch((err) => {
    console.error("[FX] Scheduled rate update error:", err.message);
  });
  setTimeout(run, FIRST_RUN_DELAY_MS).unref?.();
  setInterval(run, SYNC_INTERVAL_MS).unref?.();
  console.log(`[FX] Currency rates update every 6 hours (${config.currencies.join(", ")}).`);
}

module.exports = { runFxRateSync, initFxRateScheduler };
