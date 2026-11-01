import { Component } from "react";
import { House, RefreshCw, TriangleAlert } from "lucide-react";

const CHUNK_RELOAD_KEY = "dsg-chunk-reload-at";

// After a new release, an open tab can ask for page files that no longer exist
function isStaleBuildError(error) {
  return /dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError/i.test(
    String(error?.message || error)
  );
}

function reloadOnceForNewBuild() {
  try {
    const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
    if (Date.now() - lastReload < 30000) return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

// Shows a friendly page instead of a blank screen if a page fails to render.
// `resetKey` clears the error when the shopper navigates somewhere else.
class ErrorBoundary extends Component {
  state = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error) {
    return { error };
  }

  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.resetKey) {
      return { error: null, resetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error, info) {
    if (isStaleBuildError(error) && reloadOnceForNewBuild()) return;
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="ux-state ux-state-page" role="alert">
        <span className="ux-state-icon" aria-hidden="true">
          <TriangleAlert size={34} />
        </span>
        <h1>Something went wrong</h1>
        <p>This page couldn't load properly. Your cart and account are safe. Please try again.</p>
        <div className="ux-state-actions">
          <button type="button" className="ux-btn ux-btn-primary" onClick={() => window.location.reload()}>
            <RefreshCw size={18} aria-hidden="true" />
            Reload page
          </button>
          <a className="ux-btn ux-btn-secondary" href="/">
            <House size={18} aria-hidden="true" />
            Go to Home
          </a>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
