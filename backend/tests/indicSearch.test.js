const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("indicSearch & multilingual search engine", async () => {
  const {
    detectIndicScript,
    transliterateIndicToLatin,
    processIndicQuery,
    scoreProduct,
    searchWebsite
  } = await import("../../src/utils/searchText.js");

  const sampleCatalog = [
    {
      _id: "prod-1",
      name: "Bhagavad Gita As It Is",
      category: "Book - Paperback",
      description: "Authentic Bhagavad Gita with Sanskrit verses, transliteration, and English translation."
    },
    {
      _id: "prod-2",
      name: "Learn Basic Sanskrit Grammar",
      category: "Grammar",
      description: "Easy step-by-step vyakarana guide covering dhatus, subanta, and tinganta."
    },
    {
      _id: "prod-3",
      name: "Astadhyayi of Panini",
      category: "Grammar",
      description: "Classical sutras of Panini grammar."
    },
    {
      _id: "prod-4",
      name: "Valmiki Ramayana Sundarakanda",
      category: "Book - Paperback",
      description: "Complete Sundarakanda chanting and text from Valmiki Ramayana."
    },
    {
      _id: "prod-5",
      name: "Sanskrit Grammar on Kindle",
      category: "E-Book - Kindle",
      description: "Kindle e-book edition for easy mobile reading."
    },
    {
      _id: "prod-6",
      name: "Vishnu Sahasranama Stotram",
      category: "Chanting",
      description: "1000 holy names of Lord Vishnu with notation."
    }
  ];

  describe("1. Script and Language Detection across 9 Indic Languages", () => {
    it("detects Kannada script correctly", () => {
      const res = detectIndicScript("ಭಗವದ್ಗೀತಾ");
      assert.equal(res.isIndic, true);
      assert.equal(res.language, "Kannada");
      assert.equal(res.script, "Kannada");
    });

    it("detects Hindi (Devanagari) script correctly", () => {
      const res = detectIndicScript("किताब");
      assert.equal(res.isIndic, true);
      assert.equal(res.language, "Hindi");
      assert.equal(res.script, "Devanagari");
    });

    it("detects Sanskrit (Devanagari) script correctly", () => {
      const res = detectIndicScript("संस्कृतम् अष्टाध्यायी");
      assert.equal(res.isIndic, true);
      assert.equal(res.language, "Sanskrit");
      assert.equal(res.script, "Devanagari");
    });

    it("detects Tamil script correctly", () => {
      const res = detectIndicScript("பகவத் கீதை");
      assert.equal(res.isIndic, true);
      assert.equal(res.language, "Tamil");
      assert.equal(res.script, "Tamil");
    });

    it("detects Marathi (Devanagari) script correctly", () => {
      const res = detectIndicScript("पुस्तके डिलिव्हरी");
      assert.equal(res.isIndic, true);
      assert.equal(res.language, "Marathi");
      assert.equal(res.script, "Devanagari");
    });

    it("detects Telugu script correctly", () => {
      const res = detectIndicScript("భగవద్గీత");
      assert.equal(res.isIndic, true);
      assert.equal(res.language, "Telugu");
      assert.equal(res.script, "Telugu");
    });

    it("detects Odia script correctly", () => {
      const res = detectIndicScript("ଭଗବଦ୍‌ଗୀତା");
      assert.equal(res.isIndic, true);
      assert.equal(res.language, "Odia");
      assert.equal(res.script, "Odia");
    });

    it("detects Gujarati script correctly", () => {
      const res = detectIndicScript("ભગવદ્ ગીતા");
      assert.equal(res.isIndic, true);
      assert.equal(res.language, "Gujarati");
      assert.equal(res.script, "Gujarati");
    });

    it("detects Bengali script correctly", () => {
      const res = detectIndicScript("ভগবদ্গীতা");
      assert.equal(res.isIndic, true);
      assert.equal(res.language, "Bengali");
      assert.equal(res.script, "Bengali");
    });

    it("returns isIndic: false for English Latin queries", () => {
      const res = detectIndicScript("bhagavad gita");
      assert.equal(res.isIndic, false);
      assert.equal(res.language, null);
    });
  });

  describe("2. Universal Brahmic Phonetic Transliteration", () => {
    it("transliterates Kannada compound words", () => {
      const latin = transliterateIndicToLatin("ಭಗವದ್ಗೀತಾ");
      assert.ok(latin.includes("bhagavad"), "Expected transliteration to contain bhagavad");
      assert.ok(latin.includes("gita"), "Expected transliteration to contain gita");
    });

    it("transliterates Devanagari Sanskrit words", () => {
      const latin = transliterateIndicToLatin("अष्टाध्यायी");
      assert.ok(latin.includes("ashta") && latin.includes("dhyayi"));
    });

    it("transliterates Telugu words", () => {
      const latin = transliterateIndicToLatin("భగవద్గీత");
      assert.ok(latin.includes("bhagavad") && latin.includes("gita"));
    });

    it("transliterates Bengali words", () => {
      const latin = transliterateIndicToLatin("ভগবদ্গীতা");
      assert.ok(latin.includes("bhagab") || latin.includes("bhagav"));
    });
  });

  describe("3. Multilingual Query Recognition & Concept Mapping", () => {
    it("recognizes Kannada book query 'ಪುಸ್ತಕ'", () => {
      const res = processIndicQuery("ಪುಸ್ತಕ");
      assert.equal(res.isIndic, true);
      assert.equal(res.language, "Kannada");
      assert.ok(res.canonicalQuery.includes("book") || res.canonicalQuery.includes("paperback"));
    });

    it("recognizes Tamil book query 'புத்தகம்'", () => {
      const res = processIndicQuery("புத்தகம்");
      assert.equal(res.isIndic, true);
      assert.equal(res.language, "Tamil");
      assert.ok(res.canonicalQuery.includes("book") || res.canonicalQuery.includes("paperback"));
    });

    it("recognizes Telugu grammar query 'వ్యాకరణం'", () => {
      const res = processIndicQuery("వ్యాకరణం");
      assert.equal(res.isIndic, true);
      assert.equal(res.language, "Telugu");
      assert.ok(res.canonicalQuery.includes("grammar"));
    });

    it("recognizes Bengali book query 'বই'", () => {
      const res = processIndicQuery("বই");
      assert.equal(res.isIndic, true);
      assert.equal(res.language, "Bengali");
      assert.ok(res.canonicalQuery.includes("book"));
    });

    it("recognizes Odia shipping query 'ବିତରଣ'", () => {
      const res = processIndicQuery("ବିତରଣ");
      assert.equal(res.isIndic, true);
      assert.equal(res.language, "Odia");
      assert.ok(res.canonicalQuery.includes("shipping") || res.canonicalQuery.includes("delivery"));
    });

    it("recognizes Marathi delivery query 'डिलिव्हरी'", () => {
      const res = processIndicQuery("डिलिव्हरी");
      assert.equal(res.isIndic, true);
      assert.equal(res.language, "Marathi");
      assert.ok(res.canonicalQuery.includes("delivery") || res.canonicalQuery.includes("shipping"));
    });
  });

  describe("4. End-to-End searchWebsite Multilingual AI Search", () => {
    it("searches in Kannada 'ಭಗವದ್ಗೀತಾ' and returns matching products and Gita category", () => {
      const result = searchWebsite("ಭಗವದ್ಗೀತಾ", { catalogProducts: sampleCatalog });
      assert.equal(result.isIndicSearch, true);
      assert.equal(result.detectedLanguage.name, "Kannada");
      assert.ok(result.matchingProducts.length > 0, "Expected at least 1 matching product");
      assert.equal(result.matchingProducts[0].name, "Bhagavad Gita As It Is");
      assert.ok(result.matchingCategories.some((c) => c.name === "Gita" || c.name.includes("Gita")));
    });

    it("searches in Hindi 'व्याकरण' and returns Sanskrit grammar products and Grammar category", () => {
      const result = searchWebsite("व्याकरण", { catalogProducts: sampleCatalog });
      assert.equal(result.isIndicSearch, true);
      assert.ok(result.matchingProducts.length >= 2, "Expected multiple grammar products");
      assert.ok(result.matchingCategories.some((c) => c.name === "Grammar"));
    });

    it("searches in Tamil 'பகவத் கீதை' and returns Bhagavad Gita", () => {
      const result = searchWebsite("பகவத் கீதை", { catalogProducts: sampleCatalog });
      assert.equal(result.isIndicSearch, true);
      assert.equal(result.detectedLanguage.name, "Tamil");
      assert.ok(result.matchingProducts.some((p) => p.name.includes("Bhagavad Gita")));
    });

    it("searches in Telugu 'కిండిల్' and returns Kindle category and products", () => {
      const result = searchWebsite("కిండిల్", { catalogProducts: sampleCatalog });
      assert.equal(result.isIndicSearch, true);
      assert.equal(result.detectedLanguage.name, "Telugu");
      assert.ok(result.matchingCategories.some((c) => c.name.includes("Kindle")));
    });

    it("searches in Kannada 'ಗ್ರಂಥಾಲಯ' and matches My Digital Library page", () => {
      const result = searchWebsite("ಗ್ರಂಥಾಲಯ", { catalogProducts: sampleCatalog });
      assert.equal(result.isIndicSearch, true);
      assert.ok(result.matchingPages.some((p) => p.id === "my-library"));
    });

    it("searches in Gujarati 'સંપર્ક' and matches Contact Us page", () => {
      const result = searchWebsite("સંપર્ક", { catalogProducts: sampleCatalog });
      assert.equal(result.isIndicSearch, true);
      assert.ok(result.matchingPages.some((p) => p.id === "contact"));
    });

    it("direct scoreProduct works with Kannada query 'ಭಗವದ್ಗೀತಾ'", () => {
      const score = scoreProduct(sampleCatalog[0], "ಭಗವದ್ಗೀತಾ");
      assert.ok(score >= 60, `Expected score >= 60, got ${score}`);
    });
  });

  describe("5. Kannada & Indic Sanskrit Book Title Targeting", () => {
    const bookCatalog = [
      {
        _id: "b-1",
        name: "Dhaturupaparicayah (Dhāturūpaparicayaḥ)",
        category: "Web Version",
        description: "Comprehensive introduction to Sanskrit verbal roots and conjugations."
      },
      {
        _id: "b-2",
        name: "Śabdarūpasaṅgrahaḥ - (Sabdarupa Sangrahah)",
        category: "Web Version",
        description: "Compilation of Sanskrit noun declensions."
      },
      {
        _id: "b-3",
        name: "Yoga Sutra Paricayah - (Yogasūtraparicayaḥ)",
        category: "Web Version",
        description: "Patanjali yoga sutras with lucid commentary."
      },
      {
        _id: "b-4",
        name: "Saptaha Stotra Sangrahah - (Saptāhastotra Saṅgrahaḥ) Paperback",
        category: "Book - Paperback",
        description: "Weekly Sanskrit stotras for daily spiritual chanting."
      },
      {
        _id: "b-5",
        name: "Ramayana Ratnamala - (Rāmāyaṇaratnamālā)",
        category: "Web Version",
        description: "Gems of Valmiki Ramayana shlokas."
      },
      {
        _id: "b-6",
        name: "Astadhyayi - Learn Advanced Grammar in Sanskrit (Aṣṭādhyāyī)",
        category: "Web Version",
        description: "Advanced Paninian sutras and vyakarana analysis."
      }
    ];

    it("matches Kannada 'ಧಾತುರೂಪ ಪರಿಚಯ' to Dhaturupaparicayah with score >= 80", () => {
      const res = searchWebsite("ಧಾತುರೂಪ ಪರಿಚಯ", { catalogProducts: bookCatalog });
      assert.ok(res.matchingProducts.length > 0);
      assert.equal(res.matchingProducts[0].name, "Dhaturupaparicayah (Dhāturūpaparicayaḥ)");
      assert.ok(res.matchingProducts[0]._score >= 80);
    });

    it("matches Kannada compound 'ಧಾತುರೂಪಪರಿಚಯಃ' to Dhaturupaparicayah", () => {
      const res = searchWebsite("ಧಾತುರೂಪಪರಿಚಯಃ", { catalogProducts: bookCatalog });
      assert.ok(res.matchingProducts.length > 0);
      assert.equal(res.matchingProducts[0].name, "Dhaturupaparicayah (Dhāturūpaparicayaḥ)");
      assert.ok(res.matchingProducts[0]._score >= 80);
    });

    it("matches Kannada 'ಯೋಗ ಸೂತ್ರ' and 'ಯೋಗಸೂತ್ರ' to Yoga Sutra Paricayah without vowel distortion", () => {
      const res1 = searchWebsite("ಯೋಗ ಸೂತ್ರ", { catalogProducts: bookCatalog });
      assert.ok(res1.matchingProducts.length > 0);
      assert.equal(res1.matchingProducts[0].name, "Yoga Sutra Paricayah - (Yogasūtraparicayaḥ)");
      assert.ok(res1.matchingProducts[0]._score >= 80);

      const res2 = searchWebsite("ಯೋಗಸೂತ್ರ", { catalogProducts: bookCatalog });
      assert.ok(res2.matchingProducts.length > 0);
      assert.equal(res2.matchingProducts[0].name, "Yoga Sutra Paricayah - (Yogasūtraparicayaḥ)");
      assert.ok(res2.matchingProducts[0]._score >= 80);
    });

    it("matches Kannada 'ಸಪ್ತಾಹ ಸ್ತೋತ್ರ ಸಂಗ್ರಹ' to Saptaha Stotra Sangrahah without injecting extra words", () => {
      const res = searchWebsite("ಸಪ್ತಾಹ ಸ್ತೋತ್ರ ಸಂಗ್ರಹ", { catalogProducts: bookCatalog });
      assert.ok(res.matchingProducts.length > 0);
      assert.equal(res.matchingProducts[0].name, "Saptaha Stotra Sangrahah - (Saptāhastotra Saṅgrahaḥ) Paperback");
      assert.ok(res.matchingProducts[0]._score >= 80);
    });

    it("matches Kannada 'ಶಬ್ದರೂಪ ಸಂಗ್ರಹ' to Śabdarūpasaṅgrahaḥ", () => {
      const res = searchWebsite("ಶಬ್ದರೂಪ ಸಂಗ್ರಹ", { catalogProducts: bookCatalog });
      assert.ok(res.matchingProducts.length > 0);
      assert.equal(res.matchingProducts[0].name, "Śabdarūpasaṅgrahaḥ - (Sabdarupa Sangrahah)");
      assert.ok(res.matchingProducts[0]._score >= 80);
    });

    it("matches Kannada 'ರಾಮಾಯಣ ರತ್ನಮಾಲಾ' to Ramayana Ratnamala", () => {
      const res = searchWebsite("ರಾಮಾಯಣ ರತ್ನಮಾಲಾ", { catalogProducts: bookCatalog });
      assert.ok(res.matchingProducts.length > 0);
      assert.equal(res.matchingProducts[0].name, "Ramayana Ratnamala - (Rāmāyaṇaratnamālā)");
      assert.ok(res.matchingProducts[0]._score >= 80);
    });

    it("matches Kannada 'ಅಷ್ಟಾಧ್ಯಾಯಿ' to Astadhyayi with high relevance (>= 80)", () => {
      const res = searchWebsite("ಅಷ್ಟಾಧ್ಯಾಯಿ", { catalogProducts: bookCatalog });
      assert.ok(res.matchingProducts.length > 0);
      assert.equal(res.matchingProducts[0].name, "Astadhyayi - Learn Advanced Grammar in Sanskrit (Aṣṭādhyāyī)");
      assert.ok(res.matchingProducts[0]._score >= 80);
    });
  });
});
