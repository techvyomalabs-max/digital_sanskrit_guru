/**
 * Search text normalization, typo tolerance (fuzzy matching),
 * Sanskrit transliteration awareness, and relevance scoring utilities.
 * Pure ES module with no external dependencies (100% offline).
 */

import { htmlToPlainText } from "./plainText.js";

export function stripHtml(text) {
  return htmlToPlainText(text);
}

export function foldText(text) {
  return stripHtml(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Phonetic and Sanskrit transliteration normalization:
 * Normalizes common variations in Romanized Sanskrit text.
 */
export function normalizeSanskrit(text) {
  if (!text) return "";
  const s = foldText(text);

  return s
    .replace(/bhagw/g, "bhagav")
    .replace(/sh/g, "s")
    .replace(/ṣ/g, "s")
    .replace(/ś/g, "s")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/w/g, "v")
    .replace(/dh/g, "d")
    .replace(/th/g, "t")
    .replace(/ph/g, "f")
    .replace(/kh/g, "k")
    .replace(/gh/g, "g")
    .replace(/ch/g, "c")
    .replace(/jh/g, "j");
}

/**
 * Levenshtein distance between two strings (minimum single-character edits).
 */
export function levenshteinDistance(s1, s2) {
  if (s1 === s2) return 0;
  if (!s1) return s2 ? s2.length : 0;
  if (!s2) return s1.length;

  const len1 = s1.length;
  const len2 = s2.length;

  const prevRow = new Array(len2 + 1);
  const currRow = new Array(len2 + 1);

  for (let j = 0; j <= len2; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    currRow[0] = i;
    const char1 = s1[i - 1];

    for (let j = 1; j <= len2; j++) {
      const char2 = s2[j - 1];
      const cost = char1 === char2 ? 0 : 1;

      currRow[j] = Math.min(
        currRow[j - 1] + 1,       // insertion
        prevRow[j] + 1,           // deletion
        prevRow[j - 1] + cost     // substitution
      );
    }

    for (let j = 0; j <= len2; j++) {
      prevRow[j] = currRow[j];
    }
  }

  return prevRow[len2];
}

/**
 * Evaluates the match quality between a single query word and a candidate word.
 * Returns: { matched: boolean, quality: number, type: string }
 */
export function matchWord(queryWord, targetWord) {
  if (!queryWord || !targetWord) return { matched: false, quality: 0, type: "none" };

  // 1. Exact match
  if (targetWord === queryWord) {
    return { matched: true, quality: 1.0, type: "exact" };
  }

  // 2. Starts with / prefix
  if (targetWord.startsWith(queryWord)) {
    return { matched: true, quality: 0.9, type: "prefix" };
  }

  // 3. Substring
  if (targetWord.includes(queryWord)) {
    return { matched: true, quality: 0.8, type: "substring" };
  }

  // 4. Sanskrit transliteration match
  const normQuery = normalizeSanskrit(queryWord);
  const normTarget = normalizeSanskrit(targetWord);
  if (normTarget === normQuery) {
    return { matched: true, quality: 0.85, type: "translit_exact" };
  }
  if (normTarget.startsWith(normQuery)) {
    return { matched: true, quality: 0.8, type: "translit_prefix" };
  }
  if (normTarget.includes(normQuery)) {
    return { matched: true, quality: 0.75, type: "translit_sub" };
  }

  // 5. Fuzzy typo tolerance (Levenshtein edit-distance)
  // Only allow typos for words with length >= 3
  if (queryWord.length >= 3) {
    const maxDist = queryWord.length >= 6 ? 2 : 1;

    const dist = levenshteinDistance(queryWord, targetWord);
    if (dist <= maxDist) {
      const quality = Math.max(0.4, 0.7 - dist * 0.15);
      return { matched: true, quality, type: "fuzzy" };
    }

    // Also check transliterated distance for combinations of transliteration + typo
    const normDist = levenshteinDistance(normQuery, normTarget);
    if (normDist <= maxDist) {
      const quality = Math.max(0.4, 0.65 - normDist * 0.15);
      return { matched: true, quality, type: "fuzzy_translit" };
    }
  }

  return { matched: false, quality: 0, type: "none" };
}

/**
 * Searches for a query word across an array of target words.
 */
function matchWordInList(queryWord, wordList) {
  let best = { matched: false, quality: 0, type: "none" };
  for (const tWord of wordList) {
    const res = matchWord(queryWord, tWord);
    if (res.matched && res.quality > best.quality) {
      best = res;
      if (best.quality === 1.0) break;
    }
  }
  return best;
}

/**
 * Scores a product against a search query.
 * Produces accurate, deterministic ranking:
 * 100: Exact title match
 * 80: Title starts with query
 * 60: Title contains full query string
 * 50: Title words start with query words
 * 40: All query words found in title
 * 35: Compacted match (ignoring whitespace)
 * 25: All query words in title or category
 * 20: Typo/Fuzzy or Sanskrit transliterated match in title
 * 15: Typo/Fuzzy match in category or description
 * 10: Description-only match
 * 0: No match
 */
export function scoreProduct(product, query) {
  const foldedQuery = foldText(query);
  if (!foldedQuery) return 1;

  const words = foldedQuery.split(" ").filter(Boolean);
  if (words.length === 0) return 1;

  const foldedName = foldText(product?.name);
  const foldedCategory = foldText(product?.category);
  const foldedDesc = foldText(product?.description);

  const compactedName = foldedName.replace(/\s+/g, "");
  const compactedQuery = foldedQuery.replace(/\s+/g, "");
  const compactedMatch = Boolean(
    compactedName && compactedQuery && compactedName.includes(compactedQuery)
  );

  const nameWords = foldedName.split(" ").filter(Boolean);
  const catWords = foldedCategory.split(" ").filter(Boolean);
  const descWords = foldedDesc.split(" ").filter(Boolean);

  // Exact tier checks (backward-compatible and highest precision)
  if (foldedName === foldedQuery) return 100;
  if (foldedName.startsWith(foldedQuery)) return 80;
  if (foldedName.includes(foldedQuery)) return 60;

  if (nameWords.length > 0 && words.every((w) => nameWords.some((nw) => nw.startsWith(w)))) {
    return 50;
  }

  const allWordsInNameExact = words.every((w) => foldedName.includes(w));
  if (allWordsInNameExact) return 40;

  if (compactedMatch) return 35;

  const allWordsInNameOrCatExact = words.every(
    (w) => foldedName.includes(w) || foldedCategory.includes(w)
  );
  if (allWordsInNameOrCatExact) {
    return 25;
  }

  // Multi-word token inspection including typo tolerance and Sanskrit transliteration
  let allWordsMatched = true;
  let hasFuzzyOrTranslitInName = false;
  let allWordsInDescOnly = true;

  for (const w of words) {
    const nameMatch = matchWordInList(w, nameWords);
    if (nameMatch.matched) {
      allWordsInDescOnly = false;
      if (nameMatch.type.startsWith("fuzzy") || nameMatch.type.startsWith("translit")) {
        hasFuzzyOrTranslitInName = true;
      }
      continue;
    }

    const catMatch = matchWordInList(w, catWords);
    if (catMatch.matched) {
      allWordsInDescOnly = false;
      continue;
    }

    const descMatch = matchWordInList(w, descWords);
    if (descMatch.matched) {
      continue;
    }

    allWordsMatched = false;
    break;
  }

  if (allWordsMatched) {
    if (hasFuzzyOrTranslitInName) {
      return 20;
    }
    if (allWordsInDescOnly) {
      return 10;
    }
    return 15;
  }

  // Fallback: Check if the entire folded query transliterates or fuzzily matches the title
  const normQuery = normalizeSanskrit(foldedQuery);
  const normName = normalizeSanskrit(foldedName);
  if (normName && normQuery && (normName.includes(normQuery) || normQuery.includes(normName))) {
    return 20;
  }

  // If query is a single word and matches title with edit distance <= 2
  if (words.length === 1 && foldedQuery.length >= 3) {
    for (const nw of nameWords) {
      const maxD = foldedQuery.length >= 6 ? 2 : 1;
      if (levenshteinDistance(foldedQuery, nw) <= maxD) {
        return 20;
      }
    }
  }

  return 0;
}

/**
 * Generates an intelligent "Did you mean?" suggestion based on product vocabulary.
 * Returns the corrected query string, or null if no typo was detected.
 */
export function getSearchSuggestion(query, products) {
  if (!query || !Array.isArray(products) || products.length === 0) return null;

  const foldedQuery = foldText(query);
  const queryWords = foldedQuery.split(" ").filter(Boolean);
  if (queryWords.length === 0) return null;

  // Build vocabulary from product names and categories
  const vocabulary = new Set();
  for (const p of products) {
    foldText(p?.name).split(" ").filter((w) => w.length >= 3).forEach((w) => vocabulary.add(w));
    foldText(p?.category).split(" ").filter((w) => w.length >= 3).forEach((w) => vocabulary.add(w));
  }

  let hasCorrection = false;
  const correctedWords = queryWords.map((qWord) => {
    // If word is short or already an exact match in vocabulary, keep it
    if (qWord.length < 3 || vocabulary.has(qWord)) {
      return qWord;
    }

    let bestCandidate = qWord;
    let bestDist = Infinity;
    const maxDist = qWord.length >= 6 ? 2 : 1;

    for (const vWord of vocabulary) {
      // 1. Check direct Levenshtein edit distance
      const dist = levenshteinDistance(qWord, vWord);
      if (dist <= maxDist && dist < bestDist) {
        bestDist = dist;
        bestCandidate = vWord;
      }

      // 2. Check Sanskrit transliteration match
      if (normalizeSanskrit(qWord) === normalizeSanskrit(vWord)) {
        if (1 < bestDist) {
          bestDist = 1;
          bestCandidate = vWord;
        }
      }
    }

    if (bestCandidate !== qWord) {
      hasCorrection = true;
      return bestCandidate;
    }
    return qWord;
  });

  return hasCorrection ? correctedWords.join(" ") : null;
}
