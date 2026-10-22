/**
 * Plain text conversion utility for HTML descriptions.
 * Pure ES module with no external dependencies.
 */

const BLOCK_TAGS_REGEX = /<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|td|th|table|section|article|blockquote|header|footer|aside|nav|main|pre|address)\b[^>]*>/gi;
const SCRIPT_STYLE_REGEX = /<(?:script|style)\b[\s\S]*?<\/(?:script|style)>/gi;
const ALL_TAGS_REGEX = /<[^>]*>/g;

function decodeHtmlEntities(text) {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        const code = parseInt(hex, 16);
        return String.fromCodePoint ? String.fromCodePoint(code) : String.fromCharCode(code);
      } catch {
        return "";
      }
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        const code = parseInt(dec, 10);
        return String.fromCodePoint ? String.fromCodePoint(code) : String.fromCharCode(code);
      } catch {
        return "";
      }
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&");
}

export function htmlToPlainText(html, maxLength = 0) {
  if (html === null || html === undefined) {
    return "";
  }

  let text = String(html);

  // 1. Remove script and style blocks entirely
  text = text.replace(SCRIPT_STYLE_REGEX, " ");

  // 2. Replace block-level tags with a space
  text = text.replace(BLOCK_TAGS_REGEX, " ");

  // 3. Remove all remaining tags
  text = text.replace(ALL_TAGS_REGEX, "");

  // 4. Decode entities AFTER removing tags
  text = decodeHtmlEntities(text);

  // 5. Collapse all whitespace to single spaces and trim
  text = text.replace(/\s+/g, " ").trim();

  // 6. Truncate if maxLength > 0
  const max = Number(maxLength);
  if (max > 0 && text.length > max) {
    if (text[max] === " ") {
      text = text.slice(0, max) + "…";
    } else {
      const lastSpace = text.lastIndexOf(" ", max);
      if (lastSpace > 0) {
        text = text.slice(0, lastSpace) + "…";
      } else {
        text = text.slice(0, max) + "…";
      }
    }
  }

  return text;
}
