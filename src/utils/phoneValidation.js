/**
 * Validates a mobile/phone number for Indian and international formats.
 * @param {string} rawPhone - The raw phone number string entered by the user
 * @param {string} country - Optional country name (default: "India")
 * @returns {{ isValid: boolean, message: string, cleanPhone: string }}
 */
export const validatePhoneNumber = (rawPhone, country = "India") => {
  const trimmed = String(rawPhone || "").trim();
  if (!trimmed) {
    return {
      isValid: false,
      message: "Phone number is required.",
      cleanPhone: ""
    };
  }

  // Strip spaces, hyphens, and parentheses
  const cleaned = trimmed.replace(/[\s\-()]/g, "");
  const digitsOnly = cleaned.replace(/\D/g, "");

  // International format with '+' prefix
  if (cleaned.startsWith("+")) {
    if (cleaned.startsWith("+91")) {
      const indianDigits = cleaned.slice(3).replace(/\D/g, "");
      if (!/^[6-9]\d{9}$/.test(indianDigits)) {
        return {
          isValid: false,
          message: "Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.",
          cleanPhone: indianDigits
        };
      }
      return { isValid: true, message: "", cleanPhone: indianDigits };
    }

    if (!/^\+[1-9]\d{6,14}$/.test(cleaned)) {
      return {
        isValid: false,
        message: "Please enter a valid international phone number with country code (e.g. +1 2025550143).",
        cleanPhone: cleaned
      };
    }
    return { isValid: true, message: "", cleanPhone: cleaned };
  }

  // 10-digit Indian mobile number (e.g. 9876543210)
  if (digitsOnly.length === 10) {
    if (!/^[6-9]\d{9}$/.test(digitsOnly)) {
      return {
        isValid: false,
        message: "Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9 (e.g. 9876543210).",
        cleanPhone: digitsOnly
      };
    }
    return { isValid: true, message: "", cleanPhone: digitsOnly };
  }

  // 12-digit Indian number with '91' prefix (e.g. 919876543210)
  if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
    const indianDigits = digitsOnly.slice(2);
    if (!/^[6-9]\d{9}$/.test(indianDigits)) {
      return {
        isValid: false,
        message: "Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.",
        cleanPhone: indianDigits
      };
    }
    return { isValid: true, message: "", cleanPhone: indianDigits };
  }

  // 11-digit number with leading '0' (e.g. 09876543210)
  if (digitsOnly.length === 11 && digitsOnly.startsWith("0")) {
    const indianDigits = digitsOnly.slice(1);
    if (!/^[6-9]\d{9}$/.test(indianDigits)) {
      return {
        isValid: false,
        message: "Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.",
        cleanPhone: indianDigits
      };
    }
    return { isValid: true, message: "", cleanPhone: indianDigits };
  }

  // International non-India if country specified
  if (country && country.toLowerCase() !== "india" && digitsOnly.length >= 7 && digitsOnly.length <= 15) {
    return { isValid: true, message: "", cleanPhone: digitsOnly };
  }

  return {
    isValid: false,
    message: "Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9 (e.g. 9876543210).",
    cleanPhone: digitsOnly
  };
};
