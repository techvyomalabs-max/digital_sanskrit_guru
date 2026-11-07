import { useEffect } from "react";

export const SITE_NAME = "Digital Sanskrit Guru";

// Keep these two in sync with <title> and <meta name="description"> in index.html,
// so crawlers that don't run JavaScript see the same home title and description
export const HOME_TITLE = "Digital Sanskrit Guru | Sanskrit Books, Courses & Learning Kits";
export const DEFAULT_DESCRIPTION =
  "Shop Sanskrit books, web and Kindle editions, audio devices, learning paths and combo packs from Vyoma Linguistic Labs Foundation at Digital Sanskrit Guru.";

/**
 * Sets document.title and the meta description.
 * - title: page name, shown as "<title> | Digital Sanskrit Guru"
 * - options.absolute: use `title` as the full title, without the site-name suffix
 */
export function useDocumentMetadata(title, description, options = {}) {
  const { absolute = false } = options;

  useEffect(() => {
    if (title && absolute) {
      document.title = title;
    } else {
      document.title = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
    }

    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement("meta");
      metaDescription.setAttribute("name", "description");
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute("content", description || DEFAULT_DESCRIPTION);
  }, [title, description, absolute]);
}
