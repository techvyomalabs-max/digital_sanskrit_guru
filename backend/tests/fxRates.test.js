const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { planRateUpdate, fetchInrRates, getFxConfig, describeRate } = require("../utils/fxRates");

describe("live currency rates", () => {
  it("updates the chosen currencies to the live rate", () => {
    const { updates, skipped } = planRateUpdate({ USD: 0.012, GBP: 0.009 }, { USD: 0.01186543210, GBP: 0.0091 }, { currencies: ["USD"] });
    assert.deepEqual(updates, { USD: 0.0118654 });
    assert.deepEqual(skipped, []);
  });

  it("the first live update replaces an old hand-typed rate, however different", () => {
    // Stored $1 = ₹83.33, live $1 = ₹94.54 (11.8% apart)
    const { updates } = planRateUpdate({ USD: 0.012 }, { USD: 0.010578 }, { currencies: ["USD"] });
    assert.deepEqual(updates, { USD: 0.010578 });
  });

  it("does not apply a jump of more than 10% from the previous live rate (likely a bad response)", () => {
    const { updates, skipped } = planRateUpdate({ USD: 0.0106 }, { USD: 0.02 }, { currencies: ["USD"], previousLive: { USD: 0.0106 } });
    assert.deepEqual(updates, {});
    assert.equal(skipped[0].reason, "change-too-large");
    assert.deepEqual(planRateUpdate({ USD: 0.0106 }, { USD: 0.0107 }, { currencies: ["USD"], previousLive: { USD: 0.0106 } }).updates, { USD: 0.0107 });
  });

  it("skips currencies missing from the source and unchanged rates", () => {
    assert.equal(planRateUpdate({}, {}, { currencies: ["USD"] }).skipped[0].reason, "missing-from-source");
    assert.deepEqual(planRateUpdate({ USD: 0.012 }, { USD: 0.012 }, { currencies: ["USD"] }).updates, {});
  });

  it("reads the source response and rejects bad ones", async () => {
    const ok = async () => ({ ok: true, json: async () => ({ result: "success", base_code: "INR", time_last_update_unix: 1762300000, rates: { USD: 0.0119 } }) });
    const r = await fetchInrRates({ fetchImpl: ok });
    assert.equal(r.rates.USD, 0.0119);
    assert.ok(r.sourceUpdatedAt instanceof Date);
    await assert.rejects(fetchInrRates({ fetchImpl: async () => ({ ok: false, status: 503 }) }), /503/);
    await assert.rejects(fetchInrRates({ fetchImpl: async () => ({ ok: true, json: async () => ({ result: "error" }) }) }), /no rates/);
    await assert.rejects(fetchInrRates({ fetchImpl: async () => ({ ok: true, json: async () => ({ result: "success", base_code: "USD", rates: {} }) }) }), /base currency/);
  });

  it("is on by default for USD and can be turned off", () => {
    assert.deepEqual(getFxConfig({}), { enabled: true, currencies: ["USD"] });
    assert.equal(getFxConfig({ FX_AUTO_UPDATE: "false" }).enabled, false);
    assert.deepEqual(getFxConfig({ FX_AUTO_CURRENCIES: "usd, gbp, inr, x" }).currencies, ["USD", "GBP"]);
  });

  it("describes a rate the way people read it", () => {
    assert.equal(describeRate("USD", 0.012), "1 USD = ₹83.33");
  });
});
