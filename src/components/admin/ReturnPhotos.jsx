import { useEffect, useState } from "react";
import axios from "axios";

/**
 * A damage claim's photos for admins. They are private, so each one is loaded through the API
 * with the admin's sign-in and shown from a local copy.
 */
function ReturnPhotos({ orderId, itemId, count, token }) {
  const [urls, setUrls] = useState([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const created = [];
    (async () => {
      const loaded = [];
      for (let n = 1; n <= count; n += 1) {
        try {
          const res = await axios.get(`/api/orders/${orderId}/items/${itemId}/return-photos/${n}`, {
            headers: { Authorization: `Bearer ${token}` },
            responseType: "blob"
          });
          const url = URL.createObjectURL(res.data);
          created.push(url);
          loaded.push(url);
        } catch {
          if (!cancelled) setFailed(true);
        }
      }
      if (!cancelled) setUrls(loaded);
    })();
    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [orderId, itemId, count, token]);

  if (count <= 0) return <p className="admin-status-note">No photos attached.</p>;
  return (
    <div className="admin-damage-photos">
      {urls.map((url, idx) => (
        <a key={url} href={url} target="_blank" rel="noopener noreferrer" title="Open photo">
          <img src={url} alt={`Customer photo ${idx + 1} of the damaged item`} />
        </a>
      ))}
      {urls.length === 0 && !failed ? <p className="admin-status-note">Loading photos...</p> : null}
      {failed ? <p className="admin-status-note">Some photos could not be loaded.</p> : null}
    </div>
  );
}

export default ReturnPhotos;
