const roundMoney = (v) => Math.round((Number(v) || 0) * 100) / 100;
const str = (v) => String(v || "").trim();

/**
 * Builds normalized component list from a populated product document.
 * Follows rule: componentValue(c) = Number(bundleItem.price) if > 0,
 * else Number(populated component product.price) if > 0, else 0.
 *
 * @param {Object} productDoc
 * @returns {Array<{ productId: string, name: string, isDigital: boolean, value: number }>}
 */
function buildComponentsFromProduct(productDoc) {
  if (!productDoc || !Array.isArray(productDoc.bundleItems)) {
    return [];
  }

  return productDoc.bundleItems.map((bi) => {
    const bp = bi?.product && typeof bi.product === "object" && bi.product._id ? bi.product : bi?.product;
    const isDigital = Boolean((bp || bi)?.isDigital === true);
    const productId = bp?._id ? String(bp._id) : (bp ? String(bp) : "");
    const name = str(bp?.name || bi?.name);

    const biPrice = Number(bi?.price);
    const bpPrice = Number(bp?.price);

    let value = 0;
    if (Number.isFinite(biPrice) && biPrice > 0) {
      value = biPrice;
    } else if (Number.isFinite(bpPrice) && bpPrice > 0) {
      value = bpPrice;
    } else {
      value = 0;
    }

    return {
      productId,
      name,
      isDigital,
      value
    };
  });
}

/**
 * Computes the pro-rata upgrade credit per unit for a combo.
 *
 * @param {Object} params
 * @param {number} params.unitPrice
 * @param {Array<{ productId: string, name: string, isDigital: boolean, value: number }>} params.components
 * @param {Set<string>|Array<string>} params.ownedIds
 * @returns {{ creditPerUnit: number, ownedItems: string[], ownedValue: number, totalValue: number }}
 */
function computeUpgradeCreditPerUnit({ unitPrice, components = [], ownedIds }) {
  const uPrice = Number(unitPrice) || 0;
  if (!Array.isArray(components) || components.length === 0 || uPrice <= 0) {
    return {
      creditPerUnit: 0,
      ownedItems: [],
      ownedValue: 0,
      totalValue: 0
    };
  }

  const ownedSet = ownedIds instanceof Set
    ? ownedIds
    : new Set(Array.isArray(ownedIds) ? ownedIds.map(String) : []);

  let totalValue = 0;
  let ownedValue = 0;
  const ownedItems = [];

  for (const c of components) {
    const val = Number(c?.value) || 0;
    totalValue += val;

    const isDigital = c?.isDigital === true;
    const pId = c?.productId ? String(c.productId) : "";

    if (isDigital && pId && ownedSet.has(pId)) {
      ownedValue += val;
      if (c?.name) {
        ownedItems.push(c.name);
      }
    }
  }

  totalValue = roundMoney(totalValue);
  ownedValue = roundMoney(ownedValue);

  if (totalValue <= 0 || ownedValue <= 0) {
    return {
      creditPerUnit: 0,
      ownedItems: [],
      ownedValue,
      totalValue
    };
  }

  const rawCredit = roundMoney((uPrice * ownedValue) / totalValue);
  const maxCredit = Math.max(0, roundMoney(uPrice - 0.01));
  const creditPerUnit = Math.min(Math.max(0, rawCredit), maxCredit);

  if (creditPerUnit <= 0) {
    return {
      creditPerUnit: 0,
      ownedItems: [],
      ownedValue,
      totalValue
    };
  }

  return {
    creditPerUnit,
    ownedItems,
    ownedValue,
    totalValue
  };
}

module.exports = {
  buildComponentsFromProduct,
  computeUpgradeCreditPerUnit,
  roundMoney
};
