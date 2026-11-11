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

import { lookupProductTranslation } from "./productTranslations.js";

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
  0x0d: "e",
  0x0e: "e",
  0x0f: "e",
  0x10: "ai",
  0x11: "o",
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
  0x45: "e",
  0x46: "e",
  0x47: "e",
  0x48: "ai",
  0x49: "o",
  0x4a: "o",
  0x4b: "o",
  0x4c: "au",
  0x57: "au"
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
  0x29: "n",
  0x2a: "p",
  0x2b: "ph",
  0x2c: "b",
  0x2d: "bh",
  0x2e: "m",
  0x2f: "y",
  0x30: "r",
  0x31: "r",
  0x32: "l",
  0x33: "l",
  0x34: "zh",
  0x35: "v",
  0x36: "sh",
  0x37: "sh",
  0x38: "s",
  0x39: "h",
  0x4e: "t",
  0x58: "q",
  0x59: "kh",
  0x5a: "gh",
  0x5b: "z",
  0x5c: "r",
  0x5d: "rh",
  0x5e: "f",
  0x5f: "y",
  0x71: "v"
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

    // Devanagari candra A (ॲ)
    if (cp === 0x0972) {
      if (prevConsonant) {
        out += "a";
        prevConsonant = false;
      }
      out += "a";
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

    // Avagraha (ऽ, ঽ, ઽ, ଽ, ఽ, ಽ) & Nukta (़, ়, ଼)
    if (offset === 0x3d || offset === 0x3c) {
      continue;
    }

    // Malayalam chillu letters (pure consonants without implicit vowel)
    if (base === 0x0d00 && offset >= 0x7a && offset <= 0x7f) {
      const chillu = { 0x7a: "n", 0x7b: "n", 0x7c: "r", 0x7d: "l", 0x7e: "l", 0x7f: "k" };
      if (chillu[offset]) {
        if (prevConsonant) {
          out += "a";
        }
        out += chillu[offset];
        prevConsonant = false;
        continue;
      }
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
  // 6. FORMATS & DESCRIPTORS ACROSS 10 INDIC LANGUAGES
  // ==========================================
  // --- Audio Device & Chanting Hardware ---
  "श्रव्ययन्त्रम्": "audio device",
  "श्रव्ययन्त्र": "audio device",
  "श्रव्यम्": "audio",
  "श्रव्य": "audio",
  "यन्त्रम्": "device",
  "यन्त्र": "device",
  "ऑडियो": "audio",
  "डिवाइस": "device",
  "ऑडियो डिवाइस": "audio device",
  "ऑडिओ": "audio",
  "डिव्हाइस": "device",
  "ऑडिओ डिव्हाइस": "audio device",
  "ஆடியோ": "audio",
  "சாதனம்": "device",
  "ஆடியோ சாதனம்": "audio device",
  "ఆడియో": "audio",
  "పరికరం": "device",
  "ఆడియో పరికరం": "audio device",
  "ಆಡಿಯೋ": "audio",
  "ಸಾಧನ": "device",
  "ಆಡಿಯೋ ಸಾಧನ": "audio device",
  "ഓഡിയോ": "audio",
  "ഉപകരണം": "device",
  "ഓഡിയോ ഉപകരണം": "audio device",
  "ଅଡିଓ": "audio",
  "ଡିଭାଇସ୍": "device",
  "ଅଡିଓ ଡିଭାଇସ୍": "audio device",
  "অডিও": "audio",
  "ডিভাইস": "device",
  "অডিও ডিভাইস": "audio device",
  "ઑડિયો": "audio",
  "ડિવાઇસ": "device",
  "ઑડિયો ડિવાઇસ": "audio device",

  // --- Books & Paperback ---
  "मृदुबन्धसंस्करणम्": "paperback",
  "मृदुबन्ध-पुस्तकम्": "paperback book",
  "मृदुबन्ध": "paperback",
  "मृदु आवरण": "paperback",
  "पेपरबैक": "paperback",
  "पेपरबॅक": "paperback",
  "मृदू मुखपृष्ठ": "paperback",
  "பேப்பர்பேக்": "paperback",
  "மென் அட்டை": "paperback",
  "పేపర్‌బ్యాక్": "paperback",
  "ಪೇಪರ್‌ಬ್ಯಾಕ್": "paperback",
  "ಮುದ್ರಿತ": "paperback",
  "പേപ്പർബാക്ക്": "paperback",
  "ପେପରବ୍ୟାକ୍": "paperback",
  "পেপারব্যাক": "paperback",
  "પેપરબૅક": "paperback",
  "पुस्तक": "book paperback",
  "किताब": "book paperback",
  "ग्रन्थ": "book paperback",
  "पुस्तके": "book paperback",
  "ಪುಸ್ತಕ": "book paperback",
  "ಪುಸ್ತಕಗಳು": "books",
  "ಪುಸ್ತಕಗಳ": "books",
  "ಗ್ರಂಥ": "book paperback",
  "புத்தகம்": "book paperback",
  "நூல்": "book paperback",
  "పుస్తకం": "book paperback",
  "పుస్తకాలు": "books",
  "বই": "book paperback",
  "ବହି": "book paperback",
  "ચોપડી": "book paperback",

  // --- Flipbooks ---
  "फ्लिपबुक": "flipbook",
  "फ्लिप बुक": "flipbook",
  "फ्लिप्-पुस्तकम्": "flipbook",
  "ஃபிளிப்புக்": "flipbook",
  "ஃபிளிப் புக்": "flipbook",
  "ఫ్లిప్‌బుక్": "flipbook",
  "ఫ్లిప్ బుక్": "flipbook",
  "ಫ್ಲಿಪ್‌ಬುಕ್": "flipbook",
  "ಫ್ಲಿಪ್ ಬುಕ್": "flipbook",
  "ഫ്ലിപ്ബുക്ക്": "flipbook",
  "ഫ്ലിപ് ബുക്ക്": "flipbook",
  "ଫ୍ଲିପବୁକ୍": "flipbook",
  "ফ্লিপবুক": "flipbook",
  "ફ્લિપબુક": "flipbook",

  // --- Kindle & eBooks ---
  "किण्डल-संस्करणम्": "kindle edition ebook",
  "किण्डल-संस्करण": "kindle edition ebook",
  "किण्डल": "kindle",
  "किंडल संस्करण": "kindle edition ebook",
  "किंडल": "kindle",
  "किंडल आवृत्ती": "kindle edition ebook",
  "கிண்டில் பதிப்பு": "kindle edition ebook",
  "கிண்டில்": "kindle",
  "కిండిల్ ఎడిషన్": "kindle edition ebook",
  "కిండిల్": "kindle",
  "ಕಿಂಡಲ್ ಆವೃತ್ತಿ": "kindle edition ebook",
  "ಕಿಂಡಲ್": "kindle",
  "കിൻഡിൽ പതിപ്പ്": "kindle edition ebook",
  "കിൻഡിൽ": "kindle",
  "କିଣ୍ଡଲ୍ ସଂସ୍କରଣ": "kindle edition ebook",
  "କିଣ୍ଡଲ୍": "kindle",
  "কিন্ডল সংস্করণ": "kindle edition ebook",
  "কিন্ডল": "kindle",
  "કિન્ડલ આવૃત્તિ": "kindle edition ebook",
  "કિન્ડલ": "kindle",
  "ई-बुक": "ebook kindle",
  "ई-पुस्तकम्": "ebook",
  "डिजिटल पुस्तक": "ebook kindle",
  "इ-बुक": "ebook",
  "மின்னூல்": "ebook",
  "இ-புக்": "ebook",
  "ఈ-బుక్": "ebook",
  "ಇ-ಪುಸ್ತಕ": "ebook",
  "ಡಿಜಿಟಲ್ ಪುಸ್ತಕ": "ebook",
  "ഇ-ബുക്ക്": "ebook",
  "ଇ-ବୁକ୍": "ebook",
  "ই-বুক": "ebook",
  "ઈ-બુક": "ebook",

  // --- Web Version ---
  "वेब्-संस्करणम्": "web version",
  "वेब्-संस्करण": "web version",
  "वेब संस्करण": "web version",
  "वेब आवृत्ती": "web version",
  "வெப் பதிப்பு": "web version",
  "இணையப் பதிப்பு": "web version",
  "వెబ్ వెర్షన్": "web version",
  "ವೆಬ್ ಆವೃತ್ತಿ": "web version",
  "ಆನ್‌ಲೈನ್ ಓದು": "web version",
  "വെബ് പതിപ്പ്": "web version",
  "ୱେବ୍ ସଂସ୍କରଣ": "web version",
  "ওয়েব সংস্করণ": "web version",
  "વેબ આવૃત્તિ": "web version",

  // --- USB / Pendrive ---
  "पेनड्राइव": "pendrive",
  "पेन ड्राइव": "pendrive",
  "पेनड्राइव में": "pendrive",
  "पेन्ड्राइव्": "pendrive",
  "पेन्ड्राइव्-मध्ये": "pendrive",
  "पेनड्राइव्ह": "pendrive",
  "पेनड्राइव्हमध्ये": "pendrive",
  "பென்டிரைவ்": "pendrive",
  "பென் டிரைவ்": "pendrive",
  "பென்டிரைவில்": "pendrive",
  "పెన్‌డ్రైవ్": "pendrive",
  "పెన్ డ్రైవ్": "pendrive",
  "పెన్‌డ్రైవ్‌లో": "pendrive",
  "ಪೆನ್‌ಡ್ರೈವ್": "pendrive",
  "ಪೆನ್ ಡ್ರೈವ್": "pendrive",
  "ಪೆನ್‌ಡ್ರೈವ್‌ನಲ್ಲಿ": "pendrive",
  "പെൻഡ്രൈവ്": "pendrive",
  "പെൻഡ്രൈവിൽ": "pendrive",
  "ପେନଡ୍ରାଇଭ୍": "pendrive",
  "ପେନଡ୍ରାଇଭ୍‌ରେ": "pendrive",
  "পেনড্রাইভ": "pendrive",
  "পেনড্রাইভে": "pendrive",
  "પેનડ્રાઇવ": "pendrive",
  "પેનડ્રાઇવમાં": "pendrive",
  "यूएसबी": "usb stick",
  "ಯುಎಸ್ ಬಿ": "usb stick",

  // --- Bulk Purchase / Orders ---
  "बृहत्क्रयणम्": "bulk purchase",
  "बृहदादेशः": "bulk order",
  "थोक खरीद": "bulk purchase",
  "थोक ऑर्डर": "bulk order",
  "घाऊक खरेदी": "bulk purchase",
  "घाऊक ऑर्डर": "bulk order",
  "மொத்தக் கொள்முதல்": "bulk purchase",
  "மொத்த ஆர்டர்": "bulk order",
  "టోకు కొనుగోలు": "bulk purchase",
  "టోకు ఆర్డర్": "bulk order",
  "ಸಗಟು ಖರೀದಿ": "bulk purchase",
  "ಸಗಟು ಆರ್ಡರ್": "bulk order",
  "മൊത്ത വാങ്ങൽ": "bulk purchase",
  "മൊത്ത ഓർഡർ": "bulk order",
  "ଥୋକ କ୍ରୟ": "bulk purchase",
  "ଥୋକ ଅର୍ଡର୍": "bulk order",
  "পাইকারি ক্রয়": "bulk purchase",
  "পাইকারি অর্ডার": "bulk order",
  "જથ્થાબંધ ખરીદી": "bulk purchase",
  "જથ્થાબંધ ઑર્ડર": "bulk order",

  // --- Festival Offers ---
  "उत्सव-उपहारः": "festival offer",
  "उत्सव उपहार": "festival offer",
  "त्योहार ऑफ़र": "festival offer",
  "त्योहार ऑफर": "festival offer",
  "सण ऑफर": "festival offer",
  "பண்டிகை சலுகை": "festival offer",
  "పండుగ ఆఫర్": "festival offer",
  "ಹಬ್ಬದ ಕೊಡುಗೆ": "festival offer",
  "ഉത്സവ ഓഫർ": "festival offer",
  "ପର୍ବ ଅଫର୍": "festival offer",
  "উৎসব অফার": "festival offer",
  "તહેવાર ઑફર": "festival offer",

  // --- Learning Paths (My Path) ---
  "मम मार्गः": "my path",
  "मेरा पथ": "my path",
  "माझा मार्ग": "my path",
  "என் பாதை": "my path",
  "నా మార్గం": "my path",
  "ನನ್ನ ಹಾದಿ": "my path",
  "ಎന്റെ പാത": "my path",
  "ମୋ ପଥ": "my path",
  "আমার পথ": "my path",
  "મારો માર્ગ": "my path",

  // Audiences
  "बच्चे": "kids",
  "बालाः": "kids",
  "बालानां": "kids",
  "लहान मुले": "kids",
  "குழந்தைகள்": "kids",
  "పిల్లలు": "kids",
  "ಮಕ್ಕಳು": "kids",
  "കുട്ടികൾ": "kids",
  "ପିଲା": "kids",
  "শিশু": "kids",
  "બાળકો": "kids",
  "स्कूली बच्चे": "school children",
  "विद्यालयछात्राः": "school children",
  "शालेय मुले": "school children",
  "பள்ளி மாணவர்கள்": "school children",
  "పాఠశాల విద్యార్థులు": "school children",
  "ಶಾಲಾ ಮಕ್ಕಳು": "school children",
  "സ്കൂൾ കുട്ടികൾ": "school children",
  "ବିଦ୍ୟାଳୟ ଛାତ୍ରଛାତ୍ରୀ": "school children",
  "স্কুল পড়ুয়া": "school children",
  "શાળાના બાળકો": "school children",
  "विशेष बच्चे": "special children",
  "विशेषबालाः": "special children",
  "विशेष गरजा असलेली मुले": "special children",
  "சிறப்புக் குழந்தைகள்": "special children",
  "ప్రత్యేక అవసరాల పిల్లలు": "special children",
  "ವಿಶೇಷ ಮಕ್ಕಳು": "special children",
  "പ്രത്യേക പരിഗണന അർಹിക്കുന്ന കുട്ടികൾ": "special children",
  "ସ୍ୱତନ୍ତ୍ର ପିଲା": "special children",
  "বিশেষ চাহিদাসম্পন্ন শিশু": "special children",
  "વિશેષ બાળકો": "special children",
  "विश्वविद्यालय": "university",
  "विश्वविद्यालयः": "university",
  "विद्यापीठ": "university",
  "பல்கலைக்கழகம்": "university",
  "విశ్వవిద్యాలయం": "university",
  "ವಿಶ್ವವಿದ್ಯಾಲಯ": "university",
  "സർവ്വകലാശാല": "university",
  "ବିଶ୍ୱବିଦ୍ୟାଳୟ": "university",
  "বিশ্ববিদ্যালয়": "university",
  "યુનિવર્સિટી": "university",

  // Levels
  "प्रारंभिक": "beginner",
  "प्रारम्भिकः": "beginner",
  "प्राथमिक": "beginner",
  "தொடக்க நிலை": "beginner",
  "ప్రారంభ స్థాయి": "beginner",
  "ಆರಂಭಿಕ ಹಂತ": "beginner",
  "തുടക്കക്കാർ": "beginner",
  "ପ୍ରାରମ୍ଭିକ": "beginner",
  "প্রাথমিক": "beginner",
  "પ્રારંભિક": "beginner",
  "उन्नत": "advanced",
  "उन्नतः": "advanced",
  "प्रगत": "advanced",
  "மேம்பட்ட நிலை": "advanced",
  "ఉన్నత స్థాయి": "advanced",
  "ಉನ್ನತ ಹಂತ": "advanced",
  "ഉന്നത തലം": "advanced",
  "ଉନ୍ନତ": "advanced",
  "উন্নত": "advanced",
  "ઉન્નત": "advanced",

  // Subjects
  "मंत्रोच्चार": "chanting",
  "मन्त्रपाठः": "chanting",
  "मंत्रपठण": "chanting",
  "பாராயணம்": "chanting",
  "పారాయణం": "chanting",
  "ಪಠಣ": "chanting",
  "പാരായണം": "chanting",
  "ମନ୍ତ୍ରପାଠ": "chanting",
  "মন্ত্রপাঠ": "chanting",
  "મંત્રપાઠ": "chanting",
  "संस्कृति": "culture",
  "संस्कृतिः": "culture",
  "संस्कृती": "culture",
  "கலாச்சாரம்": "culture",
  "సంస్కృతి": "culture",
  "ಸಂಸ್ಕೃತಿ": "culture",
  "സംസ്കാരം": "culture",
  "ସଂସ୍କୃତି": "culture",
  "সংস্কৃতি": "culture",
  "સંસ્કૃતિ": "culture",
  "स्मरण शक्ति": "memory",
  "स्मृतिः": "memory",
  "स्मरणशक्ती": "memory",
  "நினைவாற்றல்": "memory",
  "జ్ఞాపకశక్తి": "memory",
  "ಸ್ಮರಣಶಕ್ತಿ": "memory",
  "ഓർമ്മശಕ್ತಿ": "memory",
  "ସ୍ମରଣ ଶକ୍ତି": "memory",
  "স্মৃতিশক্তি": "memory",
  "સ્મરણ શક્તિ": "memory",
  "संस्कृत भाषा": "sanskrit language",
  "संस्कृतभाषा": "sanskrit language",
  "சமஸ்கிருத மொழி": "sanskrit language",
  "సంస్కృత భాష": "sanskrit language",
  "ಸಂಸ್ಕೃತ ಭಾಷೆ": "sanskrit language",
  "സംസ്കൃത ഭാഷ": "sanskrit language",
  "ସଂସ୍କୃତ ଭାଷା": "sanskrit language",
  "সংস্কৃত ভাষা": "sanskrit language",
  "સંસ્કૃત ભાષા": "sanskrit language",
  "संस्कृत व्याकरण": "sanskrit grammar",
  "संस्कृतव्याकरणम्": "sanskrit grammar",
  "சமஸ்கிருத இலக்கணம்": "sanskrit grammar",
  "సంస్కృత వ్యాకరణం": "sanskrit grammar",
  "ಸಂಸ್ಕೃತ ವ್ಯಾಕರಣ": "sanskrit grammar",
  "സംസ്കൃത വ്യാകരണം": "sanskrit grammar",
  "ସଂସ୍କୃତ ବ୍ୟାକରଣ": "sanskrit grammar",
  "সংস্কৃত ব্যাকরণ": "sanskrit grammar",
  "સંસ્કૃત વ્યાકરણ": "sanskrit grammar",
  "गतिविधि": "activity",
  "क्रियाकलापः": "activity",
  "उपक्रम": "activity",
  "செயல்பாடு": "activity",
  "కార్యకలాపం": "activity",
  "ಚಟುವಟಿಕೆ": "activity",
  "പ്രവർത്തനം": "activity",
  "କାର୍ଯ୍ୟକଳାପ": "activity",
  "ক্রিয়াকলাপ": "activity",
  "પ્રવૃત્તિ": "activity",

  // --- Other formats & categories ---
  "कॉम्बो": "combo pack",
  "पैक": "combo pack",
  "ಕಾಂಬೋ": "combo pack",
  "ಕಲಿಕಾ ಪ್ಯಾಕ್": "combo learning pack",
  "காம்போ": "combo pack",
  "தொகுப்பு": "combo pack",
  "కాంబో": "combo pack",
  "సెట్": "combo pack",
  "કોમ્બો": "combo pack",
  "কম্বো": "combo pack",
  "କମ୍ବୋ": "combo pack",
  "कैलेंडर": "calendar",
  "पंचांग": "calendar panchanga",
  "ಕ್ಯಾಲೆಂಡರ್": "calendar",
  "ಪಂಚಾಂಗ": "calendar panchanga",
  "ದಿನದರ್ಶಿ": "calendar",
  "நாட்காட்டி": "calendar",
  "பஞ்சாங்கம்": "calendar panchanga",
  "క్యాలెండర్": "calendar",
  "పంచాంగం": "calendar panchanga",
  "કેલેન્ડર": "calendar",
  "ક্যালেন্ডার": "calendar",
  "পঞ্জিকা": "calendar panchanga",
  "କ୍ୟାଲେଣ୍ଡର": "calendar",
  "ପଞ୍ଜିକା": "calendar panchanga",
  "कोर्स": "course products",
  "पाठ्यक्रम": "learning path course",
  "ಕೋರ್ಸ್": "course products",
  "பாடநெறி": "course products",
  "కోర్సు": "course products",

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

  // 0. Direct whole-query product title translation match (from pre-compiled catalog mappings)
  const productTitle = lookupProductTranslation(raw) || lookupProductTranslation(cleaned) || lookupProductTranslation(normalizedCleaned);
  if (productTitle) {
    return {
      isIndic: true,
      language: detection.language,
      script: detection.script,
      nativeName: detection.nativeName,
      originalQuery: raw,
      canonicalQuery: productTitle,
      transliteratedQuery: transliterateIndicToLatin(cleaned),
      isMultilingualMatch: true,
      displayBadge: `${detection.language} Recognized`
    };
  }

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

  // 2. Multi-word phrase search in lexicon with greedy n-gram matching
  const words = cleaned.split(" ").filter(Boolean);
  const matchedCanonicalWords = [];
  let hadLexiconHit = false;
  let i = 0;

  while (i < words.length) {
    // Try 3-word phrase
    if (i + 2 < words.length) {
      const p3 = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      const norm3 = normalizeIndicWord(p3);
      if (MULTILINGUAL_LEXICON[p3] || MULTILINGUAL_LEXICON[norm3]) {
        matchedCanonicalWords.push(MULTILINGUAL_LEXICON[p3] || MULTILINGUAL_LEXICON[norm3]);
        hadLexiconHit = true;
        i += 3;
        continue;
      }
    }

    // Try 2-word phrase
    if (i + 1 < words.length) {
      const p2 = `${words[i]} ${words[i + 1]}`;
      const norm2 = normalizeIndicWord(p2);
      if (MULTILINGUAL_LEXICON[p2] || MULTILINGUAL_LEXICON[norm2]) {
        matchedCanonicalWords.push(MULTILINGUAL_LEXICON[p2] || MULTILINGUAL_LEXICON[norm2]);
        hadLexiconHit = true;
        i += 2;
        continue;
      }
    }

    // Single-word token
    const word = words[i];
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
    i += 1;
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
