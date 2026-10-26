const Product = require("../models/Product");
const Order = require("../models/Order");

const q = (i) => Number(i?.quantity);
const valid = (i) => i?.product && Number.isInteger(q(i)) && q(i) > 0;

const getId = (val) => {
  if (!val) return "";
  if (typeof val === "object" && val._id) return String(val._id).trim();
  return String(val).trim();
};

function expandItemsForStock(items = [], { includeComponents = true } = {}) {
  if (!Array.isArray(items)) return [];
  const map = new Map();

  for (const item of items) {
    if (item?.isDigital === true) continue;
    const pId = getId(item?.product);
    const itemQty = q(item);
    if (!pId || !Number.isInteger(itemQty) || itemQty <= 0) continue;

    const rawProduct = item.product?._id ? item.product._id : item.product;
    const itemName = item.name || "Item";

    if (map.has(pId)) {
      const existing = map.get(pId);
      existing.quantity += itemQty;
      if ((!existing.name || existing.name === "Bundle item") && item.name) {
        existing.name = item.name;
      }
    } else {
      map.set(pId, {
        product: rawProduct,
        quantity: itemQty,
        name: itemName
      });
    }

    const isBundle =
      item?.productType === "bundle" ||
      (Array.isArray(item?.bundleItems) && item.bundleItems.length > 0);

    if (includeComponents && isBundle && Array.isArray(item?.bundleItems)) {
      for (const component of item.bundleItems) {
        const cId = getId(component?.product);
        if (!cId) continue;
        if (component?.itemType === "custom") continue;
        if (component?.isDigital === true) continue;

        const compQtyFactor = Number(component?.quantity) || 1;
        const compTotalQty = Math.max(1, Math.floor(compQtyFactor)) * itemQty;
        const compProduct = component.product?._id ? component.product._id : component.product;
        const compName = component.name || "Bundle item";

        if (map.has(cId)) {
          const existing = map.get(cId);
          existing.quantity += compTotalQty;
          if (existing.name === "Bundle item" && component.name) {
            existing.name = component.name;
          }
        } else {
          map.set(cId, {
            product: compProduct,
            quantity: compTotalQty,
            name: compName
          });
        }
      }
    }
  }

  return Array.from(map.values());
}

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
    { $set: { stockReserved: true, stockComponentsReserved: true } },
    { returnDocument: "after", session }
  );
  if (!o) return { ok: true, alreadyReserved: true };

  const toDecrement = expandItemsForStock(o.items || [], { includeComponents: true });
  const out = await decrementStock(toDecrement, { session });
  if (out.length) {
    if (!session) {
      await Order.updateOne(
        { _id: orderId },
        { $set: { stockReserved: false, stockComponentsReserved: false } }
      );
    }
    return { ok: false, outOfStock: out };
  }
  return { ok: true };
}

async function releaseStockForOrder(target, { session } = {}) {
  const orderId = target?._id || target;
  const prev = await Order.findOneAndUpdate(
    { _id: orderId, stockReserved: true },
    { $set: { stockReserved: false, stockComponentsReserved: false } },
    { returnDocument: "before", session }
  );
  if (!prev) return false;
  const toIncrement = expandItemsForStock(prev.items || [], {
    includeComponents: prev.stockComponentsReserved === true
  });
  await incrementStock(toIncrement, { session });
  return true;
}

module.exports = {
  expandItemsForStock,
  decrementStock,
  incrementStock,
  reserveStockForOrder,
  releaseStockForOrder
};
