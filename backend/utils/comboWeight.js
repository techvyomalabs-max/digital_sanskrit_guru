"use strict";

/**
 * Pure helper for computing combo/bundle chargeable weights.
 */

function computeComboWeightGrams(productDoc) {
  if (!productDoc) return 0;

  const isCombo = Boolean(
    productDoc.productType === "bundle" ||
      (Array.isArray(productDoc.bundleItems) && productDoc.bundleItems.length > 0)
  );
  if (!isCombo) return 0;

  const bundleItems = Array.isArray(productDoc.bundleItems) ? productDoc.bundleItems : [];
  if (bundleItems.length === 0) return 0;

  let totalWeightGrams = 0;

  for (const bi of bundleItems) {
    if (!bi) continue;
    const comp = bi.product;

    // Custom entries without a populated component product document add 0
    if (!comp || typeof comp !== "object" || comp._bsontype === "ObjectId") continue;

    // Skip when the component isDigital === true or the bundle entry isDigital === true
    if (comp.isDigital === true || bi.isDigital === true) continue;

    const actualWeight = Math.max(0, Number(comp.weight) || 0);
    const l = Math.max(0, Number(comp.length) || 0);
    const w = Math.max(0, Number(comp.width) || 0);
    const h = Math.max(0, Number(comp.height) || 0);

    const volumetricWeightGrams = ((l * w * h) / 5000) * 1000;
    const chargeable = Math.max(actualWeight, volumetricWeightGrams);
    const qty = Math.max(1, Number(bi.quantity || 1));

    totalWeightGrams += chargeable * qty;
  }

  return Math.round(totalWeightGrams * 100) / 100;
}

function applyComboWeight(item, productDoc) {
  if (!item || !productDoc) return item;

  const isCombo = Boolean(
    productDoc.productType === "bundle" ||
      (Array.isArray(productDoc.bundleItems) && productDoc.bundleItems.length > 0)
  );

  if (isCombo && Number(item.weight || 0) <= 0) {
    item.weight = computeComboWeightGrams(productDoc);
  }

  return item;
}

function applyComboWeights(normalizedItems, byId) {
  const items = Array.isArray(normalizedItems) ? normalizedItems : [];
  for (const item of items) {
    if (!item) continue;
    const id = String(item.product || item._id || item.id || "");
    const productDoc = byId instanceof Map ? byId.get(id) : byId?.[id];
    applyComboWeight(item, productDoc);
  }
  return items;
}

module.exports = {
  computeComboWeightGrams,
  applyComboWeight,
  applyComboWeights
};
