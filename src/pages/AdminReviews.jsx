import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { MessageSquareText, RefreshCw, Search, Camera, Trash2, ImageOff, Star, CheckCircle2, ExternalLink } from "lucide-react";
import AdminSidebar from "../components/admin/AdminSidebar";
import { useAuth } from "../hooks/useAuth";
import { useDialog } from "../hooks/useDialog";
import { formatDateTime } from "../utils/date";
import { productPath } from "../utils/productLink";
import "./AdminShared.css";
import "./AdminReviews.css";

const PAGE_SIZE = 20;

function Stars({ rating }) {
  const value = Math.round(Number(rating) || 0);
  return (
    <span className="admin-review-stars" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={14} fill={n <= value ? "#f59e0b" : "none"} color={n <= value ? "#f59e0b" : "#cbd5e1"} aria-hidden="true" />
      ))}
    </span>
  );
}

export default function AdminReviews() {
  const { token } = useAuth();
  const { confirm } = useDialog();
  const [reviews, setReviews] = useState([]);
  const [total, setTotal] = useState(0);
  const [photosOnly, setPhotosOnly] = useState(true);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const headers = { Authorization: `Bearer ${token}` };

  const load = useCallback(
    async (skip = 0) => {
      if (!token) return;
      if (skip > 0) setLoadingMore(true);
      else setIsLoading(true);
      setError("");
      try {
        const { data } = await axios.get("/api/admin/reviews", {
          params: { skip, limit: PAGE_SIZE, photos: photosOnly ? 1 : 0, q: appliedQuery },
          headers: { Authorization: `Bearer ${token}` }
        });
        const next = Array.isArray(data?.reviews) ? data.reviews : [];
        setReviews((prev) => (skip > 0 ? [...prev, ...next] : next));
        setTotal(Number(data?.total || 0));
      } catch (err) {
        setError(err?.response?.data?.message || "Could not load reviews.");
      } finally {
        setIsLoading(false);
        setLoadingMore(false);
      }
    },
    [token, photosOnly, appliedQuery]
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  const removePhoto = async (review, url) => {
    const ok = await confirm({
      title: "Remove this photo?",
      message: `The photo will no longer show on ${review.userName}'s review. The review text and rating stay.`,
      tone: "danger",
      confirmText: "Remove photo"
    });
    if (!ok) return;
    setBusy(`${review._id}:${url}`);
    setError("");
    try {
      const { data } = await axios.delete(`/api/admin/reviews/${review._id}/photos`, { headers, data: { url } });
      setReviews((list) =>
        list
          .map((r) => (r._id === review._id ? { ...r, photos: data.photos || [] } : r))
          .filter((r) => !photosOnly || r.photos.length > 0)
      );
      setMessage("Photo removed.");
    } catch (err) {
      setError(err?.response?.data?.message || "Could not remove the photo.");
    } finally {
      setBusy("");
    }
  };

  const deleteReview = async (review) => {
    const ok = await confirm({
      title: "Delete this review?",
      message: `${review.userName}'s ${review.rating}-star review and its photos will be deleted and the product's rating recalculated. This can't be undone.`,
      tone: "danger",
      confirmText: "Delete review"
    });
    if (!ok) return;
    setBusy(review._id);
    setError("");
    try {
      await axios.delete(`/api/admin/reviews/${review._id}`, { headers });
      setReviews((list) => list.filter((r) => r._id !== review._id));
      setTotal((n) => Math.max(0, n - 1));
      setMessage("Review deleted.");
    } catch (err) {
      setError(err?.response?.data?.message || "Could not delete the review.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main">
        <header className="admin-page-header admin-reviews-header">
          <div>
            <h1 className="admin-reviews-title">
              <MessageSquareText size={24} color="#d97706" aria-hidden="true" /> Reviews
            </h1>
            <p className="admin-reviews-subtitle">
              Customer reviews show on the product page as soon as they are posted. Remove a photo that shouldn&apos;t be
              public, or delete a review completely.
            </p>
          </div>
          <button type="button" className="admin-btn admin-btn-secondary admin-reviews-refresh" onClick={() => load(0)} disabled={isLoading}>
            <RefreshCw size={15} aria-hidden="true" /> Refresh
          </button>
        </header>

        <div className="admin-reviews-toolbar">
          <div className="admin-reviews-tabs" role="tablist" aria-label="Which reviews">
            <button type="button" role="tab" aria-selected={photosOnly} className={photosOnly ? "is-active" : ""} onClick={() => setPhotosOnly(true)}>
              <Camera size={15} aria-hidden="true" /> With photos
            </button>
            <button type="button" role="tab" aria-selected={!photosOnly} className={!photosOnly ? "is-active" : ""} onClick={() => setPhotosOnly(false)}>
              All reviews
            </button>
          </div>
          <form
            className="admin-reviews-search"
            onSubmit={(e) => {
              e.preventDefault();
              setAppliedQuery(query.trim());
            }}
          >
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (!e.target.value) setAppliedQuery("");
              }}
              placeholder="Search by customer, product or words in the review"
              aria-label="Search reviews"
            />
          </form>
        </div>

        {message && (
          <p className="admin-reviews-message" role="status" onAnimationEnd={() => setMessage("")}>
            {message}
          </p>
        )}
        {error && <p className="admin-reviews-error" role="alert">{error}</p>}

        {isLoading ? (
          <p className="admin-reviews-empty">Loading reviews...</p>
        ) : reviews.length === 0 ? (
          <p className="admin-reviews-empty">{photosOnly ? "No reviews with photos yet." : "No reviews found."}</p>
        ) : (
          <>
            <p className="admin-reviews-count">
              Showing {reviews.length} of {total}
            </p>
            <ul className="admin-reviews-list">
              {reviews.map((review) => (
                <li key={review._id} className="admin-review-card">
                  <div className="admin-review-top">
                    {review.product ? (
                      <Link to={productPath(review.product)} target="_blank" rel="noopener noreferrer" className="admin-review-product">
                        {review.product.image ? <img src={review.product.image} alt="" /> : null}
                        <span>{review.product.name}</span>
                        <ExternalLink size={13} aria-hidden="true" />
                      </Link>
                    ) : (
                      <span className="admin-review-product is-missing">Product deleted</span>
                    )}
                    <span className="admin-review-date">{formatDateTime(review.createdAt)}</span>
                  </div>

                  <div className="admin-review-meta">
                    <strong>{review.userName}</strong>
                    {review.verifiedPurchase && (
                      <span className="admin-review-verified">
                        <CheckCircle2 size={13} aria-hidden="true" /> Verified buyer
                      </span>
                    )}
                    <Stars rating={review.rating} />
                  </div>

                  {review.comment ? <p className="admin-review-comment">{review.comment}</p> : null}

                  {review.photos.length > 0 && (
                    <div className="admin-review-photos">
                      {review.photos.map((url, i) => (
                        <figure key={url} className="admin-review-photo">
                          <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open photo ${i + 1} full size`}>
                            <img src={url} alt={`Photo ${i + 1} from ${review.userName}`} loading="lazy" />
                          </a>
                          <button
                            type="button"
                            className="admin-review-photo-remove"
                            onClick={() => removePhoto(review, url)}
                            disabled={Boolean(busy)}
                          >
                            <ImageOff size={13} aria-hidden="true" />
                            {busy === `${review._id}:${url}` ? "Removing..." : "Remove"}
                          </button>
                        </figure>
                      ))}
                    </div>
                  )}

                  <div className="admin-review-actions">
                    <button type="button" className="admin-review-delete" onClick={() => deleteReview(review)} disabled={Boolean(busy)}>
                      <Trash2 size={14} aria-hidden="true" />
                      {busy === review._id ? "Deleting..." : "Delete review"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {reviews.length < total && (
              <button type="button" className="admin-btn admin-btn-secondary admin-reviews-more" onClick={() => load(reviews.length)} disabled={loadingMore}>
                {loadingMore ? "Loading..." : "Load more"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
