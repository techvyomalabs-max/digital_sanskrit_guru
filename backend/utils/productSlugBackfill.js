// Works out which link names (slugs) to give existing products. Pure: no database access.
const { MAX_SLUG_LENGTH, nameKey, normalizeSlug, slugify } = require("./productSlug");

function uniqueFrom(base, taken) {
  const clean = normalizeSlug(base) || "product";
  if (!taken.has(clean)) return clean;
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${clean.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-+$/g, "")}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

// Main products before format/option children, live before deleted, oldest first.
function statusOf(p) {
  if (p.isDeleted === true) return "deleted";
  if (p.optionParent) return "format copy";
  if (p.hideFromListings === true) return "hidden";
  return "";
}

function preference(p) {
  return (p.optionParent ? 2 : 0) + (p.isDeleted === true ? 4 : 0) + (p.hideFromListings === true ? 1 : 0);
}

/**
 * @param products   [{ _id, name, slug, slugHistory, optionParent, isDeleted, hideFromListings }]
 * @param wpProducts [{ id, title, slug, oldLinkOnly }] from wp_posts (post_name is the old link name);
 *                   oldLinkOnly: the old link only opens the product, it never becomes its main link name
 */
function planSlugBackfill(products = [], wpProducts = []) {
  const taken = new Set();
  for (const p of products) {
    if (p.slug) taken.add(String(p.slug));
    (p.slugHistory || []).forEach((s) => s && taken.add(String(s)));
  }

  const needing = products.filter((p) => !p.slug);
  const byName = new Map();
  for (const p of products) {
    const key = nameKey(p.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(p);
  }
  // Looser match for names that differ only in HTML, punctuation or accents.
  const byLooseName = new Map();
  for (const p of products) {
    const key = slugify(p.name, 500);
    if (!key) continue;
    if (!byLooseName.has(key)) byLooseName.set(key, []);
    byLooseName.get(key).push(p);
  }
  for (const list of [...byName.values(), ...byLooseName.values()]) list.sort((a, b) => preference(a) - preference(b));

  const assigned = new Set();
  const updates = [];
  const unmatchedWp = [];
  const skippedWp = [];
  const oldLinks = [];

  // Adds an old link to a product that keeps (or will get) another main link name.
  const addOldLink = (wp, product, slug) => {
    if ((product.slugHistory || []).includes(slug) || product.slug === slug) return;
    if (taken.has(slug)) {
      skippedWp.push({ ...wp, reason: `link "${slug}" is already used by another product` });
      return;
    }
    taken.add(slug);
    oldLinks.push({ _id: product._id, name: product.name, oldSlug: slug, source: "wordpress-old-link", wpProductId: Number(wp.id) || undefined, status: statusOf(product) });
  };

  // Entries marked oldLinkOnly are handled last, so they never take a product's main link name.
  const sortedWp = [...wpProducts].sort((a, b) => (a.oldLinkOnly ? 1 : 0) - (b.oldLinkOnly ? 1 : 0) || Number(a.id) - Number(b.id));
  for (const wp of sortedWp) {
    // Same name, or a name that differs only in HTML/spacing/accents. Among those, a live,
    // listed product wins over a deleted or hidden copy; on a tie the exact name wins.
    const exact = byName.get(nameKey(wp.title)) || [];
    const loose = byLooseName.get(slugify(wp.title, 500)) || [];
    const pool = [...new Set([...exact, ...loose])];
    const candidates = pool.length
      ? pool
          .map((p, i) => ({ p, rank: preference(p) * 2 + (exact.includes(p) ? 0 : 1), i }))
          .sort((x, y) => x.rank - y.rank || x.i - y.i)
          .map(({ p }) => p)
      : null;
    if (!candidates) {
      unmatchedWp.push(wp);
      continue;
    }
    const slug = normalizeSlug(wp.slug);
    if (!slug) {
      skippedWp.push({ ...wp, reason: "no link name on the old site" });
      continue;
    }
    // Only products as good as the best match qualify (a deleted copy never wins over a live
    // product that already has a link). Otherwise the old link is added to the best match.
    const best = preference(candidates[0]);
    const candidate = wp.oldLinkOnly
      ? null
      : candidates.find((p) => preference(p) === best && !assigned.has(String(p._id)));
    if (!candidate) {
      addOldLink(wp, candidates[0], slug);
      continue;
    }
    assigned.add(String(candidate._id));
    if (candidate.slug === slug || (candidate.slugHistory || []).includes(slug)) continue; // already works
    if (taken.has(slug)) {
      skippedWp.push({ ...wp, reason: `link "${slug}" is already used by another product` });
      continue;
    }
    taken.add(slug);
    const wpProductId = Number(wp.id) || undefined;
    if (candidate.slug) {
      // The product already has a new link name: keep it, and make the old link open it too.
      updates.push({ _id: candidate._id, name: candidate.name, slug: candidate.slug, oldSlug: slug, source: "wordpress-old-link", wpProductId, status: statusOf(candidate) });
    } else {
      updates.push({ _id: candidate._id, name: candidate.name, slug, source: "wordpress", wpProductId, status: statusOf(candidate) });
    }
  }

  // Live, listed products get the plain link name first; deleted or hidden copies get -2, -3 ...
  const byPreference = needing
    .map((p, index) => ({ p, index }))
    .sort((a, b) => preference(a.p) - preference(b.p) || a.index - b.index)
    .map(({ p }) => p);
  for (const p of byPreference) {
    if (assigned.has(String(p._id)) && updates.some((u) => String(u._id) === String(p._id))) continue;
    if (p.slug) continue;
    const slug = uniqueFrom(slugify(p.name), taken);
    taken.add(slug);
    updates.push({ _id: p._id, name: p.name, slug, source: "generated", status: statusOf(p) });
  }

  // Old links show the main link name they open
  const mainSlug = new Map(products.filter((p) => p.slug).map((p) => [String(p._id), p.slug]));
  updates.forEach((u) => u.slug && mainSlug.set(String(u._id), u.slug));
  oldLinks.forEach((u) => updates.push({ ...u, slug: mainSlug.get(String(u._id)) || "" }));

  return { alreadySet: products.length - needing.length, updates, unmatchedWp, skippedWp };
}

module.exports = { planSlugBackfill };
