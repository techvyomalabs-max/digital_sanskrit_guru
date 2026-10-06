const Product = require("../models/Product");
const Order = require("../models/Order");

const q = (i) => Number(i?.quantity);
const valid = (i) => i?.product && Number.isInteger(q(i)) && q(i) > 0;

async function incrementStock(items, { session } = {}) {
  const ops = items.filter(valid).map((i) => ({
    updateOne: {
      filter: { _id: i.product },
      update: { $inc: { stock: q(i) } }
    }
  }));
  if (ops.length) {
    await Product.bulkWrite(ops, { ordered: true, session });
  }
}

async function decrementStock(items, { session } = {}) {
  const applied = [];
  for (const i of items.filter(valid)) {
    const r = await Product.updateOne(
      { _id: i.product, isDeleted: { $ne: true }, stock: { $gte: q(i) } },
      { $inc: { stock: -q(i) } },
      { session }
    );
    if (r.modifiedCount !== 1) {
      if (!session) {
        await incrementStock(applied);
      }
      return [`${i.name || "Item"} (requested: ${q(i)})`];
    }
    applied.push(i);
  }
  return [];
}

async function reserveStockForOrder(target, { session } = {}) {
  const orderId = target?._id || target;
  const o = await Order.findOneAndUpdate(
    { _id: orderId, stockReserved: false, status: { $ne: "Cancelled" } },
    { $set: { stockReserved: true } },
    { returnDocument: "after", session }
  );
  if (!o) return { ok: true, alreadyReserved: true };

  const out = await decrementStock(o.items || [], { session });
  if (out.length) {
    if (!session) {
      await Order.updateOne({ _id: orderId }, { $set: { stockReserved: false } });
    }
    return { ok: false, outOfStock: out };
  }
  return { ok: true };
}

async function releaseStockForOrder(target, { session } = {}) {
  const orderId = target?._id || target;
  const prev = await Order.findOneAndUpdate(
    { _id: orderId, stockReserved: true },
    { $set: { stockReserved: false } },
    { returnDocument: "before", session }
  );
  if (!prev) return false;
  await incrementStock(prev.items || [], { session });
  return true;
}

module.exports = {
  decrementStock,
  incrementStock,
  reserveStockForOrder,
  releaseStockForOrder
};
