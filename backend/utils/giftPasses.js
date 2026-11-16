const GiftPass = require("../models/GiftPass");
const Order = require("../models/Order");
const { generateGiftCode } = require("../routes/giftRoutes");
const { codesForLine } = require("./digitalCopies");

/**
 * Issues the shareable codes of a paid order: for gift orders every copy, for normal orders the
 * extra copies (see utils/digitalCopies.js). Idempotent: codes that exist are kept. Returns the
 * newly issued codes [{ pass, item }].
 */
async function issueGiftPassesForOrder(orderId) {
  const o = await Order.findOne({
    _id: orderId,
    paymentStatus: "Paid",
    status: { $ne: "Cancelled" },
    refundStatus: { $ne: "Refunded" }
  }).lean();
  if (!o) return [];

  const issued = [];
  for (let i = 0; i < (o.items || []).length; i++) {
    const it = o.items[i];
    const copies = codesForLine(o, it);
    if (copies <= 0) continue;
    // A line that already shows a code has its first pass (possibly made by older code with a
    // different line number): never make a second "first" pass, only the missing extra copies
    const hasFirstCode = Boolean(it.giftCode);

    let firstCode = hasFirstCode ? it.giftCode : "";
    for (let copyIndex = hasFirstCode ? 1 : 0; copyIndex < copies; copyIndex++) {
      let pass = null;
      let inserted = false;
      // Older codes were made before copyIndex existed; they count as copy 0
      const filter = copyIndex === 0
        ? { order: o._id, product: it.product, lineIndex: i, copyIndex: { $in: [0, null] } }
        : { order: o._id, product: it.product, lineIndex: i, copyIndex };

      for (let attempt = 0; attempt < 3 && !pass; attempt++) {
        try {
          const r = await GiftPass.findOneAndUpdate(
            filter,
            {
              $setOnInsert: {
                code: generateGiftCode(),
                productName: it.name || "Digital Item",
                buyer: o.user,
                recipientEmail: o.isGift ? o.giftRecipientEmail || "" : "",
                copyIndex,
                isRedeemed: false,
                isRevoked: false
              }
            },
            { upsert: true, returnDocument: "after", includeResultMetadata: true }
          );
          pass = r.value;
          inserted = !r.lastErrorObject?.updatedExisting;
        } catch (e) {
          if (e?.code !== 11000) throw e;
          pass = await GiftPass.findOne(filter).lean();
        }
      }
      if (!pass) continue;
      if (copyIndex === 0) firstCode = pass.code;
      if (inserted) issued.push({ pass, item: it });
    }

    // Gift lines show their (first) code on the order, as before
    if (firstCode && (o.isGift || it.isGift) && it.giftCode !== firstCode) {
      await Order.updateOne({ _id: o._id }, { $set: { [`items.${i}.giftCode`]: firstCode } });
    }
  }

  return issued;
}

const revokeGiftPassesForOrder = (orderId, reason = "order-cancelled") =>
  GiftPass.updateMany(
    { order: orderId, isRevoked: { $ne: true } },
    { $set: { isRevoked: true, revokedAt: new Date(), revokedReason: reason } }
  );

module.exports = {
  issueGiftPassesForOrder,
  revokeGiftPassesForOrder
};
