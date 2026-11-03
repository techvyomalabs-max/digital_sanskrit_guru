// One shared copy of the public product list per visit. The Navbar search, the
// search page and the recommendations all need the full list, so they share a
// single request instead of each downloading it.

import axios from "axios";

const MAX_AGE_MS = 5 * 60 * 1000;

let cached = null;
let cachedAt = 0;

/** Resolves to the public product list. A failed request is not kept, so a retry fetches again. */
export function fetchPublicCatalog() {
  if (cached && Date.now() - cachedAt < MAX_AGE_MS) return cached;

  cachedAt = Date.now();
  cached = axios
    .get("/api/products")
    .then((res) => (Array.isArray(res.data) ? res.data : []))
    .catch((err) => {
      cached = null;
      throw err;
    });
  return cached;
}
