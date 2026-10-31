// Which public coupons fit a cart or a product. Mirrors the server rule in
// backend/utils/coupons.js: a coupon with applicableProducts only discounts cart lines whose
// product id is in that list; a coupon without them is storewide. Only decides what to *show* -
// the server still decides the discount.

export const couponProductIds = (coupon) =>
  (Array.isArray(coupon?.applicableProducts) ? coupon.applicableProducts : [])
    .map((p) => String(p?._id || p || "").trim())
    .filter(Boolean);

export const isProductCoupon = (coupon) => couponProductIds(coupon).length > 0;

// Same id order the server uses for cart lines (orderTotals mergeDuplicateItems).
const cartLineId = (item) => String(item?._id || item?.id || item?.product || "").trim();

// Cart lines the coupon would discount: every line for storewide coupons, otherwise only its products.
export function couponEligibleItems(coupon, cartItems) {
  const items = Array.isArray(cartItems) ? cartItems : [];
  if (!isProductCoupon(coupon)) return items;
  const ids = new Set(couponProductIds(coupon));
  return items.filter((item) => ids.has(cartLineId(item)));
}

export const couponEligibleTotal = (coupon, cartItems) =>
  couponEligibleItems(coupon, cartItems).reduce(
    (sum, item) => sum + Number(item?.price || 0) * Number(item?.quantity || 1),
    0
  );

// Product-specific coupons for one product (storewide coupons are left out on purpose).
export function couponsForProduct(coupons, productId) {
  const id = String(productId || "").trim();
  if (!id) return [];
  return (Array.isArray(coupons) ? coupons : []).filter((coupon) => couponProductIds(coupon).includes(id));
}
