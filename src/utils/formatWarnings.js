// Problems worth flagging on a product's format in the admin list (pure; also used by tests).

const hasText = (value) => String(value || "").trim() !== "";

export function formatWarnings(product) {
  if (!product) return ["Product missing"];
  const warnings = [];
  const isKindle = hasText(product.kindleLink) || String(product.digitalType || "").toLowerCase().includes("kindle");
  if (!(Number(product.price) > 0) && !isKindle) warnings.push("No price");
  if (product.isDigital === true) {
    if (isKindle) {
      if (!hasText(product.kindleLink)) warnings.push("No Amazon link");
    } else if (product.digitalDelivery === "external") {
      if (!hasText(product.externalAccessLink)) warnings.push("No access link");
    } else if (!hasText(product.webReaderLink) && !hasText(product.courseLink)) {
      warnings.push("No access link");
    }
  } else {
    const stock = Number(product.stock || 0);
    if (stock <= 0) warnings.push("Out of stock");
    else if (stock <= 5) warnings.push("Low stock");
    if (!(Number(product.weight) > 0)) warnings.push("No package weight");
  }
  return warnings;
}

