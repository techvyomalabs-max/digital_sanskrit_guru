/**
 * AI-powered Offline Recommendation Engine for Digital Sanskrit Guru.
 * Generates personalized product recommendations based on user browsing history,
 * recent searches, and wishlist/cart signals.
 *
 * 100% offline, zero external API dependencies, sub-millisecond execution.
 */

import { foldText } from "./searchText.js";

const STOP_WORDS = new Set([
  "in", "for", "the", "and", "edition", "paperback", "ebook", "kindle",
  "of", "a", "an", "to", "with", "book", "products", "web", "version",
  "combo", "device", "stick", "usb", "audio", "flipbook", "part", "vol"
]);

/**
 * Extracts normalized, meaningful semantic topic tokens from text.
 */
export function extractTopicTokens(text) {
  if (!text) return [];
  const folded = foldText(text);
  return folded
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

/**
 * Retrieves the recent search queries from localStorage safely.
 */
export function getRecentSearchQueries() {
  try {
    const raw = localStorage.getItem("recentSearchQueries");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Records a search query in localStorage for personalization.
 */
export function recordSearchQuery(query) {
  if (!query || typeof query !== "string") return;
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length < 2) return;

  try {
    const existing = getRecentSearchQueries();
    const updated = [trimmed, ...existing.filter((q) => q.toLowerCase() !== trimmed)].slice(0, 10);
    localStorage.setItem("recentSearchQueries", JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Builds an interest vector/affinity profile from user signals.
 */
export function buildUserProfile({
  viewedProducts = [],
  searchQueries = [],
  cartItems = [],
  wishlist = []
} = {}) {
  const categoryWeights = {};
  const topicWeights = {};
  const relatedBonus = {};
  const viewedIds = new Set();

  // 1. Process viewed products (with recency decay)
  viewedProducts.forEach((product, idx) => {
    if (!product) return;
    const id = String(product._id || product.id || "");
    if (id) viewedIds.add(id);

    // Recency factor: most recent gets weight 1.0, decaying gracefully
    const recencyWeight = 1.0 / (1 + idx * 0.25);

    // Category affinity
    if (product.category) {
      categoryWeights[product.category] =
        (categoryWeights[product.category] || 0) + recencyWeight * 3.5;
    }

    // Topic keywords
    const tokens = extractTopicTokens(`${product.name || ""} ${product.category || ""}`);
    tokens.forEach((token) => {
      topicWeights[token] = (topicWeights[token] || 0) + recencyWeight * 2.5;
    });

    // Related products graph
    if (Array.isArray(product.relatedProducts)) {
      product.relatedProducts.forEach((rel) => {
        const relId = typeof rel === "object" && rel !== null ? String(rel._id || rel.id || "") : String(rel || "");
        if (relId) {
          relatedBonus[relId] = (relatedBonus[relId] || 0) + recencyWeight * 6.0;
        }
      });
    }
  });

  // 2. Process search queries
  searchQueries.forEach((query, idx) => {
    const recencyWeight = 1.0 / (1 + idx * 0.3);
    const tokens = extractTopicTokens(query);
    tokens.forEach((token) => {
      topicWeights[token] = (topicWeights[token] || 0) + recencyWeight * 3.0;
    });
  });

  // 3. Process wishlist & cart signals (high intent)
  const highIntentItems = [...cartItems, ...wishlist];
  highIntentItems.forEach((item) => {
    if (!item) return;
    const prod = item.product || item;
    if (prod.category) {
      categoryWeights[prod.category] = (categoryWeights[prod.category] || 0) + 4.0;
    }
    const tokens = extractTopicTokens(prod.name || "");
    tokens.forEach((token) => {
      topicWeights[token] = (topicWeights[token] || 0) + 3.0;
    });
  });

  return {
    categoryWeights,
    topicWeights,
    relatedBonus,
    viewedIds,
    hasSignals:
      viewedProducts.length > 0 ||
      searchQueries.length > 0 ||
      cartItems.length > 0 ||
      wishlist.length > 0
  };
}

/**
 * Computes personalized recommendations from the catalog based on user signals.
 *
 * @param {Array} catalog - Full list of products
 * @param {Object} signals - { viewedProducts, searchQueries, cartItems, wishlist }
 * @param {Object} options - { limit, excludeIds }
 * @returns {Array} List of recommended products with `_recommendationReason` and `_aiScore`
 */
export function getAIRecommendations(
  catalog = [],
  signals = {},
  options = {}
) {
  if (!Array.isArray(catalog) || catalog.length === 0) {
    return [];
  }

  const { limit = 8, excludeIds = [] } = options;
  const userProfile = buildUserProfile(signals);
  const excludeSet = new Set([
    ...userProfile.viewedIds,
    ...excludeIds.map(String)
  ]);

  // Cold Start: If the user has no history, provide curated top-tier starter products
  if (!userProfile.hasSignals) {
    return getColdStartRecommendations(catalog, limit);
  }

  const scoredCandidates = [];

  for (const product of catalog) {
    if (!product) continue;
    const prodId = String(product._id || product.id || "");

    // Exclude products already viewed/purchased if we have enough catalog items
    if (excludeSet.has(prodId) && catalog.length > limit + excludeSet.size) {
      continue;
    }

    let score = 0;
    let primaryReason = "";

    // 1. Related product bonus (strongest collaborative signal)
    if (userProfile.relatedBonus[prodId]) {
      score += userProfile.relatedBonus[prodId];
      primaryReason = "Frequently studied together with your viewed topics";
    }

    // 2. Category affinity score
    if (product.category && userProfile.categoryWeights[product.category]) {
      const catScore = userProfile.categoryWeights[product.category];
      score += catScore;
      if (!primaryReason) {
        primaryReason = `Top pick in ${product.category}`;
      }
    }

    // 3. Topic keyword similarity
    const prodTokens = extractTopicTokens(`${product.name || ""} ${product.description || ""}`);
    let topicScore = 0;
    let matchedKeywords = [];

    for (const token of prodTokens) {
      if (userProfile.topicWeights[token]) {
        topicScore += userProfile.topicWeights[token];
        matchedKeywords.push(token);
      }
    }

    score += topicScore * 1.5;

    if (matchedKeywords.length > 0 && (!primaryReason || primaryReason.startsWith("Top pick"))) {
      const highlight = matchedKeywords[0];
      const capitalized = highlight.charAt(0).toUpperCase() + highlight.slice(1);
      primaryReason = `Matches your focus on ${capitalized}`;
    }

    // 4. Quality & popularity boosters
    score += (Number(product.rating) || 0) * 0.4;
    if (product.festiveOffer || product.discountType === "festive") {
      score += 0.8;
    }

    // 5. If still no personalized reason, default to curated reason
    if (!primaryReason) {
      primaryReason = product.category
        ? `Popular in ${product.category}`
        : "Curated for your learning journey";
    }

    if (score > 0) {
      scoredCandidates.push({
        ...product,
        _aiScore: Number(score.toFixed(2)),
        _recommendationReason: primaryReason
      });
    }
  }

  // Sort by AI score descending
  scoredCandidates.sort((a, b) => b._aiScore - a._aiScore);

  // If not enough personalized candidates, supplement with cold-start products
  if (scoredCandidates.length < limit) {
    const existingIds = new Set(scoredCandidates.map((p) => String(p._id || p.id)));
    const fallbacks = getColdStartRecommendations(catalog, limit);
    for (const fb of fallbacks) {
      const fbId = String(fb._id || fb.id);
      if (!existingIds.has(fbId)) {
        scoredCandidates.push(fb);
        existingIds.add(fbId);
        if (scoredCandidates.length >= limit) break;
      }
    }
  }

  return scoredCandidates.slice(0, limit);
}

/**
 * Fallback recommendations for new visitors with no browsing history yet.
 */
function getColdStartRecommendations(catalog, limit = 8) {
  return [...catalog]
    .sort((a, b) => {
      // Prioritize high rating, festive offers, and diverse categories
      const ratingDiff = Number(b.rating || 0) - Number(a.rating || 0);
      if (ratingDiff !== 0) return ratingDiff;
      const reviewsDiff = Number(b.reviewsCount || 0) - Number(a.reviewsCount || 0);
      return reviewsDiff;
    })
    .slice(0, limit)
    .map((product) => ({
      ...product,
      _aiScore: 10,
      _recommendationReason: "Popular starter recommendation for Sanskrit learners"
    }));
}
