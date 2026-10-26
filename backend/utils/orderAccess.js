const DIGITAL_ITEM_FIELDS = ["webReaderLink", "kindleLink", "kindleAsin", "digitalInstructions", "externalAccessLink", "externalAccessLabel"];

const hasDigitalAccess = (o) =>
  !!o &&
  o.paymentStatus === "Paid" &&
  o.status !== "Cancelled" &&
  o.refundStatus !== "Refunded";

const hasItemDigitalAccess = (o, it) =>
  hasDigitalAccess(o) &&
  it?.returnRequest?.status !== "Refunded" &&
  (!it?.accessManual || !!it?.accessGrantedAt);

function stripDigitalFields(item) {
  if (!item || typeof item !== "object") return item;
  const out = { ...item };
  DIGITAL_ITEM_FIELDS.forEach((f) => delete out[f]);
  if (Array.isArray(out.bundleItems)) {
    out.bundleItems = out.bundleItems.map((b) => {
      const c = { ...b };
      DIGITAL_ITEM_FIELDS.forEach((f) => delete c[f]);
      return c;
    });
  }
  return out;
}

function serializeOrderForOwner(order, viewerUserId, options = {}) {
  if (!order) return null;
  const plain = typeof order?.toObject === "function" ? order.toObject() : { ...order };
  const isPaid = hasDigitalAccess(plain);
  plain.digitalAccess = isPaid;

  const isGiftOrder = Boolean(plain.isGift);
  const isViewerBuyer = viewerUserId && String(plain.user?._id || plain.user) === String(viewerUserId);
  const isRedeemedRecipient = Boolean(plain.isRedeemedGift) || Boolean(viewerUserId && !isViewerBuyer);

  const mapItem = (it, allowed) => {
    const isGranted = Boolean(it?.accessGrantedAt);
    const isPending = Boolean(it?.accessManual && !isGranted);
    const base = allowed
      ? { ...it, digitalAccess: true }
      : { ...stripDigitalFields(it), digitalAccess: false };

    base.accessPending = isPending;
    base.accessGrantedAt = it?.accessGrantedAt || null;
    if (isGranted) {
      base.accessNote = String(it?.accessNote || "");
    } else {
      delete base.accessNote;
    }
    return base;
  };

  if (isRedeemedRecipient) {
    // Recipient should ONLY see the items they redeemed or digital access info, NOT buyer's sensitive billing/shipping info
    delete plain.billing;
    delete plain.shipping;
    delete plain.paymentMeta;
    delete plain.currencyDisplay;
    delete plain.totalInInr;
    delete plain.fxRateToInr;

    const redeemedSet = options.redeemedProductIds
      ? new Set(Array.from(options.redeemedProductIds).map(String))
      : null;

    plain.items = (plain.items || []).map((it) => {
      const pId = String(it.product || it._id || it.id || "");
      const isRedeemedByViewer = redeemedSet ? redeemedSet.has(pId) : Boolean(plain.isRedeemedGift);
      const allowed = isRedeemedByViewer && hasItemDigitalAccess(plain, it);
      return mapItem(it, allowed);
    });
  } else {
    plain.items = (plain.items || []).map((it) => {
      // For the buyer, if an item is a gift, digital links are stripped because the gift pass is for the recipient
      const allowed = !(isGiftOrder || it?.giftCode) && hasItemDigitalAccess(plain, it);
      return mapItem(it, allowed);
    });
  }

  return plain;
}

module.exports = {
  DIGITAL_ITEM_FIELDS,
  hasDigitalAccess,
  hasItemDigitalAccess,
  stripDigitalFields,
  serializeOrderForOwner
};
