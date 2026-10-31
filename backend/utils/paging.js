"use strict";

/** Reads ?page and ?limit safely: page >= 1, 1 <= limit <= maxLimit. */
function parsePageParams(query = {}, { defaultLimit = 25, maxLimit = 100 } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.max(1, Math.min(maxLimit, Number.parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

module.exports = { parsePageParams };
