/**
 * Single source of truth for the organisation's postal addresses.
 * Lines follow the Indian postal format: premises/street, locality, landmark,
 * "City, State – PIN", country. Update here and every page picks it up.
 */

export const ORGANISATION_NAME = "Vyoma Linguistic Labs Foundation";

export const REGISTERED_OFFICE = {
  title: "Registered Office",
  lines: [
    "#155, 2nd Floor, 4th Cross,",
    "GKW Layout, Vijayanagar,",
    "Bengaluru, Karnataka – 560040"
  ],
  country: "India"
};

export const WORKING_OFFICE = {
  title: "Working Office",
  lines: [
    "#84, 3rd Cross, 2nd Block,",
    "NGEF Layout, Nagarabhavi,",
    "Opp. Fortis Hospital,",
    "Bengaluru, Karnataka – 560072"
  ],
  country: "India"
};

/** One-line form, e.g. for FAQ answers: "#84, 3rd Cross, ... – 560072, India" */
export function formatAddressInline(address) {
  const body = address.lines.map((line) => line.replace(/,\s*$/, "")).join(", ");
  return `${body}, ${address.country}`;
}
