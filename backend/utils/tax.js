function getItemHsnSac(item) {
  if (item?.hsnSac) return String(item.hsnSac).trim();
  const name = String(item?.name || "").trim().toLowerCase();
  const category = String(item?.category || "").trim().toLowerCase();

  // E-books, Kindle books, Web versions, and Digital formats are taxed at 18% GST (SAC 9973 or 9984)
  const isDigital =
    category.includes("ebook") ||
    category.includes("e-book") ||
    category.includes("kindle") ||
    category.includes("web version") ||
    category.includes("web-version") ||
    category.includes("flipbook") ||
    name.includes("ebook") ||
    name.includes("e-book") ||
    name.includes("kindle") ||
    name.includes("web version") ||
    name.includes("web-version") ||
    name.includes("flipbook") ||
    name.includes("epub") ||
    name.includes("pdf");

  if (isDigital) {
    return "9973";
  }

  // Exempt printed books: category or name based check (HSN Chapter 49 - 0% GST)
  const isPrintedBook =
    category.includes("book") ||
    category.includes("sanskrit") ||
    category.includes("gita") ||
    category.includes("scriptures") ||
    category.includes("grammar") ||
    category.includes("dharma") ||
    category.includes("paperback") ||
    name.includes("book") ||
    name.includes("volume") ||
    name.includes("vol.") ||
    name.includes("hardcover") ||
    name.includes("paperback");

  return isPrintedBook ? "4901" : "8523";
}

module.exports = { getItemHsnSac };
