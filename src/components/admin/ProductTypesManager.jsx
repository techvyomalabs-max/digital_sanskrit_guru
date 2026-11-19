import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Save, Settings2, Trash2, X } from "lucide-react";
import "./ProductTypesManager.css";

const GST_SLABS = [0, 0.25, 3, 5, 12, 18, 28];
const KIND_LABELS = { physical: "Physical (shipped)", digital: "Digital (on our site)", kindle: "Kindle (sold on Amazon)" };

const toRows = (types) =>
  (Array.isArray(types) ? types : []).map((t, i) => ({
    rowKey: `${t.key || "new"}-${i}`,
    key: t.key || "",
    label: t.label || "",
    kind: t.kind || "physical",
    hsnSac: t.hsnSac || "",
    gstRate: t.gstRate === null || t.gstRate === undefined ? "" : String(t.gstRate),
    note: t.note || ""
  }));

/**
 * The store's list of product types (Paper, Pendrive, Web Version, Audio Book, Kindle...).
 * Each type's HSN/SAC and GST fill in for every format of that type unless the format has its own.
 * Changing a type's tax here updates those formats; past orders keep what they were charged.
 */
function ProductTypesManager({ types, onSave, onClose }) {
  const [rows, setRows] = useState(() => toRows(types));
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState({ text: "", error: false });

  useEffect(() => {
    setRows(toRows(types));
  }, [types]);

  const update = (rowKey, field, value) =>
    setRows((current) => current.map((row) => (row.rowKey === rowKey ? { ...row, [field]: value } : row)));

  const move = (rowKey, step) =>
    setRows((current) => {
      const index = current.findIndex((row) => row.rowKey === rowKey);
      const target = index + step;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const add = () =>
    setRows((current) => [
      ...current,
      { rowKey: `new-${Date.now()}`, key: "", label: "", kind: "physical", hsnSac: "", gstRate: "", note: "" }
    ]);

  const remove = (rowKey) => setRows((current) => current.filter((row) => row.rowKey !== rowKey));

  const save = async () => {
    setIsSaving(true);
    setMessage({ text: "", error: false });
    try {
      await onSave(
        rows.map((row) => ({
          key: row.key,
          label: row.label.trim(),
          kind: row.kind,
          hsnSac: row.kind === "kindle" ? "" : row.hsnSac.replace(/\s+/g, ""),
          gstRate: row.kind === "kindle" || row.gstRate === "" ? null : Number(row.gstRate),
          note: row.note.trim()
        }))
      );
      setMessage({ text: "Product types saved. Formats that follow a type now use its tax.", error: false });
    } catch (err) {
      setMessage({ text: err?.response?.data?.message || err?.message || "Could not save the product types.", error: true });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="ptm" role="region" aria-label="Product types">
      <div className="ptm-head">
        <div>
          <strong><Settings2 size={15} className="ui-inline-icon" aria-hidden="true" />Product types</strong>
          <p className="pf-hint">
            The types a product can come in. Their order is the order customers see (after what&apos;s in stock and
            what can be delivered to them). HSN/SAC and GST fill in for every format of the type unless you set the
            format&apos;s own. The note is the &quot;what you get&quot; line on the product page.
          </p>
        </div>
        {onClose ? (
          <button type="button" className="secondary icon" onClick={onClose} aria-label="Close product types">
            <X size={15} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="ptm-list">
        {rows.map((row, index) => (
          <div key={row.rowKey} className="ptm-row">
            <label>
              <span>Name</span>
              <input type="text" maxLength={40} value={row.label} placeholder="e.g. Audio Book" onChange={(e) => update(row.rowKey, "label", e.target.value)} />
            </label>
            <label>
              <span>Kind</span>
              <select value={row.kind} onChange={(e) => update(row.rowKey, "kind", e.target.value)}>
                {Object.entries(KIND_LABELS).map(([value, text]) => (
                  <option key={value} value={value}>{text}</option>
                ))}
              </select>
            </label>
            <label>
              <span>HSN/SAC</span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={8}
                value={row.hsnSac}
                placeholder={row.kind === "kindle" ? "Not sold here" : "Auto"}
                disabled={row.kind === "kindle"}
                onChange={(e) => update(row.rowKey, "hsnSac", e.target.value)}
              />
            </label>
            <label>
              <span>GST %</span>
              <select value={row.gstRate} disabled={row.kind === "kindle"} onChange={(e) => update(row.rowKey, "gstRate", e.target.value)}>
                <option value="">Auto</option>
                {GST_SLABS.map((rate) => (
                  <option key={rate} value={String(rate)}>{rate}%</option>
                ))}
              </select>
            </label>
            <label className="ptm-note">
              <span>What you get (shown to customers)</span>
              <input type="text" maxLength={140} value={row.note} placeholder="e.g. Listen instantly in your Digital Library." onChange={(e) => update(row.rowKey, "note", e.target.value)} />
            </label>
            <div className="ptm-tools">
              <button type="button" className="secondary icon" onClick={() => move(row.rowKey, -1)} disabled={index === 0} aria-label="Move up" title="Move up">
                <ChevronUp size={15} aria-hidden="true" />
              </button>
              <button type="button" className="secondary icon" onClick={() => move(row.rowKey, 1)} disabled={index === rows.length - 1} aria-label="Move down" title="Move down">
                <ChevronDown size={15} aria-hidden="true" />
              </button>
              <button type="button" className="danger icon" onClick={() => remove(row.rowKey)} disabled={rows.length <= 1} aria-label={`Remove ${row.label || "type"}`} title="Remove">
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="ptm-actions">
        <button type="button" className="secondary" onClick={add} disabled={rows.length >= 20}>
          <Plus size={14} className="ui-inline-icon" aria-hidden="true" />Add type
        </button>
        <button type="button" onClick={save} disabled={isSaving}>
          <Save size={14} className="ui-inline-icon" aria-hidden="true" />{isSaving ? "Saving..." : "Save types"}
        </button>
      </div>
      {message.text ? <p className={`ptm-msg${message.error ? " error" : ""}`}>{message.text}</p> : null}
      <p className="pf-hint">
        Removing a type doesn&apos;t change products that use it: their formats keep their current tax.
      </p>
    </div>
  );
}

export default ProductTypesManager;
