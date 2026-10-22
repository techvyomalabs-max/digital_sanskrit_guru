/**
 * Search text normalization and relevance scoring utilities.
 * Pure ES module with no external dependencies.
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

  const allWordsMatch = words.every(
    (w) =>
      foldedName.includes(w) ||
      foldedCategory.includes(w) ||
      foldedDesc.includes(w)
  );

  if (!allWordsMatch && !compactedMatch) return 0;

  if (foldedName === foldedQuery) return 100;
  if (foldedName.startsWith(foldedQuery)) return 80;
  if (foldedName.includes(foldedQuery)) return 60;

  const nameWords = foldedName.split(" ").filter(Boolean);
  if (nameWords.length > 0 && words.every((w) => nameWords.some((nw) => nw.startsWith(w)))) {
    return 50;
  }
  if (words.every((w) => foldedName.includes(w))) return 40;

  if (compactedMatch) return 35;

  if (words.every((w) => foldedName.includes(w) || foldedCategory.includes(w))) {
    return 25;
  }

  return 10;
}
