const GiftPass = require("../models/GiftPass");
const Order = require("../models/Order");
const { generateGiftCode } = require("../routes/giftRoutes");

async function issueGiftPassesForOrder(orderId) {
  const o = await Order.findOne({
    _id: orderId,
    paymentStatus: "Paid",
    isGift: true,
    status: { $ne: "Cancelled" }
  }).lean();
  if (!o) return [];

  const issued = [];
  for (let i = 0; i < (o.items || []).length; i++) {
    const it = o.items[i];
    if (it?.isDigital !== true) continue;

    let pass = null;
    let inserted = false;

    for (let attempt = 0; attempt < 3 && !pass; attempt++) {
      try {
        const r = await GiftPass.findOneAndUpdate(
          { order: o._id, product: it.product, lineIndex: i },
          {
            $setOnInsert: {
              code: generateGiftCode(),
              productName: it.name || "Digital Item",
              buyer: o.user,
              recipientEmail: o.giftRecipientEmail || "",
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
        pass = await GiftPass.findOne({ order: o._id, product: it.product, lineIndex: i }).lean();
      }
    }

    if (!pass) continue;
    await Order.updateOne({ _id: o._id }, { $set: { [`items.${i}.giftCode`]: pass.code } });
    if (inserted) {
      issued.push({ pass, item: it });
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
