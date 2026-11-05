const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("10-Language Multilingual Search & Format Recognition (Official Team Translations)", async () => {
  const { searchWebsite, scoreProduct } = await import("../../src/utils/searchText.js");
  const { processIndicQuery, detectIndicScript } = await import("../../src/utils/indicSearch.js");

  const catalog = [
    {
      _id: "p-1",
      name: "Saptaha Stotra Sangraha Audio Device",
      category: "Audio Device",
      description: "Complete stotras audio device for weekly recitation."
    },
    {
      _id: "p-2",
      name: "Astadhyayi Audio Device",
      category: "Audio Device",
      description: "Paninian sutras chanting audio hardware."
    },
    {
      _id: "p-3",
      name: "Ramayana Ratnamala Audio Device",
      category: "Audio Device",
      description: "Valmiki Ramayana chanting device."
    },
    {
      _id: "p-4",
      name: "Sriman Narayaneeyam Audio Device",
      category: "Audio Device",
      description: "Complete Narayaneeyam chanting hardware."
    },
    {
      _id: "p-5",
      name: "SRIRAMA JAPAYANTRAM - Chanting Audio Device with 13 Powerful Mahamantra-s",
      category: "Audio Device",
      description: "13 powerful mahamantras chanting device."
    },
    {
      _id: "p-6",
      name: "Dhaturupaparicayah (Dhāturūpaparicayaḥ) paperback",
      category: "Book - Paperback",
      description: "Comprehensive introduction to Sanskrit verbal roots and conjugations."
    },
    {
      _id: "p-7",
      name: "Bhagavad Gita – Flipbook",
      category: "Flipbook",
      description: "Interactive digital flipbook of Bhagavad Gita."
    },
    {
      _id: "p-8",
      name: "Saptaha Stotra Sangrahah - (Saptāhastotra Saṅgrahaḥ) - (Kindle Edition) eBook",
      category: "E-Book - Kindle",
      description: "Kindle edition of weekly stotras."
    },
    {
      _id: "p-9",
      name: "SRIRAMA EXPERIENCE COMPANION IN PENDRIVE",
      category: "USB Stick",
      description: "Srirama discourses and chants in high-speed USB pendrive."
    },
    {
      _id: "p-10",
      name: "Tarkasangraha",
      category: "Web Version",
      description: "Nyaya and Vaisheshika treatise web version."
    },
    {
      _id: "p-11",
      name: "My Path - Kids - Chanting - Beginner",
      category: "Learning Path",
      description: "Curated beginner pathway for kids learning to chant."
    },
    {
      _id: "p-12",
      name: "Ramayana Ratnamala Audio Device - Festival Offer",
      category: "Festival Offer",
      description: "Special discounted festival offer on Ramayana device."
    },
    {
      _id: "p-13",
      name: "Dhaturupaparicayah – 2 (Dhāturūpaparicayaḥ – 2) Paperback - Bulk Purchase",
      category: "Festival Offer",
      description: "Bulk order edition of Dhaturupaparicayah 2."
    },
    {
      _id: "p-14",
      name: "संस्कारबीजानि संस्कृतगीतानि (Saṃskāra-Bījāni Saṃskṛta-Gītāni) - Sanskrit Rhymes for Little Minds",
      category: "Book - Paperback",
      description: "Sanskrit rhymes for young minds."
    }
  ];

  describe("1. Audio Device searches across 10 Indic languages", () => {
    const testCases = [
      { lang: "Hindi", query: "सप्ताहस्तोत्र संग्रहः ऑडियो डिवाइस" },
      { lang: "Sanskrit", query: "सप्ताहस्तोत्र संग्रहः श्रव्ययन्त्रम्" },
      { lang: "Tamil", query: "ஸப்தாஹஸ்தோத்ர ஸங்க்ரஹ: ஆடியோ சாதனம்" },
      { lang: "Telugu", query: "సప్తాహస్తోత్ర సంగ్రహః ఆడియో పరికరం" },
      { lang: "Kannada", query: "ಸಪ್ತಾಹಸ್ತೋತ್ರ ಸಂಗ್ರಹಃ ಆಡಿಯೋ ಸಾಧನ" },
      { lang: "Marathi", query: "सप्ताहस्तोत्र संग्रहः ऑडिओ डिव्हाइस" },
      { lang: "Malayalam", query: "സപ്താഹസ്തോത്ര സംഗ്രഹഃ ഓഡിയോ ഉപകരണം" },
      { lang: "Odia", query: "ସପ୍ତାହସ୍ତୋତ୍ର ସଂଗ୍ରହଃ ଅଡିଓ ଡିଭାଇସ୍" },
      { lang: "Bengali", query: "সপ্তাহস্তোত্র সংগ্রহঃ অডিও ডিভাইস" },
      { lang: "Gujarati", query: "સપ્તાહસ્તોત્ર સંગ્રહઃ ઑડિયો ડિવાઇસ" }
    ];

    for (const tc of testCases) {
      it(`accurately ranks Saptaha Stotra Sangraha Audio Device #1 in ${tc.lang}`, () => {
        const res = searchWebsite(tc.query, { catalogProducts: catalog });
        assert.ok(res.matchingProducts.length > 0, `Expected results for ${tc.lang}`);
        assert.equal(res.matchingProducts[0].name, "Saptaha Stotra Sangraha Audio Device");
        assert.ok(res.matchingProducts[0]._score >= 80);
      });
    }
  });

  describe("2. Srirama Japayantram search across 10 Indic languages", () => {
    const queries = [
      "श्रीराम जपयन्त्रम् – 13 शक्तिशाली महामंत्रों वाला जप ऑडियो डिवाइस",
      "श्रीराम जपयन्त्रम् – त्रयोदश-प्रभावशालि-महामन्त्रयुक्तं जपश्रव्ययन्त्रम्",
      "ஸ்ரீராம ஜபயந்த்ரம் – 13 சக்திவாய்ந்த மகாமந்திரங்களுடன் கூடிய ஜப ஆடியோ சாதனம்",
      "శ్రీరామ జపయంత్రం – 13 శక్తివంతమైన మహామంత్రాలతో జప ఆడియో పరికరం",
      "ಶ್ರೀರಾಮ ಜಪಯಂತ್ರಂ – 13 ಶಕ್ತಿಶಾಲಿ ಮಹಾಮಂತ್ರಗಳೊಂದಿಗೆ ಜಪ ಆಡಿಯೋ ಸಾಧನ",
      "श्रीराम जपयन्त्रम् – 13 प्रभावी महामंत्रांसह जप ऑडिओ डिव्हाइस",
      "ശ്രീരാമ ജപയന്ത്രം – 13 ശക്തമായ മഹാമന്ത്രങ്ങളോടു കൂടിയ ജപ ഓഡിയോ ഉപകരണം",
      "ଶ୍ରୀରାମ ଜପୟନ୍ତ୍ରମ୍ – 13ଟି ଶକ୍ତିଶାଳୀ ମହାମନ୍ତ୍ର ସହିତ ଜପ ଅଡିଓ ଡିଭାଇସ୍",
      "শ্রীরাম জপয়ন্ত্রম্ – 13টি শক্তিশালী মহামন্ত্রসহ জপ অডিও ডিভাইস",
      "શ્રીરામ જપયન્ત્રમ્ – 13 શક્તિશાળી મહામંત્રો સાથેનું જપ ઑડિયો ડિવાઇસ"
    ];

    for (const q of queries) {
      it(`finds SRIRAMA JAPAYANTRAM for query: "${q.slice(0, 30)}..."`, () => {
        const res = searchWebsite(q, { catalogProducts: catalog });
        assert.ok(res.matchingProducts.length > 0);
        assert.equal(res.matchingProducts[0].name, "SRIRAMA JAPAYANTRAM - Chanting Audio Device with 13 Powerful Mahamantra-s");
      });
    }
  });

  describe("3. Digital & Physical Formats Recognition", () => {
    it("recognizes Sanskrit Paperback: 'मृदुबन्धसंस्करणम्'", () => {
      const res = processIndicQuery("धातुरूपपरिचयः मृदुबन्धसंस्करणम्");
      assert.ok(res.canonicalQuery.includes("paperback") || res.isMultilingualMatch);
    });

    it("recognizes Tamil Kindle eBook: 'கிண்டில் பதிப்பு மின்னூல்'", () => {
      const res = processIndicQuery("கிண்டில் பதிப்பு மின்னூல்");
      assert.ok(res.canonicalQuery.includes("kindle") || res.canonicalQuery.includes("ebook"));
    });

    it("recognizes Kannada Flipbook: 'ಫ್ಲಿಪ್‌ಬುಕ್'", () => {
      const res = processIndicQuery("ಭಗವದ್ಗೀತಾ ಫ್ಲಿಪ್‌ಬುಕ್");
      assert.ok(res.canonicalQuery.includes("flipbook") || res.isMultilingualMatch);
    });

    it("recognizes Hindi Pendrive: 'पेनड्राइव में'", () => {
      const res = processIndicQuery("पेनड्राइव में श्रीराम अनुभव");
      assert.ok(res.canonicalQuery.includes("pendrive") || res.isMultilingualMatch);
    });

    it("recognizes Telugu Web Version: 'వెబ్ వెర్షన్'", () => {
      const res = processIndicQuery("తర్కసంగ్రహః వెబ్ వెర్షన్");
      assert.ok(res.canonicalQuery.includes("web version") || res.isMultilingualMatch);
    });

    it("recognizes Malayalam Bulk Purchase: 'മൊത്ത വാങ്ങൽ'", () => {
      const res = processIndicQuery("ധാതുരൂപപരിചയഃ മൊത്ത വാങ്ങൽ");
      assert.ok(res.canonicalQuery.includes("bulk purchase") || res.isMultilingualMatch);
    });

    it("recognizes Gujarati Festival Offer: 'તહેવાર ઑફર'", () => {
      const res = processIndicQuery("રામાયણ રત્નમાલા તહેવાર ઑફર");
      assert.ok(res.canonicalQuery.includes("festival offer") || res.isMultilingualMatch);
    });

    it("recognizes Odia My Path: 'ମୋ ପଥ – ପିଲା – ମନ୍ତ୍ରପାଠ'", () => {
      const res = processIndicQuery("ମୋ ପଥ ପିଲା ମନ୍ତ୍ରପାଠ");
      assert.ok(res.canonicalQuery.includes("my path") || res.isMultilingualMatch);
    });
  });

  describe("4. End-to-End Search on Native Indic Titled Products", () => {
    it("matches Sanskrit rhymes 'संस्कारबीजानि' in Tamil", () => {
      const q = "ஸம்ஸ்காரபீஜானி ஸம்ஸ்க்ருதகீதானி – சின்னஞ்சிறு மனங்களுக்கான சமஸ்கிருதப் பாடல்கள்";
      const res = searchWebsite(q, { catalogProducts: catalog });
      assert.ok(res.matchingProducts.length > 0);
      assert.equal(res.matchingProducts[0].name, "संस्कारबीजानि संस्कृतगीतानि (Saṃskāra-Bījāni Saṃskṛta-Gītāni) - Sanskrit Rhymes for Little Minds");
    });

    it("matches Sanskrit rhymes 'संस्कारबीजानि' in Kannada", () => {
      const q = "ಸಂಸ್ಕಾರಬೀಜಾನಿ ಸಂಸ್ಕೃತಗೀತಾನಿ – ಪುಟ್ಟ ಮನಸ್ಸುಗಳಿಗಾಗಿ ಸಂಸ್ಕೃತ ಶಿಶುಗೀತೆಗಳು";
      const res = searchWebsite(q, { catalogProducts: catalog });
      assert.ok(res.matchingProducts.length > 0);
      assert.equal(res.matchingProducts[0].name, "संस्कारबीजानि संस्कृतगीतानि (Saṃskāra-Bījāni Saṃskṛta-Gītāni) - Sanskrit Rhymes for Little Minds");
    });
  });
});
