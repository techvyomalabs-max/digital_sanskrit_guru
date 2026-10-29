const mongoose = require("mongoose");
const { toPublicProduct } = require("./productProjection");

const MAX_OPTIONS = 12;
const MAX_LABEL_LENGTH = 40;

function normalizeOptionsInput(input, selfId = "") {
  if (!Array.isArray(input) || input.length === 0) {
    return { options: [], error: "Add at least one option." };
  }
  if (input.length > MAX_OPTIONS) {
    return { options: [], error: `At most ${MAX_OPTIONS} options.` };
  }

  const selfKey = String(selfId || "").trim();
  const seen = new Set();
  const options = [];

  for (let i = 0; i < input.length; i++) {
    const n = i + 1;
    const item = input[i] || {};
    const rawProduct = item.product?._id ?? item.product ?? item.productId ?? "";
    const productStr = String(rawProduct || "").trim();

    if (!productStr || !mongoose.Types.ObjectId.isValid(productStr)) {
      return { options: [], error: `Option ${n}: choose a product.` };
    }
    if (selfKey && productStr === selfKey) {
      return { options: [], error: `Option ${n}: a product cannot be an option of itself.` };
    }
    if (seen.has(productStr)) {
      return { options: [], error: `Option ${n}: this product is already an option.` };
    }

    const label = String(item.label ?? "").trim().slice(0, MAX_LABEL_LENGTH);
    if (!label) {
      return { options: [], error: `Option ${n}: add a label (for example Book or Flipbook).` };
    }

    seen.add(productStr);
    options.push({ product: productStr, label });
  }

  return { options, error: "" };
}

function validateOptionTargets(options = [], targetDocs = []) {
  const byId = new Map(
    (Array.isArray(targetDocs) ? targetDocs : []).map((doc) => [String(doc?._id || ""), doc])
  );

  for (const opt of options) {
    const id = String(opt?.product?._id ?? opt?.product ?? "");
    const label = String(opt?.label || "Option");
    const target = byId.get(id);

    if (!target) {
      return { ok: false, error: `${label}: product not found.` };
    }
    if (target.isDeleted === true) {
      return { ok: false, error: `${label}: that product is in the Recycle Bin.` };
    }
    if (target.hasOptions === true) {
      return { ok: false, error: `${label}: that product has its own options; options cannot be nested.` };
    }
  }

  return { ok: true, error: "" };
}

function pickPricingFromOptions(targetDocs = []) {
  const active = (Array.isArray(targetDocs) ? targetDocs : []).filter(
    (doc) => doc && doc.isDeleted !== true
  );
  if (active.length === 0) return null;

  let chosen = active[0];
  let bestPrice = Math.max(0, Number(chosen.price) || 0);

  for (let i = 1; i < active.length; i++) {
    const p = Math.max(0, Number(active[i].price) || 0);
    if (p < bestPrice) {
      bestPrice = p;
      chosen = active[i];
    }
  }

  return {
    price: bestPrice,
    internationalPrice:
      chosen.internationalPrice === null || chosen.internationalPrice === undefined
        ? null
        : Math.max(0, Number(chosen.internationalPrice) || 0),
    internationalCountryPrices: Array.isArray(chosen.internationalCountryPrices)
      ? chosen.internationalCountryPrices.map((c) => ({ ...c }))
      : [],
    marketPrices: Array.isArray(chosen.marketPrices)
      ? chosen.marketPrices.map((m) => ({ ...m }))
      : []
  };
}

function computeOptionsStock(targetDocs = []) {
  const active = (Array.isArray(targetDocs) ? targetDocs : []).filter(
    (doc) => doc && doc.isDeleted !== true
  );
  let total = 0;
  for (const doc of active) {
    if (doc.isDigital === true) {
      total += 1;
    } else {
      total += Math.max(0, Number(doc.stock) || 0);
    }
  }
  return total;
}

function summarizeOptionsForPublic(parent, productsById) {
  const opts = Array.isArray(parent?.options) ? parent.options : [];
  if (opts.length === 0) return [];

  const lookup = (id) => {
    if (!productsById) return null;
    if (productsById instanceof Map) return productsById.get(id);
    if (Array.isArray(productsById)) {
      return productsById.find((p) => String(p?._id || "") === id) || null;
    }
    return productsById[id] || null;
  };

  const out = [];
  for (const opt of opts) {
    const id = String(opt?.product?._id ?? opt?.product ?? "");
    const target = lookup(id);
    if (!target || target.isDeleted === true) continue;
    out.push({
      label: String(opt?.label || "").trim(),
      product: toPublicProduct(target)
    });
  }
  return out;
}

module.exports = {
  MAX_OPTIONS,
  MAX_LABEL_LENGTH,
  normalizeOptionsInput,
  validateOptionTargets,
  pickPricingFromOptions,
  computeOptionsStock,
  summarizeOptionsForPublic
};

