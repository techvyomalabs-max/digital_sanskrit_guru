const roundMoney = (v) => Math.round((Number(v) || 0) * 100) / 100;
const str = (v) => String(v || "").trim();

function normalizeOrderItem(product, item, pricing = {}) {
  const id = String(product?._id || product?.id || item?.product || "");
  const isDigital = product?.isDigital === true;
  const digitalType = str(product?.digitalType) || "Web Version";

  return {
    product: id,
    _id: id,
    id,
    name: str(product?.name || item?.name),
    image: str(product?.image || item?.image),
    category: str(product?.category || item?.category) || "General",
    format: isDigital ? digitalType : "",
    isDigital,
    digitalType,
    webReaderLink: str(product?.webReaderLink),
    kindleLink: str(product?.kindleLink),
    kindleAsin: str(product?.kindleAsin),
    digitalInstructions: str(product?.digitalInstructions),
    quantity: Math.max(1, Math.floor(Number(item?.quantity || 1))),
    price: roundMoney(pricing.price ?? product?.price ?? item?.price ?? 0),
    currency: str(pricing.currency || product?.currency || item?.currency || "INR").toUpperCase(),
    weight: Number(product?.weight || 0),
    height: Number(product?.height || 0),
    width: Number(product?.width || 0),
    length: Number(product?.length || 0),
    productType: String(product?.productType || "single"),
    bundleItems: (product?.bundleItems || []).map((bi) => {
      const bp = bi?.product && bi.product._id ? bi.product : bi?.product;
      const isSubDigital = (bp || bi)?.isDigital === true;
      return {
        bundleItemId: String(bi?._id || ""),
        product: bp?._id ? String(bp._id) : (bp ? String(bp) : null),
        name: str(bp?.name || bi?.name) || "Product",
        image: str(bp?.image || bi?.image),
        quantity: Math.max(1, Math.floor(Number(bi?.quantity || 1))),
        isDigital: isSubDigital,
        digitalType: str(bp?.digitalType || bi?.digitalType || "Web Version"),
        webReaderLink: str(bp?.webReaderLink || bi?.webReaderLink),
        kindleLink: str(bp?.kindleLink || bi?.kindleLink)
      };
    }),
    returnRequest: { status: "Not Requested", requestedAt: null, resolvedAt: null, reason: "" }
  };
}

module.exports = { normalizeOrderItem };
