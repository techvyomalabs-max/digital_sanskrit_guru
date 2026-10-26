export const COUNTRY_PHONE_CODES = [
  { country: "India", code: "+91", flag: "🇮🇳", min: 10, max: 10, placeholder: "10-digit mobile number" },
  { country: "United States", code: "+1", flag: "🇺🇸", min: 10, max: 10, placeholder: "10-digit phone number" },
  { country: "United Kingdom", code: "+44", flag: "🇬🇧", min: 10, max: 11, placeholder: "10 or 11-digit phone number" },
  { country: "Canada", code: "+1", flag: "🇨🇦", min: 10, max: 10, placeholder: "10-digit phone number" },
  { country: "Australia", code: "+61", flag: "🇦🇺", min: 9, max: 10, placeholder: "9 or 10-digit phone number" },
  { country: "New Zealand", code: "+64", flag: "🇳🇿", min: 8, max: 10, placeholder: "Phone number" },
  { country: "Singapore", code: "+65", flag: "🇸🇬", min: 8, max: 8, placeholder: "8-digit phone number" },
  { country: "United Arab Emirates", code: "+971", flag: "🇦🇪", min: 9, max: 9, placeholder: "9-digit phone number" },
  { country: "Saudi Arabia", code: "+966", flag: "🇸🇦", min: 9, max: 9, placeholder: "9-digit phone number" },
  { country: "Qatar", code: "+974", flag: "🇶🇦", min: 8, max: 8, placeholder: "8-digit phone number" },
  { country: "Kuwait", code: "+965", flag: "🇰🇼", min: 8, max: 8, placeholder: "8-digit phone number" },
  { country: "Oman", code: "+968", flag: "🇴🇲", min: 8, max: 8, placeholder: "8-digit phone number" },
  { country: "Bahrain", code: "+973", flag: "🇧🇭", min: 8, max: 8, placeholder: "8-digit phone number" },
  { country: "Germany", code: "+49", flag: "🇩🇪", min: 10, max: 11, placeholder: "Phone number" },
  { country: "France", code: "+33", flag: "🇫🇷", min: 9, max: 9, placeholder: "9-digit phone number" },
  { country: "Italy", code: "+39", flag: "🇮🇹", min: 10, max: 10, placeholder: "Phone number" },
  { country: "Spain", code: "+34", flag: "🇪🇸", min: 9, max: 9, placeholder: "9-digit phone number" },
  { country: "Netherlands", code: "+31", flag: "🇳🇱", min: 9, max: 9, placeholder: "Phone number" },
  { country: "Ireland", code: "+353", flag: "🇮🇪", min: 9, max: 9, placeholder: "Phone number" },
  { country: "Portugal", code: "+351", flag: "🇵🇹", min: 9, max: 9, placeholder: "Phone number" },
  { country: "Belgium", code: "+32", flag: "🇧🇪", min: 9, max: 9, placeholder: "Phone number" },
  { country: "Japan", code: "+81", flag: "🇯🇵", min: 10, max: 10, placeholder: "Phone number" },
  { country: "China", code: "+86", flag: "🇨🇳", min: 11, max: 11, placeholder: "Phone number" },
  { country: "Pakistan", code: "+92", flag: "🇵🇰", min: 10, max: 10, placeholder: "Phone number" },
  { country: "Bangladesh", code: "+880", flag: "🇧🇩", min: 10, max: 10, placeholder: "Phone number" },
  { country: "Nepal", code: "+977", flag: "🇳🇵", min: 10, max: 10, placeholder: "Phone number" },
  { country: "Sri Lanka", code: "+94", flag: "🇱🇰", min: 9, max: 9, placeholder: "Phone number" },
  { country: "Malaysia", code: "+60", flag: "🇲🇾", min: 9, max: 10, placeholder: "Phone number" },
  { country: "Thailand", code: "+66", flag: "🇹🇭", min: 9, max: 9, placeholder: "Phone number" },
  { country: "South Africa", code: "+27", flag: "🇿🇦", min: 9, max: 9, placeholder: "Phone number" },
  { country: "Nigeria", code: "+234", flag: "🇳🇬", min: 10, max: 10, placeholder: "Phone number" },
  { country: "Brazil", code: "+55", flag: "🇧🇷", min: 10, max: 11, placeholder: "Phone number" },
  { country: "Mexico", code: "+52", flag: "🇲🇽", min: 10, max: 10, placeholder: "Phone number" }
];

export const DEFAULT_PHONE_COUNTRY = COUNTRY_PHONE_CODES[0]; // India

/**
 * Find country phone metadata by country name or code.
 */
export const getCountryPhoneData = (countryName) => {
  if (!countryName) return DEFAULT_PHONE_COUNTRY;
  const normalized = String(countryName).trim().toLowerCase();
  const match = COUNTRY_PHONE_CODES.find(
    (item) => item.country.toLowerCase() === normalized
  );
  if (match) return match;

  // Secondary check by code (e.g. "+1", "+44")
  const codeMatch = COUNTRY_PHONE_CODES.find(
    (item) => item.code.toLowerCase() === normalized
  );
  if (codeMatch) return codeMatch;

  return {
    country: countryName,
    code: "+",
    flag: "🌐",
    min: 7,
    max: 15,
    placeholder: "Phone number"
  };
};

/**
 * Extracts dialing code and local digits from a phone number string.
 */
export const extractPhoneAndCountry = (rawPhone, fallbackCountry = "India") => {
  const trimmed = String(rawPhone || "").trim();
  if (!trimmed) {
    return { country: fallbackCountry, localPhone: "" };
  }

  if (trimmed.startsWith("+")) {
    // Check known codes in descending order of code length so +971 is matched before +97, etc.
    const sortedCodes = [...COUNTRY_PHONE_CODES].sort((a, b) => b.code.length - a.code.length);
    for (const item of sortedCodes) {
      if (trimmed.startsWith(item.code)) {
        const remaining = trimmed.slice(item.code.length).trim();
        return {
          country: item.country,
          localPhone: remaining
        };
      }
    }
  }

  return {
    country: fallbackCountry,
    localPhone: trimmed
  };
};
