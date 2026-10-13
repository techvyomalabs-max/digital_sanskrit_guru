const defaultPolicy = require("../config/refundPolicy");

const round2 = (num) => Math.round((Number(num) || 0) * 100) / 100;

/**
 * Pure calculation for order refund quotes.
 * Does not make DB queries or network requests.
 *
 * @param {Object} params
 * @param {Object} params.order - The order document/object
 * @param {Array|string} [params.itemIds] - Array or comma-delimited string of item IDs. If empty, treated as whole-order cancellation.
 * @param {string} [params.reason="customer_choice"] - "store_fault" or "customer_choice"
 * @param {number|null} [params.gatewayFeePaise=null] - Razorpay fee in paise
 * @param {Object} [params.policy] - Refund policy config override
 * @returns {Object} Quote breakdown and refundable amount
 */
function computeRefundQuote({ order, itemIds, reason = "customer_choice", gatewayFeePaise = null, policy }) {
  if (!order) {
    throw new Error("Order is required to compute refund quote");
  }

  const activePolicy = {
    ...defaultPolicy,
    ...(policy || {})
  };

  const orderItems = Array.isArray(order.items) ? order.items : [];

  // Parse itemIds: if empty or missing, treated as WHOLE order (cancellation)
  const rawItemIds = Array.isArray(itemIds)
    ? itemIds.map((id) => String(id).trim()).filter(Boolean)
    : (typeof itemIds === "string" && itemIds.trim()
        ? itemIds.split(",").map((s) => s.trim()).filter(Boolean)
        : []);

  const isWholeOrder = rawItemIds.length === 0;
  const selectedIdSet = new Set(rawItemIds);

  const selectedItems = isWholeOrder
    ? orderItems
    : orderItems.filter((it) => {
        const id = String(it._id || it.id || it.product || "");
        return selectedIdSet.has(id);
      });

  // Gross value of all items in the order
  const allItemsGross = orderItems.reduce((acc, it) => {
    const p = Number(it.price) || 0;
    const q = Number(it.quantity) || 1;
    return acc + p * q;
  }, 0);

  const orderDiscount = Number(order.discount || 0);

  // Calculate itemsValue with proportional discount allocation
  const rawSelectedValue = selectedItems.reduce((sum, it) => {
    const itemGross = (Number(it.price) || 0) * (Number(it.quantity) || 1);
    const itemDiscount = allItemsGross > 0 ? orderDiscount * (itemGross / allItemsGross) : 0;
    return sum + (itemGross - itemDiscount);
  }, 0);

  // Currency & FX conversion
  const total = Number(order.total || 0);
  const totalInInr = Number(order.totalInInr !== undefined && order.totalInInr !== null ? order.totalInInr : total);
  const fxRate = Number(order.fxRateToInr) || (total > 0 && totalInInr > 0 ? totalInInr / total : 1);

  const isNonInr = Boolean(
    (order.currencyDisplay?.currency && order.currencyDisplay.currency !== "INR") ||
    (order.paymentMeta?.paidCurrency && order.paymentMeta.paidCurrency !== "INR") ||
    (order.fxRateToInr && order.fxRateToInr !== 1) ||
    (total > 0 && totalInInr > 0 && Math.abs(totalInInr - total) > 0.01)
  );

  const itemsValue = round2(rawSelectedValue * (isNonInr ? fxRate : 1));
  const rawDeliveryCharge = Number(order.deliveryCharge || 0);
  const deliveryChargeInInr = round2(rawDeliveryCharge * (isNonInr ? fxRate : 1));

  // Delivery refund logic
  let deliveryIncluded = 0;
  if (isWholeOrder) {
    // Whole-order cancellation includes delivery for both reasons
    deliveryIncluded = deliveryChargeInInr;
  } else if (reason === "store_fault") {
    // Item return on store fault: include delivery if policy allows and all physical items end up returned/refunded
    const physicalItems = orderItems.filter((it) => !it.isDigital);
    if (physicalItems.length > 0) {
      const allPhysicalReturned = physicalItems.every((it) => {
        const id = String(it._id || it.id || it.product || "");
        const alreadyRefunded = it.returnRequest?.status === "Refunded";
        const beingRefundedNow = selectedIdSet.has(id);
        return alreadyRefunded || beingRefundedNow;
      });
      if (allPhysicalReturned && activePolicy.refundDeliveryOnStoreFault) {
        deliveryIncluded = deliveryChargeInInr;
      }
    }
  } else if (reason === "customer_choice") {
    if (activePolicy.refundDeliveryOnCustomerChoice) {
      deliveryIncluded = deliveryChargeInInr;
    }
  }

  const refundBase = round2(itemsValue + deliveryIncluded);

  // Gateway fee share logic (customer_choice only, if policy enabled)
  let feeShare = 0;
  let feeUnknown = false;
  if (reason === "customer_choice" && activePolicy.deductGatewayFeeOnCustomerChoice) {
    if (gatewayFeePaise === null || gatewayFeePaise === undefined || !Number.isFinite(Number(gatewayFeePaise))) {
      feeUnknown = true;
      feeShare = 0;
    } else {
      const gatewayFeeInr = Number(gatewayFeePaise) / 100;
      feeShare = totalInInr > 0 ? round2(gatewayFeeInr * (refundBase / totalInInr)) : 0;
    }
  }

  // Return shipping deduction (customer_choice item returns only)
  let returnShipping = 0;
  if (!isWholeOrder && reason === "customer_choice") {
    returnShipping = round2(activePolicy.returnShippingDeductionInr || 0);
  }

  // Balance remaining check
  const refundedAmountInInr = Number(order.refundedAmountInInr || 0);
  const remainingBefore = Math.max(0, round2(totalInInr - refundedAmountInInr));

  const rawRefundable = Math.max(0, round2(refundBase - feeShare - returnShipping));
  const refundable = Math.min(rawRefundable, remainingBefore);

  // Breakdown lines for display
  const lines = [
    { label: "Items", amount: itemsValue }
  ];

  if (deliveryIncluded > 0) {
    lines.push({ label: "Delivery charges", amount: deliveryIncluded });
  }

  if (feeShare > 0) {
    lines.push({ label: "Payment gateway charges", amount: -feeShare });
  }

  if (returnShipping > 0) {
    lines.push({ label: "Return shipping deduction", amount: -returnShipping });
  }

  if (rawRefundable > remainingBefore) {
    lines.push({
      label: "Remaining balance cap adjustment",
      amount: -round2(rawRefundable - remainingBefore)
    });
  }

  const finalItemIds = isWholeOrder
    ? orderItems.map((it) => String(it._id || it.id || it.product || ""))
    : rawItemIds;

  return {
    reason,
    itemIds: finalItemIds,
    itemsValue,
    deliveryIncluded,
    feeShare,
    returnShipping,
    refundable,
    remainingBefore,
    feeUnknown,
    lines
  };
}

module.exports = {
  computeRefundQuote
};
