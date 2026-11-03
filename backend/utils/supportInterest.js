// Validation for the public "Support us" form. Pure functions, no DB.

const SUPPORT_TYPES = [
  { value: "sponsor", label: "Sponsor a product or course" },
  { value: "institution", label: "Partner as an institution" },
  { value: "donate", label: "Make a donation" },
  { value: "volunteer", label: "Volunteer my time or skills" },
  { value: "other", label: "Something else" }
];

const SUPPORT_STATUSES = ["new", "contacted", "closed"];

const LIMITS = {
  name: { min: 2, max: 100 },
  email: { max: 254 },
  phone: { max: 20 },
  organisation: { max: 150 },
  message: { min: 10, max: 2000 },
  adminNote: { max: 1000 }
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^\+?[0-9][0-9\s\-()]{5,18}[0-9]$/;

// Keeps line breaks in messages but drops other control characters
const clean = (value, { multiline = false } = {}) => {
  const text = String(value ?? "").replace(multiline ? /[^\S\n]+/g : /\s+/g, " ");
  return text.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").replace(/\n{3,}/g, "\n\n").trim();
};

const supportTypeLabel = (value) => SUPPORT_TYPES.find((type) => type.value === value)?.label || value;

/**
 * Checks a submission. Returns { ok: true, value } with cleaned fields, or
 * { ok: false, errors } with one visitor-friendly message per bad field.
 */
function validateSupportInterest(body = {}) {
  const value = {
    name: clean(body.name),
    email: clean(body.email).toLowerCase(),
    phone: clean(body.phone),
    organisation: clean(body.organisation),
    supportType: clean(body.supportType),
    message: clean(body.message, { multiline: true }),
    consent: body.consent === true || body.consent === "true"
  };
  const errors = {};

  if (value.name.length < LIMITS.name.min) errors.name = "Please enter your name.";
  else if (value.name.length > LIMITS.name.max) errors.name = `Please keep your name under ${LIMITS.name.max} characters.`;

  if (!value.email) errors.email = "Please enter your email address.";
  else if (value.email.length > LIMITS.email.max || !EMAIL_PATTERN.test(value.email)) errors.email = "Please enter a valid email address.";

  if (value.phone && (value.phone.length > LIMITS.phone.max || !PHONE_PATTERN.test(value.phone))) {
    errors.phone = "Please enter a valid phone number, or leave it empty.";
  }

  if (value.organisation.length > LIMITS.organisation.max) {
    errors.organisation = `Please keep this under ${LIMITS.organisation.max} characters.`;
  }

  if (!SUPPORT_TYPES.some((type) => type.value === value.supportType)) {
    errors.supportType = "Please choose how you would like to support us.";
  }

  if (value.message.length < LIMITS.message.min) errors.message = "Please tell us a little more (at least 10 characters).";
  else if (value.message.length > LIMITS.message.max) errors.message = `Please keep your message under ${LIMITS.message.max} characters.`;

  if (!value.consent) errors.consent = "Please agree to be contacted about your request.";

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

/** Checks an admin update. Only status and the internal note can change. */
function validateSupportInterestUpdate(body = {}) {
  const update = {};
  const errors = {};

  if (body.status !== undefined) {
    if (SUPPORT_STATUSES.includes(body.status)) update.status = body.status;
    else errors.status = "Unknown status.";
  }

  if (body.adminNote !== undefined) {
    const note = clean(body.adminNote, { multiline: true });
    if (note.length > LIMITS.adminNote.max) errors.adminNote = `Please keep the note under ${LIMITS.adminNote.max} characters.`;
    else update.adminNote = note;
  }

  if (!Object.keys(update).length && !Object.keys(errors).length) errors.status = "Nothing to update.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, update };
}

module.exports = {
  SUPPORT_TYPES,
  SUPPORT_STATUSES,
  LIMITS,
  supportTypeLabel,
  validateSupportInterest,
  validateSupportInterestUpdate
};
