export function isOptionsParent(product) {
  return product?.hasOptions === true;
}

export function getOptionCount(product) {
  if (Array.isArray(product?.publicOptions)) {
    return product.publicOptions.length;
  }
  if (Array.isArray(product?.options)) {
    return product.options.length;
  }
  return 0;
}

export function isOptionAvailable(optionProduct) {
  return optionProduct?.isDigital === true || Number(optionProduct?.stock || 0) > 0;
}

export function pickDefaultOptionId(publicOptions, preferredId) {
  if (!Array.isArray(publicOptions) || publicOptions.length === 0) {
    return "";
  }

  const pref = String(preferredId || "").trim();
  if (pref) {
    const matched = publicOptions.find(
      (entry) => String(entry?.product?._id || "") === pref
    );
    if (matched) {
      return pref;
    }
  }

  const firstAvailable = publicOptions.find(
    (entry) => entry?.product && isOptionAvailable(entry.product) && entry.product._id
  );
  if (firstAvailable) {
    return String(firstAvailable.product._id);
  }

  return String(publicOptions[0]?.product?._id || "");
}

export function getBuyProduct(product, selectedOptionId) {
  if (!isOptionsParent(product)) {
    return product;
  }
  const list = Array.isArray(product?.publicOptions) ? product.publicOptions : [];
  const targetId = String(selectedOptionId || "").trim();
  if (!targetId) {
    return null;
  }
  const found = list.find((entry) => String(entry?.product?._id || "") === targetId);
  return found?.product || null;
}

