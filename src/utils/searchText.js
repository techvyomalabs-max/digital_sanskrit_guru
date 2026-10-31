/**
 * Advanced Offline AI Search Engine for Digital Sanskrit Guru.
 * 
 * Features:
 * - Multi-Entity Website Search: Products, Categories/Formats, and Website Pages (Library, FAQ, Policies, Orders, About, etc.)
 * - Phonetic & Sanskrit Soundex/Transliteration Engine (handling Romanized Sanskrit, anusvaras, aspirated consonants)
 * - Deep Typo-Tolerance & Aggressive Seamless Auto-Correction (instantly corrects severe misspellings like 'kndl', 'bgvad', 'paprback', 'snskrit')
 * - Semantic Synonyms & Sanskrit Knowledge Graph (e.g., 'ebook' -> 'Kindle', 'print' -> 'Paperback', 'vyakarana' -> 'Grammar')
 * - Tiered Relevance Ranking with Category and Format boosting
 * - 100% Client-Side / Offline Capable with zero external network dependencies
 */

import { htmlToPlainText } from "./plainText.js";

export function stripHtml(text) {
  return htmlToPlainText(text);
}

export function foldText(text) {
  return stripHtml(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Phonetic and Sanskrit transliteration normalization:
 * Normalizes common variations in Romanized Sanskrit text.
 */
export function normalizeSanskrit(text) {
  if (!text) return "";
  const s = foldText(text);

  return s
    .replace(/bhagw/g, "bhagav")
    .replace(/sh/g, "s")
    .replace(/ṣ/g, "s")
    .replace(/ś/g, "s")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/w/g, "v")
    .replace(/dh/g, "d")
    .replace(/th/g, "t")
    .replace(/ph/g, "f")
    .replace(/kh/g, "k")
    .replace(/gh/g, "g")
    .replace(/ch/g, "c")
    .replace(/jh/g, "j");
}

/**
 * Advanced Sanskrit and Indian English Phonetic Key Generator.
 * Strips vowels (after initial), collapses double consonants, harmonizes
 * aspirated stops (bh/dh/th/kh/gh/ph), sibilants (s/sh/ṣ/ś), and anusvaras.
 */
export function sanskritPhoneticKey(text) {
  if (!text) return "";
  let s = foldText(text);

  s = s
    .replace(/ph/g, "f")
    .replace(/bh/g, "b")
    .replace(/dh/g, "d")
    .replace(/th/g, "t")
    .replace(/kh/g, "k")
    .replace(/gh/g, "g")
    .replace(/ch/g, "c")
    .replace(/jh/g, "j")
    .replace(/sh/g, "s")
    .replace(/ṣ/g, "s")
    .replace(/ś/g, "s")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/aa/g, "a")
    .replace(/ai/g, "e")
    .replace(/au/g, "o")
    .replace(/w/g, "v")
    .replace(/y/g, "j")
    .replace(/[ṃṅñṇn]/g, "n")
    .replace(/([bcdfghjklmnpqrstvwxyz])\1+/g, "$1");

  if (s.length > 1) {
    const first = s[0];
    const rest = s.slice(1).replace(/[aeiou]/g, "");
    s = first + rest;
  }

  return s.replace(/m$/, "n").replace(/h$/, "");
}

/**
 * Levenshtein distance between two strings (minimum single-character edits).
 */
export function levenshteinDistance(s1, s2) {
  if (s1 === s2) return 0;
  if (!s1) return s2 ? s2.length : 0;
  if (!s2) return s1.length;

  const len1 = s1.length;
  const len2 = s2.length;

  const prevRow = new Array(len2 + 1);
  const currRow = new Array(len2 + 1);

  for (let j = 0; j <= len2; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    currRow[0] = i;
    const char1 = s1[i - 1];

    for (let j = 1; j <= len2; j++) {
      const char2 = s2[j - 1];
      const cost = char1 === char2 ? 0 : 1;

      currRow[j] = Math.min(
        currRow[j - 1] + 1,       // insertion
        prevRow[j] + 1,           // deletion
        prevRow[j - 1] + cost     // substitution
      );
    }

    for (let j = 0; j <= len2; j++) {
      prevRow[j] = currRow[j];
    }
  }

  return prevRow[len2];
}

/**
 * Knowledge Base of Website Pages and Informational Services.
 * Allows searching for help, downloads, policies, accounts, and contact.
 */
export const WEBSITE_PAGES = [
  {
    id: "my-library",
    title: "My Digital Library",
    url: "/my-library",
    icon: "BookOpen",
    badge: "Digital Downloads",
    keywords: ["library", "digital library", "my books", "download", "downloads", "ebooks", "kindle downloads", "web version access", "purchased books", "read online", "stream", "my digital library"],
    description: "Access all your purchased digital products, Kindle files, Flipbooks, and interactive Web Versions in one place."
  },
  {
    id: "shipping-policy",
    title: "Shipping & Delivery Policy",
    url: "/shipping-policy",
    icon: "Truck",
    badge: "Customer Help",
    keywords: ["shipping", "delivery", "dispatch", "courier", "tracking", "postage", "rates", "timelines", "international shipping", "domestic delivery", "delhivery", "dtdc", "package", "transit time"],
    description: "Standard domestic shipping takes 3-7 business days. Track your courier parcel and review international delivery rates."
  },
  {
    id: "faq",
    title: "Frequently Asked Questions (FAQ)",
    url: "/faq",
    icon: "HelpCircle",
    badge: "Help & Support",
    keywords: ["faq", "help", "questions", "answers", "how to buy", "payment failed", "upi", "card", "refund", "return", "digital access", "kindle guide", "help center"],
    description: "Find quick answers to common questions about physical delivery, digital format compatibility, payments, and account setup."
  },
  {
    id: "contact",
    title: "Contact Us & Support",
    url: "/contact",
    icon: "Mail",
    badge: "Help & Support",
    keywords: ["contact", "support", "customer care", "whatsapp", "phone", "email", "address", "call", "helpdesk", "office", "contact us"],
    description: "Reach out to our customer care team via WhatsApp or email for prompt assistance with your orders and learning paths."
  },
  {
    id: "about",
    title: "About Digital Sanskrit Guru",
    url: "/about",
    icon: "Info",
    badge: "About DSG",
    keywords: ["about", "about us", "who we are", "vision", "mission", "sanskrit", "vyoma", "vyoma labs", "guru", "publisher", "team"],
    description: "Empowering every home with classical Sanskrit knowledge through technology, authentic pedagogy, and multimedia publications."
  },
  {
    id: "my-orders",
    title: "My Orders & Tax Invoices",
    url: "/my-orders",
    icon: "Package",
    badge: "My Account",
    keywords: ["orders", "my orders", "invoice", "gst invoice", "order history", "tracking", "receipt", "order status", "past purchases", "tax invoice"],
    description: "Track current shipments, review past order history, and download official GST tax invoices."
  },
  {
    id: "account",
    title: "My Account & Profile",
    url: "/account",
    icon: "User",
    badge: "My Account",
    keywords: ["account", "profile", "addresses", "manage address", "password", "settings", "login details", "phone number", "my profile"],
    description: "Manage your contact information, default delivery addresses, and login credentials."
  },
  {
    id: "wishlist",
    title: "My Wishlist",
    url: "/wishlist",
    icon: "Heart",
    badge: "Shopping",
    keywords: ["wishlist", "saved", "favorites", "saved items", "bookmark"],
    description: "View and manage products you have saved for future learning."
  },
  {
    id: "cart",
    title: "Shopping Cart",
    url: "/cart",
    icon: "ShoppingCart",
    badge: "Shopping",
    keywords: ["cart", "bag", "checkout", "basket", "buy", "order", "items"],
    description: "Review items in your shopping bag and proceed to secure checkout."
  },
  {
    id: "redeem-gift",
    title: "Redeem Gift Card / Voucher",
    url: "/redeem-gift",
    icon: "Gift",
    badge: "Offers & Gifts",
    keywords: ["redeem", "gift", "gift card", "voucher", "coupon code", "promo", "discount code"],
    description: "Redeem store gift cards, promotional vouchers, or complimentary learning coupons."
  },
  {
    id: "privacy-policy",
    title: "Privacy Policy",
    url: "/privacy-policy",
    icon: "Shield",
    badge: "Legal",
    keywords: ["privacy", "privacy policy", "data protection", "gdpr", "dpdp", "cookies", "security"],
    description: "Learn how we protect and safeguard your personal information in compliance with DPDP Act 2023."
  },
  {
    id: "terms-and-conditions",
    title: "Terms and Conditions",
    url: "/terms-and-conditions",
    icon: "FileText",
    badge: "Legal",
    keywords: ["terms", "conditions", "terms of service", "user agreement", "cancellation", "refund policy", "digital rights"],
    description: "Store terms of service, payment processing policies, and digital intellectual property terms."
  }
];

/**
 * Store Categories & Product Formats Directory.
 */
export const STORE_CATEGORIES = [
  {
    name: "Web Version",
    icon: "🌐",
    aliases: ["web", "web version", "webversion", "browser", "read online", "online reader", "stream", "digital reader"],
    description: "Interactive online reader with audio sync, translations, and search"
  },
  {
    name: "E-Book - Kindle",
    icon: "📱",
    aliases: ["kindle", "ebook", "e-book", "mobi", "kndl", "amazon kindle", "digital book", "electronic book", "kindel"],
    description: "Optimized e-books compatible with Kindle e-readers and mobile apps"
  },
  {
    name: "Book - Paperback",
    icon: "📖",
    aliases: ["paperback", "book", "books", "paper", "print", "physical", "hardcopy", "paprback", "papr", "softcover"],
    description: "High quality printed books delivered directly to your doorstep"
  },
  {
    name: "Combo",
    icon: "🎁",
    aliases: ["combo", "bundle", "set", "pack", "collection", "all in one", "complete set"],
    description: "Curated learning bundles combining physical books and digital access"
  },
  {
    name: "Flipbook",
    icon: "📑",
    aliases: ["flipbook", "flip book", "3d book", "interactive book", "flpbook"],
    description: "Page-flipping digital edition for tablets and desktop browsers"
  },
  {
    name: "Learning Path",
    icon: "🎓",
    aliases: ["learning path", "learningpath", "course", "curriculum", "syllabus", "beginner path"],
    description: "Step-by-step guided Sanskrit learning pathways for all ages"
  },
  {
    name: "Course Products",
    icon: "🎯",
    aliases: ["course", "courses", "classes", "tutorials", "lessons", "training"],
    description: "Structured self-paced courses with graded exercises and audios"
  },
  {
    name: "Audio Device",
    icon: "🎧",
    aliases: ["audio", "audio device", "sound", "voice", "player", "speaker", "chanting box", "chntng", "mp3"],
    description: "Dedicated audio chanting players and pre-loaded audio devices"
  },
  {
    name: "USB Stick",
    icon: "💾",
    aliases: ["usb", "usb stick", "pen drive", "pendrive", "flash drive", "memory stick"],
    description: "Offline digital content loaded onto plug-and-play USB flash drives"
  },
  {
    name: "Bulk Products",
    icon: "📦",
    aliases: ["bulk", "wholesale", "bulk orders", "institutions", "schools", "gurukula"],
    description: "Discounted multi-quantity packs for schools, temples, and study groups"
  },
  {
    name: "Festival Offer",
    icon: "✨",
    aliases: ["festival", "festival offer", "festive", "discount", "sale", "offer", "special offer"],
    description: "Special seasonal festival discounts and complimentary gift packs"
  },
  {
    name: "Calendar - Paperback",
    icon: "📅",
    aliases: ["calendar", "panchanga", "almanac", "date", "year calendar"],
    description: "Traditional Sanskrit Vedic calendars and date planners"
  },
  {
    name: "Grammar",
    icon: "📜",
    aliases: ["grammar", "vyakarana", "panini", "ashtadhyayi", "dhatu", "subanta", "tinganta", "grammer", "vyakaran"],
    description: "Classical Sanskrit grammar guides, verb tables, and declining charts"
  },
  {
    name: "Scriptures",
    icon: "🕉️",
    aliases: ["scriptures", "vedas", "upanishads", "purana", "shastra", "stotra", "sacred", "itihasa", "upnishd"],
    description: "Authentic Sanskrit moola texts with word-by-word meanings and commentaries"
  },
  {
    name: "Gita",
    icon: "🏹",
    aliases: ["gita", "bhagavad gita", "geeta", "bgvad", "bhagavat", "krishna", "arjuna"],
    description: "Bhagavad Gita study guides, chapter-wise chanting, and commentaries"
  },
  {
    name: "Chanting",
    icon: "🪕",
    aliases: ["chanting", "chant", "stotram", "stotra", "shloka", "sloka", "mantra", "suktam", "chntng"],
    description: "Traditional stotras, suktams, and chanting audio guides with notation"
  }
];

/**
 * Direct Canonical Typo & Slang Corrections Dictionary.
 */
export const CANONICAL_CORRECTIONS = {
  kndl: "kindle",
  kindel: "kindle",
  paprback: "paperback",
  papr: "paperback",
  bgvad: "bhagavad",
  bagvad: "bhagavad",
  bhagwad: "bhagavad",
  geeta: "gita",
  gt: "gita",
  snskrit: "sanskrit",
  sansrit: "sanskrit",
  sanskrt: "sanskrit",
  samskrita: "sanskrit",
  shippng: "shipping",
  delivry: "delivery",
  libary: "library",
  librari: "library",
  chntng: "chanting",
  flpbook: "flipbook",
  grammer: "grammar",
  vyakran: "vyakarana",
  panneeni: "panini",
  dharama: "dharma",
  upnishd: "upanishad",
  ramyan: "ramayana",
  ashtadyayi: "ashtadhyayi",
  pnchtntra: "panchatantra",
  dhaturpam: "dhaturupa"
};

/**
 * Semantic Synonyms & Semantic Aliases Map.
 */
export const SEMANTIC_SYNONYMS = {
  kindle: ["ebook", "e-book", "digital", "mobi", "electronic", "kndl", "kindel"],
  ebook: ["kindle", "e-book", "digital", "pdf", "mobi", "electronic"],
  paperback: ["book", "books", "paper", "print", "physical", "hardcopy", "softcover", "paprback", "papr"],
  book: ["paperback", "print", "books", "publication"],
  "web version": ["web", "online", "browser", "stream", "reader", "webversion"],
  flipbook: ["3d", "interactive", "flpbook", "flip book", "page flip"],
  audio: ["sound", "mp3", "voice", "listen", "chant", "player", "speaker", "audio device"],
  usb: ["pen drive", "pendrive", "flash drive", "stick", "usb stick", "memory"],
  course: ["learning path", "classes", "tutorial", "lessons", "path", "curriculum"],
  combo: ["bundle", "set", "pack", "collection", "all in one"],
  calendar: ["panchanga", "almanac", "date", "year", "panchang"],

  gita: ["bhagavad gita", "geeta", "krishna", "arjuna", "mahabharata", "bgvad", "bhagvat", "bhagavat"],
  bhagavad: ["gita", "bhagavat", "bhagavan", "lord krishna", "bgvad", "bhagwad"],
  ramayana: ["valmiki", "rama", "sundarakanda", "balakanda", "ayodhya", "ramayan", "ram"],
  grammar: ["vyakarana", "panini", "dhatu", "sutra", "ashtadhyayi", "subanta", "tinganta", "grammer", "vyakaran"],
  vyakarana: ["grammar", "panini", "dhatu", "sutra", "rules", "declensions"],
  chanting: ["stotram", "stotra", "shloka", "sloka", "mantra", "suktam", "sahasranama", "chntng", "chant"],
  stotram: ["stotra", "chanting", "shloka", "praise", "hymn", "prayer"],
  sanskrit: ["samskrita", "devanagari", "classical", "vedic", "language", "snskrit", "sansrit", "sanskrt"],
  dharma: ["shastra", "smriti", "ethics", "duty", "righteousness", "sanatana", "dharama"],
  vedas: ["upanishad", "samhita", "brahmana", "aranyaka", "vedic", "veda", "upnishd"],
  upanishad: ["vedanta", "philosophy", "upanishads", "mandukya", "katha", "upnishd"],

  shipping: ["delivery", "dispatch", "courier", "tracking", "postage", "rates", "shippng", "delivry"],
  delivery: ["shipping", "dispatch", "courier", "tracking", "timeline", "order status"],
  library: ["downloads", "my books", "digital access", "purchased", "stream", "libary", "librari"],
  faq: ["help", "questions", "answers", "support", "issues", "query", "problems"],
  contact: ["support", "whatsapp", "phone", "email", "address", "call", "helpdesk"],
  invoice: ["receipt", "bill", "tax invoice", "gst", "download invoice", "orders"],
  order: ["orders", "purchase", "tracking", "history", "my orders", "status"],
  account: ["profile", "address", "password", "settings", "login"],
  wishlist: ["favorites", "saved", "bookmark", "likes"]
};

/**
 * Evaluates the match quality between a single query word and a candidate word.
 * Returns: { matched: boolean, quality: number, type: string }
 */
export function matchWord(queryWord, targetWord) {
  if (!queryWord || !targetWord) return { matched: false, quality: 0, type: "none" };

  // 1. Exact match
  if (targetWord === queryWord) {
    return { matched: true, quality: 1.0, type: "exact" };
  }

  // 2. Starts with / prefix
  if (targetWord.startsWith(queryWord)) {
    return { matched: true, quality: 0.9, type: "prefix" };
  }

  // 3. Substring
  if (targetWord.includes(queryWord)) {
    return { matched: true, quality: 0.8, type: "substring" };
  }

  // 4. Sanskrit transliteration match
  const normQuery = normalizeSanskrit(queryWord);
  const normTarget = normalizeSanskrit(targetWord);
  if (normTarget === normQuery) {
    return { matched: true, quality: 0.85, type: "translit_exact" };
  }
  if (normTarget.startsWith(normQuery)) {
    return { matched: true, quality: 0.8, type: "translit_prefix" };
  }
  if (normTarget.includes(normQuery)) {
    return { matched: true, quality: 0.75, type: "translit_sub" };
  }

  // 5. Sanskrit Phonetic key equivalence
  if (queryWord.length >= 3 && targetWord.length >= 3) {
    const qPhone = sanskritPhoneticKey(queryWord);
    const tPhone = sanskritPhoneticKey(targetWord);
    if (qPhone && tPhone && qPhone === tPhone) {
      return { matched: true, quality: 0.75, type: "phonetic" };
    }
  }

  // 6. Fuzzy typo tolerance (Levenshtein edit-distance)
  if (queryWord.length >= 3) {
    const maxDist = queryWord.length >= 6 ? 2 : 1;

    const dist = levenshteinDistance(queryWord, targetWord);
    if (dist <= maxDist) {
      const quality = Math.max(0.4, 0.7 - dist * 0.15);
      return { matched: true, quality, type: "fuzzy" };
    }

    const normDist = levenshteinDistance(normQuery, normTarget);
    if (normDist <= maxDist) {
      const quality = Math.max(0.4, 0.65 - normDist * 0.15);
      return { matched: true, quality, type: "fuzzy_translit" };
    }
  }

  return { matched: false, quality: 0, type: "none" };
}

function matchWordInList(queryWord, wordList) {
  let best = { matched: false, quality: 0, type: "none" };
  for (const tWord of wordList) {
    const res = matchWord(queryWord, tWord);
    if (res.matched && res.quality > best.quality) {
      best = res;
      if (best.quality === 1.0) break;
    }
  }
  return best;
}

/**
 * Checks if a query corresponds directly to a category/format name or alias.
 */
function isCategoryQuery(query, category) {
  if (!query || !category) return false;
  const fQuery = foldText(query);
  const fCat = foldText(category);

  if (fCat === fQuery || fCat.includes(fQuery)) return true;

  for (const catDef of STORE_CATEGORIES) {
    if (foldText(catDef.name) === fCat) {
      if (catDef.aliases.some((a) => foldText(a) === fQuery || fQuery.includes(foldText(a)))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Scores a product against a search query.
 * Produces accurate, deterministic ranking:
 * 100: Exact title match
 * 80: Title starts with query
 * 75: Category exact match (e.g. searching 'kindle' boosts all Kindle items)
 * 60: Title contains full query string / Category alias match
 * 50: Title words start with query words
 * 40: All query words found in title
 * 35: Compacted match (ignoring whitespace)
 * 25: All query words in title or category
 * 20: Typo/Fuzzy or Sanskrit transliterated match in title
 * 15: Typo/Fuzzy match in category or description
 * 10: Description-only match
 * 0: No match
 */
export function scoreProduct(product, query) {
  const foldedQuery = foldText(query);
  if (!foldedQuery) return 1;

  const words = foldedQuery.split(" ").filter(Boolean);
  if (words.length === 0) return 1;

  const foldedName = foldText(product?.name);
  const foldedCategory = foldText(product?.category);
  const foldedDesc = foldText(product?.description);
  const foldedAbout = foldText(product?.aboutProduct);

  const compactedName = foldedName.replace(/\s+/g, "");
  const compactedQuery = foldedQuery.replace(/\s+/g, "");
  const compactedMatch = Boolean(
    compactedName && compactedQuery && compactedName.includes(compactedQuery)
  );

  const nameWords = foldedName.split(" ").filter(Boolean);
  const catWords = foldedCategory.split(" ").filter(Boolean);
  const descWords = foldedDesc.split(" ").filter(Boolean);

  // Exact tier checks (highest precision)
  if (foldedName === foldedQuery) return 100;
  if (foldedName.startsWith(foldedQuery)) return 80;

  // Category boost: If user explicitly searches for a category (e.g. 'kindle', 'paperback', 'web version')
  if (isCategoryQuery(foldedQuery, foldedCategory)) {
    // If name also matches, top score 90
    if (foldedName.includes(foldedQuery) || words.some((w) => foldedName.includes(w))) {
      return 90;
    }
    return 75;
  }

  if (foldedName.includes(foldedQuery)) return 60;

  if (nameWords.length > 0 && words.every((w) => nameWords.some((nw) => nw.startsWith(w)))) {
    return 50;
  }

  const allWordsInNameExact = words.every((w) => foldedName.includes(w));
  if (allWordsInNameExact) return 40;

  if (compactedMatch) return 35;

  const allWordsInNameOrCatExact = words.every(
    (w) => foldedName.includes(w) || foldedCategory.includes(w)
  );
  if (allWordsInNameOrCatExact) {
    return 25;
  }

  // Multi-word token inspection including typo tolerance, Sanskrit transliteration, and phonetics
  let allWordsMatched = true;
  let hasFuzzyOrTranslitInName = false;
  let allWordsInDescOnly = true;

  for (const w of words) {
    const nameMatch = matchWordInList(w, nameWords);
    if (nameMatch.matched) {
      allWordsInDescOnly = false;
      if (nameMatch.type.startsWith("fuzzy") || nameMatch.type.startsWith("translit") || nameMatch.type === "phonetic") {
        hasFuzzyOrTranslitInName = true;
      }
      continue;
    }

    const catMatch = matchWordInList(w, catWords);
    if (catMatch.matched) {
      allWordsInDescOnly = false;
      continue;
    }

    const descMatch = matchWordInList(w, descWords);
    if (descMatch.matched) {
      continue;
    }

    // Check aboutProduct as well
    if (foldedAbout && foldText(foldedAbout).includes(w)) {
      continue;
    }

    allWordsMatched = false;
    break;
  }

  if (allWordsMatched) {
    if (hasFuzzyOrTranslitInName) {
      return 20;
    }
    if (allWordsInDescOnly) {
      return 10;
    }
    return 15;
  }

  // Fallback: Check if the entire folded query transliterates or fuzzily matches the title
  const normQuery = normalizeSanskrit(foldedQuery);
  const normName = normalizeSanskrit(foldedName);
  if (normName && normQuery && (normName.includes(normQuery) || normQuery.includes(normName))) {
    return 20;
  }

  // If query is a single word and matches title with edit distance <= 2 or phonetic equivalence
  if (words.length === 1 && foldedQuery.length >= 3) {
    const queryPhone = sanskritPhoneticKey(foldedQuery);
    for (const nw of nameWords) {
      if (sanskritPhoneticKey(nw) === queryPhone) {
        return 20;
      }
      const maxD = foldedQuery.length >= 6 ? 2 : 1;
      if (levenshteinDistance(foldedQuery, nw) <= maxD) {
        return 20;
      }
    }
  }

  return 0;
}

/**
 * Searches and ranks store categories and product formats matching the query.
 * Returns an array of matching category objects with live product counts.
 */
export function searchCategories(query, catalogProducts = []) {
  if (!query) return [];
  const foldedQuery = foldText(query);
  if (!foldedQuery || foldedQuery.length < 2) return [];

  // Tally live product count per category
  const productCounts = {};
  if (Array.isArray(catalogProducts)) {
    catalogProducts.forEach((p) => {
      const cat = p?.category ? String(p.category).trim() : "General";
      productCounts[cat] = (productCounts[cat] || 0) + 1;
    });
  }

  const results = [];
  for (const catDef of STORE_CATEGORIES) {
    const foldedName = foldText(catDef.name);
    const count = productCounts[catDef.name] || 0;

    let matched = false;
    let score = 0;
    let matchType = "none";

    // 1. Direct name match
    if (foldedName === foldedQuery) {
      matched = true;
      score = 100;
      matchType = "exact";
    } else if (foldedName.startsWith(foldedQuery)) {
      matched = true;
      score = 80;
      matchType = "prefix";
    } else if (foldedName.includes(foldedQuery) || foldedQuery.includes(foldedName)) {
      matched = true;
      score = 65;
      matchType = "substring";
    } else {
      // 2. Alias match
      for (const alias of catDef.aliases) {
        const foldedAlias = foldText(alias);
        if (foldedAlias === foldedQuery) {
          matched = true;
          score = 90;
          matchType = "alias_exact";
          break;
        } else if (foldedAlias.startsWith(foldedQuery)) {
          matched = true;
          score = 75;
          matchType = "alias_prefix";
          break;
        } else if (foldedAlias.includes(foldedQuery) || foldedQuery.includes(foldedAlias)) {
          matched = true;
          score = 60;
          matchType = "alias_sub";
          break;
        } else if (sanskritPhoneticKey(foldedQuery) === sanskritPhoneticKey(foldedAlias)) {
          matched = true;
          score = 65;
          matchType = "phonetic";
          break;
        } else if (foldedQuery.length >= 3 && levenshteinDistance(foldedQuery, foldedAlias) <= 1) {
          matched = true;
          score = 55;
          matchType = "fuzzy";
          break;
        }
      }
    }

    if (matched) {
      results.push({
        name: catDef.name,
        icon: catDef.icon || "📚",
        description: catDef.description,
        count,
        score,
        matchType,
        url: `/collection?category=${encodeURIComponent(catDef.name)}`
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Searches website pages, documentation, policies, and services.
 * Returns an array of matching page cards with icons and descriptions.
 */
export function searchPages(query) {
  if (!query) return [];
  const foldedQuery = foldText(query);
  if (!foldedQuery || foldedQuery.length < 2) return [];

  const results = [];
  for (const page of WEBSITE_PAGES) {
    const foldedTitle = foldText(page.title);
    const foldedDesc = foldText(page.description);
    let matched = false;
    let score = 0;
    let matchType = "none";

    // 1. Title match
    if (foldedTitle === foldedQuery) {
      matched = true;
      score = 100;
      matchType = "exact";
    } else if (foldedTitle.startsWith(foldedQuery)) {
      matched = true;
      score = 80;
      matchType = "prefix";
    } else if (foldedTitle.includes(foldedQuery) || foldedQuery.includes(foldedTitle)) {
      matched = true;
      score = 60;
      matchType = "title_sub";
    } else {
      // 2. Keyword search
      for (const kw of page.keywords) {
        const foldedKw = foldText(kw);
        if (foldedKw === foldedQuery) {
          matched = true;
          score = 90;
          matchType = "keyword_exact";
          break;
        } else if (foldedKw.startsWith(foldedQuery) || foldedQuery.startsWith(foldedKw)) {
          matched = true;
          score = 75;
          matchType = "keyword_prefix";
          break;
        } else if (foldedKw.includes(foldedQuery) || foldedQuery.includes(foldedKw)) {
          matched = true;
          score = 55;
          matchType = "keyword_sub";
          break;
        } else if (sanskritPhoneticKey(foldedQuery) === sanskritPhoneticKey(foldedKw)) {
          matched = true;
          score = 65;
          matchType = "phonetic";
          break;
        } else if (foldedQuery.length >= 4 && levenshteinDistance(foldedQuery, foldedKw) <= 1) {
          matched = true;
          score = 50;
          matchType = "fuzzy";
          break;
        }
      }

      if (!matched && foldedDesc.includes(foldedQuery)) {
        matched = true;
        score = 30;
        matchType = "description";
      }
    }

    if (matched) {
      results.push({
        id: page.id,
        title: page.title,
        url: page.url,
        icon: page.icon,
        badge: page.badge,
        category: page.category,
        description: page.description,
        score,
        matchType
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Intelligent Multi-Layer Auto-Corrector.
 * Corrects user queries (slang, spelling mistakes, Sanskrit transliteration errors)
 * using canonical dictionaries, phonetic key hashing, and Levenshtein edit distance.
 */
export function autoCorrectQuery(query, catalogProducts = []) {
  if (!query) return { originalQuery: "", correctedQuery: "", hasCorrection: false, confidence: 0 };
  const foldedQuery = foldText(query);
  const words = foldedQuery.split(" ").filter(Boolean);
  if (words.length === 0) return { originalQuery: query, correctedQuery: query, hasCorrection: false, confidence: 0 };

  // Build canonical vocabulary from catalog and services
  const vocabulary = new Map();

  function addWord(text, weight = 1) {
    if (!text) return;
    foldText(text).split(" ").filter((w) => w.length >= 3).forEach((w) => {
      vocabulary.set(w, (vocabulary.get(w) || 0) + weight);
    });
  }

  STORE_CATEGORIES.forEach((c) => {
    addWord(c.name, 10);
  });
  WEBSITE_PAGES.forEach((p) => {
    addWord(p.title, 8);
    p.keywords.forEach((k) => addWord(k, 6));
  });
  if (Array.isArray(catalogProducts)) {
    catalogProducts.forEach((p) => {
      addWord(p?.name, 10);
      addWord(p?.category, 8);
    });
  }

  let hasCorrection = false;
  let totalConfidence = 0;
  const correctedWords = [];

  for (const w of words) {
    // 1. Direct canonical typo dictionary check
    if (CANONICAL_CORRECTIONS[w]) {
      hasCorrection = true;
      correctedWords.push(CANONICAL_CORRECTIONS[w]);
      totalConfidence += 1.0;
      continue;
    }

    // 2. Exact match in vocabulary
    if (vocabulary.has(w)) {
      correctedWords.push(w);
      totalConfidence += 1.0;
      continue;
    }

    // 3. Sanskrit Phonetic key matching against vocabulary
    const phone = sanskritPhoneticKey(w);
    let bestPhonetic = null;
    let bestPWeight = 0;

    for (const [vWord, weight] of vocabulary.entries()) {
      if (sanskritPhoneticKey(vWord) === phone) {
        if (weight > bestPWeight) {
          bestPWeight = weight;
          bestPhonetic = vWord;
        }
      }
    }

    if (bestPhonetic && bestPhonetic !== w) {
      hasCorrection = true;
      correctedWords.push(bestPhonetic);
      totalConfidence += 0.85;
      continue;
    }

    // 4. Levenshtein edit distance against vocabulary
    let bestFuzzy = null;
    let bestDist = Infinity;
    let bestFWeight = 0;
    const maxD = w.length >= 6 ? 2 : 1;

    for (const [vWord, weight] of vocabulary.entries()) {
      const d = levenshteinDistance(w, vWord);
      if (d <= maxD) {
        if (d < bestDist || (d === bestDist && weight > bestFWeight)) {
          bestDist = d;
          bestFuzzy = vWord;
          bestFWeight = weight;
        }
      }
    }

    if (bestFuzzy && bestFuzzy !== w) {
      hasCorrection = true;
      correctedWords.push(bestFuzzy);
      totalConfidence += Math.max(0.4, 0.8 - bestDist * 0.2);
      continue;
    }

    // Keep word as is if no confident correction found
    correctedWords.push(w);
    totalConfidence += 0.5;
  }

  const correctedQuery = correctedWords.join(" ");
  const avgConfidence = words.length > 0 ? totalConfidence / words.length : 0;

  return {
    originalQuery: query,
    correctedQuery,
    hasCorrection: hasCorrection && correctedQuery !== foldedQuery,
    confidence: avgConfidence
  };
}

/**
 * Legacy "Did you mean?" search suggestion generator for backward compatibility.
 */
export function getSearchSuggestion(query, products) {
  if (!query) return null;
  const result = autoCorrectQuery(query, products);
  return result.hasCorrection ? result.correctedQuery : null;
}

/**
 * Universal Multi-Entity Website Search Engine.
 * Searches Products, Categories/Formats, and Website Pages with seamless auto-correction.
 */
export function searchWebsite(query, options = {}) {
  const { catalogProducts = [], enableAutoCorrection = true } = options;

  const rawQuery = String(query || "").trim();
  if (!rawQuery || rawQuery.length < 2) {
    return {
      query: rawQuery,
      effectiveQuery: rawQuery,
      isAutoCorrected: false,
      autoCorrection: null,
      matchingCategories: [],
      matchingPages: [],
      matchingProducts: [],
      totalProductsCount: 0,
      totalResultsCount: 0
    };
  }

  // 1. Check raw product matches
  const rawScored = [];
  if (Array.isArray(catalogProducts)) {
    for (const p of catalogProducts) {
      const s = scoreProduct(p, rawQuery);
      if (s > 0) {
        rawScored.push({ ...p, _score: s });
      }
    }
  }

  // 2. Evaluate auto-correction
  const correction = autoCorrectQuery(rawQuery, catalogProducts);
  let effectiveQuery = rawQuery;
  let isAutoCorrected = false;

  if (enableAutoCorrection && correction.hasCorrection) {
    const correctionScored = [];
    if (Array.isArray(catalogProducts)) {
      for (const p of catalogProducts) {
        const s = scoreProduct(p, correction.correctedQuery);
        if (s > 0) {
          correctionScored.push({ ...p, _score: s });
        }
      }
    }

    // Auto-correct if raw produced 0 matches, or correction yields more or significantly higher quality matches
    const topRawScore = rawScored.length > 0 ? Math.max(...rawScored.map((x) => x._score)) : 0;
    const topCorrScore = correctionScored.length > 0 ? Math.max(...correctionScored.map((x) => x._score)) : 0;

    if (
      rawScored.length === 0 ||
      correctionScored.length > rawScored.length ||
      (topCorrScore > topRawScore && correction.confidence >= 0.7) ||
      correction.confidence >= 0.85
    ) {
      effectiveQuery = correction.correctedQuery;
      isAutoCorrected = true;
    }
  }

  // 3. Search Categories using effective query
  const matchingCategories = searchCategories(effectiveQuery, catalogProducts);

  // 4. Search Website Pages & Services using effective query
  const matchingPages = searchPages(effectiveQuery);

  // 5. Retrieve ranked products using effective query
  const finalProducts = [];
  if (Array.isArray(catalogProducts)) {
    for (const p of catalogProducts) {
      const s = scoreProduct(p, effectiveQuery);
      if (s > 0) {
        let matchReason = "Product Title Match";
        const fCat = foldText(p?.category);
        const fQuery = foldText(effectiveQuery);
        if (fCat === fQuery || fCat.includes(fQuery)) {
          matchReason = `Category: ${p?.category}`;
        } else if (scoreProduct(p, effectiveQuery) === 10) {
          matchReason = "Description Match";
        }

        finalProducts.push({
          ...p,
          _score: s,
          _matchReason: matchReason
        });
      }
    }
  }
  finalProducts.sort((a, b) => (b._score || 0) - (a._score || 0));

  return {
    query: rawQuery,
    effectiveQuery,
    isAutoCorrected,
    autoCorrection: isAutoCorrected ? {
      original: rawQuery,
      corrected: effectiveQuery,
      confidence: correction.confidence
    } : null,
    matchingCategories,
    matchingPages,
    matchingProducts: finalProducts,
    totalProductsCount: finalProducts.length,
    totalResultsCount: matchingCategories.length + matchingPages.length + finalProducts.length
  };
}
