"use strict";

/**
 * Finance reports, built on the server from the orders as saved (the same figures as the
 * tax invoice), so every download of a period gives the same numbers.
 *
 *   sales         Master sales register: one row per order (paid, refunded, failed, pending)
 *   lines         Invoice line register: one row per invoiced item
 *   gst           GST summary: by place of supply and rate, by HSN/SAC, credit notes, net
 *   credit-notes  Refunds and credit notes
 *
 * Amounts are in INR, converted at each order's own exchange rate.
 */

const { buildInvoice } = require("./invoiceData");
const { getFxRate, buildInvoiceRow, buildCreditNoteRows, roundMoney } = require("./financeLedger");

const REPORTS = {
  sales: "Master sales register",
  lines: "Invoice line register",
  gst: "GST summary",
  "credit-notes": "Refunds and credit notes"
};

const IST = "Asia/Kolkata";

function istDate(value) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(d); // YYYY-MM-DD
}

const money = (v) => roundMoney(v).toFixed(2);

function fxOf(order) {
  const fx = getFxRate(order);
  return fx === null ? 1 : fx;
}

const inr = (order, amount) => roundMoney((Number(amount) || 0) * fxOf(order));

function supplyType(inv) {
  if (inv.isExport) return "Export";
  return inv.isB2B ? "B2B" : "B2C";
}

function taxType(inv) {
  if (inv.isExport) return "Export (no GST)";
  return inv.isLocal ? "CGST + SGST" : "IGST";
}

const isSale = (order) => order?.paymentStatus === "Paid" || order?.paymentStatus === "Refunded";

function paymentId(order) {
  return String(order?.paymentMeta?.razorpayPaymentId || order?.razorpayPaymentId || "");
}

/** Invoice figures for an order, in INR. */
function invoiceInr(order, inv) {
  const t = inv.totals;
  const parts = {
    gross: inr(order, t.gross),
    discount: inr(order, t.discount),
    taxable: inr(order, t.taxable),
    cgst: inr(order, t.cgst),
    sgst: inr(order, t.sgst),
    igst: inr(order, t.igst),
    delivery: inr(order, t.deliveryCharge)
  };
  parts.tax = roundMoney(parts.cgst + parts.sgst + parts.igst);
  const saved = Number(order?.totalInInr);
  parts.total = Number.isFinite(saved) && saved > 0 ? roundMoney(saved) : inr(order, t.grandTotal);
  return parts;
}

// ── Master sales register ────────────────────────────────────────────────────

const SALES_HEADERS = [
  "Invoice No", "Invoice Date", "Order Ref", "Order ID", "Order Date", "Payment Status", "Counts As Sale",
  "Order Status", "Payment Method", "Payment ID", "Customer Name", "Email", "Phone", "Business Name",
  "Customer GSTIN", "Supply Type", "Billing State", "Place Of Supply", "POS Code", "Tax Type",
  "Currency", "FX Rate To INR", "Order Total (Currency)", "Items Before Discount INR", "Discount INR",
  "Taxable Value INR", "CGST INR", "SGST INR", "IGST INR", "Total Tax INR", "Delivery INR",
  "Invoice Total INR", "Check Difference INR", "Refunded INR", "Refund Status", "Net Received INR"
];

function salesRow(order, { user = null } = {}) {
  const inv = buildInvoice(order, { user: user || order?.user });
  const a = invoiceInr(order, inv);
  const sale = isSale(order);
  const refunded = sale ? roundMoney(Number(order?.refundedAmountInInr || 0)) : 0;
  return [
    sale ? inv.invoiceNumber : "",
    sale ? istDate(inv.invoiceDate) : "",
    inv.orderRef,
    String(order?._id || ""),
    istDate(order?.createdAt),
    String(order?.paymentStatus || "Pending"),
    sale ? "Yes" : "No",
    String(order?.status || ""),
    String(order?.paymentMethod || "Razorpay"),
    paymentId(order),
    inv.buyer.name,
    inv.buyer.email,
    inv.buyer.phone,
    inv.buyer.businessName,
    inv.buyer.gstin,
    supplyType(inv),
    inv.buyer.state,
    inv.placeOfSupply.state,
    inv.placeOfSupply.stateCode,
    taxType(inv),
    inv.currency,
    fxOf(order).toFixed(6),
    money(Number(order?.total ?? inv.totals.grandTotal)),
    money(a.gross),
    money(a.discount),
    money(a.taxable),
    money(a.cgst),
    money(a.sgst),
    money(a.igst),
    money(a.tax),
    money(a.delivery),
    money(a.total),
    // Taxable + tax + delivery should equal the invoice total (0.00, or a paisa of rounding on foreign currency)
    money(a.taxable + a.tax + a.delivery - a.total),
    money(refunded),
    String(order?.refundStatus || "Not Applicable"),
    money(sale ? a.total - refunded : 0)
  ];
}

// ── Invoice line register ────────────────────────────────────────────────────

const LINE_HEADERS = [
  "Invoice No", "Invoice Date", "Order Ref", "Supply Type", "Place Of Supply", "POS Code", "Customer GSTIN",
  "Line", "Item", "Format", "HSN/SAC", "Qty", "Unit Price (Currency)", "Currency", "FX Rate To INR",
  "Gross INR", "Discount INR", "Taxable Value INR", "GST Rate %", "CGST Rate %", "CGST INR",
  "SGST Rate %", "SGST INR", "IGST Rate %", "IGST INR", "Total Tax INR", "Line Total INR"
];

function lineRows(order) {
  const inv = buildInvoice(order, { user: order?.user });
  return inv.lines.map((l, i) => [
    inv.invoiceNumber,
    istDate(inv.invoiceDate),
    inv.orderRef,
    supplyType(inv),
    inv.placeOfSupply.state,
    inv.placeOfSupply.stateCode,
    inv.buyer.gstin,
    String(i + 1),
    l.name,
    l.format,
    l.hsnSac,
    String(l.quantity),
    money(l.unitPrice),
    inv.currency,
    fxOf(order).toFixed(6),
    money(inr(order, l.gross)),
    money(inr(order, l.discount)),
    money(inr(order, l.taxable)),
    String(l.rate),
    String(inv.isLocal ? l.rate / 2 : 0),
    money(inr(order, l.cgst)),
    String(inv.isLocal ? l.rate / 2 : 0),
    money(inr(order, l.sgst)),
    String(inv.isLocal || inv.isExport ? 0 : l.rate),
    money(inr(order, l.igst)),
    money(inr(order, l.tax)),
    money(inr(order, l.total))
  ]);
}

// ── Refunds and credit notes ────────────────────────────────────────────────

/**
 * Credit notes for refunds dated in the period. Tax is reversed line by line in the same
 * proportion as the refund, so each GST rate and HSN/SAC is reduced by its own share.
 */
function creditNotes(order, settings, period) {
  const inv = buildInvoice(order, { user: order?.user });
  const a = invoiceInr(order, inv);
  const ledgerRow = buildInvoiceRow(order, settings);
  return buildCreditNoteRows(order, ledgerRow, period).map((cn) => {
    const ratio = a.total > 0 ? Math.min(1, Math.max(0, cn.refundInr / a.total)) : 0;
    const lines = inv.lines.map((l) => ({
      hsnSac: l.hsnSac,
      rate: l.rate,
      taxable: roundMoney(inr(order, l.taxable) * ratio),
      cgst: roundMoney(inr(order, l.cgst) * ratio),
      sgst: roundMoney(inr(order, l.sgst) * ratio),
      igst: roundMoney(inr(order, l.igst) * ratio)
    }));
    const sum = (k) => roundMoney(lines.reduce((s, l) => s + l[k], 0));
    return {
      inv,
      cn,
      lines,
      taxable: sum("taxable"),
      cgst: sum("cgst"),
      sgst: sum("sgst"),
      igst: sum("igst"),
      deliveryShare: roundMoney(a.delivery * ratio)
    };
  });
}

const CREDIT_NOTE_HEADERS = [
  "Credit Note No", "Refund Date", "Original Invoice No", "Original Invoice Date", "Order Ref", "Customer Name",
  "Customer GSTIN", "Supply Type", "Place Of Supply", "POS Code", "Refund ID", "Method", "Reason",
  "Refund INR", "Taxable Value INR", "CGST INR", "SGST INR", "IGST INR", "Total Tax INR", "Delivery Share INR"
];

function creditNoteRow(c) {
  const tax = roundMoney(c.cgst + c.sgst + c.igst);
  return [
    String(c.cn.creditNoteNumber || ""),
    istDate(c.cn.refundDate),
    c.inv.invoiceNumber,
    istDate(c.inv.invoiceDate),
    c.inv.orderRef,
    c.inv.buyer.businessName || c.inv.buyer.name,
    c.inv.buyer.gstin,
    supplyType(c.inv),
    c.inv.placeOfSupply.state,
    c.inv.placeOfSupply.stateCode,
    c.cn.refundId,
    c.cn.method,
    c.cn.reason,
    money(c.cn.refundInr),
    money(c.taxable),
    money(c.cgst),
    money(c.sgst),
    money(c.igst),
    money(tax),
    money(c.deliveryShare)
  ];
}

// ── GST summary ──────────────────────────────────────────────────────────────

const GST_HEADERS = [
  "Section", "Supply Type", "Place Of Supply", "POS Code", "HSN/SAC", "GST Rate %", "Documents",
  "Taxable Value INR", "CGST INR", "SGST INR", "IGST INR", "Total Tax INR"
];

function gstSummaryRows(paidOrders, notes) {
  const groups = new Map();
  const add = (section, keyParts, l, docKey, sign = 1) => {
    const key = [section, ...keyParts].join("|");
    const g = groups.get(key) || { section, keyParts, docs: new Set(), taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    g.docs.add(docKey);
    g.taxable += sign * l.taxable;
    g.cgst += sign * l.cgst;
    g.sgst += sign * l.sgst;
    g.igst += sign * l.igst;
    groups.set(key, g);
  };

  for (const order of paidOrders) {
    const inv = buildInvoice(order, { user: order?.user });
    for (const l of inv.lines) {
      const li = {
        taxable: inr(order, l.taxable),
        cgst: inr(order, l.cgst),
        sgst: inr(order, l.sgst),
        igst: inr(order, l.igst)
      };
      const doc = inv.invoiceNumber || inv.orderRef;
      add("1 Sales by place of supply and rate", [supplyType(inv), inv.placeOfSupply.state, inv.placeOfSupply.stateCode, "", l.rate], li, doc);
      add("2 Sales by HSN/SAC and rate", ["", "", "", l.hsnSac, l.rate], li, doc);
      add("4 Net (sales less credit notes) by rate", ["", "", "", "", l.rate], li, doc);
    }
  }
  for (const c of notes) {
    const doc = `${c.inv.invoiceNumber || c.inv.orderRef}/${c.cn.refundId || istDate(c.cn.refundDate)}`;
    for (const l of c.lines) {
      add("3 Credit notes by place of supply and rate", [supplyType(c.inv), c.inv.placeOfSupply.state, c.inv.placeOfSupply.stateCode, "", l.rate], l, doc);
      add("4 Net (sales less credit notes) by rate", ["", "", "", "", l.rate], l, doc, -1);
    }
  }

  const rows = [...groups.values()].sort((a, b) => {
    if (a.section !== b.section) return a.section.localeCompare(b.section);
    for (let i = 0; i < a.keyParts.length; i += 1) {
      const x = a.keyParts[i];
      const y = b.keyParts[i];
      if (x === y) continue;
      return typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    }
    return 0;
  });

  return rows.map((g) => {
    const [supply, pos, code, hsn, rate] = g.keyParts;
    const tax = roundMoney(g.cgst + g.sgst + g.igst);
    return [g.section.slice(2), supply, pos, code, hsn, String(rate), String(g.docs.size), money(g.taxable), money(g.cgst), money(g.sgst), money(g.igst), money(tax)];
  });
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/** One CSV cell. Text that a spreadsheet would run as a formula is prefixed with '. */
function csvCell(value) {
  let s = String(value ?? "");
  const looksNumeric = /^-?\d+(\.\d+)?$/.test(s);
  if (!looksNumeric && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers, rows) {
  return `﻿${[headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/**
 * Builds one report.
 * periodOrders: orders created in the period (any payment status), for the sales register.
 * invoicedOrders: paid/refunded orders whose invoice date is in the period.
 * refundedOrders: orders with refunds that may fall in the period.
 */
function buildFinanceReport(report, { periodOrders = [], invoicedOrders = [], refundedOrders = [], settings = {}, period = {} }) {
  const label = `${period.fromStr || ""}_to_${period.toStr || ""}`;
  const name = (slug) => `DSG_${slug}_${label}.csv`;
  const byInvoiceDate = (a, b) => {
    const ia = buildInvoice(a);
    const ib = buildInvoice(b);
    return String(istDate(ia.invoiceDate) + ia.invoiceNumber).localeCompare(String(istDate(ib.invoiceDate) + ib.invoiceNumber));
  };

  if (report === "sales") {
    // Invoiced in the period, plus orders placed in the period that were not paid (failed or pending)
    const unpaid = periodOrders.filter((o) => !isSale(o));
    const rows = [...[...invoicedOrders].sort(byInvoiceDate), ...unpaid.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))]
      .map((o) => salesRow(o));
    return { filename: name("master_sales"), headers: SALES_HEADERS, rows };
  }
  if (report === "lines") {
    const rows = [...invoicedOrders].sort(byInvoiceDate).flatMap((o) => lineRows(o));
    return { filename: name("invoice_lines"), headers: LINE_HEADERS, rows };
  }
  const notes = refundedOrders
    .flatMap((o) => creditNotes(o, settings, { from: period.from, to: period.to }))
    .sort((a, b) => new Date(a.cn.refundDate) - new Date(b.cn.refundDate));
  if (report === "credit-notes") {
    return { filename: name("credit_notes"), headers: CREDIT_NOTE_HEADERS, rows: notes.map(creditNoteRow) };
  }
  if (report === "gst") {
    return { filename: name("gst_summary"), headers: GST_HEADERS, rows: gstSummaryRows(invoicedOrders, notes) };
  }
  return null;
}

module.exports = {
  REPORTS,
  SALES_HEADERS,
  LINE_HEADERS,
  GST_HEADERS,
  CREDIT_NOTE_HEADERS,
  buildFinanceReport,
  salesRow,
  lineRows,
  creditNotes,
  gstSummaryRows,
  csvCell,
  toCsv,
  istDate
};
