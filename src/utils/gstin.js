/**
 * gstin.js - GSTIN validation and state code utilities (frontend).
 * Note: GST_STATE_CODES should be verified against the official GST portal.
 */

export const GST_STATE_CODES = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" }
];

export const STATE_ABBREVIATIONS = {
  JK: "01",
  HP: "02",
  PB: "03",
  CH: "04",
  UK: "05",
  UA: "05",
  UT: "05",
  HR: "06",
  DL: "07",
  RJ: "08",
  UP: "09",
  BR: "10",
  SK: "11",
  AR: "12",
  NL: "13",
  MN: "14",
  MZ: "15",
  TR: "16",
  ML: "17",
  AS: "18",
  WB: "19",
  JH: "20",
  OR: "21",
  OD: "21",
  CG: "22",
  CT: "22",
  MP: "23",
  GJ: "24",
  DD: "26",
  DN: "26",
  DH: "26",
  MH: "27",
  KA: "29",
  GA: "30",
  LD: "31",
  KL: "32",
  TN: "33",
  PY: "34",
  AN: "35",
  TS: "36",
  TG: "36",
  AP: "37",
  LA: "38"
};

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN_FORMAT_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function normalizeGstin(v) {
  return String(v || "").trim().toUpperCase();
}

export function isValidGstinFormat(g) {
  return GSTIN_FORMAT_REGEX.test(normalizeGstin(g));
}

export function gstinCheckChar(first14) {
  const str = normalizeGstin(first14);
  if (str.length < 14) return "";
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GSTIN_CHARS.indexOf(str[i]);
    if (v === -1) return "";
    const factor = (i % 2 === 0) ? 1 : 2;
    const p = v * factor;
    sum += Math.floor(p / 36) + (p % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36];
}

export function isValidGstinChecksum(g) {
  const str = normalizeGstin(g);
  return isValidGstinFormat(str) && gstinCheckChar(str.slice(0, 14)) === str[14];
}

export function gstinStateCode(g) {
  return normalizeGstin(g).slice(0, 2);
}

export function stateByCode(code) {
  const padded = String(code || "").trim().padStart(2, "0");
  const found = GST_STATE_CODES.find((s) => s.code === padded);
  return found ? found.name : "";
}

export function codeByStateName(name) {
  const target = String(name || "").trim().toLowerCase();
  if (!target) return "";

  const abbrCode = STATE_ABBREVIATIONS[target.toUpperCase()];
  if (abbrCode) return abbrCode;

  const found = GST_STATE_CODES.find((s) => s.name.toLowerCase() === target);
  return found ? found.code : "";
}

export function validateBusinessDetails(input, current = {}) {
  if (!input || typeof input !== "object") {
    return { ok: false, message: "Invalid business details payload." };
  }

  const legalName = input.legalName !== undefined
    ? String(input.legalName || "").trim()
    : String(current.legalName || "").trim();
  const address = input.address !== undefined
    ? String(input.address || "").trim()
    : String(current.address || "").trim();
  const email = input.email !== undefined
    ? String(input.email || "").trim()
    : String(current.email || "").trim();

  const rawGstin = input.gstin !== undefined ? input.gstin : current.gstin;
  const gstin = normalizeGstin(rawGstin);

  const rawState = input.state !== undefined
    ? String(input.state || "").trim()
    : String(current.state || "").trim();
  const rawStateCode = input.stateCode !== undefined
    ? String(input.stateCode || "").trim()
    : String(current.stateCode || "").trim();

  if (legalName.length > 150) {
    return { ok: false, message: "Legal name cannot exceed 150 characters." };
  }
  if (address.length > 300) {
    return { ok: false, message: "Address cannot exceed 300 characters." };
  }
  if (email.length > 150) {
    return { ok: false, message: "Email cannot exceed 150 characters." };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "Enter a valid email address." };
  }

  let state = rawState;
  let stateCode = rawStateCode;

  if (gstin) {
    if (!isValidGstinFormat(gstin)) {
      return { ok: false, message: "Enter a valid 15-character GSTIN." };
    }

    const expectedCode = codeByStateName(state);
    if (!expectedCode || stateCode !== expectedCode) {
      return { ok: false, message: "Select the business state." };
    }

    const gstinState = gstin.slice(0, 2);
    if (gstinState !== stateCode) {
      return {
        ok: false,
        message: `GSTIN state code (${gstinState}) does not match the selected state (${state}).`
      };
    }
  } else {
    if (state && !stateCode) {
      stateCode = codeByStateName(state) || "";
    } else if (stateCode && !state) {
      state = stateByCode(stateCode) || "";
    }
  }

  return {
    ok: true,
    data: {
      legalName,
      gstin,
      address,
      state,
      stateCode,
      email
    }
  };
}

export function determineIsIntrastate(order, customerState, sellerState) {
  const cgst = Number(order?.taxDetails?.cgstAmount || 0);
  const sgst = Number(order?.taxDetails?.sgstAmount || 0);
  const igst = Number(order?.taxDetails?.igstAmount || 0);

  if (cgst + sgst > 0) return true;
  if (igst > 0) return false;

  const effectiveSellerState = String(sellerState || "Karnataka").trim();
  const cust = String(customerState || "").trim();
  if (!cust) return false;

  const custCode = codeByStateName(cust) || (cust.length === 2 ? cust.toUpperCase() : "");
  const sellerCode = codeByStateName(effectiveSellerState) || (effectiveSellerState.length === 2 ? effectiveSellerState.toUpperCase() : "");

  if (custCode && sellerCode && custCode === sellerCode) {
    return true;
  }

  return cust.toLowerCase() === effectiveSellerState.toLowerCase();
}
