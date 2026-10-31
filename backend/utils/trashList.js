"use strict";

/**
 * Recycle Bin list helpers (pure, no DB).
 * The route reads only the fields shown, at most `page * limit` newest items from each
 * collection; these helpers turn them into rows and cut out the requested page.
 */

const MAX_PAGE_SIZE = 100;
const TYPES = ["product", "coupon", "user"];

const escapeRegex = (str) => String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function deletedByLabel(doc) {
  const by = doc?.deletedBy || {};
  if (by.name) return by.email ? `${by.name} (${by.email})` : by.name;
  return by.email || "Admin";
}

function deletedAtOf(doc) {
  return doc?.deletedAt || doc?.updatedAt || null;
}

function formatTrashItem(type, doc) {
  const base = {
    _id: String(doc?._id || ""),
    entityType: type,
    deletedAt: deletedAtOf(doc),
    deletedBy: deletedByLabel(doc)
  };
  if (type === "coupon") {
    return {
      ...base,
      name: `Coupon Code: ${doc?.code || ""}`,
      category: "Coupon",
      details: `Type: ${doc?.type} | Value: ${doc?.value} | Uses: ${doc?.usageCount || 0}`
    };
  }
  if (type === "user") {
    return {
      ...base,
      name: doc?.name || "User",
      category: doc?.isAdmin ? "Admin User" : "Customer",
      details: `Email: ${doc?.email} | Role: ${doc?.isAdmin ? doc?.adminRole || "Admin" : "Customer"}`
    };
  }
  return {
    ...base,
    name: doc?.name || "Unnamed Product",
    category: doc?.category || "General",
    details: `Price: ₹${doc?.price || 0} | Category: ${doc?.category || "General"}`
  };
}

/** Mongo filter for one collection's deleted items, with an optional search. */
function trashFilter(type, search) {
  const filter = { isDeleted: true };
  const query = String(search || "").trim();
  if (!query) return filter;
  const rx = { $regex: escapeRegex(query), $options: "i" };
  const byFields = [{ "deletedBy.name": rx }, { "deletedBy.email": rx }];
  if (type === "coupon") filter.$or = [{ code: rx }, ...byFields];
  else if (type === "user") filter.$or = [{ name: rx }, { email: rx }, ...byFields];
  else filter.$or = [{ name: rx }, { category: rx }, ...byFields];
  return filter;
}

function parsePaging(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.max(1, Math.min(MAX_PAGE_SIZE, Number.parseInt(query.limit, 10) || 25));
  const type = TYPES.includes(String(query.type)) ? String(query.type) : "all";
  return { page, limit, type, search: String(query.search || "").trim() };
}

/**
 * lists: { product: [...docs], coupon: [...], user: [...] }, each newest first and holding at
 * least page*limit items when there are that many. matching: total matching count.
 */
function mergeTrashPage(lists, { page, limit, matching }) {
  const rows = [];
  for (const type of TYPES) {
    for (const doc of lists[type] || []) rows.push(formatTrashItem(type, doc));
  }
  rows.sort((a, b) => new Date(b.deletedAt || 0).getTime() - new Date(a.deletedAt || 0).getTime());
  const start = (page - 1) * limit;
  return {
    trash: rows.slice(start, start + limit),
    page,
    limit,
    matching,
    hasMore: start + limit < matching
  };
}

module.exports = {
  TYPES,
  MAX_PAGE_SIZE,
  formatTrashItem,
  trashFilter,
  parsePaging,
  mergeTrashPage
};
