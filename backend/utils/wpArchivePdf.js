"use strict";

/**
 * PDFs for the WordPress (WooCommerce) archive:
 * - renderWpOrdersReportPdf: landscape A4 list of the filtered archive orders
 * - renderWpInvoicePdf: one archived order's invoice copy (model from buildWpInvoice)
 */

const PDFDocument = require("pdfkit");
const { pdfText } = require("./invoicePdfGenerator");
const { cleanText } = require("./wpArchiveExport");

const { plain, money, dateText } = pdfText;

const C = {
  ink: "#0f172a",
  body: "#334155",
  muted: "#64748b",
  line: "#e2e8f0",
  fill: "#f8fafc",
  head: "#1e293b",
  accent: "#b45309"
};

function toBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

// ── Archive report (list) ──────────────────────────────────────────────────────

const REPORT_COLUMNS = [
  { key: "id", label: "WP #", width: 52 },
  { key: "date", label: "Date", width: 70 },
  { key: "customer", label: "Customer", width: 150 },
  { key: "email", label: "Email", width: 165 },
  { key: "items", label: "Items", width: 190 },
  { key: "status", label: "Status", width: 62 },
  { key: "total", label: "Total", width: 72, align: "right" }
];

function reportRow(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const first = cleanText(items[0]?.name) || "WooCommerce order";
  return {
    id: `#${order?.wpOrderId ?? ""}`,
    date: dateText(order?.wpCreatedAt),
    customer: cleanText(order?.billing?.name || order?.billingName) || "Customer",
    email: String(order?.billingEmail || ""),
    items: items.length > 1 ? `${first} (+${items.length - 1} more)` : first,
    status: String(order?.status || ""),
    total: money(order?.total, String(order?.currencyDisplay?.currency || "INR").toUpperCase())
  };
}

/**
 * @param {object[]} orders lean WpOrder documents, already filtered and sorted
 * @param {object} meta { filterLabel, totalMatched, truncated, totals: { INR: n, ... }, generatedAt }
 */
function renderWpOrdersReportPdf(orders, meta = {}) {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36, bufferPages: true });
  const left = 36;
  const right = doc.page.width - 36;
  const bottom = doc.page.height - 50;

  const drawHeader = () => {
    let x = left;
    const y = doc.y;
    doc.rect(left, y, right - left, 20).fill(C.head);
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#ffffff");
    for (const col of REPORT_COLUMNS) {
      doc.text(col.label, x + 5, y + 6, { width: col.width - 10, align: col.align || "left", lineBreak: false });
      x += col.width;
    }
    doc.y = y + 20;
  };

  doc.font("Helvetica-Bold").fontSize(16).fillColor(C.ink).text("WordPress Archive - Orders Report", left, 36);
  doc.font("Helvetica").fontSize(9).fillColor(C.muted)
    .text(plain(`Filter: ${meta.filterLabel || "All orders"}   |   Generated: ${dateText(meta.generatedAt || new Date())}`))
    .text(plain(
      meta.truncated
        ? `Showing the first ${orders.length.toLocaleString("en-IN")} of ${Number(meta.totalMatched || 0).toLocaleString("en-IN")} matching orders. Use CSV export for the full list.`
        : `${orders.length.toLocaleString("en-IN")} orders`
    ));
  doc.moveDown(0.6);
  drawHeader();

  orders.forEach((order, index) => {
    const row = reportRow(order);
    doc.font("Helvetica").fontSize(8.5);
    const heights = REPORT_COLUMNS.map((col) =>
      doc.heightOfString(plain(row[col.key]), { width: col.width - 10 })
    );
    const rowHeight = Math.min(36, Math.max(...heights)) + 10;

    if (doc.y + rowHeight > bottom) {
      doc.addPage();
      doc.y = 36;
      drawHeader();
    }

    const y = doc.y;
    if (index % 2 === 1) doc.rect(left, y, right - left, rowHeight).fill(C.fill);
    let x = left;
    doc.fillColor(C.body);
    for (const col of REPORT_COLUMNS) {
      doc.font(col.key === "id" || col.key === "total" ? "Helvetica-Bold" : "Helvetica").fontSize(8.5)
        .fillColor(col.key === "id" ? C.ink : C.body)
        .text(plain(row[col.key]), x + 5, y + 5, { width: col.width - 10, height: rowHeight - 6, align: col.align || "left", ellipsis: true });
      x += col.width;
    }
    doc.moveTo(left, y + rowHeight).lineTo(right, y + rowHeight).lineWidth(0.5).strokeColor(C.line).stroke();
    doc.y = y + rowHeight;
  });

  const totals = Object.entries(meta.totals || {});
  if (totals.length) {
    if (doc.y + 30 > bottom) {
      doc.addPage();
      doc.y = 36;
    }
    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(C.ink)
      .text(plain(`Total (excluding cancelled): ${totals.map(([cur, value]) => money(value, cur)).join("   ")}`), left, doc.y, { width: right - left, align: "right" });
  }

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    // The footer sits inside the bottom margin; without this PDFKit would start a new page
    doc.page.margins.bottom = 0;
    doc.font("Helvetica").fontSize(8).fillColor(C.muted)
      .text(`Page ${i + 1} of ${range.count}`, left, doc.page.height - 30, { width: right - left, align: "right", lineBreak: false });
  }

  return toBuffer(doc);
}

// ── Archived order invoice copy ────────────────────────────────────────────────

function renderWpInvoicePdf(inv) {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const left = 40;
  const right = 555;
  const width = right - left;
  const cur = inv.currency || "INR";

  // Title + seller
  doc.font("Helvetica-Bold").fontSize(18).fillColor(C.ink).text("INVOICE", left, 40);
  doc.font("Helvetica").fontSize(9).fillColor(C.accent).text(plain(inv.documentTitle.toUpperCase()), left, doc.y + 2);

  doc.font("Helvetica-Bold").fontSize(11).fillColor(C.ink).text(plain(inv.seller.name), 300, 40, { width: right - 300, align: "right" });
  doc.font("Helvetica").fontSize(8.5).fillColor(C.body);
  [inv.seller.address, inv.seller.state, inv.seller.gstin ? `GSTIN: ${inv.seller.gstin}` : "", inv.seller.email]
    .filter(Boolean)
    .forEach((line) => doc.text(plain(line), 300, doc.y + 1, { width: right - 300, align: "right" }));

  // Order facts
  let y = Math.max(doc.y, 100) + 16;
  doc.rect(left, y, width, 52).fill(C.fill);
  const facts = [
    ["WP order no.", `#${inv.wpOrderId}`],
    ["Order date", dateText(inv.orderDate)],
    ["Paid date", inv.paidDate ? dateText(inv.paidDate) : "-"],
    ["Payment", [inv.paymentMethod, inv.paymentStatus].filter(Boolean).join(" - ") || "-"]
  ];
  facts.forEach(([label, value], i) => {
    const x = left + 12 + i * (width / 4);
    doc.font("Helvetica").fontSize(7.5).fillColor(C.muted).text(label.toUpperCase(), x, y + 10, { width: width / 4 - 16 });
    doc.font("Helvetica-Bold").fontSize(10).fillColor(C.ink).text(plain(value), x, y + 24, { width: width / 4 - 16, ellipsis: true, height: 14 });
  });
  y += 52;
  if (inv.transactionId) {
    doc.font("Helvetica").fontSize(8).fillColor(C.muted).text(plain(`Transaction ID: ${inv.transactionId}`), left, y + 6);
    y += 16;
  }

  // Addresses
  y += 14;
  const half = width / 2 - 8;
  const block = (title, party, x) => {
    doc.font("Helvetica-Bold").fontSize(8).fillColor(C.muted).text(title, x, y);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(C.ink).text(plain(party.name), x, y + 13, { width: half });
    doc.font("Helvetica").fontSize(9).fillColor(C.body);
    [party.address, party.phone ? `Phone: ${party.phone}` : "", party.email ? `Email: ${party.email}` : ""]
      .filter(Boolean)
      .forEach((line) => doc.text(plain(line), x, doc.y + 1, { width: half }));
    return doc.y;
  };
  const endA = block("BILL TO", inv.billTo, left);
  const endB = block("SHIP TO", inv.shipTo, left + half + 16);
  y = Math.max(endA, endB) + 18;

  // Items table
  const cols = [
    { label: "#", w: 24 },
    { label: "Item", w: 291 },
    { label: "Qty", w: 50, align: "right" },
    { label: "Unit price", w: 75, align: "right" },
    { label: "Amount", w: 75, align: "right" }
  ];
  const header = () => {
    doc.rect(left, y, width, 20).fill(C.head);
    let x = left;
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#ffffff");
    cols.forEach((c) => {
      doc.text(c.label, x + 6, y + 6, { width: c.w - 12, align: c.align || "left", lineBreak: false });
      x += c.w;
    });
    y += 20;
  };
  header();

  inv.items.forEach((item, i) => {
    const name = plain(item.name) + (item.isDigital ? " (digital)" : "");
    doc.font("Helvetica").fontSize(9);
    const h = Math.max(14, doc.heightOfString(name, { width: cols[1].w - 12 })) + 10;
    if (y + h > 700) {
      doc.addPage();
      y = 40;
      header();
    }
    const cells = [String(i + 1), name, String(item.quantity), money(item.unitPrice, cur), money(item.amount, cur)];
    let x = left;
    cells.forEach((value, ci) => {
      doc.font(ci === 4 ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(C.body)
        .text(value, x + 6, y + 5, { width: cols[ci].w - 12, align: cols[ci].align || "left" });
      x += cols[ci].w;
    });
    y += h;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(C.line).stroke();
  });

  // Totals
  if (y + 120 > 760) {
    doc.addPage();
    y = 40;
  }
  y += 12;
  const lines = [["Subtotal", money(inv.subtotal, cur)]];
  if (inv.discount > 0) lines.push([`Discount${inv.couponCode ? ` (${inv.couponCode})` : ""}`, `-${money(inv.discount, cur)}`]);
  if (inv.shippingCharge > 0) lines.push(["Shipping", money(inv.shippingCharge, cur)]);
  if (inv.gstAmount > 0) lines.push(["GST", money(inv.gstAmount, cur)]);
  const labelX = 330;
  lines.forEach(([label, value]) => {
    doc.font("Helvetica").fontSize(9.5).fillColor(C.body).text(plain(label), labelX, y, { width: 125 });
    doc.text(value, labelX + 125, y, { width: right - labelX - 125, align: "right" });
    y += 16;
  });
  doc.moveTo(labelX, y + 2).lineTo(right, y + 2).lineWidth(1).strokeColor(C.ink).stroke();
  y += 8;
  doc.font("Helvetica-Bold").fontSize(12).fillColor(C.ink).text("Total", labelX, y, { width: 125 });
  doc.text(money(inv.total, cur), labelX + 125, y, { width: right - labelX - 125, align: "right" });

  // Note
  doc.font("Helvetica").fontSize(8).fillColor(C.muted)
    .text(plain(inv.note), left, 770, { width, align: "center" });

  return toBuffer(doc);
}

module.exports = { renderWpOrdersReportPdf, renderWpInvoicePdf };
