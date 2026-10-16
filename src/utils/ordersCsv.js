/**
 * src/utils/ordersCsv.js
 * Pure utility to generate Order CSV export in one-row-per-product format.
 * No browser APIs, no PDF or external rendering dependencies.
 */

export const FORMAT_CONFIG = {
  orderTotalsOnFirstRowOnly: true,
  orderNumberMode: "invoiceNumber", // "invoiceNumber" (default) | "shortCode"
  dateFormat: "DD-MM-YYYY HH:mm", // 24h IST
  variationMode: "bundleOrFormat"
};

export const ORDER_CSV_HEADERS = [
  "Order Number",
  "Order Status",
  "Order Date",
  "First Name (Billing)",
  "Last Name (Billing)",
  "Address 1&2 (Billing)",
  "City (Billing)",
  "State Code (Billing)",
  "Country Code (Billing)",
  "Email (Billing)",
  "Phone (Billing)",
  "Product Name",
  "billing code",
  "Category",
  "Quantity",
  "Product Variation",
  "Cart Discount Amount",
  "Order Shipping Amount",
  "Currency",
  "Item Cost",
  "Order Total Tax Amount",
  "Order Total Amount"
];

// Mapping of all Indian states and Union Territories to their 2-letter postal/GST codes
export const INDIAN_STATE_NAME_TO_CODE = {
  "andaman and nicobar islands": "AN",
  "andaman and nicobar": "AN",
  "andaman & nicobar islands": "AN",
  "andaman & nicobar": "AN",
  "andhra pradesh": "AP",
  "arunachal pradesh": "AR",
  "assam": "AS",
  "bihar": "BR",
  "chandigarh": "CH",
  "chhattisgarh": "CG",
  "chhatisgarh": "CG",
  "dadra and nagar haveli and daman and diu": "DD",
  "dadra & nagar haveli and daman & diu": "DD",
  "dadra and nagar haveli": "DD",
  "daman and diu": "DD",
  "delhi": "DL",
  "new delhi": "DL",
  "national capital territory of delhi": "DL",
  "nct of delhi": "DL",
  "goa": "GA",
  "gujarat": "GJ",
  "haryana": "HR",
  "himachal pradesh": "HP",
  "jammu and kashmir": "JK",
  "jammu & kashmir": "JK",
  "jharkhand": "JH",
  "karnataka": "KA",
  "kerala": "KL",
  "ladakh": "LA",
  "lakshadweep": "LD",
  "madhya pradesh": "MP",
  "maharashtra": "MH",
  "manipur": "MN",
  "meghalaya": "ML",
  "mizoram": "MZ",
  "nagaland": "NL",
  "odisha": "OD",
  "orissa": "OD",
  "puducherry": "PY",
  "pondicherry": "PY",
  "punjab": "PB",
  "rajasthan": "RJ",
  "sikkim": "SK",
  "tamil nadu": "TN",
  "telangana": "TS",
  "tripura": "TR",
  "uttar pradesh": "UP",
  "uttarakhand": "UK",
  "uttaranchal": "UK",
  "west bengal": "WB"
};

// Mapping of the 50 US states plus DC to their 2-letter postal codes
export const US_STATE_NAME_TO_CODE = {
  "alabama": "AL",
  "alaska": "AK",
  "arizona": "AZ",
  "arkansas": "AR",
  "california": "CA",
  "colorado": "CO",
  "connecticut": "CT",
  "delaware": "DE",
  "district of columbia": "DC",
  "washington d.c.": "DC",
  "washington dc": "DC",
  "florida": "FL",
  "georgia": "GA",
  "hawaii": "HI",
  "idaho": "ID",
  "illinois": "IL",
  "indiana": "IN",
  "iowa": "IA",
  "kansas": "KS",
  "kentucky": "KY",
  "louisiana": "LA",
  "maine": "ME",
  "maryland": "MD",
  "massachusetts": "MA",
  "michigan": "MI",
  "minnesota": "MN",
  "mississippi": "MS",
  "missouri": "MO",
  "montana": "MT",
  "nebraska": "NE",
  "nevada": "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  "ohio": "OH",
  "oklahoma": "OK",
  "oregon": "OR",
  "pennsylvania": "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  "tennessee": "TN",
  "texas": "TX",
  "utah": "UT",
  "vermont": "VT",
  "virginia": "VA",
  "washington": "WA",
  "west virginia": "WV",
  "wisconsin": "WI",
  "wyoming": "WY"
};

// ISO 3166-1 alpha-2 mapping for all countries in src/utils/countryOptions.js
export const COUNTRY_NAME_TO_CODE = {
  "india": "IN",
  "united states": "US",
  "united states of america": "US",
  "usa": "US",
  "u.s.a.": "US",
  "u.s.": "US",
  "united kingdom": "GB",
  "uk": "GB",
  "u.k.": "GB",
  "great britain": "GB",
  "canada": "CA",
  "australia": "AU",
  "new zealand": "NZ",
  "singapore": "SG",
  "united arab emirates": "AE",
  "uae": "AE",
  "u.a.e.": "AE",
  "saudi arabia": "SA",
  "qatar": "QA",
  "kuwait": "KW",
  "oman": "OM",
  "bahrain": "BH",
  "germany": "DE",
  "deutschland": "DE",
  "france": "FR",
  "italy": "IT",
  "spain": "ES",
  "netherlands": "NL",
  "holland": "NL",
  "ireland": "IE",
  "portugal": "PT",
  "belgium": "BE",
  "japan": "JP",
  "china": "CN",
  "pakistan": "PK",
  "bangladesh": "BD",
  "nepal": "NP",
  "sri lanka": "LK",
  "malaysia": "MY",
  "thailand": "TH",
  "south africa": "ZA",
  "nigeria": "NG",
  "brazil": "BR",
  "mexico": "MX"
};

export function resolveStateCode(rawState) {
  const trimmed = String(rawState || "").trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  const indianCode = INDIAN_STATE_NAME_TO_CODE[lower];
  if (indianCode) return indianCode;
  const usCode = US_STATE_NAME_TO_CODE[lower];
  if (usCode) return usCode;
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return trimmed;
}

export function resolveCountryCode(rawCountry) {
  const trimmed = String(rawCountry || "").trim();
  if (!trimmed) return "";
  const code = COUNTRY_NAME_TO_CODE[trimmed.toLowerCase()];
  if (code) return code;
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return trimmed;
}

export function formatIstDateTime(dateInput) {
  if (!dateInput) return "";
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return "";

  // Shift UTC by +5 hours 30 minutes for deterministic IST representation
  const istMs = date.getTime() + (5 * 60 + 30) * 60 * 1000;
  const istDate = new Date(istMs);

  const day = String(istDate.getUTCDate()).padStart(2, "0");
  const month = String(istDate.getUTCMonth() + 1).padStart(2, "0");
  const year = istDate.getUTCFullYear();
  const hours = String(istDate.getUTCHours()).padStart(2, "0");
  const minutes = String(istDate.getUTCMinutes()).padStart(2, "0");

  return `${day}-${month}-${year} ${hours}:${minutes}`;
}

export function splitName(rawName) {
  const fullName = String(rawName || "").trim();
  if (!fullName) return { firstName: "", lastName: "" };
  const firstSpace = fullName.indexOf(" ");
  if (firstSpace === -1) {
    return { firstName: fullName, lastName: "" };
  }
  return {
    firstName: fullName.slice(0, firstSpace).trim(),
    lastName: fullName.slice(firstSpace + 1).trim()
  };
}

/**
 * Helper to determine HSN/SAC code.
 * NOTE: This mirrors the invoice rule from src/utils/invoicePdf.js (getItemHsnSac)
 * and backend/utils/invoicePdfGenerator.js so that billing codes match invoices.
 */
export function getItemHsnSac(item) {
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

  if (isDigital) {
    return "9973";
  }

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

export function getItemProductVariation(item) {
  if (!item) return "";
  const isBundle =
    String(item.productType || "").toLowerCase() === "bundle" ||
    (Array.isArray(item.bundleItems) && item.bundleItems.length > 0);

  if (isBundle) {
    const list = Array.isArray(item.bundleItems) ? item.bundleItems : [];
    if (list.length > 0) {
      const parts = list.map((bi) => `${bi.name || "Product"} x${bi.quantity || 1}`);
      return `Includes: ${parts.join("; ")}`;
    }
    return "Includes:";
  }

  if (item.format) {
    return String(item.format).trim();
  }

  return "";
}

export function sanitizeTextCell(val) {
  const str = String(val ?? "");
  if (/^\+?[\d\s().-]{6,}$/.test(str)) {
    return str;
  }
  if (/^\s*[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

export function escapeCsvCell(val, isNumeric = false) {
  if (val === null || val === undefined) {
    return '""';
  }
  const str = String(val);
  const sanitized = isNumeric ? str : sanitizeTextCell(str);
  return `"${sanitized.replaceAll('"', '""')}"`;
}

export function formatMoney(val) {
  if (val === null || val === undefined || val === "") return "";
  const num = Number(val);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
}

export function resolveOrderStatus(order, { getStatus, getPaymentStatus } = {}) {
  if (!order) return "";

  const paymentStatus = typeof getPaymentStatus === "function"
    ? getPaymentStatus(order)
    : (order?.paymentStatus || "");
  const payStatusNorm = String(paymentStatus || "").trim().toLowerCase();

  // a) payment status "Failed" -> "Failed"
  if (payStatusNorm === "failed") {
    return "Failed";
  }

  const refundStatusNorm = String(order?.refundStatus || "").trim().toLowerCase();

  // b) refundStatus "Refunded" -> "Refunded"
  if (refundStatusNorm === "refunded") {
    return "Refunded";
  }

  // c) refundStatus "Partially Refunded" -> "Partially refunded"
  if (refundStatusNorm === "partially refunded") {
    return "Partially refunded";
  }

  const rawStatusNorm = String(order?.status || order?.orderStatus || "").trim().toLowerCase();
  const displayStatus = typeof getStatus === "function" ? getStatus(order) : (order?.status || "");
  const displayStatusNorm = String(displayStatus || "").trim().toLowerCase();
  const isCancelled = rawStatusNorm === "cancelled" || displayStatusNorm === "cancelled";

  // d) order cancelled and refundStatus "Pending" or "Processing" -> "Cancelled (refund pending)"
  if (isCancelled && (refundStatusNorm === "pending" || refundStatusNorm === "processing")) {
    return "Cancelled (refund pending)";
  }

  // e) payment status not "Paid" and order not cancelled -> "On hold (unpaid)"
  if (payStatusNorm !== "paid" && !isCancelled) {
    return "On hold (unpaid)";
  }

  // f) otherwise getStatus(order) unchanged
  return displayStatus;
}

export function buildOrdersCsv(orders = [], options = {}) {
  const getStatus = options?.getStatus || ((order) => order?.status || "");
  const getPaymentStatus = options?.getPaymentStatus || ((order) => order?.paymentStatus || "");
  const config = { ...FORMAT_CONFIG, ...(options?.config || {}) };

  const lines = [ORDER_CSV_HEADERS.map((h) => escapeCsvCell(h, false)).join(",")];

  for (const order of orders) {
    if (!order) continue;

    const orderNumber =
      config.orderNumberMode === "shortCode"
        ? String(order._id || "").slice(-6).toUpperCase()
        : order.invoiceNumber
          ? String(order.invoiceNumber)
          : String(order._id || "").slice(-6).toUpperCase();

    const orderStatus = resolveOrderStatus(order, { getStatus, getPaymentStatus });
    const orderDate = formatIstDateTime(order.createdAt);

    const billing = order.billing || {};
    const shipping = order.shipping || {};
    const user = order.user || {};

    const rawFullName = billing.name || shipping.name || user.name || "";
    const { firstName, lastName } = splitName(rawFullName);

    const address = billing.address || shipping.address || "";
    const city = billing.city || shipping.city || "";
    const stateCode = resolveStateCode(billing.state || shipping.state || "");
    const countryCode = resolveCountryCode(billing.country || shipping.country || "");
    const email = billing.email || user.email || "";
    const phone = billing.phone || shipping.phone || "";

    const items = Array.isArray(order.items) ? order.items : [];
    const currency = String(
      order.currencyDisplay?.currency ||
      (items[0]?.currency) ||
      "INR"
    ).toUpperCase();

    const discountAmount = formatMoney(order.discount ?? 0);
    const shippingAmount = formatMoney(order.deliveryCharge ?? 0);
    const taxAmount = formatMoney(
      order.gstAmount !== undefined && order.gstAmount !== null
        ? order.gstAmount
        : Number(order?.taxDetails?.cgstAmount || 0) +
          Number(order?.taxDetails?.sgstAmount || 0) +
          Number(order?.taxDetails?.igstAmount || 0)
    );
    const totalAmount = formatMoney(order.total ?? 0);

    if (items.length === 0) {
      // Orders with no items get one row with blank product columns
      const row = [
        escapeCsvCell(orderNumber, false),
        escapeCsvCell(orderStatus, false),
        escapeCsvCell(orderDate, false),
        escapeCsvCell(firstName, false),
        escapeCsvCell(lastName, false),
        escapeCsvCell(address, false),
        escapeCsvCell(city, false),
        escapeCsvCell(stateCode, false),
        escapeCsvCell(countryCode, false),
        escapeCsvCell(email, false),
        escapeCsvCell(phone, false),
        escapeCsvCell("", false), // Product Name
        escapeCsvCell("", false), // billing code
        escapeCsvCell("", false), // Category
        escapeCsvCell("", true),  // Quantity
        escapeCsvCell("", false), // Product Variation
        escapeCsvCell(discountAmount, true),
        escapeCsvCell(shippingAmount, true),
        escapeCsvCell(currency, false),
        escapeCsvCell("", true),  // Item Cost
        escapeCsvCell(taxAmount, true),
        escapeCsvCell(totalAmount, true)
      ];
      lines.push(row.join(","));
    } else {
      items.forEach((item, itemIndex) => {
        const isFirst = itemIndex === 0;
        const includeTotals = !config.orderTotalsOnFirstRowOnly || isFirst;

        const productName = item?.name || "";
        const billingCode = getItemHsnSac(item);
        const category = item?.category || "";
        const quantity =
          item?.quantity !== undefined && item?.quantity !== null ? item.quantity : 1;
        const productVariation = getItemProductVariation(item);
        const itemCost = formatMoney(item?.price ?? 0);

        const row = [
          escapeCsvCell(orderNumber, false),
          escapeCsvCell(orderStatus, false),
          escapeCsvCell(orderDate, false),
          escapeCsvCell(firstName, false),
          escapeCsvCell(lastName, false),
          escapeCsvCell(address, false),
          escapeCsvCell(city, false),
          escapeCsvCell(stateCode, false),
          escapeCsvCell(countryCode, false),
          escapeCsvCell(email, false),
          escapeCsvCell(phone, false),
          escapeCsvCell(productName, false),
          escapeCsvCell(billingCode, false),
          escapeCsvCell(category, false),
          escapeCsvCell(quantity, true),
          escapeCsvCell(productVariation, false),
          escapeCsvCell(includeTotals ? discountAmount : "", true),
          escapeCsvCell(includeTotals ? shippingAmount : "", true),
          escapeCsvCell(currency, false),
          escapeCsvCell(itemCost, true),
          escapeCsvCell(includeTotals ? taxAmount : "", true),
          escapeCsvCell(includeTotals ? totalAmount : "", true)
        ];
        lines.push(row.join(","));
      });
    }
  }

  // Prepend UTF-8 BOM (\uFEFF) for proper Excel UTF-8 decoding
  return "\uFEFF" + lines.join("\r\n");
}
