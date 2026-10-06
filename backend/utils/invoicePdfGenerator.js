const PDFDocument = require("pdfkit");

function sanitizeIastString(str) {
  if (!str) return "";
  return String(str)
    .replace(/[āāā]/g, "a")
    .replace(/[āĀ]/g, "a")
    .replace(/[īĪ]/g, "i")
    .replace(/[ūŪ]/g, "u")
    .replace(/[ṛṚ]/g, "r")
    .replace(/[ṝṜ]/g, "r")
    .replace(/[ḷḶ]/g, "l")
    .replace(/[ḹḸ]/g, "l")
    .replace(/[ṃṂ]/g, "m")
    .replace(/[ḥḤ]/g, "h")
    .replace(/[śŚ]/g, "s")
    .replace(/[ṣṢ]/g, "s")
    .replace(/[ṭṬ]/g, "t")
    .replace(/[ḍḌ]/g, "d")
    .replace(/[ṇṆ]/g, "n")
    .replace(/[ṅṄ]/g, "n")
    .replace(/[ñÑ]/g, "n");
}

function toSafeNumber(val) {
  const num = Number(val);
  return Number.isNaN(num) ? 0 : num;
}

const CURRENCY_SYMBOLS = {
  INR: "Rs. ",
  USD: "$",
  GBP: "£",
  EUR: "€",
  CAD: "C$",
  AUD: "A$",
  AED: "AED ",
  SAR: "SAR ",
  SGD: "S$"
};

function formatCurrency(value, currency = "INR") {
  const num = toSafeNumber(value);
  const formatted = num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sym = CURRENCY_SYMBOLS[currency] || (currency + " ");
  return `${sym}${formatted}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatFullAddress(addrObj) {
  if (!addrObj) return "N/A";
  if (typeof addrObj === "string") return addrObj;
  const street = addrObj.address || "";
  const city = addrObj.city || "";
  const state = addrObj.state || "";
  const pincode = addrObj.pincode || "";
  const country = addrObj.country || "";
  return [street, city, state, pincode, country].filter(Boolean).join(", ");
}

function getItemHsnSac(item) {
  if (item?.hsnSac) return String(item.hsnSac).trim();
  const name = String(item?.name || item?.product?.name || "").trim().toLowerCase();
  const category = String(item?.category || item?.product?.category || "").trim().toLowerCase();

  const isDigital =
    category.includes("ebook") ||
    category.includes("e-book") ||
    category.includes("kindle") ||
    category.includes("web version") ||
    category.includes("web-version") ||
    category.includes("flipbook") ||
    name.includes("ebook") ||
    name.includes("e-book") ||
    name.includes("kindle") ||
    name.includes("web version") ||
    name.includes("web-version") ||
    name.includes("flipbook") ||
    name.includes("epub") ||
    name.includes("pdf");

  if (isDigital) return "9973";

  const isPrintedBook =
    category.includes("book") ||
    category.includes("sanskrit") ||
    category.includes("gita") ||
    category.includes("scriptures") ||
    category.includes("grammar") ||
    category.includes("dharma") ||
    category.includes("paperback") ||
    name.includes("book") ||
    name.includes("volume") ||
    name.includes("vol.") ||
    name.includes("hardcover") ||
    name.includes("paperback");

  return isPrintedBook ? "4901" : "8523";
}

/**
 * Generates an official Tax Invoice PDF as a Buffer for email attachments.
 */
function generateInvoicePdfBuffer(order, user) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      const buffers = [];

      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", (err) => reject(err));

      const orderId = String(order?._id || "");
      const orderCode = orderId.slice(-8).toUpperCase();
      const createdAt = formatDateTime(order?.createdAt || new Date());
      const customerName = sanitizeIastString(order?.shippingAddress?.name || user?.name || "Valued Customer");
      const customerEmail = user?.email || order?.shippingAddress?.email || "N/A";
      const customerPhone = order?.shippingAddress?.phone || user?.phone || "N/A";
      const customerState = sanitizeIastString(String(order?.shippingAddress?.state || order?.shipping?.state || "").trim());
      const shippingAddress = sanitizeIastString(formatFullAddress(order?.shippingAddress || order?.shipping));

      const currency = String(
        order?.currencyDisplay?.currency || order?.displayCurrency || order?.currency || "INR"
      ).trim().toUpperCase();

      const isIntrastate =
        customerState.toLowerCase() === "karnataka" || customerState.toLowerCase() === "ka";

      const items = Array.isArray(order?.items) ? order.items : [];
      const subtotal = toSafeNumber(order?.subtotal || order?.total || 0);
      const deliveryCharge = toSafeNumber(order?.deliveryCharge || 0);
      const discount = toSafeNumber(order?.discount || 0);
      const gstAmount = toSafeNumber(order?.gstAmount || 0);
      const total = toSafeNumber(order?.currencyDisplay?.amount || order?.total || 0);

      // ── Top Header Banner ──────────────────────────────────────────────────
      doc.rect(0, 0, 595.28, 10).fill("#1e293b");

      // Brand Logo & Title
      doc.fillColor("#0f172a").fontSize(18).font("Helvetica-Bold").text("DIGITAL SANSKRIT GURU", 40, 28);
      doc.fillColor("#d97706").fontSize(8.5).font("Helvetica-Oblique").text("Vyoma Linguistic Labs Foundation — Spreading the Wisdom of Sanskrit", 40, 48);

      // Right-aligned Invoice Title
      doc.fillColor("#0f172a").fontSize(14).font("Helvetica-Bold").text("TAX INVOICE", 400, 28, { align: "right", width: 155 });
      doc.fillColor("#64748b").fontSize(8.5).font("Helvetica").text(`Invoice No: #${orderCode}`, 400, 44, { align: "right", width: 155 });
      doc.text(`Date: ${createdAt}`, 400, 56, { align: "right", width: 155 });

      // Divider
      doc.moveTo(40, 72).lineTo(555, 72).strokeColor("#cbd5e1").lineWidth(1).stroke();

      // ── 3-Column Address & Seller Block ─────────────────────────────────────
      const boxY = 82;
      doc.rect(40, boxY, 515, 80).fillAndStroke("#f8fafc", "#e2e8f0");

      // Col 1: Billed / Shipped To
      doc.fillColor("#0f172a").fontSize(9).font("Helvetica-Bold").text("SHIPPED & BILLED TO", 52, boxY + 10);
      doc.fillColor("#334155").fontSize(8).font("Helvetica");
      doc.text(`Name: ${customerName}`, 52, boxY + 23);
      doc.text(`Phone: ${customerPhone}`, 52, boxY + 34);
      doc.text(`Email: ${customerEmail}`, 52, boxY + 45);
      doc.text(`Address: ${shippingAddress.slice(0, 70)}${shippingAddress.length > 70 ? "..." : ""}`, 52, boxY + 56, { width: 230 });

      // Col 2: Seller & GSTIN Details
      doc.fillColor("#0f172a").fontSize(9).font("Helvetica-Bold").text("SELLER DETAILS", 320, boxY + 10);
      doc.fillColor("#334155").fontSize(8).font("Helvetica");
      doc.text("Vyoma Linguistic Labs Foundation", 320, boxY + 23);
      doc.text("GSTIN: 29AABTV0911M1ZE", 320, boxY + 34);
      doc.text("Place of Supply: " + (customerState || "Karnataka"), 320, boxY + 45);
      doc.text("Support: support@digitalsanskritguru.com", 320, boxY + 56);

      // ── Order Items Table ──────────────────────────────────────────────────
      let tableY = 176;

      // Table Header
      doc.rect(40, tableY, 515, 20).fill("#1e293b");
      doc.fillColor("#ffffff").fontSize(8.5).font("Helvetica-Bold");
      doc.text("Item Description", 48, tableY + 6);
      doc.text("HSN/SAC", 270, tableY + 6);
      doc.text("Qty", 350, tableY + 6, { align: "center", width: 30 });
      doc.text("Unit Price", 400, tableY + 6, { align: "right", width: 60 });
      doc.text("Amount", 480, tableY + 6, { align: "right", width: 65 });

      tableY += 20;

      // Table Rows
      doc.font("Helvetica").fontSize(8.5);
      items.forEach((item, idx) => {
        const rowHeight = 22;
        if (idx % 2 === 1) {
          doc.rect(40, tableY, 515, rowHeight).fill("#f8fafc");
        }
        doc.rect(40, tableY, 515, rowHeight).strokeColor("#f1f5f9").stroke();

        const itemName = sanitizeIastString(item.name || item.product?.name || "Product Item");
        const hsn = getItemHsnSac(item);
        const qty = Number(item.quantity || 1);
        const price = Number(item.price || 0);
        const lineTotal = qty * price;

        doc.fillColor("#0f172a").text(itemName.slice(0, 42), 48, tableY + 6);
        doc.fillColor("#64748b").text(hsn, 270, tableY + 6);
        doc.text(String(qty), 350, tableY + 6, { align: "center", width: 30 });
        doc.text(formatCurrency(price, currency), 400, tableY + 6, { align: "right", width: 60 });
        doc.fillColor("#0f172a").text(formatCurrency(lineTotal, currency), 480, tableY + 6, { align: "right", width: 65 });

        tableY += rowHeight;
      });

      // ── GST Tax Summary & Totals Block ──────────────────────────────────────
      tableY += 15;
      const totalsX = 330;
      const totalsW = 225;

      // Box for Totals
      doc.rect(totalsX, tableY, totalsW, 115).fillAndStroke("#f8fafc", "#e2e8f0");
      let subY = tableY + 10;

      doc.fontSize(8.5).font("Helvetica").fillColor("#475569");
      doc.text("Subtotal:", totalsX + 12, subY);
      doc.text(formatCurrency(subtotal, currency), totalsX + 12, subY, { align: "right", width: totalsW - 24 });

      if (discount > 0) {
        subY += 15;
        doc.text("Discount:", totalsX + 12, subY);
        doc.text(`-${formatCurrency(discount, currency)}`, totalsX + 12, subY, { align: "right", width: totalsW - 24 });
      }

      subY += 15;
      doc.text("Delivery Charges:", totalsX + 12, subY);
      doc.text(deliveryCharge > 0 ? formatCurrency(deliveryCharge, currency) : "Free", totalsX + 12, subY, { align: "right", width: totalsW - 24 });

      if (gstAmount > 0) {
        subY += 15;
        if (isIntrastate) {
          const halfGst = gstAmount / 2;
          doc.text("CGST (9%) + SGST (9%):", totalsX + 12, subY);
          doc.text(formatCurrency(gstAmount, currency), totalsX + 12, subY, { align: "right", width: totalsW - 24 });
        } else {
          doc.text("IGST (18%):", totalsX + 12, subY);
          doc.text(formatCurrency(gstAmount, currency), totalsX + 12, subY, { align: "right", width: totalsW - 24 });
        }
      }

      subY += 18;
      doc.moveTo(totalsX + 12, subY).lineTo(totalsX + totalsW - 12, subY).strokeColor("#cbd5e1").stroke();
      subY += 6;

      doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a");
      doc.text("Total Paid:", totalsX + 12, subY);
      doc.text(formatCurrency(total, currency), totalsX + 12, subY, { align: "right", width: totalsW - 24 });

      // Left Column: Payment & Declaration
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#0f172a").text("PAYMENT INFORMATION", 48, tableY + 10);
      doc.font("Helvetica").fontSize(8).fillColor("#475569");
      doc.text(`Payment Status: ${order?.paymentStatus || "Paid"}`, 48, tableY + 24);
      doc.text(`Payment Mode: ${order?.paymentMethod || "Online / Razorpay"}`, 48, tableY + 36);
      doc.text("Status: Order Shipped", 48, tableY + 48);

      doc.font("Helvetica-Oblique").fontSize(7.5).fillColor("#94a3b8");
      doc.text(
        "This is a computer-generated tax invoice and requires no physical signature.\nThank you for choosing Digital Sanskrit Guru!",
        48,
        tableY + 70,
        { width: 260 }
      );

      // ── Footer ─────────────────────────────────────────────────────────────
      doc.rect(0, 830, 595.28, 12).fill("#1e293b");

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateInvoicePdfBuffer
};
