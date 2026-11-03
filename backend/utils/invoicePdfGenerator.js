"use strict";

/**
 * The one GST tax invoice PDF (A4), used for the download button (customer and admin) and the
 * email attachment. All figures come from buildInvoice(), i.e. from the order as saved.
 */

const PDFDocument = require("pdfkit");
const { buildInvoice, buildCreditNote } = require("./invoiceData");

// The built-in PDF fonts only have Latin-1 characters, so Sanskrit transliteration marks
// (ā, ś, ṇ …) are written as plain letters.
function plain(str) {
  return String(str ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7e\xa0-\xff\n]/g, "");
}

const SYMBOLS = { INR: "Rs. ", USD: "$", GBP: "\xa3", EUR: "EUR ", CAD: "C$", AUD: "A$", SGD: "S$", AED: "AED ", SAR: "SAR " };

function money(value, currency) {
  const n = Number(value) || 0;
  const [whole, frac] = Math.abs(n).toFixed(2).split(".");
  const grouped = currency === "INR"
    ? whole.replace(/(\d)(?=(\d\d)+\d$)/g, "$1,")
    : whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${n < 0 ? "-" : ""}${SYMBOLS[currency] || `${currency} `}${grouped}.${frac}`;
}

const num = (value) => {
  const n = Number(value) || 0;
  const [whole, frac] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "-" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac}`;
};
const pct = (rate) => `${Number(rate) % 1 === 0 ? Number(rate) : Number(rate).toFixed(2)}%`;

function dateText(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

const C = {
  ink: "#0f172a",
  body: "#334155",
  muted: "#64748b",
  line: "#e2e8f0",
  fill: "#f8fafc",
  head: "#1e293b",
  accent: "#b45309"
};

const PAGE = { left: 40, right: 555, width: 515, bottom: 790 };

/** Renders an invoice model (from buildInvoice) into a PDF Buffer. */
function renderInvoicePdf(inv) {
  return new Promise((resolve, reject) => {
    const title = inv.creditNote ? `Credit Note ${inv.creditNote.number}` : `Tax Invoice ${inv.invoiceNumber || inv.orderRef}`;
    const doc = new PDFDocument({ margin: 40, size: "A4", info: { Title: title, Author: inv.seller.legalName } });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      draw(doc, inv);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function draw(doc, inv) {
  const cur = inv.currency;
  const cn = inv.creditNote || null;
  const isInvoice = !cn && inv.isPaid && Boolean(inv.invoiceNumber);
  const { left, right, width } = PAGE;

  // ── Header ────────────────────────────────────────────────────────────────
  doc.rect(0, 0, 595.28, 6).fill(C.head);

  let y = 26;
  doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(13).text(plain(inv.seller.legalName), left, y, { width: 300 });
  y = doc.y + 1;
  doc.fillColor(C.accent).font("Helvetica-Bold").fontSize(8.5).text(plain(inv.seller.tradeName), left, y, { width: 300 });
  y = doc.y + 3;
  doc.fillColor(C.body).font("Helvetica").fontSize(8);
  if (inv.seller.address) {
    doc.text(plain(inv.seller.address), left, y, { width: 300 });
    y = doc.y + 1;
  }
  const sellerLines = [
    inv.seller.gstin ? `GSTIN: ${inv.seller.gstin}` : "GSTIN: not registered",
    `State: ${plain(inv.seller.state)}${inv.seller.stateCode ? ` (Code ${inv.seller.stateCode})` : ""}`,
    inv.seller.email ? `Email: ${inv.seller.email}` : ""
  ].filter(Boolean);
  for (const line of sellerLines) {
    doc.text(line, left, y, { width: 300 });
    y = doc.y + 1;
  }
  const sellerBottom = y;

  // Title and invoice facts on the right
  const rx = 355;
  const rw = right - rx;
  doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(15)
    .text(cn ? "CREDIT NOTE" : isInvoice ? "TAX INVOICE" : "ORDER SUMMARY", rx, 26, { width: rw, align: "right" });
  if (cn) {
    doc.fillColor(C.muted).font("Helvetica").fontSize(7.5).text("Issued for a refund (GST credit note)", rx, doc.y, { width: rw, align: "right" });
  } else if (!isInvoice) {
    doc.fillColor(C.accent).font("Helvetica-Bold").fontSize(7.5).text("Not a tax invoice: payment not received", rx, doc.y, { width: rw, align: "right" });
  } else {
    doc.fillColor(C.muted).font("Helvetica").fontSize(7.5).text("Original for recipient", rx, doc.y, { width: rw, align: "right" });
  }
  let fy = doc.y + 6;
  const fact = (label, value) => {
    doc.font("Helvetica").fontSize(8).fillColor(C.muted).text(label, rx, fy, { width: 95 });
    doc.font("Helvetica-Bold").fillColor(C.ink).text(plain(value), rx + 95, fy, { width: rw - 95, align: "right" });
    fy = Math.max(doc.y, fy + 10) + 1;
  };
  if (cn) {
    fact("Credit note no.", cn.number);
    fact("Credit note date", dateText(cn.date));
    fact("Against invoice", inv.invoiceNumber || "-");
    fact("Invoice date", dateText(inv.invoiceDate));
  } else if (isInvoice) {
    fact("Invoice no.", inv.invoiceNumber);
    fact("Invoice date", dateText(inv.invoiceDate));
  }
  fact("Order ref.", `#${inv.orderRef}`);
  fact("Order date", dateText(inv.orderDate));
  fact("Place of supply", `${inv.placeOfSupply.state}${inv.placeOfSupply.stateCode ? ` (${inv.placeOfSupply.stateCode})` : ""}`);
  fact("Reverse charge", inv.reverseCharge ? "Yes" : "No");

  y = Math.max(sellerBottom, fy) + 10;
  doc.moveTo(left, y).lineTo(right, y).strokeColor(C.line).lineWidth(1).stroke();
  y += 10;

  // ── Bill to / Ship to ───────────────────────────────────────────────────
  const colW = inv.shipTo ? (width - 12) / 2 : width;
  const partyBlock = (title, x, rows) => {
    doc.fillColor(C.muted).font("Helvetica-Bold").fontSize(7.5).text(title, x, y, { width: colW, characterSpacing: 0.6 });
    let py = doc.y + 3;
    rows.forEach(([style, value]) => {
      if (!value) return;
      doc.fillColor(style === "strong" ? C.ink : C.body)
        .font(style === "strong" ? "Helvetica-Bold" : "Helvetica")
        .fontSize(style === "strong" ? 9 : 8)
        .text(plain(value), x, py, { width: colW });
      py = doc.y + 1;
    });
    return py;
  };

  const b = inv.buyer;
  const billBottom = partyBlock("BILL TO", left, [
    ["strong", b.businessName || b.name],
    ["", b.businessName ? `Attn: ${b.name}` : ""],
    ...b.address.map((l) => ["", l]),
    ["", b.gstin ? `GSTIN: ${b.gstin}` : ""],
    ["", b.state ? `State: ${b.state}${b.stateCode ? ` (Code ${b.stateCode})` : ""}` : ""],
    ["", [b.phone, b.email].filter(Boolean).join("  |  ")]
  ]);
  const shipBottom = inv.shipTo
    ? partyBlock("SHIP TO", left + colW + 12, [["strong", inv.shipTo.name], ...inv.shipTo.address.map((l) => ["", l])])
    : y;
  y = Math.max(billBottom, shipBottom) + 12;

  // ── Items ───────────────────────────────────────────────────────────────
  const cols = [
    { key: "idx", label: "#", w: 18, align: "left" },
    { key: "name", label: "Item", w: 150, align: "left" },
    { key: "hsnSac", label: "HSN/SAC", w: 44, align: "left" },
    { key: "quantity", label: "Qty", w: 24, align: "right" },
    { key: "unitPrice", label: "Price", w: 50, align: "right" },
    { key: "discount", label: "Discount", w: 46, align: "right" },
    { key: "taxable", label: "Taxable", w: 54, align: "right" },
    { key: "rate", label: "GST", w: 32, align: "right" },
    { key: "tax", label: "Tax", w: 45, align: "right" },
    { key: "total", label: "Amount", w: 52, align: "right" }
  ];
  const pad = 4;

  const header = () => {
    doc.rect(left, y, width, 18).fill(C.head);
    let x = left;
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7.5);
    cols.forEach((c) => {
      doc.text(c.label, x + pad, y + 5.5, { width: c.w - pad * 2, align: c.align });
      x += c.w;
    });
    y += 18;
  };
  const ensure = (h) => {
    if (y + h > PAGE.bottom) {
      doc.addPage({ margin: 40, size: "A4" });
      y = 40;
      return true;
    }
    return false;
  };

  header();
  inv.lines.forEach((l, i) => {
    const showFormat = l.format && !l.name.toLowerCase().includes(l.format.toLowerCase());
    const name = plain(showFormat ? `${l.name} (${l.format})` : l.name);
    doc.font("Helvetica").fontSize(8);
    const h = Math.max(18, doc.heightOfString(name, { width: cols[1].w - pad * 2 }) + 9);
    if (ensure(h)) header();
    if (i % 2 === 1) doc.rect(left, y, width, h).fill(C.fill);
    const values = {
      idx: String(i + 1),
      name,
      hsnSac: l.hsnSac,
      quantity: String(l.quantity),
      unitPrice: num(l.unitPrice),
      discount: l.discount ? num(l.discount) : "-",
      taxable: num(l.taxable),
      rate: l.rate === null ? "Mixed" : pct(l.rate),
      tax: num(l.tax),
      total: num(l.total)
    };
    let x = left;
    cols.forEach((c) => {
      doc.fillColor(c.key === "name" || c.key === "total" ? C.ink : C.body)
        .font(c.key === "total" ? "Helvetica-Bold" : "Helvetica")
        .fontSize(8)
        .text(values[c.key], x + pad, y + 4.5, { width: c.w - pad * 2, align: c.align });
      x += c.w;
    });
    y += h;

    // A combo's components, each with its own code and rate, under the combo
    (l.parts || []).forEach((part) => {
      const partName = plain(`- ${part.name}`);
      doc.font("Helvetica").fontSize(7.5);
      const ph = Math.max(14, doc.heightOfString(partName, { width: cols[1].w - pad * 2 - 6 }) + 6);
      if (ensure(ph)) header();
      if (i % 2 === 1) doc.rect(left, y, width, ph).fill(C.fill);
      const partValues = {
        idx: "",
        name: partName,
        hsnSac: part.hsnSac,
        quantity: "",
        unitPrice: "",
        discount: part.discount ? num(part.discount) : "",
        taxable: num(part.taxable),
        rate: pct(part.rate),
        tax: num(part.tax),
        total: num(part.total)
      };
      let px = left;
      cols.forEach((c) => {
        doc.fillColor(C.muted).font("Helvetica").fontSize(7.5)
          .text(partValues[c.key], px + pad + (c.key === "name" ? 6 : 0), y + 3, { width: c.w - pad * 2 - (c.key === "name" ? 6 : 0), align: c.align });
        px += c.w;
      });
      y += ph;
    });
    doc.moveTo(left, y).lineTo(right, y).strokeColor(C.line).lineWidth(0.5).stroke();
  });
  doc.fillColor(C.muted).font("Helvetica").fontSize(7)
    .text(cn
      ? cn.itemLevel
        ? `Amounts in ${cur}. Returned items only, with the refunded share of what was invoiced for them; price and quantity are as invoiced.`
        : `Amounts in ${cur}. Each line shows the refunded share of what was invoiced${cn.isFull ? " (the full amount)" : ""}; price and quantity are as invoiced.`
      : `Amounts in ${cur}. Prices include GST; the taxable value is the price less GST.${inv.lines.some((l) => l.parts) ? " A combo is taxed by its components, its price shared in proportion to their value." : ""}`, left, y + 4, { width });
  if (inv.delivery?.taxed && inv.totals.deliveryGross > 0) {
    doc.fillColor(C.muted).font("Helvetica").fontSize(7)
      .text("Delivery charges are part of the taxable value, taxed at the rate of the items delivered; their GST is included below.", left, doc.y + 1, { width });
  }
  y = doc.y + 12;

  // ── Tax by rate (left) and totals (right) ────────────────────────────────
  ensure(150);
  const blockTop = y;
  const lw = 290;
  const taxCols = inv.isLocal
    ? [["GST rate", 50], ["Taxable", 70], ["CGST", 55], ["SGST", 55], ["Total tax", 60]]
    : [["GST rate", 50], ["Taxable", 80], ["IGST", 80], ["Total tax", 80]];
  const tw = taxCols.reduce((a, [, w]) => a + w, 0);

  doc.fillColor(C.muted).font("Helvetica-Bold").fontSize(7.5).text("TAX SUMMARY", left, y, { characterSpacing: 0.6 });
  y = doc.y + 3;
  doc.rect(left, y, tw, 15).fill(C.fill);
  let x = left;
  doc.fillColor(C.body).font("Helvetica-Bold").fontSize(7.5);
  taxCols.forEach(([label, w], i) => {
    doc.text(label, x + pad, y + 4.5, { width: w - pad * 2, align: i === 0 ? "left" : "right" });
    x += w;
  });
  y += 15;
  const taxRow = (cells, bold) => {
    let cx = left;
    doc.fillColor(C.ink).font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8);
    cells.forEach((v, i) => {
      doc.text(v, cx + pad, y + 4, { width: taxCols[i][1] - pad * 2, align: i === 0 ? "left" : "right" });
      cx += taxCols[i][1];
    });
    y += 15;
    doc.moveTo(left, y).lineTo(left + tw, y).strokeColor(C.line).lineWidth(0.5).stroke();
  };
  inv.rates.forEach((r) => {
    taxRow(inv.isLocal
      ? [pct(r.rate), num(r.taxable), num(r.cgst), num(r.sgst), num(r.tax)]
      : [pct(r.rate), num(r.taxable), num(r.igst), num(r.tax)]);
  });
  const t = inv.totals;
  const ratesTaxable = inv.rates.reduce((a, r) => a + r.taxable, 0);
  taxRow(inv.isLocal
    ? ["Total", num(ratesTaxable), num(t.cgst), num(t.sgst), num(t.tax)]
    : ["Total", num(ratesTaxable), num(t.igst), num(t.tax)], true);
  if (inv.isExport) {
    doc.fillColor(C.muted).font("Helvetica").fontSize(7).text("Supply to a customer outside India: no GST charged.", left, y + 4, { width: lw });
    y = doc.y;
  }
  const leftBottom = y;

  // Totals box
  const bx = left + lw + 25;
  const bw = right - bx;
  let by = blockTop;
  const totalRow = (label, value, strong) => {
    doc.fillColor(strong ? C.ink : C.body).font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(strong ? 10 : 8.5);
    doc.text(label, bx, by, { width: bw - 90 });
    doc.text(value, bx + bw - 95, by, { width: 95, align: "right" });
    by += strong ? 16 : 13;
  };
  if (t.discount > 0) {
    totalRow("Items before discount", money(t.gross, cur));
    totalRow("Discount", money(-t.discount, cur));
  }
  const gstRows = () => {
    if (inv.isLocal) {
      totalRow("CGST", money(t.cgst, cur));
      totalRow("SGST", money(t.sgst, cur));
    } else {
      totalRow("IGST", money(t.igst, cur));
    }
  };
  if (inv.delivery?.taxed) {
    // Base price + delivery + GST = total
    totalRow("Items (taxable value)", money(t.taxable, cur));
    if (t.deliveryGross > 0 || !cn) {
      totalRow("Delivery (taxable value)", t.deliveryGross > 0 ? money(t.deliveryCharge, cur) : "Free");
    }
    totalRow("Total taxable value", money(t.totalTaxable, cur));
    gstRows();
  } else {
    totalRow("Taxable value", money(t.taxable, cur));
    gstRows();
    if (cn) {
      if (t.deliveryCharge > 0) totalRow("Delivery charges", money(t.deliveryCharge, cur));
    } else {
      totalRow("Delivery charges", t.deliveryCharge > 0 ? money(t.deliveryCharge, cur) : "Free");
    }
  }
  by += 2;
  doc.moveTo(bx, by).lineTo(right, by).strokeColor(C.ink).lineWidth(0.8).stroke();
  by += 6;
  totalRow(cn ? "Total refunded" : inv.isPaid ? "Total paid" : "Total", money(t.grandTotal, cur), true);

  y = Math.max(leftBottom, by) + 10;
  doc.fillColor(C.muted).font("Helvetica-Bold").fontSize(7.5).text("AMOUNT IN WORDS", left, y, { characterSpacing: 0.6 });
  doc.fillColor(C.ink).font("Helvetica").fontSize(8.5).text(inv.amountInWords, left, doc.y + 2, { width });
  y = doc.y + 12;

  // ── Payment and signature ────────────────────────────────────────────────
  ensure(70);
  doc.fillColor(C.muted).font("Helvetica-Bold").fontSize(7.5).text(cn ? "REFUND" : "PAYMENT", left, y, { characterSpacing: 0.6 });
  doc.fillColor(C.body).font("Helvetica").fontSize(8);
  const payLines = cn ? [
    `Reason: ${cn.reason}`,
    `Method: ${cn.method}`,
    cn.reference ? `Reference: ${cn.reference}` : "",
    inv.paymentRef ? `Original payment: ${inv.paymentRef}` : ""
  ].filter(Boolean) : [
    `Status: ${inv.paymentStatus}${inv.paymentStatus === "Refunded" ? " (see credit note)" : ""}`,
    `Method: ${inv.paymentMethod}`,
    inv.paymentRef ? `Reference: ${inv.paymentRef}` : ""
  ].filter(Boolean);
  let py = doc.y + 2;
  payLines.forEach((l) => {
    doc.text(plain(l), left, py, { width: 280 });
    py = doc.y + 1;
  });

  doc.fillColor(C.body).font("Helvetica").fontSize(8)
    .text(`For ${plain(inv.seller.legalName)}`, bx, y, { width: bw, align: "right" });
  doc.fillColor(C.muted).fontSize(7.5).text("Authorised signatory", bx, y + 30, { width: bw, align: "right" });

  y = Math.max(py, y + 42) + 14;
  doc.moveTo(left, y).lineTo(right, y).strokeColor(C.line).lineWidth(0.5).stroke();
  doc.fillColor(C.muted).font("Helvetica").fontSize(7)
    .text(`This is a computer-generated ${cn ? "credit note" : "invoice"} and does not need a physical signature.`, left, y + 6, { width, align: "center" });

  doc.rect(0, 836, 595.28, 6).fill(C.head);
}

/**
 * Builds and renders the invoice for an order. Kept with the old signature for the email code.
 * seller: business details used when the order has none saved.
 */
function generateInvoicePdfBuffer(order, user = null, seller = null) {
  return renderInvoicePdf(buildInvoice(order, { user, seller }));
}

/** The GST credit note PDF for one refund on the order. */
function generateCreditNotePdfBuffer(order, refund, user = null, seller = null) {
  return renderInvoicePdf(buildCreditNote(order, refund, { user, seller }));
}

module.exports = { generateInvoicePdfBuffer, generateCreditNotePdfBuffer, renderInvoicePdf };
