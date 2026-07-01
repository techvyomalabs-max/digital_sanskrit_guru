import { jsPDF } from "jspdf";

function toSafeNumber(value) {
  const num = Number(value);
  return Number.isNaN(num) ? 0 : num;
}

const CURRENCY_SYMBOLS = {
  INR: "Rs",
  USD: "$",
  GBP: "£",
  EUR: "€",
  CAD: "C$",
  AUD: "A$",
  NZD: "NZ$",
  JPY: "¥",
  CNY: "¥",
  SGD: "S$",
  AED: "AED",
  SAR: "SAR",
  QAR: "QAR",
  KWD: "KWD",
  OMR: "OMR",
  BHD: "BHD",
  PKR: "PKR",
  BDT: "BDT",
  NPR: "NPR",
  LKR: "LKR"
};

function formatCurrency(value, currency = "INR") {
  const num = toSafeNumber(value);
  const formattedNum = num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  const hasSpace = symbol.length > 1;
  return hasSpace ? `${symbol} ${formattedNum}` : `${symbol}${formattedNum}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  const locale =
    (typeof navigator !== "undefined" && (navigator.languages?.[0] || navigator.language)) || "en-IN";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatFullAddress(addrObj) {
  if (!addrObj) return "N/A";
  if (typeof addrObj === "string") return addrObj;
  
  const street = addrObj.address || "";
  const city = addrObj.city || "";
  const state = addrObj.state || "";
  const pincode = addrObj.pincode || "";
  const country = addrObj.country || "";
  
  const hasCity = city && street.toLowerCase().includes(city.toLowerCase());
  const hasState = state && street.toLowerCase().includes(state.toLowerCase());
  
  if (hasCity && hasState) {
    return street;
  }
  
  return [
    street,
    city,
    state,
    pincode,
    country
  ].filter(Boolean).join(", ");
}

export function generateInvoicePdf(order, options = {}) {
  const {
    customerName = order?.user?.name || order?.shipping?.name || "Customer",
    customerEmail = order?.user?.email || "N/A",
    filePrefix = "invoice"
  } = options;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 40;
  let y = 30;

  const orderId = String(order?._id || "");
  const orderCode = `${orderId.slice(-6).toUpperCase()}`;
  const status = String(order?.status || "Pending");
  const items = Array.isArray(order?.items) ? order.items : [];
  const createdAt = formatDateTime(order?.createdAt);
  const shippingName = order?.shipping?.name || customerName;
  const shippingPhone = order?.shipping?.phone || "N/A";
  const shippingAddressText = formatFullAddress(order?.shipping);
  
  const billingName = order?.billing?.name || shippingName;
  const billingPhone = order?.billing?.phone || shippingPhone;
  const billingEmail = order?.billing?.email || customerEmail;
  const billingAddressText = formatFullAddress(order?.billing || order?.shipping);

  const customerState = String(order?.shipping?.state || "").trim();
  
  const currency = String(
    order?.currencyDisplay?.currency ||
      order?.displayCurrency ||
      order?.currency ||
      "INR"
  )
    .trim()
    .toUpperCase();

  // --- GST Compliance Calculations ---
  
  // 1. Identify Intrastate Transaction (Karnataka)
  const isIntrastate = customerState.toLowerCase() === "karnataka" || customerState.toLowerCase() === "ka";

  // 2. Default GST percentage for taxable items (usually 18%)
  const defaultGstPercent = toSafeNumber(order?.gstPercent || 18);

  // Helper to determine HSN/SAC based on product classification
  function getItemHsnSac(item) {
    if (item?.hsnSac) return String(item.hsnSac).trim();
    const name = String(item?.name || item?.product?.name || "").trim().toLowerCase();
    const category = String(item?.category || item?.product?.category || "").trim().toLowerCase();
    
    // E-books, Kindle books, Web versions, and Digital formats are taxed at 18% GST
    const isDigital = 
      category.includes("ebook") ||
      category.includes("e-book") ||
      category.includes("kindle") ||
      category.includes("web version") ||
      category.includes("web-version") ||
      name.includes("ebook") ||
      name.includes("e-book") ||
      name.includes("kindle") ||
      name.includes("web version") ||
      name.includes("web-version") ||
      name.includes("epub") ||
      name.includes("pdf");
      
    if (isDigital) {
      return "9973"; // Digital products/services (18% GST)
    }

    // Exempt printed books: category or name based check (HSN Chapter 49)
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

  // Calculate items HSN/SAC and dynamic GST
  let totalItemGst = 0;
  const enrichedItems = items.map((item, index) => {
    const name = String(item?.name || item?.product?.name || `Item ${index + 1}`);
    const qty = Math.max(1, toSafeNumber(item?.quantity || 1));
    const price = toSafeNumber(item?.price || 0);
    const lineTotal = qty * price;
    const hsnSac = getItemHsnSac(item);
    
    // Books are exempt (0% GST), other products have standard rate (e.g. 18%)
    const gstRate = hsnSac === "4901" ? 0 : defaultGstPercent;
    const gstAmount = Math.round(((lineTotal * gstRate) / 100) * 100) / 100;
    totalItemGst += gstAmount;

    return {
      name,
      qty,
      price,
      lineTotal,
      hsnSac,
      gstRate,
      gstAmount,
      productType: item?.productType || "single",
      bundleItems: item?.bundleItems || []
    };
  });

  // Calculate Subtotal (Sum of item line totals, excl. tax)
  const subtotalValue = enrichedItems.reduce((sum, item) => sum + item.lineTotal, 0);

  // 3. Delivery Fee Taxation (SAC 9965, always taxed at 18%)
  const deliveryValue = toSafeNumber(order?.deliveryCharge || 0);
  // Total delivery charge is flat Rs 50. Base = 42.37, GST = 7.63
  const deliveryBase = deliveryValue > 0 ? Math.round((deliveryValue / 1.18) * 100) / 100 : 0;
  const deliveryTax = deliveryValue > 0 ? Math.round((deliveryValue - deliveryBase) * 100) / 100 : 0;

  // 4. Totals and Tax Splitting
  const discount = toSafeNumber(order?.discount || 0);
  const totalGst = totalItemGst + deliveryTax;
  const compliantTotal = subtotalValue + deliveryBase + totalGst - discount;

  // --- PDF Render ---

  // Decorative Top Accent Bar
  doc.setFillColor(15, 23, 42); // Navy accent
  doc.rect(0, 0, 595, 12, "F");

  // Logo / Store Branding
  y += 24;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text("DIGITAL SANSKRIT GURU", marginX, y);
  
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(217, 119, 6); // Saffron accent
  doc.text("Spreading the Wisdom of Sanskrit", marginX, y + 12);
  
  // Header divider
  y += 24;
  doc.setDrawColor(226, 232, 240);
  doc.line(marginX, y, 555, y);
  
  // Tax Invoice Title & Meta Block
  y += 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text("TAX INVOICE", marginX, y);
  
  y += 12;
  // Shaded Box for Details
  doc.setFillColor(248, 250, 252);
  doc.rect(marginX, y, 515, 50, "F");
  doc.setDrawColor(226, 232, 240);
  doc.rect(marginX, y, 515, 50, "S");
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Invoice No: #${orderCode}`, marginX + 12, y + 18);
  doc.text(`Issued Date: ${createdAt}`, marginX + 12, y + 34);
  
  doc.text(`Place of Supply: ${customerState || "N/A"}`, 280, y + 18);
  
  // Colored Status Badge inside box
  const statusColorMap = {
    Delivered: { bg: [222, 247, 236], text: [3, 84, 63] },
    Shipped: { bg: [254, 240, 138], text: [113, 63, 18] },
    Pending: { bg: [254, 226, 226], text: [153, 27, 27] },
    Cancelled: { bg: [243, 244, 246], text: [75, 85, 99] }
  };
  const badgeColors = statusColorMap[status] || statusColorMap.Pending;
  
  doc.setFillColor(...badgeColors.bg);
  doc.rect(470, y + 16, 50, 18, "F");
  doc.setTextColor(...badgeColors.text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(status.toUpperCase(), 495, y + 28, { align: "center" });

  // Reset colors
  doc.setTextColor(15, 23, 42);
  y += 72;

  // Billed To, Shipped To, & Seller Details columns (3-column layout)
  const colWidth = 160;
  
  // Left Column: Billed To
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text("BILLED TO", marginX, y);
  doc.line(marginX, y + 4, marginX + 70, y + 4);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text(`Name: ${billingName}`, marginX, y + 18);
  doc.text(`Phone: ${billingPhone}`, marginX, y + 30);
  doc.text(`Email: ${billingEmail}`, marginX, y + 42);
  const wrappedBillingAddress = doc.splitTextToSize(`Address: ${billingAddressText}`, colWidth);
  doc.text(wrappedBillingAddress, marginX, y + 54);

  // Middle Column: Shipped To
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text("SHIPPED TO", 215, y);
  doc.line(215, y + 4, 215 + 75, y + 4);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text(`Name: ${shippingName}`, 215, y + 18);
  doc.text(`Phone: ${shippingPhone}`, 215, y + 30);
  const wrappedShippingAddress = doc.splitTextToSize(`Address: ${shippingAddressText}`, colWidth);
  doc.text(wrappedShippingAddress, 215, y + 42);

  // Right Column: Seller Details
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text("SELLER DETAILS", 390, y);
  doc.line(390, y + 4, 390 + 95, y + 4);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text("Digital Sanskrit Guru Store", 390, y + 18);
  doc.text("GSTIN: 29DSGXX1234F1Z0", 390, y + 30);
  doc.text("Bangalore, Karnataka, India", 390, y + 42);
  doc.text("Email: support@digitalsanskritguru.com", 390, y + 54);

  // Clear vertical layout after addresses
  const addressHeight = Math.max(
    wrappedBillingAddress.length * 12 + 54,
    wrappedShippingAddress.length * 12 + 42,
    70
  );
  y += addressHeight + 20;

  // Order Items Table
  doc.setFillColor(15, 23, 42); // Navy Header
  doc.rect(marginX, y, 515, 22, "F");
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255); // White Text
  
  doc.text("Item Description", marginX + 8, y + 14);
  doc.text("HSN/SAC", 260, y + 14);
  doc.text("Qty", 350, y + 14, { align: "right" });
  doc.text("Unit Price", 440, y + 14, { align: "right" });
  doc.text("Line Total", 545, y + 14, { align: "right" });
  
  y += 22;

  // Table Body Rows
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);

  if (enrichedItems.length === 0) {
    doc.setTextColor(100, 116, 139);
    doc.text("No items found in this order.", marginX + 8, y + 14);
    y += 22;
  } else {
    enrichedItems.forEach((item, index) => {
      let nameLines = [item.name];
      if (item.productType === "bundle" && Array.isArray(item.bundleItems) && item.bundleItems.length > 0) {
        nameLines.push("Pack Includes:");
        item.bundleItems.forEach((bi) => {
          nameLines.push(`  • ${bi.name} (Qty: ${bi.quantity * item.qty})`);
        });
      }
      const wrappedName = doc.splitTextToSize(nameLines.join("\n"), 200);
      const rowHeight = Math.max(22, wrappedName.length * 12 + 10);
      
      // Zebra striping alternating colors
      if (index % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(marginX, y, 515, rowHeight, "F");
      }
      
      // Bottom border line for each row
      doc.setDrawColor(241, 245, 249);
      doc.line(marginX, y + rowHeight, 555, y + rowHeight);
      
      doc.setTextColor(51, 65, 85);
      doc.text(wrappedName, marginX + 8, y + 14);
      doc.text(item.hsnSac, 260, y + 14);
      doc.text(String(item.qty), 350, y + 14, { align: "right" });
      doc.text(formatCurrency(item.price, currency), 440, y + 14, { align: "right" });
      doc.text(formatCurrency(item.lineTotal, currency), 545, y + 14, { align: "right" });
      
      y += rowHeight;

      if (y > 720) {
        doc.addPage();
        y = 46;
      }
    });
  }

  y += 20;

  // Summary & Breakdown Panel (aligned right)
  const summaryLeftX = 320;
  
  doc.setDrawColor(226, 232, 240);
  doc.line(summaryLeftX, y, 555, y);
  y += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);

  doc.text("Subtotal:", summaryLeftX, y);
  doc.text(formatCurrency(subtotalValue, currency), 545, y, { align: "right" });
  y += 16;
  
  if (discount > 0) {
    doc.text("Discount:", summaryLeftX, y);
    doc.text(`-${formatCurrency(discount, currency)}`, 545, y, { align: "right" });
    y += 16;
  }

  doc.text("Delivery Charges (Base):", summaryLeftX, y);
  doc.text(formatCurrency(deliveryBase, currency), 545, y, { align: "right" });
  y += 16;

  if (isIntrastate) {
    // Intrastate tax splitting (CGST + SGST)
    const halfGst = totalGst / 2;
    doc.text("CGST (9% / 0% Split):", summaryLeftX, y);
    doc.text(formatCurrency(halfGst, currency), 545, y, { align: "right" });
    y += 16;
    doc.text("SGST (9% / 0% Split):", summaryLeftX, y);
    doc.text(formatCurrency(halfGst, currency), 545, y, { align: "right" });
    y += 16;
  } else {
    // Interstate integrated tax (IGST)
    doc.text("IGST (Integrated Tax):", summaryLeftX, y);
    doc.text(formatCurrency(totalGst, currency), 545, y, { align: "right" });
    y += 16;
  }

  // Grand Total Highlight block
  doc.setFillColor(15, 23, 42); // Dark navy highlight bar
  doc.rect(summaryLeftX, y - 10, 235, 24, "F");
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text("Grand Total:", summaryLeftX + 10, y + 6);
  doc.text(formatCurrency(compliantTotal, currency), 535, y + 6, { align: "right" });

  // Footer notes at the bottom of page
  const footerY = 810;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184);
  doc.text("Thank you for your business & spreading the wisdom of Sanskrit! 🙏", 297.5, footerY - 14, { align: "center" });
  doc.text("This is a computer-generated invoice and requires no physical signature.", 297.5, footerY, { align: "center" });

  doc.save(`${filePrefix}-${orderCode || "order"}.pdf`);
}
