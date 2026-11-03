"use strict";

/**
 * A product's own tax settings, set by the admin. Blank means "use the automatic rule"
 * (printed books 0%, everything else the store-wide rate), so nothing changes until set.
 */

const GST_SLABS = [0, 0.25, 3, 5, 12, 18, 28];

/** Returns { hsnSac, gstRate } or { error }. hsnSac: "" or 4–8 digits. gstRate: null or a GST slab. */
function normalizeProductTax({ hsnSac, gstRate } = {}) {
  const code = String(hsnSac ?? "").replace(/\s+/g, "");
  if (code && !/^\d{4,8}$/.test(code)) {
    return { error: "HSN/SAC code must be 4 to 8 digits (or left blank)." };
  }
  let rate = null;
  if (gstRate !== null && gstRate !== undefined && String(gstRate).trim() !== "") {
    rate = Number(gstRate);
    if (!GST_SLABS.includes(rate)) {
      return { error: `GST rate must be one of ${GST_SLABS.join(", ")} % (or left blank).` };
    }
  }
  return { hsnSac: code, gstRate: rate };
}

module.exports = { GST_SLABS, normalizeProductTax };
