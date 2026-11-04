// Product link names ("slugs"), e.g. /product/bhagavad-gita-paperback.
// Pure helpers: no database access, so they can be unit-tested.

const MAX_SLUG_LENGTH = 90;

function safeDecode(value) {
  let text = String(value ?? "");
  // Old WordPress links store non-English names percent-encoded (%e0%a4...).
  for (let i = 0; i < 2 && /%[0-9a-f]{2}/i.test(text); i += 1) {
    try {
      text = decodeURIComponent(text);
    } catch {
      break;
    }
  }
  return text;
}

// Turns any text into link-name form: lowercase words joined by "-".
// Letters in other scripts (e.g. Devanagari) are kept, like WordPress does.
function cleanSlug(value, maxLength = MAX_SLUG_LENGTH) {
  let s = safeDecode(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['\u2018\u2019`]/g, "")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  if (s.length > maxLength) {
    const cut = s.slice(0, maxLength);
    const lastDash = cut.lastIndexOf("-");
    s = (lastDash > maxLength / 2 ? cut.slice(0, lastDash) : cut).replace(/-+$/g, "");
  }
  return s;
}

// Link name for a product name: "Bhagavad Gītā (Paperback)" -> "bhagavad-gita-paperback".
// HTML in names (<br>, &amp;) is ignored. When the name also has English letters,
// words in other scripts are left out so the link is easy to share
// ("Nāmarāmāyaṇam - नामरामायणम्" -> "namaramayanam"); names only in another script keep it.
function slugify(name, maxLength = MAX_SLUG_LENGTH) {
  const text = decodeEntities(String(name ?? "").replace(/<[^>]*>/g, " "))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2018\u2019`]/g, "");
  const latinOnly = /[a-z0-9]/i.test(text) ? text.replace(/[^\p{ASCII}]+/gu, " ") : text;
  return cleanSlug(latinOnly, maxLength);
}

// A link name must not look like a database id or an old WordPress number,
// because those are looked up differently.
function isReservedSlug(slug) {
  return /^\d+$/.test(slug) || /^[a-f0-9]{24}$/i.test(slug);
}

// Cleans a link name typed by an admin, taken from WordPress, or read from a URL.
function normalizeSlug(value) {
  const s = cleanSlug(String(safeDecode(value)).trim().replace(/^\/+|\/+$/g, "").split("/").pop());
  if (!s) return "";
  return isReservedSlug(s) ? `${s}-item` : s;
}

function withSuffix(base, n) {
  const suffix = `-${n}`;
  return `${base.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-+$/g, "")}${suffix}`;
}

// Picks base, base-2, base-3 ... until isTaken(slug) is false.
async function pickUniqueSlug(base, isTaken) {
  const clean = normalizeSlug(base) || "product";
  if (!(await isTaken(clean))) return clean;
  for (let n = 2; n < 200; n += 1) {
    const candidate = withSuffix(clean, n);
    if (!(await isTaken(candidate))) return candidate;
  }
  return withSuffix(clean, Date.now().toString(36));
}

// Decodes the HTML entities WordPress puts in titles (&amp; &#8211; ...), for name matching.
function decodeEntities(text) {
  return String(text ?? "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#039;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

// Key used to match a WordPress product to a migrated product by name.
function nameKey(name) {
  return decodeEntities(name)
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Sets doc.slug before a product is saved (used by the Product model).
 * - New product, or no link name yet: made from the name, unique (base, base-2, ...).
 * - Admin typed a link name: cleaned and checked; refused if another product uses it
 *   (now or as an old link). The previous link name goes into slugHistory.
 * - Admin cleared the field: the current link name is kept.
 * Model needs findOne(...).select(...).lean() and exists(...).
 */
async function assignProductSlug(doc, Model) {
  const selfId = doc._id;
  const previous = (doc.$locals && doc.$locals.savedSlug) || "";
  const usedByOther = (candidate) => ({ _id: { $ne: selfId }, $or: [{ slug: candidate }, { slugHistory: candidate }] });

  if (doc.slug && doc.isModified("slug")) {
    const wanted = normalizeSlug(doc.slug);
    if (wanted && wanted !== previous) {
      const clash = await Model.findOne(usedByOther(wanted)).select("name").lean();
      if (clash) {
        doc.invalidate("slug", `The link "${wanted}" is already used by "${clash.name}". Choose a different link.`);
        return;
      }
    }
    doc.slug = wanted || undefined;
    if (wanted && previous && wanted !== previous) {
      const history = (doc.slugHistory || []).filter((s) => s !== wanted);
      if (!history.includes(previous)) history.push(previous);
      doc.slugHistory = history;
    }
  }

  if (!doc.slug) {
    if (previous) {
      doc.slug = previous;
      return;
    }
    doc.slug = await pickUniqueSlug(slugify(doc.name) || "product", async (candidate) =>
      Boolean(await Model.exists(usedByOther(candidate)))
    );
  }
}

module.exports = {
  assignProductSlug,
  cleanSlug,
  MAX_SLUG_LENGTH,
  slugify,
  normalizeSlug,
  isReservedSlug,
  pickUniqueSlug,
  decodeEntities,
  nameKey
};
