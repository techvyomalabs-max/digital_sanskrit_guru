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
});
