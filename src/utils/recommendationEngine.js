/**
 * AI-powered Offline Recommendation Engine for Digital Sanskrit Guru.
 * Generates personalized product recommendations based on user browsing history,
 * recent searches, and wishlist/cart signals.
 *
 * 100% offline, zero external API dependencies, sub-millisecond execution.
 */

import { foldText, normalizeSanskrit } from "./searchText.js";

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

const idOf = (item) =>
  String((item && typeof item === "object" ? item._id || item.id : item) || "");

// Edition, packaging and language words and fillers, which never identify a title
const NON_TITLE_WORDS = new Set(
  [
    "paperback", "digital", "pendrive", "bulk", "purchase", "purchas", "festival", "offer",
    "english", "hindi", "tamil", "kannada", "level", "levels", "volume", "learn",
    "sanskrit", "samskrta", "samskrita", "from", "your", "through", "upto", "years"
  ].map(normalizeSanskrit)
);

/** Normalized title words of a product name in order, with honorifics (Sri, Sriman, Srimad) removed. */
const titleWordList = (name) =>
  extractTopicTokens(name)
    .map((t) => normalizeSanskrit(t).replace(/^(?:srimad|sriman|srimat|sri)(?=[a-z]{4}|$)/, ""))
    .filter((t) => t.length >= 3 && !NON_TITLE_WORDS.has(t));

/** Neighbouring title words joined ("Joy of Oneness" -> "joyoneness"), a word never with itself. */
const titlePhrases = (words) =>
  words.slice(1).map((w, i) => words[i] + w).filter((_, i) => words[i] !== words[i + 1]);

/** Title words plus phrases, so "Bhagavad Gita" also matches "Bhagavadgita". */
const titleWords = (name) => {
  const words = titleWordList(name);
  return [...new Set([...words, ...titlePhrases(words)])];
};

// Longer keywords also match compounds they start, e.g. "bhagavad" in "bhagavadgita"
const hasTitleWord = (words, keyword) =>
  words.some((w) => w === keyword || (keyword.length >= 5 && w.startsWith(keyword)));

/**
 * Products related to `product`, for its Related Products section: those whose names
 * contain the product's title keyword (e.g. every "Narayaneeyam" product), or share a
 * title phrase with it ("Vocabulary Builder"). The keyword is the first Sanskrit title word in the name
 * (one written with diacritics somewhere in the catalogue, e.g. Nārāyaṇīyam), or else its
 * first English title word; it is enough by itself only when it is a long Sanskrit word.
 * Admin-picked, reverse-linked and combo products are listed first, but only when their
 * names match too. Never returns the product itself or the same product twice.
 *
 * @param {Object} product - The product being viewed
 * @param {Array} catalog - Full public product list
 * @param {number} limit - Maximum number of products returned
 */
export function getRelatedProducts(product, catalog = [], limit = 8) {
  const currentId = idOf(product);
  if (!currentId) return [];

  const list = Array.isArray(catalog) ? catalog.filter(Boolean) : [];
  const byId = new Map(list.map((p) => [idOf(p), p]));
  const seen = new Set([currentId]);
  const results = [];

  // Title keyword, derived from the current product's name
  const named = byId.has(currentId) ? list : [...list, product];
  const wordsById = new Map(named.map((p) => [idOf(p), titleWords(p?.name)]));
  const wordCounts = new Map();
  wordsById.forEach((words) => words.forEach((w) => wordCounts.set(w, (wordCounts.get(w) || 0) + 1)));
  // Words in a large share of all names are too broad to be a title
  const maxCount = Math.max(10, Math.floor(named.length * 0.25));
  const iastWords = named
    .flatMap((p) => String(p?.name || "").split(/[^\p{L}]+/u))
    .filter((w) => w && foldText(w) !== w.toLowerCase())
    .map(normalizeSanskrit);
  const isSanskrit = (w) => w.length >= 4 && iastWords.some((iast) => iast.includes(w));
  const ownWords = wordsById.get(currentId).filter((w) => wordCounts.get(w) <= maxCount);
  const keyword = ownWords.find(isSanskrit) || ownWords[0];
  if (!keyword) return [];
  // A long Sanskrit title word (Narayaneeyam, Bhagavadgita) identifies the title by itself;
  // short roots and English words (Gita, Shabda, Basic, Joy) need a shared title phrase too
  const keywordAlone = isSanskrit(keyword) && keyword.length >= 6;
  const ownPhrases = titlePhrases(titleWordList(product.name));
  const isRelated = (words) =>
    (keywordAlone && hasTitleWord(words, keyword)) ||
    ownPhrases.some((phrase) => hasTitleWord(words, phrase));

  const add = (item) => {
    const id = idOf(item);
    const resolved = byId.get(id) || item;
    if (!id || seen.has(id) || !resolved || typeof resolved !== "object") return;
    if (!isRelated(wordsById.get(id) || titleWords(resolved.name))) return;
    seen.add(id);
    results.push(resolved);
  };
  const relatedIds = (p) => (Array.isArray(p?.relatedProducts) ? p.relatedProducts.map(idOf) : []);
  const bundleIds = (p) => (Array.isArray(p?.bundleItems) ? p.bundleItems.map((b) => idOf(b?.product)) : []);

  // 1. Linked by the admin, in either direction
  (Array.isArray(product.relatedProducts) ? product.relatedProducts : []).forEach(add);
  list.filter((p) => relatedIds(p).includes(currentId)).forEach(add);

  // 2. Items of this combo, and combos containing this product
  bundleIds(product).forEach(add);
  list.filter((p) => bundleIds(p).includes(currentId)).forEach(add);

  // 3. Every other product whose name relates to this title (other formats of the same title)
  list.forEach(add);

  return results.slice(0, limit);
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
