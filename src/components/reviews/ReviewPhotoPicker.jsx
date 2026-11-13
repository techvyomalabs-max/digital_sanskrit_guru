import { useId, useState } from "react";
import axios from "axios";
import { Camera, Loader2, X } from "lucide-react";
import { shrinkImage } from "../../utils/shrinkImage";
import "./ReviewPhotos.css";

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Photos for a product review. Each photo goes straight to storage through a one-time upload
 * slot from the server; the parent keeps the list of public photo links.
 */
export default function ReviewPhotoPicker({ productId, token, photos, onChange, maxPhotos = 4, disabled = false }) {
  const inputId = useId();
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState("");

  const uploadOne = async (original) => {
    const file = await shrinkImage(original);
    if (!TYPES.includes(file.type) || file.size > MAX_BYTES) {
      throw Object.assign(new Error("too big"), { friendly: "Use JPG, PNG or WebP photos under 2 MB." });
    }
    const { data } = await axios.post(
      `/api/products/${productId}/reviews/photos/presign`,
      { contentType: file.type },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const form = new FormData();
    Object.entries(data.fields || {}).forEach(([key, value]) => form.append(key, value));
    form.append("file", file);
    const res = await fetch(data.url, { method: "POST", body: form });
    if (!res.ok) throw new Error("upload failed");
    return data.publicUrl;
  };

  const handleFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    setError("");
    const room = maxPhotos - photos.length;
    if (room <= 0) {
      setError(`You can add up to ${maxPhotos} photos.`);
      return;
    }
    const chosen = files.filter((f) => TYPES.includes(f.type)).slice(0, room);
    if (chosen.length === 0) {
      setError("Use JPG, PNG or WebP photos.");
      return;
    }
    setUploading(chosen.length);
    const added = [];
    for (const file of chosen) {
      try {
        added.push(await uploadOne(file));
      } catch (err) {
        setError(
          err?.friendly ||
            (err?.response?.status === 503
              ? "Photo upload isn't available right now. You can post your review without photos."
              : err?.response?.data?.message || "A photo could not be uploaded. Please try again.")
        );
        break;
      } finally {
        setUploading((n) => Math.max(0, n - 1));
      }
    }
    setUploading(0);
    if (added.length) onChange([...photos, ...added]);
  };

  return (
    <div className="review-photo-picker">
      <div className="review-photo-picker-head">
        <span className="reviews-form-label">Add photos (optional)</span>
        <span className="review-photo-picker-hint">Up to {maxPhotos} photos of the product you received</span>
      </div>
      <div className="review-photo-picker-grid">
        {photos.map((url) => (
          <div key={url} className="review-photo-picker-item">
            <img src={url} alt="Your photo" />
            <button
              type="button"
              className="review-photo-picker-remove"
              aria-label="Remove this photo"
              onClick={() => onChange(photos.filter((p) => p !== url))}
              disabled={disabled}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
        {photos.length < maxPhotos && (
          <label htmlFor={inputId} className={`review-photo-picker-add${disabled || uploading ? " is-disabled" : ""}`}>
            {uploading ? <Loader2 size={22} className="review-photo-spin" aria-hidden="true" /> : <Camera size={22} aria-hidden="true" />}
            <span>{uploading ? "Uploading..." : "Add photo"}</span>
            <input
              id={inputId}
              type="file"
              accept={TYPES.join(",")}
              multiple
              onChange={handleFiles}
              disabled={disabled || uploading > 0}
            />
          </label>
        )}
      </div>
      {error && <p className="review-form-error-msg" role="alert">{error}</p>}
    </div>
  );
}
