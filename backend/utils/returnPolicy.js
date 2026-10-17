/**
 * returnPolicy.js — Pure policy helpers for return requests and receipt-before-refund workflow.
 * CommonJS, no database calls, fully unit-testable.
 */

const RETURN_OVERDUE_DAYS = 14;

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

  return currentRefundStatus;
}

module.exports = {
  RETURN_OVERDUE_DAYS,
  isPhysicalItem,
  isReturnOverdue,
  checkRefundReceipt,
  restockableItems,
  deriveOrderRefundStatus
};
