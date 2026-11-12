/**
 * The product's M.R.P. to show crossed out, or 0 when there is none to show.
 * The M.R.P. is a rupee price for India, so it is shown only with Indian (domestic, INR)
 * pricing, and only when it is above what the customer pays.
 */
export function getShownMrp(product, pricing, displayPrice) {
  const mrp = Number(product?.mrp);
  if (!Number.isFinite(mrp) || mrp <= 0) return 0;
  if (pricing?.isInternational || String(pricing?.currency || "INR").toUpperCase() !== "INR") return 0;
  return mrp > Number(displayPrice || 0) ? mrp : 0;
}
