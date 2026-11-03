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
 * @param wpProducts [{ id, title, slug }] from wp_posts (post_name is the old link name)
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

  const sortedWp = [...wpProducts].sort((a, b) => Number(a.id) - Number(b.id));
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
    const candidate = candidates.find((p) => !assigned.has(String(p._id)));
    if (!candidate) {
      skippedWp.push({ ...wp, reason: "another old product with the same name already took this product" });
      continue;
    }
    assigned.add(String(candidate._id));
    const slug = normalizeSlug(wp.slug);
    if (!slug) {
      skippedWp.push({ ...wp, reason: "no link name on the old site" });
      continue;
    }
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

  return { alreadySet: products.length - needing.length, updates, unmatchedWp, skippedWp };
}

module.exports = { planSlugBackfill };
