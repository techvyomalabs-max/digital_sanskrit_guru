import { getItemHsnSac } from "./tax.js";
/**
 * src/utils/ordersCsv.js
 * Pure utility to generate Order CSV export in one-row-per-product format.
 * No browser APIs, no PDF or external rendering dependencies.
 */

export const FORMAT_CONFIG = {
  orderTotalsOnFirstRowOnly: true,
  dateFormat: "DD-MM-YYYY HH:mm", // 24h IST
  variationMode: "bundleOrFormat"
};

/**
 * Columns, in groups:
 *   Order    – invoice and order references, date, status
 *   Customer – billing name, contact and address
 *   Item     – one row per product, with its own GST split
 *   Summary  – the order summary exactly as on the order page (first row of each order):
 *              Subtotal (Excl. GST) + GST + Delivery = Order Total.
 *              The subtotal is after discount; the Discount column shows how much was taken off.
 *   INR      – the summary in INR at the order's own exchange rate (as in the finance reports)
 */
export const ORDER_CSV_HEADERS = [
  // Order
  "Invoice No",
  "Order ID",
  "Order Date (IST)",
  "Order Status",
  "Payment Status",
  // Customer
  "Customer Name",
  "Email",
  "Phone",
  "Address",
  "City",
  "State Code",
  "Country Code",
  // Item
  "Product Name",
  "Category",
  "Format / Includes",
  "HSN/SAC",
  "Quantity",
  "Unit Price (Incl. GST)",
  "Item Discount",
  "GST Rate %",
  "Item Subtotal (Excl. GST)",
  "Item GST",
  "Item Total (Incl. GST)",
  // Summary (as on the order page)
  "Currency",
  "Subtotal (Excl. GST)",
  "Discount",
  "Coupon Code",
  "GST",
  "Delivery",
  "Order Total",
  // INR
  "FX Rate To INR",
  "Subtotal (Excl. GST) INR",
  "Discount INR",
  "GST INR",
  "Delivery INR",
  "Order Total INR"
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

// HSN/SAC code rules shared with checkout (same as backend/utils/tax.js, which the invoice uses).
// Orders saved with item.hsnSac use that code.
export { getItemHsnSac };

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

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

/** GST-inclusive line split into discount, tax and basic value (same rule as backend lineTax). */
function splitLine(gross, discount, rate) {
  const net = Math.max(0, round2(gross - discount));
  const taxable = round2(net / (1 + rate / 100));
  return { discount: round2(discount), rate, tax: round2(net - taxable), taxable, total: net };
}

/**
 * Tax figures for each item of an order, the way the tax invoice works them out:
 * the tax saved on each line at checkout; for older orders saved without it, the line's
 * share of the coupon discount and the product's GST rate (store rate if the order had GST).
 */
export function orderLineTaxes(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const allSaved = items.length > 0 && items.every((it) => it?.tax && Number.isFinite(Number(it.tax.taxable)));
  if (allSaved) {
    return items.map((it) => {
      const t = it.tax;
      const parts = Array.isArray(t.parts) ? t.parts : [];
      const rates = parts.length
        ? [...new Set(parts.map((p) => Number(p.rate) || 0))]
        : [Number(t.rate) || 0];
      return {
        discount: round2(t.discount),
        rate: rates.join("/"),
        tax: round2(t.tax),
        taxable: round2(t.taxable),
        total: round2(t.total)
      };
    });
  }

  const country = String(order?.shipping?.country || order?.billing?.country || "").trim();
  const isInternational = country !== "" && resolveCountryCode(country) !== "IN";
  const storeRate = Number(order?.gstAmount) > 0 ? Number(order?.gstPercent || 0) : 0;
  const grosses = items.map((it) => round2(Number(it?.price || 0) * Math.max(1, Number(it?.quantity || 1))));
  const grossTotal = grosses.reduce((a, b) => a + b, 0);
  const discount = Math.max(0, Number(order?.discount || 0));
  let allocated = 0;
  return items.map((it, i) => {
    let share = 0;
    if (discount > 0 && grossTotal > 0) {
      share = i === items.length - 1 ? round2(discount - allocated) : round2(discount * (grosses[i] / grossTotal));
      allocated = round2(allocated + share);
    }
    const own = it?.gstRate;
    const rate = isInternational
      ? 0
      : own !== null && own !== undefined && own !== "" && Number.isFinite(Number(own))
        ? Number(own)
        : storeRate;
    return splitLine(grosses[i], share, rate);
  });
}

/**
 * The order's exchange rate to INR, as the finance reports use it: 1 for INR orders, else the
 * rate saved at payment, else the saved INR total / total, else 1.
 */
export function orderFxToInr(order) {
  const currency = String(order?.currencyDisplay?.currency || "INR").trim().toUpperCase();
  if (!currency || currency === "INR") return 1;
  const fx = Number(order?.fxRateToInr);
  if (Number.isFinite(fx) && fx > 0) return fx;
  const totalInInr = Number(order?.totalInInr);
  const total = Number(order?.total);
  if (Number.isFinite(totalInInr) && totalInInr > 0 && Number.isFinite(total) && total > 0) return totalInInr / total;
  return 1;
}

/**
 * The order summary as the order page shows it: Subtotal (Excl. GST) + GST + Delivery = Total,
 * with the discount (already taken off the subtotal) shown on its own.
 */
export function orderSummary(order) {
  const gst =
    order?.gstAmount !== undefined && order?.gstAmount !== null
      ? Number(order.gstAmount) || 0
      : Number(order?.taxDetails?.cgstAmount || 0) + Number(order?.taxDetails?.sgstAmount || 0) + Number(order?.taxDetails?.igstAmount || 0);
  const summary = {
    subtotal: round2(order?.subtotal),
    discount: round2(order?.discount),
    gst: round2(gst),
    delivery: round2(order?.deliveryCharge),
    total: round2(order?.total)
  };
  const fx = orderFxToInr(order);
  const inr = (v) => round2((Number(v) || 0) * fx);
  const savedInr = Number(order?.totalInInr);
  summary.fx = fx;
  summary.inr = {
    subtotal: inr(summary.subtotal),
    discount: inr(summary.discount),
    gst: inr(summary.gst),
    delivery: inr(summary.delivery),
    total: Number.isFinite(savedInr) && savedInr > 0 ? round2(savedInr) : inr(summary.total)
  };
  return summary;
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
  const text = (v) => escapeCsvCell(v ?? "", false);
  const num = (v) => escapeCsvCell(v === "" ? "" : formatMoney(v), true);

  const lines = [ORDER_CSV_HEADERS.map((h) => escapeCsvCell(h, false)).join(",")];

  for (const order of orders) {
    if (!order) continue;

    const shortId = `#${String(order._id || "").slice(-6).toUpperCase()}`;
    const billing = order.billing || {};
    const shipping = order.shipping || {};
    const user = order.user || {};
    const items = Array.isArray(order.items) ? order.items : [];
    const currency = String(order.currencyDisplay?.currency || items[0]?.currency || "INR").toUpperCase();
    const summary = orderSummary(order);

    const orderCells = [
      text(order.invoiceNumber ? String(order.invoiceNumber) : ""),
      text(shortId),
      text(formatIstDateTime(order.createdAt)),
      text(resolveOrderStatus(order, { getStatus, getPaymentStatus })),
      text(getPaymentStatus(order) || order.paymentStatus || ""),
      text(billing.name || shipping.name || user.name || ""),
      text(billing.email || user.email || ""),
      text(billing.phone || shipping.phone || ""),
      text(billing.address || shipping.address || ""),
      text(billing.city || shipping.city || ""),
      text(resolveStateCode(billing.state || shipping.state || "")),
      text(resolveCountryCode(billing.country || shipping.country || ""))
    ];
    const summaryCells = (show) => [
      text(currency),
      num(show ? summary.subtotal : ""),
      num(show ? summary.discount : ""),
      text(show ? order.couponCode || "" : ""),
      num(show ? summary.gst : ""),
      num(show ? summary.delivery : ""),
      num(show ? summary.total : ""),
      escapeCsvCell(show ? summary.fx.toFixed(6) : "", true),
      num(show ? summary.inr.subtotal : ""),
      num(show ? summary.inr.discount : ""),
      num(show ? summary.inr.gst : ""),
      num(show ? summary.inr.delivery : ""),
      num(show ? summary.inr.total : "")
    ];

    if (items.length === 0) {
      const blankItem = Array(11).fill(text(""));
      lines.push([...orderCells, ...blankItem, ...summaryCells(true)].join(","));
      continue;
    }

    const lineTaxes = orderLineTaxes(order);
    items.forEach((item, itemIndex) => {
      const line = lineTaxes[itemIndex];
      const showSummary = !config.orderTotalsOnFirstRowOnly || itemIndex === 0;
      const quantity = item?.quantity !== undefined && item?.quantity !== null ? item.quantity : 1;
      const itemCells = [
        text(item?.name || ""),
        text(item?.category || ""),
        text(getItemProductVariation(item)),
        text(getItemHsnSac(item)),
        escapeCsvCell(quantity, true),
        num(item?.price ?? 0),
        num(line.discount),
        text(String(line.rate)),
        num(line.taxable),
        num(line.tax),
        num(line.total)
      ];
      lines.push([...orderCells, ...itemCells, ...summaryCells(showSummary)].join(","));
    });
  }

  // UTF-8 BOM (\uFEFF) so Excel reads the file as UTF-8
  return "\uFEFF" + lines.join("\r\n");
}
