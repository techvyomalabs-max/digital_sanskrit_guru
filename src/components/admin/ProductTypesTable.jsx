import { AlertTriangle, Undo2 } from "lucide-react";
import { formatWarnings } from "../../utils/formatWarnings";
import "./ProductTypesTable.css";

const hasText = (value) => String(value || "").trim() !== "";

function kindOf(product, type) {
  if (type?.kind === "kindle" || hasText(product?.kindleLink)) return "Kindle";
  return product?.isDigital === true ? "Digital" : "Shipped";
}

/**
 * The types of one product (Paper, Pendrive, Web Version...) with price, stock, tax, sales and
 * warnings, so the admin can check a product at a glance without opening each format.
 */
function ProductTypesTable({ parent, productsById, sales = {}, productTypes = [], onEdit, onRevert }) {
  const options = Array.isArray(parent?.options) ? parent.options : [];
  if (options.length === 0) return null;
  const generatedIds = new Set(
    (Array.isArray(parent.bundleFormats) ? parent.bundleFormats : []).map((f) => String(f?.product?._id || f?.product || ""))
  );

  const linkedCount = options.filter((o) => {
    const id = String(o?.product?._id || o?.product || "");
    return id && !generatedIds.has(id);
  }).length;

  return (
    <div className="ptt" aria-label={`Types of ${parent.name}`}>
      <table className="ptt-table">
        <thead>
          <tr>
            <th scope="col">Type</th>
            <th scope="col">Price</th>
            <th scope="col">M.R.P.</th>
            <th scope="col">Stock</th>
            <th scope="col">HSN/SAC · GST</th>
            <th scope="col">Sold (30 days)</th>
            <th scope="col">Check</th>
            <th scope="col" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {options.map((option) => {
            const id = String(option?.product?._id || option?.product || "");
            const product = productsById.get(id);
            const type = productTypes.find((t) => t.key === product?.formatTypeKey) || null;
            const warnings = formatWarnings(product);
            const sold = sales[id] || { all: 0, last30: 0 };
            const isLinked = !generatedIds.has(id);
            return (
              <tr key={id || option?.label}>
                <td>
                  <strong>{option?.label || product?.name || "Format"}</strong>
                  <span className="ptt-sub">{kindOf(product, type)}{isLinked ? " · linked product" : ""}</span>
                </td>
                <td>{product ? `Rs ${Number(product.price || 0)}` : "—"}
                  {product?.internationalPrice !== null && product?.internationalPrice !== undefined ? (
                    <span className="ptt-sub">Intl Rs {product.internationalPrice}</span>
                  ) : null}
                </td>
                <td>{product?.mrp ? `Rs ${product.mrp}` : "—"}</td>
                <td>{product?.isDigital === true ? "Unlimited" : product ? Number(product.stock || 0) : "—"}</td>
                <td>
                  {product?.hsnSac || type?.hsnSac || "Auto"}
                  {" · "}
                  {product?.gstRate !== null && product?.gstRate !== undefined ? `${product.gstRate}%` : "Auto"}
                </td>
                <td>{Number(sold.all || 0)} <span className="ptt-sub">({Number(sold.last30 || 0)} in 30 days)</span></td>
                <td>
                  {warnings.length === 0 ? (
                    <span className="ptt-ok">OK</span>
                  ) : (
                    <span className="ptt-warn">
                      <AlertTriangle size={13} aria-hidden="true" />
                      {warnings.join(", ")}
                    </span>
                  )}
                </td>
                <td>
                  {isLinked && product && onEdit ? (
                    <button type="button" className="secondary btn-sm" onClick={() => onEdit(product)}>Edit</button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {onRevert && linkedCount > 0 ? (
        <div className="ptt-foot">
          <span className="ptt-sub">
            {linkedCount} of these {linkedCount === 1 ? "is an existing product" : "are existing products"} grouped here.
          </span>
          <button type="button" className="secondary btn-sm" onClick={() => onRevert(parent, linkedCount)}>
            <Undo2 size={13} className="ui-inline-icon" aria-hidden="true" />Revert grouping
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default ProductTypesTable;
