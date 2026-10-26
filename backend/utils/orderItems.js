const roundMoney = (v) => Math.round((Number(v) || 0) * 100) / 100;
const str = (v) => String(v || "").trim();

function normalizeOrderItem(product, item, pricing = {}) {
  const id = String(product?._id || product?.id || item?.product || "");
  const isDigital = product?.isDigital === true;
  const digitalType = str(product?.digitalType) || "Web Version";

  const rawDelivery = str(product?.digitalDelivery) || "onsite";
  const selfAccessManual = product?.externalAccessManual === true && rawDelivery === "external";

  const bundleItems = (product?.bundleItems || []).map((bi) => {
    const bp = bi?.product && bi.product._id ? bi.product : bi?.product;
    const isSubDigital = (bp || bi)?.isDigital === true;
    const compDelivery = str(bp?.digitalDelivery || bi?.digitalDelivery) || "onsite";
    const isCompExternal = compDelivery === "external";
    const compAccessManual = (bp?.externalAccessManual === true || bi?.externalAccessManual === true) && isCompExternal;
    const compLink = isCompExternal ? str(bp?.externalAccessLink || bi?.externalAccessLink) : "";
    const compLabel = isCompExternal ? str(bp?.externalAccessLabel || bi?.externalAccessLabel) : "";

    return {
      bundleItemId: String(bi?._id || ""),
      product: bp?._id ? String(bp._id) : (bp ? String(bp) : null),
      name: str(bp?.name || bi?.name) || "Product",
      image: str(bp?.image || bi?.image),
      quantity: Math.max(1, Math.floor(Number(bi?.quantity || 1))),
      isDigital: isSubDigital,
      digitalType: str(bp?.digitalType || bi?.digitalType || "Web Version"),
      digitalDelivery: compDelivery,
      externalAccessLink: compLink,
      externalAccessLabel: compLabel,
      accessManual: compAccessManual,
      webReaderLink: str(bp?.webReaderLink || bi?.webReaderLink),
      kindleLink: str(bp?.kindleLink || bi?.kindleLink)
    };
  });

  const hasManualComponent = bundleItems.some((bi) => bi.accessManual === true);
  const accessManual = selfAccessManual || hasManualComponent;

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
    digitalDelivery: rawDelivery,
    externalAccessLink: str(product?.externalAccessLink),
    externalAccessLabel: str(product?.externalAccessLabel),
    accessManual,
    accessGrantedAt: null,
    accessGrantedBy: null,
    accessNote: "",
    quantity: Math.max(1, Math.floor(Number(item?.quantity || 1))),
    price: roundMoney(pricing.price ?? product?.price ?? item?.price ?? 0),
    currency: str(pricing.currency || product?.currency || item?.currency || "INR").toUpperCase(),
    weight: Number(product?.weight || 0),
    height: Number(product?.height || 0),
    width: Number(product?.width || 0),
    length: Number(product?.length || 0),
    productType: String(product?.productType || "single"),
    bundleItems,
    returnRequest: { status: "Not Requested", requestedAt: null, resolvedAt: null, reason: "" }
  };
}

module.exports = { normalizeOrderItem };
