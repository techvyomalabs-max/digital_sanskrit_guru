"use strict";

/**
 * Product tax codes: every product with the HSN/SAC code and GST rate checkout will use, and
 * whether that was set on the product or guessed. Combos list each component and its share of
 * the combo price. For finance to check before go-live, and after adding products.
 */

const { lineCode, lineGstRate, comboParts, splitByWeights, TAX_CATEGORIES } = require("./tax");
const { normalizeOrderItem } = require("./orderItems");

const PRODUCT_TAX_HEADERS = [
  "Product", "Type", "Category", "Price (INR)", "Component Of", "HSN/SAC", "GST Rate %", "Tax Category",
  "Set On Product", "Share Of Combo Price (INR)", "Check"
];

const categoryLabel = (code, rate) => TAX_CATEGORIES.find((c) => c.code === code && c.rate === rate)?.label || "Other";
const isSet = (item) => Boolean(String(item?.hsnSac || "").trim()) && item?.gstRate !== null && item?.gstRate !== undefined;

function productTaxRows(products = []) {
  const rows = [];
  for (const p of [...products].sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
    const item = normalizeOrderItem(p, { quantity: 1 });
    const price = Number(p.price) || 0;
    const parts = comboParts(item);
    if (parts) {
      rows.push([item.name, "Combo", item.category, price.toFixed(2), "", "", "", "Split by component", "", "", ""]);
      const shares = splitByWeights(price, parts.map((c) => c.weight));
      parts.forEach((c, i) => {
        const component = item.bundleItems.filter((b) => b.owned !== true)[i] || {};
        rows.push([
          c.name, "Combo component", component.category || "", "", item.name, c.hsnSac, String(c.rate), categoryLabel(c.hsnSac, c.rate),
          isSet(component) ? "Yes" : "No (guessed)", shares[i].toFixed(2), c.weight > 0 ? "" : "No value: takes no share"
        ]);
      });
      continue;
    }
    const code = lineCode(item);
    const rate = lineGstRate(item);
    rows.push([
      item.name, item.isDigital ? "Digital" : "Physical", item.category, price.toFixed(2), "", code, String(rate),
      categoryLabel(code, rate), isSet(item) ? "Yes" : "No (guessed)", "",
      p.productType === "bundle" ? "Combo with no component values: taxed as one item" : ""
    ]);
  }
  return rows;
}

module.exports = { PRODUCT_TAX_HEADERS, productTaxRows };
