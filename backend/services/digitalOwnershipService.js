const mongoose = require("mongoose");
const Order = require("../models/Order");
const GiftPass = require("../models/GiftPass");
const Product = require("../models/Product");
const { getOwnedDigitalProductIds, analyzeDigitalOwnership } = require("../utils/digitalOwnership");

/**
 * Retrieves the Set of digital product IDs owned by a user from Order and GiftPass records.
 *
 * @param {string|mongoose.Types.ObjectId} userId
 * @returns {Promise<Set<string>>}
 */
async function getOwnedDigitalIdsForUser(userId) {
  if (!userId) return new Set();

  const userObjectId = mongoose.isValidObjectId(userId) ? userId : null;
  if (!userObjectId) return new Set();

  const [orders, redeemedPasses] = await Promise.all([
    Order.find({ user: userObjectId, paymentStatus: "Paid" })
      .select("status paymentStatus refundStatus isGift items.product items.isDigital items.isGift items.giftCode items.returnRequest.status items.bundleItems.product items.bundleItems.isDigital")
      .lean(),
    GiftPass.find({ redeemedBy: userObjectId, isRedeemed: true, isRevoked: { $ne: true } })
      .select("product isRedeemed isRevoked")
      .lean()
  ]);

  return getOwnedDigitalProductIds({ orders, redeemedPasses });
}

/**
 * Builds normalized cart lines from the database given client-provided items.
 * Ignores invalid IDs and caps input items at 50.
 *
 * @param {Array} items [{ id or _id or product, quantity }]
 * @returns {Promise<Array<{ productId: string, name: string, isDigital: boolean, isBundle: boolean, components: Array<{ productId: string|null, name: string, isDigital: boolean }> }>>}
 */
async function buildLinesFromCartItems(items) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const capped = items.slice(0, 50);

  const validIdMap = new Map();
  for (const it of capped) {
    if (!it) continue;
    const rawId = it.productId || it.product?._id || it.product || it._id || it.id;
    const strId = String(rawId || "").trim();
    if (mongoose.isValidObjectId(strId)) {
      validIdMap.set(strId, true);
    }
  }

  const validIds = Array.from(validIdMap.keys());
  if (validIds.length === 0) return [];

  const dbProducts = await Product.find({ _id: { $in: validIds }, isDeleted: { $ne: true } })
    .select("name isDigital productType bundleItems skipOwnershipRules")
    .populate("bundleItems.product", "name isDigital")
    .lean();

  const productMap = new Map(dbProducts.map((p) => [String(p._id), p]));

  const lines = [];
  for (const it of capped) {
    if (!it) continue;
    const rawId = it.productId || it.product?._id || it.product || it._id || it.id;
    const strId = String(rawId || "").trim();
    const prod = productMap.get(strId);
    if (!prod) continue;

    const isBundle =
      String(prod.productType || "").toLowerCase() === "bundle" ||
      (Array.isArray(prod.bundleItems) && prod.bundleItems.length > 0);

    const components = isBundle
      ? (prod.bundleItems || []).map((bi) => {
          const bp = bi?.product && typeof bi.product === "object" ? bi.product : null;
          const compProdId = bp?._id ? String(bp._id) : (bi?.product ? String(bi.product) : null);
          const compName = String(bp?.name || bi?.name || "Product").trim();
          const compIsDigital = (bp || bi)?.isDigital === true;
          return {
            productId: compProdId,
            name: compName,
            isDigital: compIsDigital
          };
        })
      : [];

    lines.push({
      productId: String(prod._id),
      name: String(prod.name || "Product").trim(),
      isDigital: prod.isDigital === true,
      isBundle,
      exempt: prod.skipOwnershipRules === true,
      components
    });
  }

  return lines;
}

/**
 * Checks digital ownership for a user's cart.
 *
 * @param {Object} params
 * @param {string|mongoose.Types.ObjectId} [params.userId]
 * @param {Array} params.items
 * @param {boolean} [params.isGift]
 * @returns {Promise<{ blocked: boolean, giftAllowed: boolean, notice: boolean, ownedItems: string[], message: string }>}
 */
async function checkDigitalOwnership({ userId, items, isGift }) {
  const [ownedIds, lines] = await Promise.all([
    userId ? getOwnedDigitalIdsForUser(userId) : Promise.resolve(new Set()),
    buildLinesFromCartItems(items)
  ]);

  return analyzeDigitalOwnership({ lines, ownedIds, isGift: Boolean(isGift) });
}

module.exports = {
  getOwnedDigitalIdsForUser,
  buildLinesFromCartItems,
  checkDigitalOwnership
};
