export function isOptionsParent(product) {
  return product?.hasOptions === true;
}

export function getOptionCount(product) {
  if (Array.isArray(product?.publicOptions)) {
    return product.publicOptions.length;
  }
  if (Array.isArray(product?.options)) {
    return product.options.length;
  }
  return 0;
}

export function isOptionAvailable(optionProduct) {
  return optionProduct?.isDigital === true || Number(optionProduct?.stock || 0) > 0;
}

/**
 * Whether a format can be bought here:
 *  "available", "out-of-stock" (physical, none left) or "not-in-country" (physical, and the store
 *  doesn't ship physical items abroad). Digital formats (including Kindle) are always available.
 */
export function formatOptionStatus(optionProduct, { isInternational = false, physicalAbroad = true } = {}) {
  if (optionProduct?.isDigital === true) return "available";
  if (isInternational && physicalAbroad === false) return "not-in-country";
  return Number(optionProduct?.stock || 0) > 0 ? "available" : "out-of-stock";
}

const STATUS_RANK = { available: 0, "out-of-stock": 1, "not-in-country": 2 };

/**
 * The order customers see formats in: what can be bought first (out of stock and not shipped
 * here go last), then physical first in India and digital first abroad, then the order of the
 * admin's product types list, then the product's own order.
 * typeOrder: product type keys in Settings order.
 */
export function orderFormatOptions(publicOptions, { isInternational = false, physicalAbroad = true, typeOrder = [] } = {}) {
  if (!Array.isArray(publicOptions)) return [];
  const typeIndex = new Map((Array.isArray(typeOrder) ? typeOrder : []).map((key, i) => [String(key), i]));
  return publicOptions
    .map((entry, index) => {
      const product = entry?.product;
      const status = formatOptionStatus(product, { isInternational, physicalAbroad });
      const isDigital = product?.isDigital === true;
      return {
        entry,
        status,
        sort: [
          STATUS_RANK[status] ?? 3,
          isInternational ? (isDigital ? 0 : 1) : (isDigital ? 1 : 0),
          typeIndex.has(String(product?.formatTypeKey || "")) ? typeIndex.get(String(product.formatTypeKey)) : 999,
          index
        ]
      };
    })
    .sort((a, b) => {
      for (let i = 0; i < a.sort.length; i += 1) {
        if (a.sort[i] !== b.sort[i]) return a.sort[i] - b.sort[i];
      }
      return 0;
    })
    .map(({ entry, status }) => ({ ...entry, status }));
}

/** A format chosen by link (?format=): its product id, product type key or name. */
function matchesFormatParam(entry, wanted) {
  const value = String(wanted || "").trim().toLowerCase();
  if (!value) return false;
  const product = entry?.product || {};
  const label = String(entry?.label || "").trim().toLowerCase();
  return (
    String(product._id || "").toLowerCase() === value ||
    String(product.formatTypeKey || "").toLowerCase() === value ||
    label === value ||
    label.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") === value
  );
}

export function pickDefaultOptionId(publicOptions, preferredId, context = null) {
  if (!Array.isArray(publicOptions) || publicOptions.length === 0) {
    return "";
  }

  const pref = String(preferredId || "").trim();
  if (pref) {
    const matched = publicOptions.find((entry) => matchesFormatParam(entry, pref));
    if (matched?.product?._id) {
      return String(matched.product._id);
    }
  }

  if (context) {
    const ordered = orderFormatOptions(publicOptions, context);
    const first = ordered.find((entry) => entry.status === "available" && entry?.product?._id) || ordered[0];
    return String(first?.product?._id || "");
  }

  const firstAvailable = publicOptions.find(
    (entry) => entry?.product && isOptionAvailable(entry.product) && entry.product._id
  );
  if (firstAvailable) {
    return String(firstAvailable.product._id);
  }

  return String(publicOptions[0]?.product?._id || "");
}

export function getBuyProduct(product, selectedOptionId) {
  if (!isOptionsParent(product)) {
    return product;
  }
  const list = Array.isArray(product?.publicOptions) ? product.publicOptions : [];
  const targetId = String(selectedOptionId || "").trim();
  if (!targetId) {
    return null;
  }
  const found = list.find((entry) => String(entry?.product?._id || "") === targetId);
  return found?.product || null;
}

