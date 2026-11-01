import { Link } from "react-router-dom";
import { BookOpen, CircleHelp, House, SearchX } from "lucide-react";
import { useDocumentMetadata } from "../hooks/useDocumentMetadata";

function NotFound() {
  useDocumentMetadata("Page not found", "The page you were looking for could not be found on Digital Sanskrit Guru.");

  return (
    <div className="ux-state ux-state-page">
      <span className="ux-state-icon" aria-hidden="true">
        <SearchX size={34} />
      </span>
      <h1>We couldn't find that page</h1>
      <p>The link may be old or mistyped. Try the search bar above, or head to one of these pages.</p>
      <div className="ux-state-actions">
        <Link className="ux-btn ux-btn-primary" to="/collection">
          <BookOpen size={18} aria-hidden="true" />
          Browse the collection
        </Link>
        <Link className="ux-btn ux-btn-secondary" to="/">
          <House size={18} aria-hidden="true" />
          Home
        </Link>
        <Link className="ux-btn ux-btn-secondary" to="/faq">
          <CircleHelp size={18} aria-hidden="true" />
          Help & FAQs
        </Link>
      </div>
    </div>
  );
}

export default NotFound;
