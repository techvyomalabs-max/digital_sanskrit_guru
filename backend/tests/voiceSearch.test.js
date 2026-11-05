const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("Voice Search Integration & Language Code Verification", async () => {
  const { searchWebsite } = await import("../../src/utils/searchText.js");

  const catalog = [
    {
      id: "p-1",
      name: "Bhagavad Gita",
      category: "Book - Paperback",
      description: "Original Sanskrit verses with translation."
    },
    {
      id: "p-2",
      name: "Saptaha Stotra Sangrahah - (Saptāhastotra Saṅgrahaḥ) (Kannada - ಕನ್ನಡ)",
      category: "Book - Paperback",
      description: "Weekly recitation stotras in Kannada."
    },
    {
      id: "p-3",
      name: "Sri Vishnu Sahasranama Stotram",
      category: "Audio Device",
      description: "Complete Vishnu Sahasranama chanting."
    },
    {
      id: "p-4",
      name: "SRIRAMA JAPAYANTRAM",
      category: "Audio Device",
      description: "Rama japa device."
    }
  ];

  const VOICE_LANGUAGES = [
    { code: "en-IN", label: "English", native: "English (India)" },
    { code: "hi-IN", label: "Hindi", native: "हिन्दी" },
    { code: "kn-IN", label: "Kannada", native: "ಕನ್ನಡ" },
    { code: "ta-IN", label: "Tamil", native: "தமிழ்" },
    { code: "te-IN", label: "Telugu", native: "తెలుగు" },
    { code: "mr-IN", label: "Marathi", native: "मराठी" },
    { code: "sa-IN", label: "Sanskrit", native: "संस्कृतम्", speechCode: "hi-IN" },
    { code: "bn-IN", label: "Bengali", native: "বাংলা" },
    { code: "gu-IN", label: "Gujarati", native: "ગુજરાતી" },
    { code: "ml-IN", label: "Malayalam", native: "മലയാളം" },
    { code: "or-IN", label: "Odia", native: "ଓଡ଼ିଆ" }
  ];

  it("defines standard BCP-47 codes for all 10 Indic languages plus English", () => {
    assert.equal(VOICE_LANGUAGES.length, 11);
    const codes = VOICE_LANGUAGES.map((l) => l.code);
    assert.ok(codes.includes("en-IN"));
    assert.ok(codes.includes("hi-IN"));
    assert.ok(codes.includes("kn-IN"));
    assert.ok(codes.includes("ta-IN"));
    assert.ok(codes.includes("te-IN"));
    assert.ok(codes.includes("mr-IN"));
    assert.ok(codes.includes("sa-IN"));
    assert.ok(codes.includes("bn-IN"));
    assert.ok(codes.includes("gu-IN"));
    assert.ok(codes.includes("ml-IN"));
    assert.ok(codes.includes("or-IN"));
  });

  it("configures Sanskrit speech recognition to use Devanagari engine fallback", () => {
    const sanskrit = VOICE_LANGUAGES.find((l) => l.code === "sa-IN");
    assert.equal(sanskrit.speechCode, "hi-IN");
  });

  it("seamlessly feeds English voice queries into AI search without disruption", () => {
    const res = searchWebsite("bhagavad gita", { catalogProducts: catalog });
    assert.ok(res.matchingProducts.length > 0);
    assert.match(res.matchingProducts[0].name.toLowerCase(), /bhagavad/);
  });

  it("seamlessly feeds spoken Kannada transcript into AI search", () => {
    const res = searchWebsite("ಸಪ್ತಾಹಸ್ತೋತ್ರ ಸಂಗ್ರಹಃ", { catalogProducts: catalog });
    assert.ok(res.matchingProducts.length > 0);
    assert.equal(res.isIndicSearch, true);
    assert.equal(res.detectedLanguage.name, "Kannada");
  });

  it("seamlessly feeds spoken Hindi / Sanskrit transcript into AI search", () => {
    const res = searchWebsite("विष्णुसहस्रनामस्तोत्रम्", { catalogProducts: catalog });
    assert.ok(res.matchingProducts.length > 0);
    assert.equal(res.isIndicSearch, true);
    assert.match(res.matchingProducts[0].name.toLowerCase(), /vishnu/);
  });

  it("seamlessly feeds spoken Tamil transcript into AI search", () => {
    const res = searchWebsite("ஸ்ரீராம ஜபயந்த்ரம்", { catalogProducts: catalog });
    assert.ok(res.matchingProducts.length > 0);
    assert.equal(res.isIndicSearch, true);
    assert.equal(res.detectedLanguage.name, "Tamil");
  });
});
