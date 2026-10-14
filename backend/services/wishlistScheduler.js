const Wishlist = require("../models/Wishlist");
const Order = require("../models/Order");
const StoreSettings = require("../models/StoreSettings");
const { sendWishlistReminderEmail } = require("../utils/email");

/**
 * Process pending wishlist email nudges for inactive user wishlists.
 */
async function processWishlistNudges() {
  try {
    const settings = (await StoreSettings.findOne()) || {};
    const nudgeConfig = settings.wishlistNudge || {};

    // 1. Check if feature is enabled (defaults to true)
    const isEnabled = nudgeConfig.enabled !== false;
    if (!isEnabled) {
      return { processedCount: 0, sentCount: 0, reason: "Wishlist nudge feature disabled in settings" };
    }

    const delayHours = Number(nudgeConfig.delayHours || 24);
    const frequencyDays = Number(nudgeConfig.frequencyDays || 7);

    const now = Date.now();
    const updatedAtCutoff = new Date(now - delayHours * 60 * 60 * 1000);
    const frequencyCutoff = new Date(now - frequencyDays * 24 * 60 * 60 * 1000);

    // 2. Query wishlists with items, inactive for > delayHours, and not emailed recently
    const candidateWishlists = await Wishlist.find({
      "productIds.0": { $exists: true },
      updatedAt: { $lte: updatedAtCutoff },
      $or: [
        { lastNudgeSentAt: null },
        { lastNudgeSentAt: { $exists: false } },
        { lastNudgeSentAt: { $lte: frequencyCutoff } }
      ]
    })
      .populate("user", "name email marketingOptOut")
      .populate("productIds", "name price image stock");

    let sentCount = 0;

    for (const wishlist of candidateWishlists) {
      const user = wishlist.user;
      if (!user || !user.email) continue;

      const products = (wishlist.productIds || []).filter((p) => p && p.name);
      if (products.length === 0) continue;

      // Claim before sending to prevent duplicate sends across cluster workers
      const claimedAt = new Date();
      const claimFilter = {
        _id: wishlist._id,
        ...(wishlist.lastNudgeSentAt
          ? { lastNudgeSentAt: wishlist.lastNudgeSentAt }
          : { $or: [{ lastNudgeSentAt: null }, { lastNudgeSentAt: { $exists: false } }] })
      };
      const claim = await Wishlist.updateOne(
        claimFilter,
        { $set: { lastNudgeSentAt: claimedAt } }
      );
      if (claim.modifiedCount !== 1) continue;

      if (user.marketingOptOut === true) continue;

      // 3. Check user's recent orders to filter out products already purchased
      const userOrders = await Order.find({
        user: user._id,
        status: { $ne: "Cancelled" }
      }).select("items").lean();

      const purchasedProductIds = new Set();
      for (const order of userOrders) {
        for (const item of order.items || []) {
          if (item.product) {
            purchasedProductIds.add(String(item.product));
          }
        }
      }

      // Keep only products user hasn't bought yet
      const unpurchasedProducts = products.filter(
        (p) => !purchasedProductIds.has(String(p._id))
      );

      if (unpurchasedProducts.length > 0) {
        // Send email reminder
        await sendWishlistReminderEmail(user, unpurchasedProducts);
        sentCount++;
      }
    }

    if (sentCount > 0) {
      console.log(`[Wishlist Nudge] Sent ${sentCount} wishlist reminder email(s).`);
    }

    return { processedCount: candidateWishlists.length, sentCount };
  } catch (err) {
    console.error("[Wishlist Nudge] Scheduler error:", err.message);
    return { error: err.message };
  }
}

/**
 * Initialize hourly background interval for Wishlist Nudge Scheduler.
 */
function initWishlistScheduler() {
  // Initial check after 30 seconds on server boot
  setTimeout(() => {
    processWishlistNudges().catch(() => {});
  }, 30000);

  // Run hourly (every 60 minutes)
  const HOURLY = 60 * 60 * 1000;
  setInterval(() => {
    processWishlistNudges().catch(() => {});
  }, HOURLY);

  console.log("[Wishlist Nudge] Scheduler initialized (Hourly check).");
}

module.exports = {
  processWishlistNudges,
  initWishlistScheduler
};
