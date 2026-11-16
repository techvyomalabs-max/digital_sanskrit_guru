"use strict";

/**
 * Gifts of products whose access the admin sets up by hand on another website.
 *
 * At purchase nobody knows who will use the gift, so a gift line is held back from the
 * admin's "Access Pending" queue: it is saved with giftAccessManual: true and
 * accessManual: false. When someone redeems the Gift Pass, the line becomes a normal
 * pending line (accessManual: true) carrying the recipient's name and email, and the
 * admin grants it the usual way. Pure helpers: no database.
 */

const { isDigitalLikeItem } = require("./accessFulfilment");

/** Gift order lines: manual-access digital lines wait for a recipient instead of joining the admin queue. */
function holdGiftManualAccess(items) {
  return (Array.isArray(items) ? items : []).map((item) => {
    if (item && item.accessManual === true && isDigitalLikeItem(item)) {
      return { ...item, accessManual: false, giftAccessManual: true };
    }
    return item;
  });
}

/** A line waiting for its gift to be redeemed before the admin can set up access. */
function isGiftAwaitingRecipient(item) {
  return item?.giftAccessManual === true && item?.accessManual !== true && !item?.accessGrantedAt;
}

const idOf = (value) => String(value?._id ?? value ?? "").trim();

/**
 * Which line of the order a Gift Pass belongs to: its own line number when that line is
 * for the same product, otherwise the first line for that product. -1 when none.
 */
function findGiftLineIndex(items, giftPass) {
  const list = Array.isArray(items) ? items : [];
  const productId = idOf(giftPass?.product);
  const preferred = Number(giftPass?.lineIndex);
  if (Number.isInteger(preferred) && preferred >= 0 && preferred < list.length && idOf(list[preferred]?.product) === productId) {
    return preferred;
  }
  return list.findIndex((item) => idOf(item?.product) === productId);
}

/** Recipient details stored on the order line when the gift is redeemed. */
function buildGiftRecipient(user, now = new Date()) {
  return {
    user: user?._id || user?.id || null,
    name: String(user?.name || "").trim() || "Gift recipient",
    email: String(user?.email || "").trim().toLowerCase(),
    redeemedAt: now
  };
}

/** Lines in this grant that belong to a redeemed gift (access goes to the recipient). */
function giftRecipientsForLines(items, indexes) {
  const byEmail = new Map();
  (Array.isArray(indexes) ? indexes : []).forEach((idx) => {
    const recipient = items?.[idx]?.giftRecipient;
    if (!recipient?.email && !recipient?.user) return;
    const key = recipient.email || idOf(recipient.user);
    if (!byEmail.has(key)) byEmail.set(key, { recipient, indexes: [] });
    byEmail.get(key).indexes.push(idx);
  });
  return [...byEmail.values()];
}

module.exports = {
  holdGiftManualAccess,
  isGiftAwaitingRecipient,
  findGiftLineIndex,
  buildGiftRecipient,
  giftRecipientsForLines
};
