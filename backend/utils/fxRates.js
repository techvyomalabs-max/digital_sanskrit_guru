"use strict";

/**
 * Live currency rates for international prices and order values.
 * Store rates are "units of the currency per 1 INR" (e.g. USD 0.012 means $1 = ₹83.33).
 *
 * Source: ExchangeRate-API's open endpoint (no key, updated daily):
 *   https://open.er-api.com/v6/latest/INR  ->  { result: "success", rates: { USD: 0.0119, ... } }
 *
 * Only the currencies in FX_AUTO_CURRENCIES are updated (default USD). A live rate that moves
 * more than MAX_CHANGE_PCT from the previous LIVE rate is not applied: that is far beyond a
 * normal day's movement and more likely a bad response. The check is against the last live
 * rate, not the store's rate, because a rate typed in by hand may be months old (the first
 * live update replaces it whatever the difference).
 */

const FX_SOURCE_URL = "https://open.er-api.com/v6/latest/INR";
const FX_SOURCE_NAME = "ExchangeRate-API (open.er-api.com)";
const MAX_CHANGE_PCT = 10;
const FETCH_TIMEOUT_MS = 10000;

function getFxConfig(env = process.env) {
  const enabled = String(env.FX_AUTO_UPDATE ?? "true").trim().toLowerCase() !== "false";
  const currencies = String(env.FX_AUTO_CURRENCIES || "USD")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{3}$/.test(c) && c !== "INR");
  return { enabled, currencies: [...new Set(currencies)] };
}

/**
 * Which rates to change (pure).
 * @param {object} current   { USD: 0.012, ... } store rates per INR
 * @param {object} fetched   { USD: 0.0119, ... } rates per INR from the source
 * @param {object} options.previousLive  { USD: ... } the last live rates applied (sanity check)
 * @returns {{ updates: object, skipped: {currency, reason}[] }}
 */
function planRateUpdate(current = {}, fetched = {}, { currencies = ["USD"], maxChangePct = MAX_CHANGE_PCT, previousLive = {} } = {}) {
  const updates = {};
  const skipped = [];
  for (const currency of currencies) {
    const next = Number(fetched?.[currency]);
    if (!Number.isFinite(next) || next <= 0) {
      skipped.push({ currency, reason: "missing-from-source" });
      continue;
    }
    // Rates have about 6 significant digits; keep them that precise
    const rounded = Number(next.toPrecision(6));
    const lastLive = Number(previousLive?.[currency]);
    if (Number.isFinite(lastLive) && lastLive > 0) {
      const changePct = (Math.abs(rounded - lastLive) / lastLive) * 100;
      if (changePct > maxChangePct) {
        skipped.push({ currency, reason: "change-too-large", changePct: Math.round(changePct * 10) / 10 });
        continue;
      }
    }
    if (rounded === Number(current?.[currency])) continue;
    updates[currency] = rounded;
  }
  return { updates, skipped };
}

/** Fetches the latest rates per INR. Throws on a failed or malformed response. */
async function fetchInrRates({ fetchImpl = globalThis.fetch, url = FX_SOURCE_URL } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Rate source answered ${res.status}`);
    const data = await res.json();
    if (data?.result !== "success" || !data?.rates || typeof data.rates !== "object") {
      throw new Error("Rate source returned no rates");
    }
    if (String(data.base_code || "INR").toUpperCase() !== "INR") {
      throw new Error("Rate source returned rates for a different base currency");
    }
    return {
      rates: data.rates,
      sourceUpdatedAt: data.time_last_update_unix ? new Date(Number(data.time_last_update_unix) * 1000) : null
    };
  } finally {
    clearTimeout(timer);
  }
}

/** "$1 = ₹83.33" style text for a rate per INR. */
function describeRate(currency, ratePerInr) {
  const r = Number(ratePerInr);
  if (!Number.isFinite(r) || r <= 0) return `${currency}: -`;
  return `1 ${currency} = ₹${(1 / r).toFixed(2)}`;
}

module.exports = {
  FX_SOURCE_URL,
  FX_SOURCE_NAME,
  MAX_CHANGE_PCT,
  getFxConfig,
  planRateUpdate,
  fetchInrRates,
  describeRate
};
