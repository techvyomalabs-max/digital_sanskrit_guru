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
    const book = { _id: "n-book", name: "Sriman Narayaneeyam Book", category: "Book - Paperback" };
    const audio = { _id: "n-audio", name: "Sriman Narayaneeyam Audio Device", category: "Audio Device" };
    const ebook = { _id: "n-ebook", name: "Narayaniyam eBook", category: "E-Book - Kindle" };
    const web = { _id: "n-web", name: "Narayaneeyam Companion: Web Version", category: "Web Version" };
    const combo = {
      _id: "n-combo",
      name: "Complete Collection",
      category: "Combo",
      bundleItems: [{ product: { _id: "n-book" } }, { product: "n-audio" }]
    };
    const gitaCard = { _id: "gita-card", name: "Gita Flash Cards", category: "General", relatedProducts: [{ _id: "n-book" }] };
    const catalog = [book, audio, ebook, web, combo, gitaCard, ...mockCatalog];
    const ids = (list) => list.map((p) => p._id);

    it("finds the other formats of the same title", () => {
      const related = ids(getRelatedProducts(book, catalog));
      ["n-audio", "n-ebook", "n-web"].forEach((id) => assert.ok(related.includes(id), id));
      assert.ok(!related.includes("prod-5"), "unrelated Gita book should not match");
    });

    it("puts admin links, reverse links and combos before name matches", () => {
      const related = ids(getRelatedProducts({ ...book, relatedProducts: [{ _id: "prod-3" }] }, catalog));
      assert.deepEqual(related.slice(0, 3), ["prod-3", "gita-card", "n-combo"]);
    });

    it("lists a combo's items on the combo page", () => {
      const related = ids(getRelatedProducts(combo, catalog));
      assert.deepEqual(related.slice(0, 2), ["n-book", "n-audio"]);
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
