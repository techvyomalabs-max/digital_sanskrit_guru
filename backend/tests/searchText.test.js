const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("searchText utility (pure)", async () => {
  const { stripHtml, foldText, scoreProduct } = await import("../../src/utils/searchText.js");

  describe("foldText", () => {
    it("handles Sanskrit diacritics and casing correctly", () => {
      assert.equal(foldText("Gītā"), "gita");
      assert.equal(foldText("Aṣṭādhyāyī"), "astadhyayi");
      assert.equal(foldText("Dhāturūpa"), "dhaturupa");
    });

    it("collapses whitespace and strips HTML tags", () => {
      assert.equal(foldText("  <p>Bhagavad &nbsp; <strong>Gītā</strong></p>  "), "bhagavad gita");
    });
  });

  describe("stripHtml", () => {
    it("removes HTML tags and entity references", () => {
      const stripped = stripHtml("<div class=\"intro\">Hello &amp; <span>World</span>!</div>");
      assert.equal(stripped.replace(/\s+/g, " ").trim(), "Hello & World!");
    });

    it("handles null or undefined input safely", () => {
      assert.equal(stripHtml(null), "");
      assert.equal(stripHtml(undefined), "");
      assert.equal(stripHtml(""), "");
    });
  });

  describe("HTML tags are not matched as search terms", () => {
    it("'strong' does not match a product whose only 'strong' is an HTML tag", () => {
      const product = {
        name: "Sanskrit Primer",
        category: "Books",
        description: "<p><strong>Learn Sanskrit basics easily</strong></p>"
      };
      const score = scoreProduct(product, "strong");
      assert.equal(score, 0);
    });
  });

  describe("multi-word AND matching", () => {
    it("'learn sanskrit grammar' matches 'Learn Basic Sanskrit Grammar'", () => {
      const product = {
        name: "Learn Basic Sanskrit Grammar",
        category: "Grammar",
        description: "A comprehensive course"
      };
      const score = scoreProduct(product, "learn sanskrit grammar");
      assert.ok(score > 0, "Expected match score to be greater than 0");
    });

    it("fails when one of the query words is missing entirely", () => {
      const product = {
        name: "Learn Basic Sanskrit Grammar",
        category: "Grammar",
        description: "A comprehensive course"
      };
      const score = scoreProduct(product, "learn sanskrit astronomy");
      assert.equal(score, 0);
    });
  });

  describe("ranking order", () => {
    it("ranks exact name > starts with > contains > words in name > description only", () => {
      const exactProduct = { name: "Gita Lessons", category: "Scriptures", description: "Sacred text" };
      const startsWithProduct = { name: "Gita Lessons Online", category: "Scriptures", description: "Sacred commentary" };
      const containsProduct = { name: "Advanced Gita Lessons Online", category: "Scriptures", description: "Holy book" };
      const wordsInNameProduct = { name: "Lessons from the Sacred Gita", category: "Web Version", description: "Online study" };
      const descOnlyProduct = { name: "Sacred Chants", category: "Audio", description: "Complete audio lessons on Gita" };

      const query = "gita lessons";
      const exactScore = scoreProduct(exactProduct, query);
      const startsWithScore = scoreProduct(startsWithProduct, query);
      const containsScore = scoreProduct(containsProduct, query);
      const wordsInNameScore = scoreProduct(wordsInNameProduct, query);
      const descOnlyScore = scoreProduct(descOnlyProduct, query);

      assert.equal(exactScore, 100);
      assert.equal(startsWithScore, 80);
      assert.equal(containsScore, 60);
      assert.equal(wordsInNameScore, 50);
      assert.equal(descOnlyScore, 10);

      assert.ok(exactScore > startsWithScore, "exact name > starts with");
      assert.ok(startsWithScore > containsScore, "starts with > contains");
      assert.ok(containsScore > wordsInNameScore, "contains > words in name");
      assert.ok(wordsInNameScore > descOnlyScore, "words in name > description only");
      assert.ok(descOnlyScore > 0, "description only > 0");
    });
  });

  describe("compacted name fallback (ignoring spaces)", () => {
    it("finds 'Bhagavad Gītā' for 'bhagavadgita' with score 35", () => {
      const product = {
        name: "Bhagavad Gītā",
        category: "Scriptures",
        description: "Ancient sacred text"
      };
      const score = scoreProduct(product, "bhagavadgita");
      assert.equal(score, 35);
    });

    it("unrelated word still scores 0", () => {
      const product = {
        name: "Bhagavad Gītā",
        category: "Scriptures",
        description: "Ancient sacred text"
      };
      const score = scoreProduct(product, "astronomy");
      assert.equal(score, 0);
    });
  });

  describe("empty query", () => {
    it("returns 1 for every product on empty or whitespace query", () => {
      const product = { name: "Sanskrit Book", description: "Some text" };
      assert.equal(scoreProduct(product, ""), 1);
      assert.equal(scoreProduct(product, "   "), 1);
      assert.equal(scoreProduct(product, null), 1);
      assert.equal(scoreProduct(product, undefined), 1);
    });
  });

  describe("missing fields tolerance", () => {
    it("products with missing fields do not throw", () => {
      assert.doesNotThrow(() => scoreProduct({}, "gita"));
      assert.doesNotThrow(() => scoreProduct({ name: null, description: undefined }, "gita"));
      assert.doesNotThrow(() => scoreProduct(null, "gita"));
      assert.doesNotThrow(() => scoreProduct(undefined, "gita"));
      assert.doesNotThrow(() => scoreProduct(null, ""));
      assert.doesNotThrow(() => scoreProduct(undefined, ""));

      assert.equal(scoreProduct({}, "gita"), 0);
      assert.equal(scoreProduct(null, "gita"), 0);
      assert.equal(scoreProduct(null, ""), 1);
    });
  });

  describe("typo tolerance & spelling mistakes", () => {
    it("'sansrit' matches 'Sanskrit Primer'", () => {
      const product = { name: "Sanskrit Primer", category: "Books", description: "Learn Sanskrit" };
      const score = scoreProduct(product, "sansrit");
      assert.ok(score > 0, "Expected typo 'sansrit' to match 'Sanskrit Primer'");
    });

    it("'snskrit' matches 'Learn Basic Sanskrit'", () => {
      const product = { name: "Learn Basic Sanskrit", category: "Language", description: "Basics" };
      const score = scoreProduct(product, "snskrit");
      assert.ok(score > 0, "Expected typo 'snskrit' to match");
    });

    it("'grammer' matches 'Sanskrit Grammar Guide'", () => {
      const product = { name: "Sanskrit Grammar Guide", category: "Grammar", description: "Guide" };
      const score = scoreProduct(product, "grammer");
      assert.ok(score > 0, "Expected misspelling 'grammer' to match");
    });

    it("'bagvad' matches 'Bhagavad Gita'", () => {
      const product = { name: "Bhagavad Gita", category: "Scriptures", description: "Sacred" };
      const score = scoreProduct(product, "bagvad");
      assert.ok(score > 0, "Expected typo 'bagvad' to match");
    });

    it("exact match ranks higher than typo match", () => {
      const exactProduct = { name: "Sanskrit Primer", category: "Books" };
      const typoProduct = { name: "Sanskrit Grammar", category: "Books" };

      const exactScore = scoreProduct(exactProduct, "sanskrit primer");
      const typoScore = scoreProduct(typoProduct, "sansrit primer");

      assert.ok(exactScore > typoScore, `Expected exact score (${exactScore}) > typo score (${typoScore})`);
    });
  });

  describe("Sanskrit transliteration equivalence", () => {
    it("'geeta' matches 'Bhagavad Gita'", () => {
      const product = { name: "Bhagavad Gita", category: "Scriptures", description: "Sacred text" };
      const score = scoreProduct(product, "geeta");
      assert.ok(score > 0, "Expected 'geeta' to match 'Gita'");
    });

    it("'bhagwad' matches 'Bhagavad Gita'", () => {
      const product = { name: "Bhagavad Gita", category: "Scriptures", description: "Sacred text" };
      const score = scoreProduct(product, "bhagwad");
      assert.ok(score > 0, "Expected 'bhagwad' to match 'Bhagavad'");
    });

    it("'ashtadhyayi' matches 'Astadhyayi'", () => {
      const product = { name: "Astadhyayi Sutras", category: "Grammar", description: "Panini" };
      const score = scoreProduct(product, "ashtadhyayi");
      assert.ok(score > 0, "Expected 'ashtadhyayi' to match 'Astadhyayi'");
    });
  });

  describe("intelligent search suggestions (Did you mean?)", () => {
    it("suggests 'sanskrit grammar' for 'sansrit grammer'", async () => {
      const { getSearchSuggestion } = await import("../../src/utils/searchText.js");
      const products = [
        { name: "Sanskrit Grammar Essentials", category: "Grammar" },
        { name: "Bhagavad Gita", category: "Scriptures" }
      ];
      const suggestion = getSearchSuggestion("sansrit grammer", products);
      assert.equal(suggestion, "sanskrit grammar");
    });

    it("returns null if query has no typos", async () => {
      const { getSearchSuggestion } = await import("../../src/utils/searchText.js");
      const products = [
        { name: "Sanskrit Grammar Essentials", category: "Grammar" }
      ];
      const suggestion = getSearchSuggestion("sanskrit grammar", products);
      assert.equal(suggestion, null);
    });
  });

  describe("Category & Format Search", () => {
    it("matches 'kindle' to 'E-Book - Kindle' category with product count", async () => {
      const { searchCategories } = await import("../../src/utils/searchText.js");
      const products = [
        { name: "Gita", category: "E-Book - Kindle" },
        { name: "Ramayana", category: "E-Book - Kindle" },
        { name: "Sanskrit Grammar", category: "Book - Paperback" }
      ];
      const matched = searchCategories("kindle", products);
      assert.ok(matched.length > 0);
      assert.equal(matched[0].name, "E-Book - Kindle");
      assert.equal(matched[0].count, 2);
    });

    it("matches 'paperback' to 'Book - Paperback' category", async () => {
      const { searchCategories } = await import("../../src/utils/searchText.js");
      const products = [
        { name: "Sanskrit Grammar", category: "Book - Paperback" }
      ];
      const matched = searchCategories("paperback", products);
      assert.ok(matched.length > 0);
      assert.equal(matched[0].name, "Book - Paperback");
    });
  });

  describe("Website Pages & Informational Content Search", () => {
    it("matches 'shipping' to Shipping & Delivery Policy page", async () => {
      const { searchPages } = await import("../../src/utils/searchText.js");
      const matched = searchPages("shipping");
      assert.ok(matched.length > 0);
      assert.equal(matched[0].id, "shipping-policy");
      assert.equal(matched[0].url, "/shipping-policy");
    });

    it("matches 'library' or 'download' to My Digital Library page", async () => {
      const { searchPages } = await import("../../src/utils/searchText.js");
      const matchedLib = searchPages("library");
      assert.ok(matchedLib.length > 0);
      assert.equal(matchedLib[0].id, "my-library");

      const matchedDl = searchPages("download");
      assert.ok(matchedDl.length > 0);
      assert.equal(matchedDl[0].id, "my-library");
    });

    it("matches 'contact' or 'whatsapp' to Contact Us page", async () => {
      const { searchPages } = await import("../../src/utils/searchText.js");
      const matched = searchPages("whatsapp");
      assert.ok(matched.length > 0);
      assert.equal(matched[0].id, "contact");
    });
  });

  describe("Aggressive AI Auto-Correction", () => {
    it("corrects severe slang/typos: 'kndl' -> 'kindle', 'paprback' -> 'paperback', 'bgvad' -> 'bhagavad'", async () => {
      const { autoCorrectQuery } = await import("../../src/utils/searchText.js");
      const products = [
        { name: "Bhagavad Gita", category: "E-Book - Kindle" },
        { name: "Sanskrit Primer", category: "Book - Paperback" }
      ];
      assert.equal(autoCorrectQuery("kndl", products).correctedQuery, "kindle");
      assert.equal(autoCorrectQuery("paprback", products).correctedQuery, "paperback");
      assert.equal(autoCorrectQuery("bgvad", products).correctedQuery, "bhagavad");
      assert.equal(autoCorrectQuery("shippng", products).correctedQuery, "shipping");
    });
  });

  describe("Unified searchWebsite Pipeline", () => {
    it("returns categories, pages, products, and auto-correction in one call", async () => {
      const { searchWebsite } = await import("../../src/utils/searchText.js");
      const products = [
        { _id: "1", name: "Bhagavad Gita (Paperback)", category: "Book - Paperback", price: 350 },
        { _id: "2", name: "Bhagavad Gita (Kindle Edition)", category: "E-Book - Kindle", price: 150 }
      ];

      // Typing typo 'bgvad' should seamlessly auto-correct to 'bhagavad' and find products + category
      const res = searchWebsite("bgvad", { catalogProducts: products });
      assert.equal(res.isAutoCorrected, true);
      assert.equal(res.effectiveQuery, "bhagavad");
      assert.ok(res.matchingProducts.length >= 2);
    });
  });
});

