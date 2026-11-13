// Combo entries in the Digital Library are keyed by order and line number,
// so a pack page link stays the same for as long as the order exists.
export const comboPackPath = (combo) => {
  const match = /^combo_(.+)_(\d+)$/.exec(String(combo?.key || ""));
  return match ? `/my-library/pack/${encodeURIComponent(match[1])}/${match[2]}` : "/my-library";
};

export const comboPackKey = (orderId, itemIndex) => `combo_${orderId}_${itemIndex}`;
