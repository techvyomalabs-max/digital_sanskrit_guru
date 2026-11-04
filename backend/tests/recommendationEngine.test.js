const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("AI Recommendation Engine (pure)", async () => {
  const {
    extractTopicTokens,
    buildUserProfile,
    getAIRecommendations,
    getRelatedProducts
  } = await import("../../src/utils/recommendationEngine.js");

  const mockCatalog = [
    {
      _id: "prod-1",
      name: "Dhaturupaparicayah (Dhāturūpaparicayaḥ)",
      category: "Web Version",
      rating: 5,
      relatedProducts: ["prod-2", "prod-3"]
    },
    {
      _id: "prod-2",
      name: "Astadhyayi - Learn Advanced Grammar in Sanskrit",
      category: "Web Version",
      rating: 4.8,
      relatedProducts: ["prod-1"]
    },
    {
      _id: "prod-3",
      name: "Learn Sanskrit Grammar Level 1",
      category: "Book - Paperback",
      rating: 4.5
    },
    {
      _id: "prod-4",
      name: "Bhagavad Gita Audio Chanting",
      category: "Audio Device",
      rating: 5,
      relatedProducts: ["prod-5"]
    },
    {
      _id: "prod-5",
      name: "Bhagavad Gita Study Book",
      category: "Book - Paperback",
      rating: 4.9
    },
    {
      _id: "prod-6",
      name: "Sanskrit Rhymes for Kids",
      category: "Web Version",
      rating: 4.2
    }
  ];

  describe("extractTopicTokens", () => {
    it("extracts meaningful lowercase tokens without stop words", () => {
      const tokens = extractTopicTokens("Learn Basic Sanskrit Grammar in Web Version");
      assert.ok(tokens.includes("learn"));
      assert.ok(tokens.includes("basic"));
      assert.ok(tokens.includes("sanskrit"));
      assert.ok(tokens.includes("grammar"));
      assert.ok(!tokens.includes("in"));
      assert.ok(!tokens.includes("web"));
      assert.ok(!tokens.includes("version"));
    });
  });

  describe("buildUserProfile", () => {
    it("weights viewed categories and topics with recency decay", () => {
      const profile = buildUserProfile({
        viewedProducts: [mockCatalog[0], mockCatalog[1]],
        searchQueries: ["grammar guide"]
      });

      assert.equal(profile.hasSignals, true);
      assert.ok(profile.categoryWeights["Web Version"] > 0);
      assert.ok(profile.topicWeights["grammar"] > 0);
      assert.ok(profile.relatedBonus["prod-2"] > 0);
    });
  });

  describe("getAIRecommendations", () => {
    it("returns cold-start recommendations when history is empty", () => {
      const recs = getAIRecommendations(mockCatalog, {}, { limit: 3 });
      assert.equal(recs.length, 3);
      assert.ok(recs[0]._recommendationReason);
    });

    it("recommends Grammar products to a user who viewed Dhaturupaparicayah", () => {
      const recs = getAIRecommendations(
        mockCatalog,
        { viewedProducts: [mockCatalog[0]] },
        { limit: 3 }
      );

      assert.ok(recs.length > 0);
      // Astadhyayi and Grammar Level 1 should rank at the top
      const topIds = recs.map((r) => r._id);
      assert.ok(topIds.includes("prod-2") || topIds.includes("prod-3"));

      const first = recs[0];
      assert.ok(first._aiScore > 0);
      assert.ok(first._recommendationReason);
    });

    it("recommends Gita products to a user who viewed Bhagavad Gita Audio", () => {
      const recs = getAIRecommendations(
        mockCatalog,
        { viewedProducts: [mockCatalog[3]] },
        { limit: 2 }
      );

      assert.ok(recs.length > 0);
      const topProduct = recs[0];
      assert.equal(topProduct._id, "prod-5"); // Bhagavad Gita Study Book
      assert.ok(topProduct._recommendationReason.includes("studied together") || topProduct._recommendationReason.includes("Gita"));
    });

    it("incorporates recent search queries into recommendations", () => {
      const recs = getAIRecommendations(
        mockCatalog,
        { searchQueries: ["gita study"] },
        { limit: 2 }
      );

      assert.ok(recs.length > 0);
      const matched = recs.find((r) => r.name.includes("Gita"));
      assert.ok(matched, "Expected Gita product to be recommended from search query");
    });
  });

  describe("getRelatedProducts", () => {
    // Names as they appear in the store
    const book = { _id: "n-book", name: "Sriman Narayaneeyam (Śrīmannārāyaṇīyam) – Moolam – Paperback", category: "Book - Paperback" };
    const audio = { _id: "n-audio", name: "Sriman Narayaneeyam Audio Device", category: "Audio Device" };
    const ebook = { _id: "n-ebook", name: "Narayaniyam eBook", category: "E-Book - Kindle" };
    const web = { _id: "n-web", name: "Narayaneeyam Companion: Web Version", category: "Web Version" };
    const bliss = { _id: "n-bliss", name: "Experience the Bliss of Bhakti and Vibhakti in Sriman Narayaneeyam – Paperback", category: "Book - Paperback" };
    const combo = {
      _id: "n-combo",
      name: "Complete Sriman Narayaneeyam Learning Kit",
      category: "Combo",
      bundleItems: [{ product: { _id: "n-audio" } }, { product: "n-web" }, { product: "lahari" }]
    };
    const lahari = { _id: "lahari", name: "Soundarya Lahari Moolam – Paperback", category: "Book - Paperback", relatedProducts: [{ _id: "n-book" }] };
    const srirama = { _id: "srirama", name: "SRIRAMA EXPERIENCE COMPANION IN WEB and APP", category: "Web Version" };
    const companion = { _id: "companion", name: "Personal Sanskrit Companion for Kids", category: "Web Version" };
    const gitaBook = { _id: "g-book", name: "Srimad Bhagavadgita (Śrīmadbhagavadgītā) – Paperback", category: "Book - Paperback" };
    const gitaAudio = { _id: "g-audio", name: "Srimad Bhagavadgita (Śrīmadbhagavadgītā) – Audio Device", category: "Audio Device" };
    const gitaFlip = { _id: "g-flip", name: "Bhagavad Gita (Bhagavadgītā) – Digital Flipbook", category: "Flipbook" };
    const timeless = { _id: "timeless", name: "Timeless Gita (Gītā) – Endless Bliss – Paperback", category: "Book - Paperback" };
    const sandhi = { _id: "sandhi", name: "Learn Sanskrit Sandhi – Web Version", category: "Web Version" };
    const sandhyavandana = { _id: "sandhya", name: "Thoughts on Sandhyavandana (Sandhyāvandana) – Paperback", category: "Book - Paperback" };
    const catalog = [
      book, audio, ebook, web, bliss, combo, lahari, srirama, companion,
      gitaBook, gitaAudio, gitaFlip, timeless, sandhi, sandhyavandana, ...mockCatalog
    ];
    const ids = (list) => list.map((p) => p._id);

    it("shows only products named after the same title, in every format", () => {
      assert.deepEqual(
        ids(getRelatedProducts(book, catalog)).sort(),
        ["n-audio", "n-bliss", "n-combo", "n-ebook", "n-web"]
      );
    });

    it("derives the keyword from each product's own name", () => {
      // "Experience" and "Bliss" come first but are shared with unrelated titles
      assert.deepEqual(ids(getRelatedProducts(bliss, catalog)).sort(), ["n-audio", "n-book", "n-combo", "n-ebook", "n-web"]);
      // "Companion" is shared with unrelated products, "Narayaneeyam" is the title
      assert.ok(!ids(getRelatedProducts(web, catalog)).some((id) => ["srirama", "companion"].includes(id)));
    });

    it("shows only Bhagavad Gita products for a Bhagavad Gita product, however it is spelt", () => {
      // prod-4 and prod-5 are "Bhagavad Gita Audio Chanting" and "Bhagavad Gita Study Book"
      assert.deepEqual(ids(getRelatedProducts(gitaFlip, catalog)).sort(), ["g-audio", "g-book", "prod-4", "prod-5"]);
      assert.deepEqual(ids(getRelatedProducts(gitaBook, catalog)).sort(), ["g-audio", "g-flip", "prod-4", "prod-5"]);
    });

    it("excludes products of the same category whose names do not match", () => {
      const related = ids(getRelatedProducts(book, catalog));
      ["lahari", "g-book", "timeless", "sandhya"].forEach((id) => assert.ok(!related.includes(id), id));
    });

    it("does not let admin links, reverse links or combos bypass the name rule", () => {
      const related = ids(getRelatedProducts({ ...book, relatedProducts: [{ _id: "prod-3" }, { _id: "n-web" }] }, catalog));
      assert.equal(related[0], "n-web", "matching admin pick is listed first");
      assert.ok(!related.includes("prod-3"), "non-matching admin pick");
      assert.ok(!related.includes("lahari"), "non-matching reverse link");
      assert.deepEqual(ids(getRelatedProducts(combo, catalog)).slice(0, 2), ["n-audio", "n-web"]);
      assert.ok(!ids(getRelatedProducts(combo, catalog)).includes("lahari"), "non-matching combo item");
    });

    it("returns nothing for a title no other product shares", () => {
      assert.deepEqual(getRelatedProducts(sandhi, catalog), []);
    });

    it("needs more than a short or English word in common (Shabda, Basic, Joy, Gita)", () => {
      const names = [
        "Sanskrit Vocabulary Builder – Samskrita Shabda Sampadvardhini (Saṃskṛta Śabdasampadvardhinī) – Paperback",
        "Sanskrit Vocabulary Builder – Part 1 – Web Version",
        "Shabdarupa Sangraha (Śabdarūpasaṅgrahaḥ) – Web Version",
        "Shabdarupa Sangraha (Śabdarūpasaṅgrahaḥ) – Kindle Edition",
        "Shabda Dhaturupa Parichaya (Śabdadhāturūpaparicayaḥ) – Study Material",
        "Learn Basic Sanskrit (Step by Step Approach)",
        "Learn  Basic Sanskrit (Step by Step Approach) – Web Version",
        "Learn Basic Sanskrit Grammar",
        "The Joy of Oneness – Paperback",
        "The Joy of Oneness – Paperback – Bulk Purchase",
        "The Puzzle of Work – Joy – Evolution – Paperback",
        "Timeless Gita (Gītā) – Endless Bliss – Paperback",
        "Timeless Gita (Gītā) – Endless Bliss – Volume 2 – Paperback",
        "Bhagavad Gita (Bhagavadgītā) – Digital Flipbook"
      ];
      const store = names.map((name, i) => ({ _id: `s${i}`, name }));
      const relatedTo = (i) => ids(getRelatedProducts(store[i], store)).sort();

      assert.deepEqual(relatedTo(0), ["s1"], "vocabulary builders only, no Shabdarupa or Shabda Dhaturupa");
      assert.deepEqual(relatedTo(2), ["s3"], "Shabdarupa only");
      assert.deepEqual(relatedTo(4), [], "nothing shares Shabda Dhaturupa");
      assert.deepEqual(relatedTo(5), ["s6"], "same Learn Basic course, not Basic Grammar");
      assert.deepEqual(relatedTo(7), [], "Basic alone is not enough");
      assert.deepEqual(relatedTo(8), ["s9"], "Joy of Oneness only, not Puzzle of Work");
      assert.deepEqual(relatedTo(11), ["s12"], "Timeless Gita only, not Bhagavad Gita");
    });

    it("never includes the product itself or duplicates", () => {
      const related = ids(getRelatedProducts({ ...book, relatedProducts: [{ _id: "n-book" }, "n-audio", { _id: "n-audio" }] }, catalog));
      assert.ok(!related.includes("n-book"));
      assert.equal(new Set(related).size, related.length);
    });

    it("returns an empty list when nothing is related", () => {
      assert.deepEqual(getRelatedProducts({ _id: "x", name: "Audio Device" }, catalog), []);
      assert.deepEqual(getRelatedProducts(null, catalog), []);
      assert.deepEqual(getRelatedProducts(book, undefined), []);
    });

    it("respects the limit", () => {
      assert.equal(getRelatedProducts(book, catalog, 2).length, 2);
    });
  });
});
