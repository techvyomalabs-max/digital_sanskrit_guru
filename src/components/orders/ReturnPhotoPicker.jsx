import { useId, useState } from "react";
import axios from "axios";
import { Camera, Loader2, X } from "lucide-react";
import "./ReturnPhotoPicker.css";

const MAX_PHOTOS = 3;
const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Photos of a damaged item for a return request. Each photo goes straight to private storage
 * through a one-time upload slot from the server. The parent keeps [{ key, preview }]: `key` is
 * sent with the request; `preview` is a local picture of the file (photos have no public link).
 */
function ReturnPhotoPicker({ orderId, itemId, token, photos, onChange, onUnavailable, required = false, disabled = false }) {
  const inputId = useId();
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState("");

  const uploadOne = async (file) => {
    const headers = { Authorization: `Bearer ${token}` };
    const { data } = await axios.post(
      `/api/orders/${orderId}/items/${itemId}/return-photos/presign`,
      { contentType: file.type },
      { headers }
    );
    const form = new FormData();
    Object.entries(data.fields || {}).forEach(([key, value]) => form.append(key, value));
    form.append("file", file);
    const res = await fetch(data.url, { method: "POST", body: form });
    if (!res.ok) throw new Error("upload failed");
    return { key: data.key, preview: URL.createObjectURL(file) };
  };

  const handleFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    setError("");
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setError(`You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const chosen = files.slice(0, room);
    const bad = chosen.find((f) => !TYPES.includes(f.type) || f.size > MAX_BYTES);
    if (bad) {
      setError("Use JPG, PNG or WebP photos, each under 2 MB.");
      return;
    }
    setUploading(chosen.length);
    const added = [];
    for (const file of chosen) {
      try {
        added.push(await uploadOne(file));
      } catch (err) {
        if (err?.response?.status === 503) {
          // Photo storage isn't set up here: the request can go without photos
          onUnavailable?.();
          setError("Photo upload isn't available right now. You can submit the request without photos.");
        } else {
          setError(err?.response?.data?.message || "A photo could not be uploaded. Please try again.");
        }
        break;
      } finally {
        setUploading((n) => Math.max(0, n - 1));
      }
    }
    setUploading(0);
    if (added.length) onChange([...photos, ...added]);
  };

  return (
    <div className="return-photos">
      <div className="return-photos-head">
        <span className="order-cancel-field-label">
          Photos of the damage{required ? " *" : ""}
        </span>
        <span className="return-photos-hint">Up to {MAX_PHOTOS} photos, each under 2 MB</span>
      </div>
      <div className="return-photos-grid">
        {photos.map((photo) => (
          <div key={photo.key} className="return-photo">
            <img src={photo.preview} alt="Uploaded photo of the damaged item" />
            <button
              type="button"
              className="return-photo-remove"
              aria-label="Remove this photo"
              onClick={() => {
                URL.revokeObjectURL(photo.preview);
                onChange(photos.filter((p) => p.key !== photo.key));
              }}
              disabled={disabled}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
          <label htmlFor={inputId} className={`return-photo-add${disabled || uploading ? " is-disabled" : ""}`}>
            {uploading ? <Loader2 size={20} className="return-photo-spin" aria-hidden="true" /> : <Camera size={20} aria-hidden="true" />}
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
      {error && <p className="return-photos-error" role="alert">{error}</p>}
    </div>
  );
}

export default ReturnPhotoPicker;
