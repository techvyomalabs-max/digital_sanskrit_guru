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

module.exports = {
  BASE_CURRENCY,
  DEFAULT_CURRENCY_EXCHANGE_RATES,
  normalizeCurrencyRates,
  normalizeCurrencyCode,
  convertCurrencyAmount
};
