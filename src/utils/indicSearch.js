/**
 * Universal Indic Multilingual Search & Transliteration Engine
 * 
 * Supports instant, client-side offline recognition for:
 * 1. Kannada (ಕನ್ನಡ)
 * 2. Hindi (हिन्दी)
 * 3. Sanskrit (संस्कृतम् / देवनागरी)
 * 4. Tamil (தமிழ்)
 * 5. Marathi (मराठी)
 * 6. Telugu (తెలుగు)
 * 7. Odia (ଓଡ଼ିଆ)
 * 8. Gujarati (ગુજરાતી)
 * 9. Bengali (বাংলা)
 * + Malayalam (മലയാളം) & Gurmukhi (ਪੰਜਾਬੀ)
 * 
 * Capabilities:
 * - High-speed Unicode script & language detection
 * - Universal Brahmic-to-Latin phonetic transliteration
 * - Morphological normalization (anusvara, visarga, case endings)
 * - Comprehensive multilingual lexicon of Sanskrit learning resources,
 *   formats, categories, and website services.
 */

// Unicode ranges for Indian Brahmic scripts
export const SCRIPT_CONFIGS = [
  { script: "Devanagari", defaultLang: "Hindi / Sanskrit", base: 0x0900, min: 0x0900, max: 0x097f, nativeName: "देवनागरी" },
  { script: "Bengali", defaultLang: "Bengali", base: 0x0980, min: 0x0980, max: 0x09ff, nativeName: "বাংলা" },
  { script: "Gurmukhi", defaultLang: "Punjabi", base: 0x0a00, min: 0x0a00, max: 0x0a7f, nativeName: "ਪੰਜਾਬੀ" },
  { script: "Gujarati", defaultLang: "Gujarati", base: 0x0a80, min: 0x0a80, max: 0x0aff, nativeName: "ગુજરાતી" },
  { script: "Odia", defaultLang: "Odia", base: 0x0b00, min: 0x0b00, max: 0x0b7f, nativeName: "ଓଡ଼ିଆ" },
  { script: "Tamil", defaultLang: "Tamil", base: 0x0b80, min: 0x0b80, max: 0x0bff, nativeName: "தமிழ்" },
  { script: "Telugu", defaultLang: "Telugu", base: 0x0c00, min: 0x0c00, max: 0x0c7f, nativeName: "తెలుగు" },
  { script: "Kannada", defaultLang: "Kannada", base: 0x0c80, min: 0x0c80, max: 0x0cff, nativeName: "ಕನ್ನಡ" },
  { script: "Malayalam", defaultLang: "Malayalam", base: 0x0d00, min: 0x0d00, max: 0x0d7f, nativeName: "മലയാളം" }
];

// Unified Brahmic phonetic mapping based on offset from script base
const BRAHMIC_VOWELS = {
  0x05: "a",
  0x06: "a",
  0x07: "i",
  0x08: "i",
  0x09: "u",
  0x0a: "u",
  0x0b: "ri",
  0x0e: "e",
  0x0f: "e",
  0x10: "ai",
  0x12: "o",
  0x13: "o",
  0x14: "au"
};

const BRAHMIC_MATRAS = {
  0x3e: "a",
  0x3f: "i",
  0x40: "i",
  0x41: "u",
  0x42: "u",
  0x43: "ri",
  0x46: "e",
  0x47: "e",
  0x48: "ai",
  0x4a: "o",
  0x4b: "o",
  0x4c: "au"
};

const BRAHMIC_CONSONANTS = {
  0x15: "k",
  0x16: "kh",
  0x17: "g",
  0x18: "gh",
  0x19: "ng",
  0x1a: "c",
  0x1b: "chh",
  0x1c: "j",
  0x1d: "jh",
  0x1e: "ny",
  0x1f: "t",
  0x20: "th",
  0x21: "d",
  0x22: "dh",
  0x23: "n",
  0x24: "t",
  0x25: "th",
  0x26: "d",
  0x27: "dh",
  0x28: "n",
  0x2a: "p",
  0x2b: "ph",
  0x2c: "b",
  0x2d: "bh",
  0x2e: "m",
  0x2f: "y",
  0x30: "r",
  0x32: "l",
  0x33: "l",
  0x34: "zh",
  0x35: "v",
  0x36: "sh",
  0x37: "sh",
  0x38: "s",
  0x39: "h",
  0x58: "q",
  0x59: "kh",
  0x5a: "gh",
  0x5b: "z",
  0x5c: "r",
  0x5d: "rh",
  0x5e: "f",
  0x5f: "y"
};

/**
 * Detects if the text contains characters from an Indic script.
 * Returns detailed script and language diagnostics.
 */
export function detectIndicScript(text) {
  if (!text || typeof text !== "string") {
    return { isIndic: false, language: null, script: null, nativeName: null };
  }

  const scriptCounts = {};
  for (const cfg of SCRIPT_CONFIGS) {
    scriptCounts[cfg.script] = 0;
  }

  let totalIndicChars = 0;

  for (let i = 0; i < text.length; i++) {
    const cp = text.charCodeAt(i);
    for (const cfg of SCRIPT_CONFIGS) {
      if (cp >= cfg.min && cp <= cfg.max) {
        scriptCounts[cfg.script] += 1;
        totalIndicChars += 1;
        break;
      }
    }
  }

  if (totalIndicChars === 0) {
    return { isIndic: false, language: null, script: null, nativeName: null };
  }

  // Find the dominant script
  let dominantScript = "Devanagari";
  let maxCount = 0;
  for (const [script, count] of Object.entries(scriptCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantScript = script;
    }
  }

  const cfg = SCRIPT_CONFIGS.find((c) => c.script === dominantScript) || SCRIPT_CONFIGS[0];
  let language = cfg.defaultLang;

  // Refine Devanagari detection between Sanskrit, Hindi, and Marathi
  if (dominantScript === "Devanagari") {
    const trimmed = text.trim();
    // Marathi specific letter 'ळ' (0x0933) or common Marathi markers
    if (text.includes("ळ") || /पुस्तके|डिलिव्हरी|पाहिजे|आहे|सूट/i.test(trimmed)) {
      language = "Marathi";
    } else if (
      /संस्कृतम्|अष्टाध्यायी|धातुरूपम्|सुबन्त|तिङन्त|स्तोत्रम्|सूक्तम्|उपनिषद्|गीता|वेद|न्याय/i.test(trimmed) ||
      /[ःम्]$/.test(trimmed)
    ) {
      language = "Sanskrit";
    } else {
      language = "Hindi";
    }
  }

  return {
    isIndic: true,
    language,
    script: dominantScript,
    nativeName: cfg.nativeName,
    charCount: totalIndicChars
  };
}

/**
 * Converts Indic text into standard Romanized Latin text phonetically.
 * Works seamlessly across Kannada, Hindi, Sanskrit, Tamil, Marathi, Telugu, Odia, Gujarati, Bengali.
 */
export function transliterateIndicToLatin(text) {
  if (!text || typeof text !== "string") return "";

  let out = "";
  let prevConsonant = false;

  for (let i = 0; i < text.length; i++) {
    const cp = text.charCodeAt(i);

    // Skip Zero Width Joiner / Non-Joiner
    if (cp === 0x200c || cp === 0x200d) {
      continue;
    }

    // Determine script base
    let base = null;
    for (const cfg of SCRIPT_CONFIGS) {
      if (cp >= cfg.min && cp <= cfg.max) {
        base = cfg.base;
        break;
      }
    }

    if (base === null) {
      if (prevConsonant) {
        out += "a";
        prevConsonant = false;
      }
      out += text[i];
      continue;
    }

    const offset = cp - base;

    // Virama (Halant) - suppresses the implicit 'a'
    if (offset === 0x4d) {
      prevConsonant = false;
      continue;
    }

    // Anusvara (ं, ং, ં, ଂ, ஂ, ం, ಂ, ം)
    if (offset === 0x02 || offset === 0x01) {
      if (prevConsonant) {
        out += "a";
        prevConsonant = false;
      }
      out += "n";
      continue;
    }

    // Visarga (ः, ঃ, ઃ, ଃ, ః, ಃ, ഃ)
    if (offset === 0x03) {
      if (prevConsonant) {
        out += "a";
        prevConsonant = false;
      }
      out += "h";
      continue;
    }

    // Avagraha (ऽ, ঽ, ઽ, ଽ, ఽ, ಽ)
    if (offset === 0x3d) {
      continue;
    }

    // Independent Vowel
    if (BRAHMIC_VOWELS[offset]) {
      if (prevConsonant) {
        out += "a";
        prevConsonant = false;
      }
      out += BRAHMIC_VOWELS[offset];
      continue;
    }

    // Dependent Matra (Vowel Sign)
    if (BRAHMIC_MATRAS[offset]) {
      out += BRAHMIC_MATRAS[offset];
      prevConsonant = false;
      continue;
    }

    // Consonant
    if (BRAHMIC_CONSONANTS[offset]) {
      if (prevConsonant) {
        out += "a";
      }
      out += BRAHMIC_CONSONANTS[offset];
      prevConsonant = true;
      continue;
    }

    if (prevConsonant) {
      out += "a";
      prevConsonant = false;
    }
    out += text[i];
  }

  if (prevConsonant) {
    out += "a";
  }

  // Post-processing phonetic cleanups for accurate English matching
  return out
    .toLowerCase()
    .replace(/n(?=[pb])/g, "m")
    .replace(/aa/g, "a")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/w/g, "v")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalizes terminal inflection markers across Indic scripts
 * (e.g. Sanskrit 'संस्कृतम्' -> 'संस्कृत', Telugu 'సంస్కృతం' -> 'సంస్కృత', Tamil 'புத்தகம்' -> 'புத்தக')
 */
export function normalizeIndicWord(w) {
  if (!w || typeof w !== "string") return "";
  return w
    .trim()
    // Strip terminal anusvara / candrabindu across Indic scripts
    .replace(/[\u0901\u0902\u0981\u0982\u0A81\u0A82\u0B01\u0B02\u0B82\u0C01\u0C02\u0C82\u0D02]$/, "")
    // Strip terminal virama + ma (म्, ্ম, મ્, ମ୍, ம், మ్, ಮ್, മ്)
    .replace(/[\u092e\u09ae\u0aae\u0b2e\u0bae\u0c2e\u0cbe\u0d2e][\u094d\u09cd\u0acd\u0b4d\u0bcd\u0c4d\u0ccd\u0d4d]$/, "")
    // Strip terminal visarga (ः, ঃ, ઃ, ଃ, ః, ಃ, ഃ)
    .replace(/[\u0903\u0983\u0A83\u0B03\u0C03\u0C83\u0D03]$/, "");
}

/**
 * Sanskrit Compound (Samasa) Root Vocabulary.
 * Used to intelligently separate unspaced Sanskrit titles (e.g. 'dhaturupaparicayah' -> 'dhaturupa paricayah').
 */
export const SANSKRIT_COMPOUND_ROOTS = [
  "bhagavad", "gita", "gitam",
  "dhaturupa", "shabdarupa", "sabdarupa",
  "saptaha", "stotra", "stotram",
  "sangraha", "sangrahah", "sangraham",
  "paricaya", "paricayah", "parichaya",
  "ramayana", "ratnamala",
  "yoga", "sutra", "sutram",
  "ashtadhyayi", "astadhyayi",
  "panchatantra", "katha",
  "shabdasampadvardhini", "sampadvardhini",
  "sanskrit", "vyakarana", "vyakaranam",
  "prarthana", "shloka", "shlokah", "nama",
  "amarakosha", "tarkasangraha", "saundaryalahari"
];
SANSKRIT_COMPOUND_ROOTS.sort((a, b) => b.length - a.length);

/**
 * Splits unspaced Sanskrit compounds into constituent words for high-accuracy token matching.
 */
export function splitSanskritCompound(text) {
  let remaining = String(text || "").toLowerCase().trim();
  if (remaining.length < 5) return text;
  const tokens = [];
  while (remaining.length > 0) {
    let matched = false;
    for (const r of SANSKRIT_COMPOUND_ROOTS) {
      if (remaining.startsWith(r)) {
        tokens.push(r);
        remaining = remaining.slice(r.length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      tokens.push(remaining);
      break;
    }
  }
  return tokens.join(" ").trim();
}

/**
 * Comprehensive Cross-Lingual Knowledge Dictionary
 * Maps user search terms in Kannada, Hindi, Sanskrit, Tamil, Marathi, Telugu, Odia, Gujarati, Bengali
 * to canonical English store queries, categories, and entities.
 */
export const MULTILINGUAL_LEXICON = {
  // ==========================================
  // BRAND & ORGANIZATIONS
  // ==========================================
  "ವ್ಯೋಮ": "vyoma",
  "व्योम": "vyoma",
  "வியோமா": "vyoma",
  "వ్యోమ": "vyoma",
  "વ્યોમ": "vyoma",
  "ব্যোম": "vyoma",
  "ବ୍ୟୋମ": "vyoma",
  "ಡಿಜಿಟಲ್ ಸಂಸ್ಕೃತ ಗುರು": "digital sanskrit guru",
  "डिजिटल संस्कृत गुरु": "digital sanskrit guru",
  "டிஜிட்டல் சமஸ்கிருத குரு": "digital sanskrit guru",
  "డిజిటల్ సంస్కృత గురు": "digital sanskrit guru",

  // ==========================================
  // STORE BOOK TITLES & POPULAR SANSKRIT WORKS
  // ==========================================
  // Dhaturupaparicayah
  "ಧಾತುರೂಪ ಪರಿಚಯ": "dhaturupa paricaya",
  "ಧಾತುರೂಪಪರಿಚಯಃ": "dhaturupa paricayah",
  "ಧಾತುರೂಪ ಪರಿಚಯಃ": "dhaturupa paricayah",
  "ಧಾತುರೂಪ ಪರಿಚಯ ೨": "dhaturupa paricaya 2",
  "ಧಾತುರೂಪ ಪರಿಚಯ - ೨": "dhaturupa paricaya 2",
  "धातुरूप परिचय": "dhaturupa paricaya",
  "धातुरूपपरिचयः": "dhaturupa paricayah",
  "धातुरूप परिचयः": "dhaturupa paricayah",
  "धातुरूप परिचय - २": "dhaturupa paricaya 2",
  "ಧಾತುರೂಪ": "dhaturupa",
  "ಧಾತು ರೂಪ": "dhaturupa",
  "धातुरूप": "dhaturupa",
  "धातु रूप": "dhaturupa",

  // Shabdarupasangrahah
  "ಶಬ್ದರೂಪ ಸಂಗ್ರಹ": "shabdarupa sangraha",
  "ಶಬ್ದರೂಪ ಸಂಗ್ರಹಃ": "shabdarupa sangrahah",
  "ಶಬ್ದರೂಪಸಂಗ್ರಹಃ": "shabdarupa sangrahah",
  "ಶಬ್ದ ರೂಪ ಸಂಗ್ರಹ": "shabdarupa sangraha",
  "शब्दरूप संग्रह": "shabdarupa sangraha",
  "शब्दरूपसंग्रहः": "shabdarupa sangrahah",
  "शब्दरूप संग्रहः": "shabdarupa sangrahah",
  "शब्द रूप संग्रह": "shabdarupa sangraha",
  "ಶಬ್ದರೂಪ": "shabdarupa",
  "ಶಬ್ದ ರೂಪ": "shabdarupa",
  "शब्दरूप": "shabdarupa",
  "शब्द रूप": "shabdarupa",

  // Saptaha Stotra Sangrahah
  "ಸಪ್ತಾಹ ಸ್ತೋತ್ರ ಸಂಗ್ರಹ": "saptaha stotra sangraha",
  "ಸಪ್ತಾಹ ಸ್ತೋತ್ರ ಸಂಗ್ರಹಃ": "saptaha stotra sangrahah",
  "ಸಪ್ತಾಹಸ್ತೋತ್ರಸಂಗ್ರಹಃ": "saptaha stotra sangrahah",
  "ಸಪ್ತಾಹ ಸ್ತೋತ್ರ": "saptaha stotra",
  "ಸಪ್ತಾಹಸ್ತೋತ್ರ": "saptaha stotra",
  "सप्ताह स्तोत्र संग्रह": "saptaha stotra sangraha",
  "सप्ताह स्तोत्र संग्रहः": "saptaha stotra sangrahah",
  "सप्ताहस्तोत्रसंग्रहः": "saptaha stotra sangrahah",
  "सप्ताह स्तोत्र": "saptaha stotra",
  "सप्ताहस्तोत्र": "saptaha stotra",

  // Ramayana Ratnamala
  "ರಾಮಾಯಣ ರತ್ನಮಾಲಾ": "ramayana ratnamala",
  "ರಾಮಾಯಣ ರತ್ನಮಾಲೆ": "ramayana ratnamala",
  "ರಾಮಾಯಣರತ್ನಮಾಲಾ": "ramayana ratnamala",
  "ರಾಮಾಯಣರತ್ನಮಾಲೆ": "ramayana ratnamala",
  "रामायण रत्नमाला": "ramayana ratnamala",
  "रामायणरत्नमाला": "ramayana ratnamala",

  // Yoga Sutra Paricayah
  "ಯೋಗ ಸೂತ್ರ": "yoga sutra",
  "ಯೋಗಸೂತ್ರ": "yoga sutra",
  "ಯೋಗ ಸೂತ್ರಗಳು": "yoga sutras",
  "ಯೋಗ ಸೂತ್ರ ಪರಿಚಯ": "yoga sutra paricaya",
  "ಯೋಗ ಸೂತ್ರ ಪರಿಚಯಃ": "yoga sutra paricayah",
  "ಯೋಗಸೂತ್ರಪರಿಚಯಃ": "yoga sutra paricayah",
  "ಯೋಗದರ್ಶನ": "yoga sutra",
  "योग सूत्र": "yoga sutra",
  "योगसूत्र": "yoga sutra",
  "योग सूत्र परिचय": "yoga sutra paricaya",
  "योग सूत्र परिचयः": "yoga sutra paricayah",
  "योगसूत्रपरिचयः": "yoga sutra paricayah",
  "योगदर्शन": "yoga sutra",

  // Ashtadhyayi
  "ಅಷ್ಟಾಧ್ಯಾಯಿ": "ashtadhyayi",
  "ಅಷ್ಟಾಧ್ಯಾಯೀ": "ashtadhyayi",
  "ಅಷ್ಟಾಧ್ಯಾಯೀ ಸೂತ್ರ": "ashtadhyayi sutra",
  "अष्टाध्यायी": "ashtadhyayi",
  "अष्टाध्यायी सूत्र": "ashtadhyayi sutra",

  // Panchatantra
  "ಪಂಚತಂತ್ರ": "panchatantra",
  "ಪಂಚತಂತ್ರ ಕಥೆಗಳು": "panchatantra stories",
  "ಸಂಸ್ಕೃತ ಕಥಾಮಾಲಿಕಾ": "samskrita kathamalika stories",
  "पञ्चतन्त्र": "panchatantra",
  "पंचतंत्र": "panchatantra",
  "पंचतंत्र की कहानियां": "panchatantra stories",
  "संस्कृत कथामालिका": "samskrita kathamalika stories",

  // Shabdasampadvardhini (Vocabulary Builder)
  "ಶಬ್ದಸಂಪದ್ವರ್ಧಿನೀ": "shabdasampadvardhini",
  "ಶಬ್ದ ಸಂಪದ್ವರ್ಧಿನೀ": "shabdasampadvardhini",
  "ಸಂಸ್ಕೃತ ಶಬ್ದಸಂಪದ್ವರ್ಧಿನೀ": "samskrta shabdasampadvardhini",
  "ಸಂಸ್ಕೃತ ಶಬ್ದ ಸಂಪದ್ವರ್ಧಿನೀ": "samskrta shabdasampadvardhini",
  "शब्दसम्पद्वर्धिनी": "shabdasampadvardhini",
  "शब्द सम्पद वर्धिनी": "shabdasampadvardhini",
  "संस्कृत शब्दसम्पद्वर्धिनी": "samskrta shabdasampadvardhini",

  // Nitya Prarthana Shloka
  "ನಿತ್ಯ ಪ್ರಾರ್ಥನಾ ಶ್ಲೋಕ": "nitya prarthana shloka",
  "ನಿತ್ಯ ಪ್ರಾರ್ಥನೆ": "nitya prarthana shloka",
  "ನಮಸ್ಕಾರ ಶ್ಲೋಕ": "prarthana shloka",
  "नित्य प्रार्थना श्लोक": "nitya prarthana shloka",
  "नित्य प्रार्थना": "nitya prarthana shloka",

  // Nama Ramayana
  "ನಾಮರಾಮಾಯಣ": "nama ramayana",
  "ನಾಮರಾಮಾಯಣಂ": "nama ramayana",
  "ನಾಮ ರಾಮಾಯಣ": "nama ramayana",
  "नामरामायण": "nama ramayana",
  "नामरामायणम्": "nama ramayana",
  "नाम रामायण": "nama ramayana",

  // Saundaryalahari & Amarakosha & Tarkasangraha
  "ಸೌಂದರ್ಯಲಹರೀ": "saundarya lahari",
  "ಸೌಂದರ್ಯ ಲಹರಿ": "saundarya lahari",
  "सौन्दर्यलहरी": "saundarya lahari",
  "सौंदर्य लहरी": "saundarya lahari",
  "ಅಮರಕೋಶ": "amarakosha",
  "ಅಮರಕೋಶಂ": "amarakosha",
  "अमरकोश": "amarakosha",
  "तर्कसंग्रह": "tarkasangraha",
  "ತರ್ಕಸಂಗ್ರಹ": "tarkasangraha",
  "ತರ್ಕ ಸಂಗ್ರಹ": "tarkasangraha",
  "ಸಮಾಸ": "samasa",
  "ಸಮಾಸಗಳು": "samasa compounds",
  "समास": "samasa compounds",

  // Common title subcomponents
  "ಪರಿಚಯ": "paricaya",
  "ಪರಿಚಯಃ": "paricayah",
  "ಸಂಗ್ರಹ": "sangraha",
  "ಸಂಗ್ರಹಃ": "sangrahah",
  "ಸಪ್ತಾಹ": "saptaha",
  "ರತ್ನಮಾಲಾ": "ratnamala",
  "ರತ್ನಮಾಲೆ": "ratnamala",
  "ಸೂತ್ರ": "sutra",
  "ಸೂತ್ರಗಳು": "sutras",
  "ಪ್ರಾರ್ಥನಾ": "prarthana",
  "ಪ್ರಾರ್ಥನೆ": "prarthana",
  "परिचय": "paricaya",
  "परिचयः": "paricayah",
  "संग्रह": "sangraha",
  "संग्रहः": "sangrahah",
  "सप्ताह": "saptaha",
  "रत्नमाला": "ratnamala",
  "सूत्र": "sutra",

  // ==========================================
  // 1. BHAGAVAD GITA
  // ==========================================
  "ಭಗವದ್ಗೀತಾ": "bhagavad gita",
  "ಭಗವದ್ಗೀತೆ": "bhagavad gita",
  "ಗೀತಾ": "gita",
  "ಗೀತೆ": "gita",
  "भगवद्गीता": "bhagavad gita",
  "भगवत गीता": "bhagavad gita",
  "श्रीमद्भगवद्गीता": "bhagavad gita",
  "गीता": "gita",
  "பகவத் கீதை": "bhagavad gita",
  "பகவத்கீதை": "bhagavad gita",
  "கீதை": "gita",
  "భగవద్గీత": "bhagavad gita",
  "భగవద్గీతా": "bhagavad gita",
  "గీత": "gita",
  "ભગવદ્ ગીતા": "bhagavad gita",
  "ભગવદગીતા": "bhagavad gita",
  "ગીતા": "gita",
  "ভগবদ্গীতা": "bhagavad gita",
  "ভগবদগীতা": "bhagavad gita",
  "গীতা": "gita",
  "ଭଗବଦ୍‌ଗୀତା": "bhagavad gita",
  "ଭଗବତ ଗୀତା": "bhagavad gita",
  "ଗୀତା": "gita",

  // ==========================================
  // 2. SANSKRIT LANGUAGE & LEARNING
  // ==========================================
  "ಸಂಸ್ಕೃತ": "sanskrit",
  "ಸಂಸ್ಕೃತ ಕಲಿಯಿರಿ": "learn sanskrit",
  "ಸಂಸ್ಕೃತಂ": "sanskrit",
  "ಸಂಸ್ಕೃತ ಪ್ರವೇಶ": "basic sanskrit primer",
  "ಸಂಸ್ಕೃತ ಭಾಷೆ": "sanskrit",
  "ಸಂಸ್ಕೃತ ಪುಸ್ತಕಗಳು": "sanskrit books",
  "ಸಂಸ್ಕೃತ ಪುಸ್ತಕ": "sanskrit book",
  "ಸುಲಭ ಸಂಸ್ಕೃತ": "learn basic sanskrit",
  "ಆರಂಭಿಕ ಸಂಸ್ಕೃತ": "learn basic sanskrit",

  "संस्कृत": "sanskrit",
  "संस्कृतम्": "sanskrit",
  "संस्कृत सीखें": "learn sanskrit",
  "संस्कृत प्रवेश": "basic sanskrit primer",
  "गीर्वाण": "sanskrit",
  "संस्कृत भाषा": "sanskrit",
  "संस्कृत किताबें": "sanskrit books",
  "संस्कृत पुस्तकें": "sanskrit books",
  "सरल संस्कृत": "learn basic sanskrit",
  "आरंभिक संस्कृत": "learn basic sanskrit",

  "சமஸ்கிருதம்": "sanskrit",
  "சம்ஸ்கிருதம்": "sanskrit",
  "சமஸ்கிருத": "sanskrit",
  "சமஸ்கிருத புத்தகங்கள்": "sanskrit books",
  "எளிய சமஸ்கிருதம்": "learn basic sanskrit",
  "அடிப்படை சமஸ்கிருதம்": "basic sanskrit primer",

  "సంస్కృతం": "sanskrit",
  "సంస్కృత": "sanskrit",
  "సంస్కృతం నేర్చుకోండి": "learn sanskrit",
  "సంస్కృత పుస్తకాలు": "sanskrit books",
  "సులభ సంస్కృతం": "learn basic sanskrit",

  "સંસ્કૃત": "sanskrit",
  "સંસ્કૃત શીખો": "learn sanskrit",
  "સંસ્કૃત પુસ્તકો": "sanskrit books",
  "સરળ સંસ્કૃત": "learn basic sanskrit",

  "সংস্কৃত": "sanskrit",
  "সংস্কৃত শিক্ষা": "learn sanskrit",
  "সংস্কৃত বই": "sanskrit books",
  "সহজ সংস্কৃত": "learn basic sanskrit",

  "ସଂସ୍କୃତ": "sanskrit",
  "ସଂସ୍କୃତ ଶିକ୍ଷା": "learn sanskrit",
  "ସଂସ୍କୃତ ବହି": "sanskrit books",
  "ସହଜ ସଂସ୍କୃତ": "learn basic sanskrit",

  // ==========================================
  // 3. GRAMMAR (VYAKARANA)
  // ==========================================
  "ವ್ಯಾಕರಣ": "sanskrit grammar",
  "ವ್ಯಾಕರಣಂ": "sanskrit grammar",
  "ಅಷ್ಟಾಧ್ಯಾಯಿ": "ashtadhyayi",
  "ಅಷ್ಟಾಧ್ಯಾಯೀ": "ashtadhyayi",
  "ಧಾತು": "dhatu",
  "ಧಾತುರೂಪ": "dhaturupa",
  "ಧಾತುರೂಪಾವಳಿ": "dhaturupa",
  "ಧಾತುರೂಪಗಳು": "dhaturupa",
  "ವ್ಯಾಕರಣ ಕಲಿಯಿರಿ": "learn grammar",
  "ಪಾಣಿನಿ": "panini",
  "ವಿಭಕ್ತಿ": "vibhakti subanta",
  "ಸುಬಂತ": "subanta",
  "ತಿಙಂತ": "tinganta",

  "व्याकरण": "sanskrit grammar",
  "अष्टाध्यायी": "ashtadhyayi",
  "धातु": "dhatu",
  "धातुरूप": "dhaturupa",
  "धातुरूपमञ्जरी": "dhaturupa",
  "धातुरूपम्": "dhaturupa",
  "पाणिनि": "panini",
  "सुबन्त": "subanta",
  "तिङन्त": "tinganta",
  "कारक": "karaka",
  "सन्धि": "sandhi",
  "समास": "samasa",

  "இலக்கணம்": "sanskrit grammar",
  "வியாகரணம்": "vyakarana grammar",
  "வியாகரண": "vyakarana grammar",
  "அஷ்டாத்யாயி": "ashtadhyayi",
  "பாணினி": "panini",

  "వ్యాకరణం": "sanskrit grammar",
  "వ్యాకరణ": "sanskrit grammar",
  "అష్టాధ్యాయి": "ashtadhyayi",
  "ధాతువు": "dhatu",
  "ధాతురూప": "dhaturupa",
  "ధాతురూపాలు": "dhaturupa",
  "పాణిని": "panini",

  "વ્યાકરણ": "sanskrit grammar",
  "અષ્ટાધ્યાયી": "ashtadhyayi",
  "ધાતુ": "dhatu",
  "ધાતુરૂપ": "dhaturupa",
  "પાણિનિ": "panini",

  "ব্যাকরণ": "sanskrit grammar",
  "অষ্টাধ্যায়ী": "ashtadhyayi",
  "ধাতু": "dhatu",
  "ধাতুরূপ": "dhaturupa",
  "ধাতুরূপম্": "dhaturupa",
  "পাণিনি": "panini",

  "ବ୍ୟାକରଣ": "sanskrit grammar",
  "ଅଷ୍ଟାଧ୍ୟାୟୀ": "ashtadhyayi",
  "ଧାତୁ": "dhatu",
  "ଧାତୁରୂପ": "dhaturupa",
  "ପାଣିନି": "panini",

  // ==========================================
  // 4. SCRIPTURES & ITIHASA (RAMAYANA, VEDAS, UPANISHADS)
  // ==========================================
  "ರಾಮಾಯಣ": "ramayana",
  "ವಾಲ್ಮೀಕಿ ರಾಮಾಯಣ": "valmiki ramayana",
  "ಸುಂದರಕಾಂಡ": "sundarakanda",
  "ಬಾಲಕಾಂಡ": "balakanda",
  "ಉಪನಿಷತ್": "upanishad",
  "ಉಪನಿಷತ್ತುಗಳು": "upanishads",
  "ವೇದ": "vedas",
  "ವೇದಗಳು": "vedas",
  "ಪಂಚತಂತ್ರ": "panchatantra",
  "ಕಥೆಗಳು": "stories",
  "ಧರ್ಮ": "dharma",

  "रामायण": "ramayana",
  "वाल्मीकि रामायण": "valmiki ramayana",
  "सुन्दरकाण्ड": "sundarakanda",
  "बालकाण्ड": "balakanda",
  "उपनिषद्": "upanishad",
  "उपनिषद": "upanishad",
  "वेद": "vedas",
  "वेदान्त": "vedanta",
  "पञ्चतन्त्र": "panchatantra",
  "पंचतंत्र": "panchatantra",
  "कथा": "stories",
  "धर्म": "dharma",

  "ராமாயணம்": "ramayana",
  "வால்மீகி ராமாயணம்": "valmiki ramayana",
  "சுந்தர காண்டம்": "sundarakanda",
  "உபநிடதம்": "upanishad",
  "வேதம்": "vedas",
  "பஞ்சதந்திரம்": "panchatantra",
  "கதைகள்": "stories",

  "రామాయణం": "ramayana",
  "వాల్మీకి రామాయణం": "valmiki ramayana",
  "సుందరకాండ": "sundarakanda",
  "ఉపనిషత్తు": "upanishad",
  "ఉపనిషత్తులు": "upanishads",
  "వేదం": "vedas",
  "పంచతంత్రం": "panchatantra",
  "కథలు": "stories",

  "રામાયણ": "ramayana",
  "વાલ્મીકિ રામાયણ": "valmiki ramayana",
  "સુંદરકાંડ": "sundarakanda",
  "ઉપનિષદ": "upanishad",
  "વેદ": "vedas",
  "પંચતંત્ર": "panchatantra",
  "વાર્તાઓ": "stories",

  "রামায়ণ": "ramayana",
  "বাল্মীকি রামায়ণ": "valmiki ramayana",
  "সুন্দরকাণ্ড": "sundarakanda",
  "উপনিষদ": "upanishad",
  "বেদ": "vedas",
  "পঞ্চতন্ত্র": "panchatantra",
  "গল্প": "stories",

  "ରାମାୟଣ": "ramayana",
  "ବାଲ୍ମୀକି ରାମାୟଣ": "valmiki ramayana",
  "ସୁନ୍ଦରକାଣ୍ଡ": "sundarakanda",
  "ଉପନିଷଦ": "upanishad",
  "ବେଦ": "vedas",
  "ପଞ୍ଚତନ୍ତ୍ର": "panchatantra",
  "ଗଳ୍ପ": "stories",

  // ==========================================
  // 5. CHANTING, STOTRAS, SHLOKAS & SUKTAMS
  // ==========================================
  "ಸ್ತೋತ್ರ": "stotra",
  "ಶ್ಲೋಕ": "shloka",
  "ಮಂತ್ರ": "mantra",
  "ಸೂಕ್ತಂ": "suktam",
  "ಸಹಸ್ರನಾಮ": "sahasranama",
  "ವಿಷ್ಣು ಸಹಸ್ರನಾಮ": "vishnu sahasranama",
  "ಲಲಿತಾ ಸಹಸ್ರನಾಮ": "lalitha sahasranama",
  "ಪಾರಾಯಣ": "chanting",

  "स्तोत्र": "stotra",
  "स्तोत्रम्": "stotra",
  "श्लोक": "shloka",
  "मंत्र": "mantra",
  "सूक्त": "suktam",
  "सहस्रनाम": "sahasranama",
  "विष्णु सहस्रनाम": "vishnu sahasranama",
  "ललिता सहस्रनाम": "lalitha sahasranama",
  "पारायण": "chanting",
  "आरती": "aarti chanting",

  "ஸ்தோத்திரம்": "stotra",
  "சுலோகம்": "shloka",
  "மந்திரம்": "mantra",
  "சூக்தம்": "suktam",
  "சகஸ்ரநாமம்": "sahasranama",

  "స్తోత్రం": "stotra",
  "శ్లోకం": "shloka",
  "మంత్రం": "mantra",
  "సూక్తం": "suktam",
  "సహస్రనామం": "sahasranama",

  "સ્તોત્ર": "stotra",
  "શ્લોક": "shloka",
  "મંત્ર": "mantra",
  "સૂક્ત": "suktam",
  "સહસ્રનામ": "sahasranama",

  "স্তোত্র": "stotra",
  "শ্লোক": "shloka",
  "মন্ত্র": "mantra",
  "সূক্ত": "suktam",
  "সহস্রনাম": "sahasranama",

  "ସ୍ତୋତ୍ର": "stotra",
  "ଶ୍ଳୋକ": "shloka",
  "ମନ୍ତ୍ର": "mantra",
  "ସୂକ୍ତ": "suktam",
  "ସହସ୍ରନାମ": "sahasranama",

  // ==========================================
  // 6. FORMATS (BOOK, KINDLE, FLIPBOOK, AUDIO, COMBO)
  // ==========================================
  "ಪುಸ್ತಕ": "book paperback",
  "ಪುಸ್ತಕಗಳು": "books",
  "ಪುಸ್ತಕಗಳ": "books",
  "ಗ್ರಂಥ": "book paperback",
  "ಮುದ್ರಿತ": "paperback",
  "ಕಿಂಡಲ್": "kindle",
  "ಇ-ಬುಕ್": "ebook kindle",
  "ಡಿಜಿಟಲ್ ಪುಸ್ತಕ": "ebook kindle",
  "ಫ್ಲಿಪ್ ಬುಕ್": "flipbook",
  "ಫ್ಲಿಪ್‌ಬುಕ್": "flipbook",
  "ಆಡಿಯೋ": "audio device",
  "ಧ್ವನಿ": "audio",
  "ಹಾಡು": "audio chanting",
  "ಪೆನ್ ಡ್ರೈವ್": "usb stick",
  "ಯುಎಸ್ ಬಿ": "usb stick",
  "ಕಾಂಬೋ": "combo pack",
  "ಕಲಿಕಾ ಪ್ಯಾಕ್": "combo learning pack",
  "ಆನ್‌ಲೈನ್ ಓದು": "web version",
  "ಕೋರ್ಸ್": "course products",
  "ಕ್ಯಾಲೆಂಡರ್": "calendar",
  "ಪಂಚಾಂಗ": "calendar panchanga",
  "ದಿನದರ್ಶಿ": "calendar",

  "पुस्तक": "book paperback",
  "किताब": "book paperback",
  "ग्रन्थ": "book paperback",
  "किंडल": "kindle",
  "ई-बुक": "ebook kindle",
  "डिजिटल पुस्तक": "ebook kindle",
  "फ्लिपबुक": "flipbook",
  "फ्लिप बुक": "flipbook",
  "ऑडियो": "audio device",
  "आवाज": "audio",
  "पेन ड्राइव": "usb stick",
  "यूएसबी": "usb stick",
  "कॉम्बो": "combo pack",
  "पैक": "combo pack",
  "ऑनलाइन": "web version",
  "कोर्स": "course products",
  "पाठ्यक्रम": "learning path course",
  "कैलेंडर": "calendar",
  "पंचांग": "calendar panchanga",

  "புத்தகம்": "book paperback",
  "நூல்": "book paperback",
  "அச்சிடப்பட்ட": "paperback",
  "கிண்டில்": "kindle",
  "இ-புக்": "ebook kindle",
  "ஃபிளிப் புக்": "flipbook",
  "ஆடியோ": "audio device",
  "ஒலி": "audio",
  "பென் டிரைவ்": "usb stick",
  "காம்போ": "combo pack",
  "தொகுப்பு": "combo pack",
  "இணையப் பதிப்பு": "web version",
  "பாடநெறி": "course products",
  "நாட்காட்டி": "calendar",
  "பஞ்சாங்கம்": "calendar panchanga",

  "పుస్తకం": "book paperback",
  "పుస్తకాలు": "books",
  "ముద్రిత": "paperback",
  "కిండిల్": "kindle",
  "ఈ-బుక్": "ebook kindle",
  "ఫ్లిప్ బుక్": "flipbook",
  "ఆడియో": "audio device",
  "ధ్వని": "audio",
  "పెన్ డ్రೈవ్": "usb stick",
  "కాంబో": "combo pack",
  "సెట్": "combo pack",
  "ఆన్‌లైన్": "web version",
  "కోర్సు": "course products",
  "క్యాలెండర్": "calendar",
  "పంచాంగం": "calendar panchanga",

  "ચોપડી": "book paperback",
  "કિન્ડલ": "kindle",
  "ઇ-બુક": "ebook kindle",
  "ઓડિયો": "audio device",
  "કોમ્બો": "combo pack",
  "કેલેન્ડર": "calendar",

  "বই": "book paperback",
  "কিন্ডল": "kindle",
  "ই-বুক": "ebook kindle",
  "অডিও": "audio device",
  "কম্বো": "combo pack",
  "ক্যালেন্ডার": "calendar",
  "পঞ্জিকা": "calendar panchanga",

  "ବହି": "book paperback",
  "କିଣ୍ଡଲ୍": "kindle",
  "ଇ-ବୁକ୍": "ebook kindle",
  "ଅଡିଓ": "audio device",
  "କମ୍ବୋ": "combo pack",
  "କ୍ୟାଲେଣ୍ଡର": "calendar",
  "ପଞ୍ଜିକା": "calendar panchanga",

  // Marathi specific variations
  "पुस्तके": "book paperback",
  "पुस्तके खरेदी": "buy books",

  // ==========================================
  // 7. WEBSITE PAGES & SERVICES (LIBRARY, SHIPPING, ORDERS, CONTACT)
  // ==========================================
  "ಗ್ರಂಥಾಲಯ": "library",
  "ಲೈಬ್ರರಿ": "library",
  "ಡೌನ್‌ಲೋಡ್": "library download",
  "ನನ್ನ ಪುಸ್ತಕಗಳು": "my library",
  "ವಿತರಣೆ": "shipping delivery",
  "ಶಿಪ್ಪಿಂಗ್": "shipping delivery",
  "ಡೆಲಿವರಿ": "delivery shipping",
  "ರವಾನೆ": "shipping",
  "ಪಾರ್ಸೆಲ್": "shipping courier tracking",
  "ಆದೇಶ": "orders my orders",
  "ಆರ್ಡರ್": "orders my orders",
  "ಆರ್ಡರ್‌ಗಳು": "my orders",
  "ರಶೀದಿ": "orders invoice",
  "ಇನ್‌ವಾಯ್ಸ್": "orders invoice",
  "ಸಂಪರ್ಕ": "contact support",
  "ಸಹಾಯ": "faq help",
  "ಗ್ರಾಹಕ ಸೇವೆ": "contact support",
  "ದೂರವಾಣಿ": "contact phone whatsapp",
  "ಕಾರ್ಟ್": "cart",
  "ಬುಟ್ಟಿ": "cart shopping",
  "ಮೆಚ್ಚಿನವು": "wishlist",

  "लाइब्रेरी": "library",
  "पुस्तकालय": "library",
  "डाउनलोड": "library download",
  "मेरी किताबें": "my library",
  "शिपिंग": "shipping delivery",
  "डिलीवरी": "delivery shipping",
  "वितरण": "shipping delivery",
  "पार्सल": "shipping tracking",
  "ऑर्डर": "orders my orders",
  "रसीद": "orders invoice",
  "बिल": "orders invoice",
  "इनवॉइस": "orders invoice",
  "संपर्क": "contact support",
  "सहायता": "faq help",
  "मदद": "faq help",
  "कस्टमर केयर": "contact support",
  "फोन": "contact phone whatsapp",
  "कार्ट": "cart",
  "झोली": "cart shopping",
  "पसंदीदा": "wishlist",

  "நூலகம்": "library",
  "பதிவிறக்கம்": "library download",
  "எனது நூலகம்": "my library",
  "விநியோகம்": "shipping delivery",
  "டெலிவரி": "delivery shipping",
  "அனுப்புதல்": "shipping",
  "ஆர்டர்": "orders my orders",
  "ரசீது": "orders invoice",
  "விலைப்பட்டியல்": "orders invoice",
  "தொடர்பு": "contact support",
  "உதவி": "faq help",
  "வாடிக்கையாளர் சேவை": "contact support",
  "வண்டி": "cart",

  "గ్రంథాలయం": "library",
  "లైబ్రరీ": "library",
  "డౌన్‌లోడ్": "library download",
  "నా పుస్తకాలు": "my library",
  "పంపిణీ": "shipping delivery",
  "డెలివరీ": "delivery shipping",
  "ఆర్డర్": "orders my orders",
  "ఆర్డర్లు": "my orders",
  "రసీదు": "orders invoice",
  "సంప్రదించండి": "contact support",
  "సంప్రదింపు": "contact support",
  "సహాయం": "faq help",

  "પુસ્તકાલય": "library",
  "ડિલિવરી": "delivery shipping",
  "શિપિંગ": "shipping delivery",
  "ઓર્ડર": "orders my orders",
  "સંપર્ક": "contact support",
  "મદદ": "faq help",

  "গ্রন্থাগার": "library",
  "ডেলিভারি": "delivery shipping",
  "শিপিং": "shipping delivery",
  "অর্ডার": "orders my orders",
  "যোগাযোগ": "contact support",
  "সাহায্য": "faq help",

  "ପାଠାଗାର": "library",
  "ଡାଉନଲୋଡ୍": "library download",
  "ବିତରଣ": "shipping delivery",
  "ଡେଲିଭରି": "delivery shipping",
  "ଅର୍ଡର": "orders my orders",
  "ଯୋଗାଯୋଗ": "contact support",
  "ସାହାଯ୍ୟ": "faq help",

  "डिलिव्हरी": "delivery shipping",
  "ग्रंथालय": "library"
};

/**
 * Normalizes query string for lexicon lookup by removing punctuation and excess whitespace.
 */
function cleanQuery(text) {
  return String(text || "")
    .trim()
    .replace(/[?,।!.;:।॥'"()\[\]{}]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Intelligent Multilingual Query Processor
 * Evaluates a user query and returns:
 * - Language and Script detection
 * - Morphological normalization
 * - Exact Lexicon translation or multi-word concept extraction
 * - High quality phonetic transliteration
 * - Effective canonical query to search the DSG store
 */
export function processIndicQuery(query) {
  const raw = String(query || "").trim();
  if (!raw) {
    return {
      isIndic: false,
      language: null,
      script: null,
      nativeName: null,
      originalQuery: "",
      canonicalQuery: "",
      transliteratedQuery: "",
      isMultilingualMatch: false,
      displayBadge: null
    };
  }

  const detection = detectIndicScript(raw);
  if (!detection.isIndic) {
    return {
      isIndic: false,
      language: null,
      script: null,
      nativeName: null,
      originalQuery: raw,
      canonicalQuery: raw,
      transliteratedQuery: "",
      isMultilingualMatch: false,
      displayBadge: null
    };
  }

  const cleaned = cleanQuery(raw);
  const normalizedCleaned = normalizeIndicWord(cleaned);

  // 1. Direct whole-query dictionary match (exact or inflection-normalized)
  if (MULTILINGUAL_LEXICON[cleaned] || MULTILINGUAL_LEXICON[normalizedCleaned]) {
    const canonical = MULTILINGUAL_LEXICON[cleaned] || MULTILINGUAL_LEXICON[normalizedCleaned];
    return {
      isIndic: true,
      language: detection.language,
      script: detection.script,
      nativeName: detection.nativeName,
      originalQuery: raw,
      canonicalQuery: canonical,
      transliteratedQuery: transliterateIndicToLatin(cleaned),
      isMultilingualMatch: true,
      displayBadge: `${detection.language} Recognized`
    };
  }

  // 2. Multi-word phrase search in lexicon
  const words = cleaned.split(" ").filter(Boolean);
  const matchedCanonicalWords = [];
  let hadLexiconHit = false;

  for (const word of words) {
    const normW = normalizeIndicWord(word);
    if (MULTILINGUAL_LEXICON[word]) {
      matchedCanonicalWords.push(MULTILINGUAL_LEXICON[word]);
      hadLexiconHit = true;
    } else if (MULTILINGUAL_LEXICON[normW]) {
      matchedCanonicalWords.push(MULTILINGUAL_LEXICON[normW]);
      hadLexiconHit = true;
    } else {
      // Transliterate individual word phonetically
      const tWord = transliterateIndicToLatin(word);
      if (tWord) {
        matchedCanonicalWords.push(tWord);
      }
    }
  }

  const transliteratedFull = transliterateIndicToLatin(cleaned);
  let canonicalQuery = matchedCanonicalWords.join(" ").trim();

  // 3. Compound word detection if query has no spaces or is a joined compound
  if (!hadLexiconHit && words.length === 1) {
    const splitCompound = splitSanskritCompound(transliteratedFull);
    if (splitCompound && splitCompound !== transliteratedFull) {
      canonicalQuery = splitCompound;
      hadLexiconHit = true;
    } else {
      canonicalQuery = transliteratedFull;
    }
  }

  return {
    isIndic: true,
    language: detection.language,
    script: detection.script,
    nativeName: detection.nativeName,
    originalQuery: raw,
    canonicalQuery: canonicalQuery || transliteratedFull,
    transliteratedQuery: transliteratedFull,
    isMultilingualMatch: hadLexiconHit || Boolean(canonicalQuery),
    displayBadge: `${detection.language} Recognized`
  };
}
