const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  slugify,
  normalizeSlug,
  isReservedSlug,
  pickUniqueSlug,
  nameKey,
  assignProductSlug
} = require("../utils/productSlug");
const { planSlugBackfill } = require("../utils/productSlugBackfill");

describe("slugify / normalizeSlug", () => {
  it("makes a readable link name from a product name", () => {
    assert.equal(slugify("Bhagavad Gītā (Paperback)"), "bhagavad-gita-paperback");
    assert.equal(slugify("  Sanskrit & Vedic Maths – Book 2 "), "sanskrit-and-vedic-maths-book-2");
    assert.equal(slugify("Children's Picture Book"), "childrens-picture-book");
  });

  it("keeps an old WordPress link name unchanged", () => {
    const old = "a-bibliographic-compendium-of-bharatiya-arthasastra-parampara";
    assert.equal(normalizeSlug(old), old);
    assert.equal(normalizeSlug(`/product/${old}/`), old);
    assert.equal(normalizeSlug(old.toUpperCase()), old);
  });

  it("decodes percent-encoded non-English link names like WordPress stores them", () => {
    const encoded = encodeURIComponent("संस्कृत-पुस्तक").toLowerCase();
    assert.equal(normalizeSlug(encoded), "संस्कृत-पुस्तक");
    assert.equal(slugify("संस्कृत पुस्तक"), "संस्कृत-पुस्तक");
    assert.equal(normalizeSlug(encoded), normalizeSlug("संस्कृत-पुस्तक"));
  });

  it("never returns something that looks like an id or old product number", () => {
    assert.equal(isReservedSlug("12345"), true);
    assert.equal(isReservedSlug("6650f1c2a1b2c3d4e5f60718"), true);
    assert.equal(normalizeSlug("12345"), "12345-item");
    assert.equal(normalizeSlug("6650f1c2a1b2c3d4e5f60718"), "6650f1c2a1b2c3d4e5f60718-item");
  });

  it("limits long names at a word boundary", () => {
    const s = slugify("word ".repeat(40));
    assert.ok(s.length <= 90);
    assert.ok(!s.endsWith("-"));
    assert.ok(s.endsWith("word"));
  });

  it("returns an empty string when nothing usable is left", () => {
    assert.equal(normalizeSlug("  ///  "), "");
    assert.equal(slugify("!!!"), "");
  });
});

describe("pickUniqueSlug", () => {
  it("adds -2, -3 ... when the link name is taken", async () => {
    const taken = new Set(["gita", "gita-2"]);
    assert.equal(await pickUniqueSlug("gita", async (s) => taken.has(s)), "gita-3");
    assert.equal(await pickUniqueSlug("new-book", async (s) => taken.has(s)), "new-book");
  });
});

// Minimal stand-in for a Mongoose document and model.
function fakeDoc(fields, { saved = "", modified = true } = {}) {
  const doc = {
    _id: fields._id || "self",
    name: fields.name,
    slug: fields.slug,
    slugHistory: fields.slugHistory,
    $locals: { savedSlug: saved },
    errors: {},
    isModified: (path) => path === "slug" && modified,
    invalidate(path, message) {
      this.errors[path] = message;
    }
  };
  return doc;
}

function fakeModel(others) {
  const matches = (filter) =>
    others.filter((o) => {
      const [a, b] = filter.$or;
      return o._id !== filter._id.$ne && (o.slug === a.slug || (o.slugHistory || []).includes(b.slugHistory));
    });
  return {
    findOne: (filter) => ({ select: () => ({ lean: async () => matches(filter)[0] || null }) }),
    exists: async (filter) => (matches(filter).length ? { _id: "x" } : null)
  };
}

describe("assignProductSlug (Product model hook)", () => {
  it("gives a new product a link name from its name", async () => {
    const doc = fakeDoc({ name: "Amarakosha Flipbook" }, { modified: false });
    await assignProductSlug(doc, fakeModel([]));
    assert.equal(doc.slug, "amarakosha-flipbook");
  });

  it("adds a number when another product (or an old link) already has that name", async () => {
    const model = fakeModel([
      { _id: "a", slug: "amarakosha-flipbook" },
      { _id: "b", slug: "other", slugHistory: ["amarakosha-flipbook-2"] }
    ]);
    const doc = fakeDoc({ name: "Amarakosha Flipbook" }, { modified: false });
    await assignProductSlug(doc, model);
    assert.equal(doc.slug, "amarakosha-flipbook-3");
  });

  it("keeps the link name when the product is renamed", async () => {
    const doc = fakeDoc({ name: "New Name", slug: "old-name" }, { saved: "old-name", modified: false });
    await assignProductSlug(doc, fakeModel([]));
    assert.equal(doc.slug, "old-name");
  });

  it("an admin-chosen link name is cleaned and the old one kept for shared links", async () => {
    const doc = fakeDoc({ name: "Gita", slug: "  Bhagavad Gita Deluxe! " }, { saved: "gita" });
    await assignProductSlug(doc, fakeModel([]));
    assert.equal(doc.slug, "bhagavad-gita-deluxe");
    assert.deepEqual(doc.slugHistory, ["gita"]);
  });

  it("refuses a link name used by another product", async () => {
    const model = fakeModel([{ _id: "a", name: "Other Book", slug: "taken" }]);
    const doc = fakeDoc({ name: "Gita", slug: "taken" }, { saved: "gita" });
    await assignProductSlug(doc, model);
    assert.match(doc.errors.slug, /already used by "Other Book"/);
  });

  it("refuses a link name that is another product's old link", async () => {
    const model = fakeModel([{ _id: "a", name: "Other Book", slug: "other", slugHistory: ["was-this"] }]);
    const doc = fakeDoc({ name: "Gita", slug: "was-this" }, { saved: "gita" });
    await assignProductSlug(doc, model);
    assert.ok(doc.errors.slug);
  });

  it("switching back to an earlier link name moves it out of the history", async () => {
    const doc = fakeDoc({ name: "Gita", slug: "gita", slugHistory: ["gita"] }, { saved: "gita-deluxe" });
    await assignProductSlug(doc, fakeModel([]));
    assert.equal(doc.slug, "gita");
    assert.deepEqual(doc.slugHistory, ["gita-deluxe"]);
  });

  it("clearing the field keeps the current link name", async () => {
    const doc = fakeDoc({ name: "Gita", slug: "" }, { saved: "gita", modified: true });
    await assignProductSlug(doc, fakeModel([]));
    assert.equal(doc.slug, "gita");
  });
});

describe("planSlugBackfill", () => {
  const wp = [
    { id: 101, title: "A Bibliographic Compendium of Bharatiya Arthasastra Parampara", slug: "a-bibliographic-compendium-of-bharatiya-arthasastra-parampara" },
    { id: 102, title: "Sanskrit &amp; Vedic Maths &#8211; Book 2", slug: "sanskrit-vedic-maths-book-2" },
    { id: 103, title: "Book No Longer Sold", slug: "book-no-longer-sold" }
  ];

  it("gives old products their old WordPress link name and new ones a generated one", () => {
    const products = [
      { _id: "p1", name: "A Bibliographic Compendium of Bharatiya Arthasastra Parampara" },
      { _id: "p2", name: "Sanskrit & Vedic Maths – Book 2" },
      { _id: "p3", name: "Brand New Flipbook" }
    ];
    const plan = planSlugBackfill(products, wp);
    const byId = Object.fromEntries(plan.updates.map((u) => [u._id, u]));
    assert.equal(byId.p1.slug, "a-bibliographic-compendium-of-bharatiya-arthasastra-parampara");
    assert.equal(byId.p1.source, "wordpress");
    assert.equal(byId.p1.wpProductId, 101);
    assert.equal(byId.p2.slug, "sanskrit-vedic-maths-book-2");
    assert.equal(byId.p3.slug, "brand-new-flipbook");
    assert.equal(byId.p3.source, "generated");
    assert.deepEqual(plan.unmatchedWp.map((w) => w.id), [103]);
  });

  it("prefers the main product over a format copy with the same name", () => {
    const products = [
      { _id: "child", name: "A Bibliographic Compendium of Bharatiya Arthasastra Parampara", optionParent: "x" },
      { _id: "main", name: "A Bibliographic Compendium of Bharatiya Arthasastra Parampara" }
    ];
    const plan = planSlugBackfill(products, wp.slice(0, 1));
    const main = plan.updates.find((u) => u._id === "main");
    const child = plan.updates.find((u) => u._id === "child");
    assert.equal(main.source, "wordpress");
    assert.equal(child.slug, "a-bibliographic-compendium-of-bharatiya-arthasastra-parampara-2");
  });

  it("leaves products that already have a link name, but makes the old link open them", () => {
    const products = [
      { _id: "p1", name: "A Bibliographic Compendium of Bharatiya Arthasastra Parampara", slug: "compendium" },
      { _id: "p2", name: "Already Fine", slug: "already-fine" }
    ];
    const plan = planSlugBackfill(products, wp.slice(0, 1));
    assert.equal(plan.alreadySet, 2);
    assert.deepEqual(plan.updates, [
      {
        _id: "p1",
        name: "A Bibliographic Compendium of Bharatiya Arthasastra Parampara",
        slug: "compendium",
        oldSlug: "a-bibliographic-compendium-of-bharatiya-arthasastra-parampara",
        source: "wordpress-old-link",
        wpProductId: 101
      }
    ]);
  });

  it("never gives two products the same link name", () => {
    const products = [
      { _id: "a", name: "Gita" },
      { _id: "b", name: "Gita" },
      { _id: "c", name: "Other", slug: "gita-2" }
    ];
    const plan = planSlugBackfill(products, []);
    const slugs = plan.updates.map((u) => u.slug);
    assert.deepEqual(slugs, ["gita", "gita-3"]);
  });

  it("matches names ignoring case, extra spaces and HTML entities", () => {
    assert.equal(nameKey("Sanskrit &amp; Vedic  Maths &#8211; Book 2"), nameKey("sanskrit & vedic maths – book 2"));
  });
});

describe("productLink (frontend)", async () => {
  const { productPath, slugPreview } = await import("../../src/utils/productLink.js");

  it("uses the link name, falling back to the id", () => {
    assert.equal(productPath({ _id: "6650f1c2a1b2c3d4e5f60718", slug: "bhagavad-gita" }), "/product/bhagavad-gita");
    assert.equal(productPath({ _id: "6650f1c2a1b2c3d4e5f60718" }), "/product/6650f1c2a1b2c3d4e5f60718");
    assert.equal(productPath(null), "/collection");
    assert.equal(productPath({ slug: "संस्कृत" }), `/product/${encodeURIComponent("संस्कृत")}`);
  });

  it("previews the same link name the server makes", () => {
    for (const name of ["Bhagavad Gītā (Paperback)", "Sanskrit & Vedic Maths – Book 2", "Children's Book", "संस्कृत पुस्तक",
      "Shabdarupasangraha <br> Level 1 to 5<br>Book -Paperback", "Nāmarāmāyaṇam - नामरामायणम्", "Grammar &amp; Composition", "Starter’s Kit"]) {
      assert.equal(slugPreview(name), slugify(name));
    }
  });
});

describe("link names from real product names", () => {
  const cases = [
    ["Shabdarupasangraha <br> Level 1 to 5<br>Book -Paperback", "shabdarupasangraha-level-1-to-5-book-paperback"],
    ["Adi Shankaracharya Pendrive<br>Only for Indian Users</br>", "adi-shankaracharya-pendrive-only-for-indian-users"],
    ["A Comprehensive Guide to Basic Sanskrit Grammar &amp; Composition Part 2", "a-comprehensive-guide-to-basic-sanskrit-grammar-and-composition-part-2"],
    ["Nāmarāmāyaṇam - नामरामायणम्", "namaramayanam"],
    ["Saptahaa Stotra Sangrahah - (Saptāhastotra Saṅgrahaḥ) (Kannada - ಕನ್ನಡ)", "saptahaa-stotra-sangrahah-saptahastotra-sangrahah-kannada"],
    ["Starter’s Kit to Indian Culture", "starters-kit-to-indian-culture"],
    ["नामरामायणम्", "नामरामायणम्"]
  ];
  for (const [name, expected] of cases) {
    it(name, () => assert.equal(slugify(name), expected));
  }

  it("an old WordPress link name in another script is kept as it is", () => {
    assert.equal(normalizeSlug("namaramayanam-नामरामायणम्"), "namaramayanam-नामरामायणम्");
  });

  it("the live product gets the plain link name before a deleted copy", () => {
    const plan = planSlugBackfill([
      { _id: "old", name: "Krsnanandam Pendrive<br>Only for Indian Users</br>", isDeleted: true },
      { _id: "live", name: "Krsnanandam Pendrive Only for Indian Users" }
    ]);
    const byId = Object.fromEntries(plan.updates.map((u) => [u._id, u.slug]));
    assert.equal(byId.live, "krsnanandam-pendrive-only-for-indian-users");
    assert.equal(byId.old, "krsnanandam-pendrive-only-for-indian-users-2");
  });
});
