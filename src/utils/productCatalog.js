// One shared copy of the public product list per visit. The Navbar search, the
// search page and the recommendations all need the full list, so they share a
// single request instead of each downloading it.

import axios from "axios";

const MAX_AGE_MS = 5 * 60 * 1000;

let cached = null;
let cachedAt = 0;

/** Resolves to the public product list. Falls back to static catalog if API is unreachable. */
export function fetchPublicCatalog() {
  if (cached && Date.now() - cachedAt < MAX_AGE_MS) return cached;

  cachedAt = Date.now();
  cached = axios
    .get("/api/products")
    .then((res) => {
      if (Array.isArray(res.data) && res.data.length > 0) {
        return res.data;
      }
      return axios.get("/products.json").then((r) => (Array.isArray(r.data) ? r.data : []));
    })
    .catch((err) => {
      // Fallback to static catalog if local API server is unreachable (e.g. dev mode without local mongo)
      return axios
        .get("/products.json")
        .then((res) => (Array.isArray(res.data) ? res.data : []))
        .catch(() => {
          cached = null;
          throw err;
        });
    });
  return cached;
}
