"use strict";

/**
 * GST invoice numbers by Indian financial year (1 April – 31 March), in India time:
 *   DSG/2026-27/0001
 * - The running number starts again at 0001 every 1 April (each year has its own counter),
 *   which GST allows because a number only has to be unique within its financial year.
 * - 16 characters: letters, digits, "/" and "-" only, the GST maximum. Up to 9,999 invoices
 *   fit in a year at that length; number 10,000 would make it 17 characters.
 */

const IST_OFFSET_MS = 330 * 60 * 1000;
const PREFIX = "DSG";

/** The financial year a moment falls in, judged by the date in India. */
function financialYearOf(date = new Date()) {
  const ist = new Date(new Date(date).getTime() + IST_OFFSET_MS);
  const year = ist.getUTCFullYear();
  const startYear = ist.getUTCMonth() >= 3 ? year : year - 1; // April is month 3
  const label = `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
  return { startYear, label };
}

/** Counter document id for that year, e.g. "orderInvoice-2026-27". */
function invoiceCounterId(date = new Date()) {
  return `orderInvoice-${financialYearOf(date).label}`;
}

function formatInvoiceNumber(date, sequence) {
  const seq = Math.max(1, Math.floor(Number(sequence) || 1));
  return `${PREFIX}/${financialYearOf(date).label}/${String(seq).padStart(4, "0")}`;
}

module.exports = { financialYearOf, invoiceCounterId, formatInvoiceNumber };
