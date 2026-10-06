const BASE_CURRENCY = "INR";

const DEFAULT_CURRENCY_EXCHANGE_RATES = {
  INR: 1,
  USD: 0.012,
  GBP: 0.009,
  CAD: 0.016,
  AUD: 0.019,
  NZD: 0.021,
  JPY: 1.71,
  CNY: 0.087,
  SGD: 0.016,
  AED: 0.044,
  SAR: 0.045,
  QAR: 0.044,
  KWD: 0.0037,
  OMR: 0.0046,
  BHD: 0.0045,
  PKR: 3.34,
  BDT: 1.46,
  NPR: 1.6,
  LKR: 3.61,
  EUR: 0.011
};

function normalizeCurrencyRates(rates = {}) {
  const normalized = { ...DEFAULT_CURRENCY_EXCHANGE_RATES };
  Object.keys(DEFAULT_CURRENCY_EXCHANGE_RATES).forEach((currencyCode) => {
    const candidate = Number(rates?.[currencyCode]);
    if (Number.isFinite(candidate) && candidate > 0) {
      normalized[currencyCode] = candidate;
    }
  });
  return normalized;
}

function normalizeCurrencyCode(value, fallback = BASE_CURRENCY) {
  const normalized = String(value || "").trim().toUpperCase();
  return DEFAULT_CURRENCY_EXCHANGE_RATES[normalized] ? normalized : fallback;
}

function convertCurrencyAmount(value, options = {}) {
  const amount = Number(value || 0);
  const sourceCurrency = normalizeCurrencyCode(options.sourceCurrency, BASE_CURRENCY);
  const targetCurrency = normalizeCurrencyCode(options.currency, BASE_CURRENCY);
  const rates = normalizeCurrencyRates(options.rates || {});

  if (!Number.isFinite(amount)) return 0;
  if (sourceCurrency === targetCurrency) return amount;

  const sourceRate = rates[sourceCurrency];
  const targetRate = rates[targetCurrency];
  if (!sourceRate || !targetRate) return amount;

  const inBaseCurrency = sourceCurrency === BASE_CURRENCY ? amount : amount / sourceRate;
  return inBaseCurrency * targetRate;
}

const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "PYG", "ISK", "UGX", "XAF", "XOF"]);
const THREE_DECIMAL = new Set(["KWD", "BHD", "OMR", "JOD", "TND"]);

function getCurrencyExponent(c = BASE_CURRENCY) {
  const code = String(c || BASE_CURRENCY).toUpperCase();
  return ZERO_DECIMAL.has(code) ? 0 : THREE_DECIMAL.has(code) ? 3 : 2;
}

function toMinorUnits(amount, currency = BASE_CURRENCY) {
  const v = Number(amount);
  if (!Number.isFinite(v)) return Number.NaN;
  const e = getCurrencyExponent(currency);
  if (e === 0) return Math.round(v);
  if (e === 3) return Math.round(Number((v * 100).toFixed(6))) * 10;
  return Math.round(Number((v * 100).toFixed(6))); // avoids 1.005*100 float error
}

function fromMinorUnits(minor, currency = BASE_CURRENCY) {
  const v = Number(minor);
  if (!Number.isFinite(v)) return Number.NaN;
  const e = getCurrencyExponent(currency);
  return Number((v / Math.pow(10, e)).toFixed(e));
}

function resolveItemsCurrency(items = []) {
  const set = [...new Set((items || []).map((i) => normalizeCurrencyCode(i?.currency, BASE_CURRENCY)))];
  return set.length === 1 ? { ok: true, currency: set[0] } : { ok: false, currency: "", currencies: set };
}

module.exports = {
  BASE_CURRENCY,
  DEFAULT_CURRENCY_EXCHANGE_RATES,
  normalizeCurrencyRates,
  normalizeCurrencyCode,
  convertCurrencyAmount,
  getCurrencyExponent,
  toMinorUnits,
  fromMinorUnits,
  resolveItemsCurrency
};
