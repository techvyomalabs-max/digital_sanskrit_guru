export function isKindleProduct(product) {
  return Boolean(
    product?.kindleLink ||
    String(product?.digitalType || "").toLowerCase().includes("kindle") ||
    String(product?.name || "").toLowerCase().includes("kindle")
  );
}
