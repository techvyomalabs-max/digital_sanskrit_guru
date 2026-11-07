import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { applySeoTags } from "../../utils/seo";

/**
 * Keeps the canonical link and robots meta in step with the current route.
 * Render it before <Routes> so a page that sets its own canonical
 * (see Product.jsx) runs after this and wins.
 */
export default function SeoTags() {
  const { pathname } = useLocation();

  useEffect(() => {
    applySeoTags(pathname);
  }, [pathname]);

  return null;
}
