const { isInternationalCountry } = require("./productPricing");
const { getWarehouseState } = require("./orderTotals");

const roundMoney = (v) => Math.round((Number(v) || 0) * 100) / 100;

function getFxRate(order) {
  const currency = String(order?.currencyDisplay?.currency || "INR").trim().toUpperCase();
  if (!currency || currency === "INR") {
    return 1;
  }
  const fx = Number(order?.fxRateToInr);
  if (Number.isFinite(fx) && fx > 0) {
    return fx;
  }
  const totalInInr = Number(order?.totalInInr);
  const total = Number(order?.total);
  if (Number.isFinite(totalInInr) && totalInInr > 0 && Number.isFinite(total) && total > 0) {
    return totalInInr / total;
  }
  return null;
}

function toInr(order, amount) {
  const fx = getFxRate(order);
  if (fx === null) {
    return amount;
  }
  return roundMoney((Number(amount) || 0) * fx);
}

function getPlaceOfSupply(order) {
  const country = order?.shipping?.country;
  if (isInternationalCountry(country)) {
    return "Outside India (export)";
  }
  const state = String(order?.shipping?.state || "").trim();
  if (!state) {
    return "Not recorded";
  }
  return state;
}

function getTaxSplit(order, settings) {
  const td = order?.taxDetails;
  const rawCgst = Number(td?.cgstAmount || 0);
  const rawSgst = Number(td?.sgstAmount || 0);
  const rawIgst = Number(td?.igstAmount || 0);

  if (rawCgst + rawSgst + rawIgst > 0) {
    return {
      cgst: toInr(order, rawCgst),
      sgst: toInr(order, rawSgst),
      igst: toInr(order, rawIgst),
      source: "invoice"
    };
  }

  const rawGst = Number(order?.gstAmount || 0);
  if (rawGst > 0) {
    const gstInInr = toInr(order, rawGst);
    const isInternational = isInternationalCountry(order?.shipping?.country);
    const customerState = String(order?.shipping?.state || "").trim().toLowerCase();
    const warehouseState = getWarehouseState(settings);

    const isLocal = !isInternational && customerState !== "" && customerState === warehouseState;

    if (isLocal) {
      const cgst = roundMoney(gstInInr / 2);
      const sgst = roundMoney(gstInInr - cgst);
      return {
        cgst,
        sgst,
        igst: 0,
        source: "recomputed"
      };
    }

    return {
      cgst: 0,
      sgst: 0,
      igst: gstInInr,
      source: "recomputed"
    };
  }

  return {
    cgst: 0,
    sgst: 0,
    igst: 0,
    source: "invoice"
  };
}

function buildInvoiceRow(order, settings) {
  const fxRate = getFxRate(order);
  const warnings = [];

  const invoiceNumber = order?.invoiceNumber ? String(order.invoiceNumber) : "";
  if (!invoiceNumber) {
    warnings.push("missing_invoice_number");
  }

  const placeOfSupply = getPlaceOfSupply(order);
  if (placeOfSupply === "Not recorded") {
    warnings.push("missing_place_of_supply");
  }

  if (fxRate === null) {
    warnings.push("missing_fx_rate");
  }

  const isExport = isInternationalCountry(order?.shipping?.country);
  const currency = String(order?.currencyDisplay?.currency || "INR").trim().toUpperCase() || "INR";
  const originalTotal = Number(order?.total || 0);

  const totalInr = typeof order?.totalInInr === "number" && !Number.isNaN(order.totalInInr)
    ? order.totalInInr
    : toInr(order, originalTotal);

  const taxableValueInr = toInr(order, order?.subtotal || 0);
  const deliveryInr = toInr(order, order?.deliveryCharge || 0);
  const discountInr = toInr(order, order?.discount || 0);
  const refundedInr = Number(order?.refundedAmountInInr || 0);
  const refundStatus = String(order?.refundStatus || "Not Applicable");

  const taxSplit = getTaxSplit(order, settings);
  if (taxSplit.source === "recomputed") {
    warnings.push("tax_recomputed");
  }

  let paymentRef = "No payment ID";
  if (order?.paymentMeta?.razorpayPaymentId || order?.razorpayPaymentId) {
    paymentRef = "Razorpay";
  } else if (order?.paymentMeta?.manualOverride?.at) {
    paymentRef = "Manual (marked paid)";
  }

  return {
    orderId: String(order?._id || ""),
    invoiceNumber,
    invoiceDate: order?.createdAt ? new Date(order.createdAt) : null,
    customer: order?.user?.name || order?.shipping?.name || order?.billing?.name || "Customer",
    email: order?.user?.email || order?.shipping?.email || order?.billing?.email || "N/A",
    placeOfSupply,
    isExport,
    currency,
    originalTotal,
    taxableValueInr,
    cgst: taxSplit.cgst,
    sgst: taxSplit.sgst,
    igst: taxSplit.igst,
    deliveryInr,
    discountInr,
    totalInr,
    refundedInr,
    refundStatus,
    paymentRef,
    taxSource: taxSplit.source,
    warnings
  };
}

function reverseTaxProportionally(invoiceRow, refundInr) {
  const total = Number(invoiceRow?.totalInr || 0);
  const refund = Number(refundInr || 0);
  const ratio = total > 0 ? Math.min(1, Math.max(0, refund / total)) : 0;

  return {
    taxableValueInr: roundMoney((Number(invoiceRow?.taxableValueInr) || 0) * ratio),
    cgst: roundMoney((Number(invoiceRow?.cgst) || 0) * ratio),
    sgst: roundMoney((Number(invoiceRow?.sgst) || 0) * ratio),
    igst: roundMoney((Number(invoiceRow?.igst) || 0) * ratio)
  };
}

function isWithinPeriod(date, from, to) {
  if (!date) return false;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  if (from) {
    const f = new Date(from);
    if (!Number.isNaN(f.getTime()) && d < f) return false;
  }
  if (to) {
    const t = new Date(to);
    if (!Number.isNaN(t.getTime()) && d >= t) return false;
  }
  return true;
}

function buildCreditNoteRows(order, invoiceRow, { from, to } = {}) {
  const refunds = Array.isArray(order?.paymentMeta?.refunds) ? order.paymentMeta.refunds : [];
  const totalRefundedInr = Number(order?.refundedAmountInInr || 0);

  if (refunds.length === 0) {
    if (totalRefundedInr > 0) {
      const refundDate = order?.updatedAt
        ? new Date(order.updatedAt)
        : (order?.createdAt ? new Date(order.createdAt) : new Date());

      if (isWithinPeriod(refundDate, from, to)) {
        const taxReversal = reverseTaxProportionally(invoiceRow, totalRefundedInr);
        return [
          {
            orderId: String(order?._id || invoiceRow?.orderId || ""),
            invoiceNumber: invoiceRow?.invoiceNumber || "",
            refundDate,
            refundId: order?.paymentMeta?.razorpayRefundId || "",
            method: order?.paymentMeta?.refundMethod || "manual",
            reason: "Refund recorded without breakdown",
            placeOfSupply: invoiceRow?.placeOfSupply || "Not recorded",
            refundInr: totalRefundedInr,
            taxableValueInr: taxReversal.taxableValueInr,
            cgst: taxReversal.cgst,
            sgst: taxReversal.sgst,
            igst: taxReversal.igst,
            taxTreatment: "proportional",
            warnings: ["refund_date_approximate"]
          }
        ];
      }
    }
    return [];
  }

  const totalMinor = refunds.reduce((sum, r) => sum + (Number(r?.amountMinor) || 0), 0);
  let allocated = 0;
  const allocatedRefunds = refunds.map((r, idx) => {
    let refundInr = 0;
    if (idx === refunds.length - 1) {
      refundInr = roundMoney(totalRefundedInr - allocated);
    } else if (totalMinor > 0) {
      const share = (Number(r?.amountMinor) || 0) / totalMinor;
      refundInr = roundMoney(totalRefundedInr * share);
      allocated = roundMoney(allocated + refundInr);
    } else {
      refundInr = roundMoney(totalRefundedInr / refunds.length);
      allocated = roundMoney(allocated + refundInr);
    }
    return { entry: r, refundInr };
  });

  const rows = [];
  for (const { entry, refundInr } of allocatedRefunds) {
    const refundDate = entry?.at
      ? new Date(entry.at)
      : (order?.updatedAt ? new Date(order.updatedAt) : new Date());

    if (isWithinPeriod(refundDate, from, to)) {
      const taxReversal = reverseTaxProportionally(invoiceRow, refundInr);
      rows.push({
        orderId: String(order?._id || invoiceRow?.orderId || ""),
        invoiceNumber: invoiceRow?.invoiceNumber || "",
        refundDate,
        refundId: String(entry?.refundId || entry?.reference || ""),
        method: String(entry?.method || "manual"),
        reason: String(entry?.reason || ""),
        placeOfSupply: invoiceRow?.placeOfSupply || "Not recorded",
        refundInr,
        taxableValueInr: taxReversal.taxableValueInr,
        cgst: taxReversal.cgst,
        sgst: taxReversal.sgst,
        igst: taxReversal.igst,
        taxTreatment: "proportional",
        warnings: []
      });
    }
  }

  return rows;
}

function summarize(invoiceRows = [], creditNoteRows = []) {
  let grossInvoicedInr = 0;
  let taxableValueInr = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let deliveryInr = 0;
  let discountInr = 0;

  for (const inv of invoiceRows) {
    grossInvoicedInr += Number(inv.totalInr || 0);
    taxableValueInr += Number(inv.taxableValueInr || 0);
    cgst += Number(inv.cgst || 0);
    sgst += Number(inv.sgst || 0);
    igst += Number(inv.igst || 0);
    deliveryInr += Number(inv.deliveryInr || 0);
    discountInr += Number(inv.discountInr || 0);
  }

  let refundsInr = 0;
  let cnCgst = 0;
  let cnSgst = 0;
  let cnIgst = 0;

  for (const cn of creditNoteRows) {
    refundsInr += Number(cn.refundInr || 0);
    cnCgst += Number(cn.cgst || 0);
    cnSgst += Number(cn.sgst || 0);
    cnIgst += Number(cn.igst || 0);
  }

  const roundedGross = roundMoney(grossInvoicedInr);
  const roundedTaxable = roundMoney(taxableValueInr);
  const roundedCgst = roundMoney(cgst);
  const roundedSgst = roundMoney(sgst);
  const roundedIgst = roundMoney(igst);
  const roundedDelivery = roundMoney(deliveryInr);
  const roundedDiscount = roundMoney(discountInr);
  const roundedRefunds = roundMoney(refundsInr);

  const roundedCnCgst = roundMoney(cnCgst);
  const roundedCnSgst = roundMoney(cnSgst);
  const roundedCnIgst = roundMoney(cnIgst);

  const netReceivedInr = roundMoney(roundedGross - roundedRefunds);
  const totalInvoiceTax = roundedCgst + roundedSgst + roundedIgst;
  const totalCnTax = roundedCnCgst + roundedCnSgst + roundedCnIgst;
  const netTaxInr = roundMoney(totalInvoiceTax - totalCnTax);

  return {
    invoiceCount: invoiceRows.length,
    grossInvoicedInr: roundedGross,
    taxableValueInr: roundedTaxable,
    cgst: roundedCgst,
    sgst: roundedSgst,
    igst: roundedIgst,
    deliveryInr: roundedDelivery,
    discountInr: roundedDiscount,
    refundsInr: roundedRefunds,
    creditNoteTax: {
      cgst: roundedCnCgst,
      sgst: roundedCnSgst,
      igst: roundedCnIgst
    },
    netReceivedInr,
    netTaxInr
  };
}

module.exports = {
  roundMoney,
  getFxRate,
  toInr,
  getPlaceOfSupply,
  getTaxSplit,
  buildInvoiceRow,
  reverseTaxProportionally,
  buildCreditNoteRows,
  summarize
};
