const mongoose = require("mongoose");

function getTodayIST() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  return parts; // "YYYY-MM-DD"
}

function isValidDateFormat(str) {
  if (typeof str !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return false;
  }
  const [y, m, d] = str.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

function parseReportRange(from, to) {
  let fromStr = from != null ? String(from).trim() : "";
  let toStr = to != null ? String(to).trim() : "";

  if (!fromStr && !toStr) {
    const today = getTodayIST();
    toStr = today;
    const todayDate = new Date(`${today}T00:00:00+05:30`);
    const fromDate = new Date(todayDate.getTime() - 29 * 24 * 60 * 60 * 1000);
    fromStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(fromDate);
  } else if (!fromStr) {
    if (!isValidDateFormat(toStr)) {
      return { error: "Invalid 'to' date format. Expected YYYY-MM-DD" };
    }
    const toDate = new Date(`${toStr}T00:00:00+05:30`);
    const fromDate = new Date(toDate.getTime() - 29 * 24 * 60 * 60 * 1000);
    fromStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(fromDate);
  } else if (!toStr) {
    if (!isValidDateFormat(fromStr)) {
      return { error: "Invalid 'from' date format. Expected YYYY-MM-DD" };
    }
    toStr = getTodayIST();
  }

  if (!isValidDateFormat(fromStr) || !isValidDateFormat(toStr)) {
    return { error: "Invalid date format. Expected YYYY-MM-DD" };
  }

  const startDate = new Date(`${fromStr}T00:00:00+05:30`);
  const endDate = new Date(`${toStr}T23:59:59.999+05:30`);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return { error: "Invalid date provided" };
  }

  const toStartDate = new Date(`${toStr}T00:00:00+05:30`);
  if (startDate > toStartDate) {
    return { error: "'from' date cannot be after 'to' date" };
  }

  const diffMs = toStartDate.getTime() - startDate.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
  if (diffDays > 366) {
    return { error: "Date range cannot exceed 366 days" };
  }

  return {
    from: fromStr,
    to: toStr,
    startDate,
    endDate
  };
}

function idRangeForDates(startDate, endDate) {
  const startSec = Math.floor(new Date(startDate).getTime() / 1000);
  const endSec = Math.ceil(new Date(endDate).getTime() / 1000);
  return {
    $gte: mongoose.Types.ObjectId.createFromTime(startSec),
    $lt: mongoose.Types.ObjectId.createFromTime(endSec)
  };
}

function summarizeSignupRows(rows = [], total = 0) {
  const parsedRows = (Array.isArray(rows) ? rows : []).map((row) => {
    const rawSource = row.source ?? row._id?.source;
    const rawMedium = row.medium ?? row._id?.medium;
    const rawCampaign = row.campaign ?? row._id?.campaign;

    const source =
      rawSource && String(rawSource).trim()
        ? String(rawSource).trim()
        : "Not tracked";
    const medium =
      rawMedium && String(rawMedium).trim() ? String(rawMedium).trim() : "";
    const campaign =
      rawCampaign && String(rawCampaign).trim() ? String(rawCampaign).trim() : "";

    const signups = Math.max(0, Number(row.signups ?? row.count ?? 0));
    const buyers = Math.max(0, Number(row.buyers ?? 0));
    const revenueInInr = Math.max(
      0,
      Math.round(Number(row.revenueInInr ?? 0) * 100) / 100
    );

    const sharePercent =
      total > 0 ? Number(((signups / total) * 100).toFixed(1)) : 0;

    return {
      source,
      medium,
      campaign,
      signups,
      sharePercent,
      buyers,
      revenueInInr
    };
  });

  return parsedRows.sort((a, b) => b.signups - a.signups);
}

module.exports = {
  parseReportRange,
  idRangeForDates,
  summarizeSignupRows
};
