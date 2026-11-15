// Spots common typos in an email's domain ("gmial.com", "gmail.co") and suggests the
// likely address. Suggestion only: the customer decides.

const COMMON_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "yahoo.co.in",
  "yahoo.in",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "rediffmail.com",
  "protonmail.com",
  "aol.com",
  "zoho.com"
];

// Real providers that look close to a common one: never "corrected"
const REAL_DOMAINS = new Set([
  "mail.com", "email.com", "gmx.com", "gmx.net", "ymail.com", "me.com", "mac.com", "msn.com",
  "live.in", "outlook.in", "hotmail.co.uk", "yahoo.co.uk", "googlemail.com", "proton.me", "pm.me",
  "zohomail.com", "zohomail.in", "aim.com", "tutanota.com", "yandex.com"
]);

// Typos too far apart for the distance check, mapped by hand
const KNOWN_TYPOS = {
  "gmail.co": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.om": "gmail.com",
  "gmail.in": "gmail.com",
  "gmail.co.in": "gmail.com",
  "gmail.con": "gmail.com",
  "gamil.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gnail.com": "gmail.com",
  "yahoo.co": "yahoo.com",
  "yaho.com": "yahoo.com",
  "hotmail.co": "hotmail.com",
  "outlook.co": "outlook.com",
  "rediff.com": "rediffmail.com",
  "redifmail.com": "rediffmail.com"
};

function distance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      // swapped neighbours ("gmial") count as one mistake
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}

/** Suggested address when the domain looks like a typo of a common one, else "". */
export function suggestEmailFix(rawEmail) {
  const email = String(rawEmail || "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return "";
  const name = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (COMMON_DOMAINS.includes(domain) || REAL_DOMAINS.has(domain)) return "";
  if (KNOWN_TYPOS[domain]) return `${name}@${KNOWN_TYPOS[domain]}`;

  let best = "";
  let bestDistance = Infinity;
  for (const candidate of COMMON_DOMAINS) {
    const d = distance(domain, candidate);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  // One or two slips on a domain of reasonable length; never "fix" a real-looking other domain
  const allowed = domain.length >= 8 ? 2 : 1;
  return bestDistance > 0 && bestDistance <= allowed ? `${name}@${best}` : "";
}

/** True when both are the same address (case and spaces ignored). */
export function isSameEmail(a, b) {
  const clean = (value) => String(value || "").trim().toLowerCase();
  return Boolean(clean(a)) && clean(a) === clean(b);
}
