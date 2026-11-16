const { hasDigitalAccess, hasItemDigitalAccess } = require("./orderAccess");

/**
 * Derives the Set of owned digital product IDs for a user based on:
 * (a) Paid orders passing hasDigitalAccess and per-item hasItemDigitalAccess.
 *     Non-gift items add their product id if isDigital is true, and any digital
 *     combo components in bundleItems. Gift order items do not count for the buyer.
 * (b) Redeemed, unrevoked GiftPasses for that product.
 *
 * @param {Object} params
 * @param {Array} params.orders
 * @param {Array} params.redeemedPasses
 * @returns {Set<string>} Set of product ID strings
 */
function getOwnedDigitalProductIds({ orders = [], redeemedPasses = [] } = {}) {
  const owned = new Set();

  if (Array.isArray(orders)) {
    for (const order of orders) {
      if (!hasDigitalAccess(order)) continue;

      const orderIsGift = Boolean(order.isGift);
      const items = Array.isArray(order.items) ? order.items : [];

      for (const item of items) {
        if (!item) continue;
        const itemIsGift = orderIsGift || Boolean(item.isGift) || Boolean(item.giftCode);
        if (itemIsGift) continue;

        if (!hasItemDigitalAccess(order, item)) continue;

        const itemId = item.product?._id ? String(item.product._id) : (item.product ? String(item.product) : null);
        if (item.isDigital === true && itemId) {
          owned.add(itemId);
        }

        if (Array.isArray(item.bundleItems)) {
          for (const component of item.bundleItems) {
            if (!component) continue;
            const compId = component.product?._id ? String(component.product._id) : (component.product ? String(component.product) : null);
            if (component.isDigital === true && compId) {
              owned.add(compId);
            }
          }
        }
      }
    }
  }

  if (Array.isArray(redeemedPasses)) {
    for (const pass of redeemedPasses) {
      if (!pass) continue;
      if (pass.isRedeemed === true && pass.isRevoked !== true) {
        const passProdId = pass.product?._id ? String(pass.product._id) : (pass.product ? String(pass.product) : null);
        if (passProdId) {
          owned.add(passProdId);
        }
      }
    }
  }

  return owned;
}

/**
 * Analyzes cart lines against owned product IDs to determine if the purchase is blocked or needs a notice.
 *
 * @param {Object} params
 * @param {Array} params.lines [{ productId, name, isDigital, isBundle, components: [{ productId, name, isDigital }] }]
 * @param {Set<string>|Array<string>} params.ownedIds
 * @param {boolean} params.isGift
 * @returns {{ blocked: boolean, giftAllowed: boolean, notice: boolean, ownedItems: string[], message: string }}
 */
function analyzeDigitalOwnership({ lines = [], ownedIds = new Set(), isGift = false } = {}) {
  const ownedSet = ownedIds instanceof Set ? ownedIds : new Set(Array.from(ownedIds || []).map(String));
  // A digital product that can have shareable copies is never blocked: buying one you already
  // own gives you codes to pass on. It is reported as an extra copy instead.
  const extraCopies = (Array.isArray(lines) ? lines : [])
    .filter((l) => l && l.exempt !== true && !isGift && l.canShareCopies === true && ownedSet.has(String(l.productId)))
    .map((l) => ({ productId: String(l.productId), name: String(l.name || "Digital Item").trim(), quantity: Math.max(1, Number(l.quantity) || 1) }));
  const safeLines = (Array.isArray(lines) ? lines : []).filter((l) => l && l.exempt !== true && l.canShareCopies !== true);

  const hasBundle = safeLines.some((l) => Boolean(l && l.isBundle));
  const giftAllowed = !hasBundle;

  const hasPhysical = safeLines.some((l) => {
    if (!l) return false;
    if (l.isBundle) {
      const comps = Array.isArray(l.components) ? l.components : [];
      return comps.some((c) => !c || !c.isDigital || !c.productId);
    }
    return !l.isDigital;
  });

  const digitalMap = new Map();
  for (const line of safeLines) {
    if (!line) continue;
    if (line.isBundle) {
      for (const comp of line.components || []) {
        if (comp && comp.isDigital && comp.productId) {
          const pId = String(comp.productId);
          if (!digitalMap.has(pId)) {
            digitalMap.set(pId, {
              productId: pId,
              name: String(comp.name || "Digital Item").trim()
            });
          }
        }
      }
    } else if (line.isDigital && line.productId) {
      const pId = String(line.productId);
      if (!digitalMap.has(pId)) {
        digitalMap.set(pId, {
          productId: pId,
          name: String(line.name || "Digital Item").trim()
        });
      }
    }
  }

  const digitalEntries = Array.from(digitalMap.values());
  const ownedDigitalEntries = digitalEntries.filter((e) => ownedSet.has(String(e.productId)));
  const ownedItems = ownedDigitalEntries.map((e) => e.name);

  const allDigitalOwned = digitalEntries.length > 0 && ownedDigitalEntries.length === digitalEntries.length;
  const someDigitalOwned = ownedDigitalEntries.length > 0;

  const giftBypass = isGift === true && !hasBundle;
  const blocked = allDigitalOwned && !hasPhysical && !giftBypass;
  const notice = someDigitalOwned && !blocked;

  let message = "";
  if (blocked) {
    message = `You already own everything digital in this purchase: ${ownedItems.join(", ")}.`;
    if (giftAllowed) {
      message += " You can still buy it as a gift.";
    }
  } else if (notice) {
    message = `You already own: ${ownedItems.join(", ")}. They are included again in this purchase.`;
  }

  if (extraCopies.length && !blocked) {
    const names = extraCopies.map((e) => e.name).join(", ");
    message = [message, `You already have ${names} in your library, so ${extraCopies.length === 1 && extraCopies[0].quantity === 1 ? "this copy becomes a shareable code" : "these copies become shareable codes"} you can give to anyone.`]
      .filter(Boolean)
      .join(" ");
  }

  return {
    blocked,
    giftAllowed,
    notice: notice || extraCopies.length > 0,
    ownedItems,
    extraCopies,
    message
  };
}

module.exports = {
  getOwnedDigitalProductIds,
  analyzeDigitalOwnership
};
