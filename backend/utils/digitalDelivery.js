/**
 * Pure helper for digital delivery validation and normalization.
 */

function validateExternalDelivery(input = {}) {
  const isDigital = input?.isDigital === true;
  const productType = String(input?.productType || "single").trim().toLowerCase();

  let rawDelivery = input?.digitalDelivery !== undefined && input?.digitalDelivery !== null
    ? String(input.digitalDelivery).trim().toLowerCase()
    : "onsite";

  if (!rawDelivery) {
    rawDelivery = "onsite";
  }

  if (rawDelivery !== "onsite" && rawDelivery !== "external") {
    const error = "digitalDelivery must be either 'onsite' or 'external'.";
    return {
      isValid: false,
      ok: false,
      error,
      message: error
    };
  }

  // Only allow "external" when isDigital === true or productType === "bundle", otherwise force "onsite".
  let digitalDelivery = rawDelivery;
  if (digitalDelivery === "external" && !isDigital && productType !== "bundle") {
    digitalDelivery = "onsite";
  }

  // For onsite store empty link and label.
  if (digitalDelivery === "onsite") {
    return {
      isValid: true,
      ok: true,
      digitalDelivery: "onsite",
      externalAccessLink: "",
      externalAccessLabel: "",
      externalAccessManual: false,
      value: {
        digitalDelivery: "onsite",
        externalAccessLink: "",
        externalAccessLabel: "",
        externalAccessManual: false
      }
    };
  }

  // external delivery validation
  const rawLink = input?.externalAccessLink !== undefined && input?.externalAccessLink !== null
    ? String(input.externalAccessLink)
    : "";

  if (!rawLink || !rawLink.trim()) {
    const error = "External access link is required for external delivery.";
    return { isValid: false, ok: false, error, message: error };
  }

  if (/\s/.test(rawLink)) {
    const error = "External access link cannot contain whitespace.";
    return { isValid: false, ok: false, error, message: error };
  }

  if (rawLink.length > 500) {
    const error = "External access link must not exceed 500 characters.";
    return { isValid: false, ok: false, error, message: error };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawLink);
  } catch {
    const error = "External access link must be a valid URL.";
    return { isValid: false, ok: false, error, message: error };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    const error = "External access link must use http: or https: protocol.";
    return { isValid: false, ok: false, error, message: error };
  }

  const rawLabel = input?.externalAccessLabel !== undefined && input?.externalAccessLabel !== null
    ? String(input.externalAccessLabel).trim()
    : "";

  if (rawLabel.length > 40) {
    const error = "External access label must not exceed 40 characters.";
    return { isValid: false, ok: false, error, message: error };
  }

  const externalAccessManual = input?.externalAccessManual === true;

  return {
    isValid: true,
    ok: true,
    digitalDelivery: "external",
    externalAccessLink: rawLink.trim(),
    externalAccessLabel: rawLabel,
    externalAccessManual,
    value: {
      digitalDelivery: "external",
      externalAccessLink: rawLink.trim(),
      externalAccessLabel: rawLabel,
      externalAccessManual
    }
  };
}

module.exports = {
  validateExternalDelivery
};
