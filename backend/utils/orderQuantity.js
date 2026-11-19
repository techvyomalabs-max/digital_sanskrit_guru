// How many units of one product a single order may contain. The cart already
// applies these limits; computeOrderTotals applies them again so an order sent
// straight to the API (direct buy, a stale or edited cart) can't exceed them.
// Keep in sync with src/utils/orderQuantity.js.
const { maxDigitalCopies } = require("./digitalCopies");

const MAX_RETAIL_QUANTITY = 5;
const MAX_BULK_QUANTITY = 99999;

function maxOrderQuantity(product) {
  if (String(product?.productType || "single").toLowerCase() === "bulk") return MAX_BULK_QUANTITY;
  // Digital: several copies when extra copies can become shareable codes, otherwise 1
  if (product?.isDigital === true) return maxDigitalCopies(product);
  return MAX_RETAIL_QUANTITY;
}

function clampOrderQuantity(product, quantity) {
  const wanted = Math.max(1, Math.floor(Number(quantity) || 1));
  return Math.min(maxOrderQuantity(product), wanted);
}

/**
 * The saved cart's limit for a product. looksDigital is the cart's wider "is this digital"
 * guess (name keywords for older products). A product marked digital may hold several copies
 * when they can become shareable codes; one only guessed digital stays at 1.
 */
function cartQuantityLimit(product, looksDigital = false) {
  if (String(product?.productType || "single").toLowerCase() === "bulk") return MAX_BULK_QUANTITY;
  if (product?.isDigital === true) return maxDigitalCopies(product);
  if (looksDigital) return 1;
  return MAX_RETAIL_QUANTITY;
}

module.exports = { MAX_RETAIL_QUANTITY, MAX_BULK_QUANTITY, maxOrderQuantity, clampOrderQuantity, cartQuantityLimit };
