// Indian financial year helpers (1 April – 31 March), all dates as "YYYY-MM-DD" in India time.
// Quarters: Q1 Apr–Jun, Q2 Jul–Sep, Q3 Oct–Dec, Q4 Jan–Mar.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function todayInIndia(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Start year of the financial year a "YYYY-MM-DD" day falls in (2026 for FY 2026-27). */
export function fyStartYearOf(ymd) {
  const year = Number(String(ymd).slice(0, 4));
  const month = Number(String(ymd).slice(5, 7));
  return month >= 4 ? year : year - 1;
}

export function fyLabel(startYear) {
  return `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

const lastDayOf = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export function fyRange(startYear) {
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
}

/** quarter 1–4 of the financial year starting in startYear. */
export function quarterRange(startYear, quarter) {
  const q = Math.min(4, Math.max(1, Number(quarter) || 1));
  const firstMonth = ((q - 1) * 3 + 3) % 12 + 1; // Q1 → 4 (Apr), Q2 → 7, Q3 → 10, Q4 → 1
  const year = q === 4 ? startYear + 1 : startYear;
  const lastMonth = firstMonth + 2;
  return {
    from: `${year}-${String(firstMonth).padStart(2, "0")}-01`,
    to: `${year}-${String(lastMonth).padStart(2, "0")}-${String(lastDayOf(year, lastMonth)).padStart(2, "0")}`
  };
}

export function quarterLabel(startYear, quarter) {
  const { from, to } = quarterRange(startYear, quarter);
  const m1 = MONTHS[Number(from.slice(5, 7)) - 1];
  const m2 = MONTHS[Number(to.slice(5, 7)) - 1];
  return `Q${quarter} ${fyLabel(startYear)} (${m1}–${m2} ${to.slice(0, 4)})`;
}

/** Quarter number (1–4) a "YYYY-MM-DD" day falls in. */
export function quarterOf(ymd) {
  const month = Number(String(ymd).slice(5, 7));
  return month >= 4 ? Math.floor((month - 4) / 3) + 1 : 4;
}

/** Choices for the pickers: the current financial year and the `count - 1` before it, newest first. */
export function recentFinancialYears(today = todayInIndia(), count = 3) {
  const current = fyStartYearOf(today);
  return Array.from({ length: count }, (_, i) => current - i);
}

/** Every quarter that has started, newest first, across those years: [{ value: "2026-3", label, from, to }]. */
export function recentQuarters(today = todayInIndia(), years = 2) {
  const out = [];
  for (const startYear of recentFinancialYears(today, years)) {
    for (let q = 4; q >= 1; q -= 1) {
      const range = quarterRange(startYear, q);
      if (range.from > today) continue;
      out.push({ value: `${startYear}-${q}`, label: quarterLabel(startYear, q), ...range });
    }
  }
  return out;
}
