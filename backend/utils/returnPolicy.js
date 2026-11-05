/**
 * returnPolicy.js — Pure policy helpers for return requests and receipt-before-refund workflow.
 * CommonJS, no database calls, fully unit-testable.
 */

const RETURN_OVERDUE_DAYS = 14;

/**
 * Damaged or defective items: one worth up to this much (price x quantity, in rupees) needs no
 * physical return; the customer's photos are the evidence and they get a refund or a replacement
 * and keep the item. One worth more is sent back to the office (return postage paid by the
 * customer) before the refund or replacement.
 */
const DAMAGE_KEEP_LIMIT_INR = 300;

function isDamageReason(reason) {
  return /damaged|defective/i.test(String(reason || ""));
}

/** For a return request: is it a damage claim, the item's value, and may the customer keep it. */
function damageClaimPlan(item, reason) {
  const damaged = isDamageReason(reason);
  const valueInInr = Math.round((Number(item?.price) || 0) * Math.max(1, Number(item?.quantity) || 1) * 100) / 100;
  return {
    damaged,
    valueInInr,
    keepItem: damaged && valueInInr <= DAMAGE_KEEP_LIMIT_INR
  };
}

function isPhysicalItem(item) {
  return item?.isDigital !== true;
}

function isReturnOverdue(item, now = new Date()) {
  if (item?.returnRequest?.status !== "Approved") return false;
  if (!item?.returnRequest?.approvedAt) return false;

  const approvedTime = new Date(item.returnRequest.approvedAt).getTime();
  if (Number.isNaN(approvedTime)) return false;

  const nowTime = new Date(now).getTime();
  const overdueMs = RETURN_OVERDUE_DAYS * 24 * 60 * 60 * 1000;

  return nowTime - approvedTime > overdueMs;
}

function checkRefundReceipt({ order, itemIds, isSuperAdmin, waive, waiveReason }) {
  const status = String(order?.status || "").trim();
  if (status !== "Shipped" && status !== "Delivered") {
    return { ok: true };
  }

  const allItems = Array.isArray(order?.items) ? order.items : [];
  const hasItemIds = Array.isArray(itemIds) && itemIds.length > 0;
  const itemIdSet = hasItemIds ? new Set(itemIds.map(String)) : null;

  const targetItems = hasItemIds
    ? allItems.filter((item) => {
        const id = String(item?._id || item?.id || item?.product || "");
        return itemIdSet.has(id);
      })
    : allItems;

  const blockedItems = targetItems.filter((item) => {
    if (!isPhysicalItem(item)) return false;
    // A damaged item under the keep limit is refunded without coming back
    if (item?.returnRequest?.keepItem === true) return false;
    return item?.returnRequest?.status !== "Received";
  });

  if (blockedItems.length === 0) {
    return { ok: true };
  }

  const isSuper = Boolean(isSuperAdmin);
  const isWaive = Boolean(waive);
  const trimmedReason = String(waiveReason || "").trim();

  if (isSuper && isWaive && trimmedReason.length >= 10) {
    return { ok: true, waived: true, blockedItems };
  }

  let message = "Refund is blocked: the item(s) have not been received back yet.";
  if (isSuper) {
    message += " As a Super Admin, you can waive this requirement with a reason (min 10 characters).";
  }

  return { ok: false, blockedItems, message };
}

function restockableItems(items) {
  const list = Array.isArray(items) ? items : [];
  return list.filter((item) => {
    if (!isPhysicalItem(item)) return false;
    const status = item?.returnRequest?.status;
    if (status !== "Received" && status !== "Refunded") return false;
    return item?.returnRequest?.condition === "Good";
  });
}

function deriveOrderRefundStatus(order) {
  if (!order) return "Not Applicable";
  const currentRefundStatus = order.refundStatus || "Not Applicable";
  if (currentRefundStatus === "Refunded" || currentRefundStatus === "Partially Refunded") {
    return currentRefundStatus;
  }

  const items = Array.isArray(order.items) ? order.items : [];
  if (items.some((it) => it?.returnRequest?.status === "Received")) {
    return "Processing";
  }

  if (items.some((it) => it?.returnRequest?.status === "Requested" || it?.returnRequest?.status === "Approved")) {
    return "Pending";
  }

  const itemsWithReturn = items.filter(
    (it) => it?.returnRequest && it.returnRequest.status && it.returnRequest.status !== "Not Requested"
  );
  if (itemsWithReturn.length > 0 && itemsWithReturn.every((it) => it.returnRequest.status === "Rejected")) {
    return "Rejected";
  }
  // Every claim settled by a replacement (or rejected): nothing is owed back
  if (
    itemsWithReturn.length > 0 &&
    itemsWithReturn.some((it) => it.returnRequest.status === "Replaced") &&
    itemsWithReturn.every((it) => ["Replaced", "Rejected"].includes(it.returnRequest.status))
  ) {
    return "Not Applicable";
  }

  return currentRefundStatus;
}

/**
 * Whether an admin can send a replacement for an item: it must be a damaged/defective claim
 * that hasn't been settled, and (above the keep limit) the damaged item must be back.
 */
function replacementEligibility(order, item) {
  const rr = item?.returnRequest || {};
  if (!isPhysicalItem(item)) return { ok: false, message: "Only physical items can be replaced." };
  if (!rr.damaged) return { ok: false, message: "Replacements are for damaged or defective items." };
  if (["Refunded", "Replaced", "Rejected"].includes(rr.status)) {
    return { ok: false, message: `This claim is already ${String(rr.status).toLowerCase()}.` };
  }
  if (rr.keepItem !== true && rr.status !== "Received") {
    return { ok: false, message: `Items over ₹${DAMAGE_KEEP_LIMIT_INR} must be received back at the office before a replacement is sent.` };
  }
  if (String(order?.status || "") === "Cancelled") return { ok: false, message: "This order is cancelled." };
  return { ok: true };
}

module.exports = {
  replacementEligibility,
  DAMAGE_KEEP_LIMIT_INR,
  isDamageReason,
  damageClaimPlan,
  RETURN_OVERDUE_DAYS,
  isPhysicalItem,
  isReturnOverdue,
  checkRefundReceipt,
  restockableItems,
  deriveOrderRefundStatus
};
