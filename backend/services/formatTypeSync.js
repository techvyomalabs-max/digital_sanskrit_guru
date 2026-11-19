/**
 * formatTypeSync.js — when the admin changes a product type's HSN/SAC or GST in Settings,
 * every format of that type that follows the type (no own HSN/GST) gets the new values.
 * Orders already placed are not touched: each order line keeps the tax it was charged.
 */

const Product = require("../models/Product");
const { findType, effectiveFormatTax } = require("../utils/productFormatTypes");

async function syncFormatTypeTax(types) {
  const keys = (Array.isArray(types) ? types : []).map((t) => t.key).filter(Boolean);
  if (keys.length === 0) return 0;
  const parents = await Product.find({ "bundleFormats.typeKey": { $in: keys }, isDeleted: { $ne: true } })
    .select("bundleFormats")
    .lean();

  let updated = 0;
  for (const parent of parents) {
    for (const format of parent.bundleFormats || []) {
      const type = findType(types, format?.typeKey);
      if (!type || !format?.product) continue;
      const tax = effectiveFormatTax(format, type);
      const res = await Product.updateOne(
        { _id: format.product, $or: [{ hsnSac: { $ne: tax.hsnSac } }, { gstRate: { $ne: tax.gstRate } }] },
        { $set: { hsnSac: tax.hsnSac, gstRate: tax.gstRate } }
      );
      updated += res.modifiedCount || 0;
    }
  }
  return updated;
}

module.exports = { syncFormatTypeTax };
