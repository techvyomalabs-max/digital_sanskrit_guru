import { useState } from "react";
import axios from "axios";
import { CheckCircle2, Layers, RefreshCw, Search, Undo2 } from "lucide-react";
import "./FormatGroupingPanel.css";

const toEditable = (group) => {
  const seenTypes = new Set();
  return {
    key: group.key,
    name: group.name,
    conflicts: group.conflicts || [],
    status: "",
    message: "",
    confirming: false,
    members: group.members.map((m) => {
      // Two products of the same type: only the first is ticked; the admin chooses
      const duplicate = seenTypes.has(m.typeKey);
      seenTypes.add(m.typeKey);
      return { ...m, include: !duplicate };
    })
  };
};

/**
 * Finds existing products that are one title in several types ("X" and "X - Web Version") and
 * groups the ones the admin approves under one new main product. Nothing changes until the admin
 * presses "Group" on a group. The products keep their orders, reviews, stock and links.
 */
function FormatGroupingPanel({ getAuthHeaders, productTypes = [], onGrouped }) {
  const [groups, setGroups] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const loadPreview = async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await axios.get("/api/products/admin/format-groups/preview", { headers: getAuthHeaders() });
      setGroups((res.data?.groups || []).map(toEditable));
    } catch (err) {
      setError(err.response?.data?.message || "Could not build the preview.");
    } finally {
      setIsLoading(false);
    }
  };

  const updateGroup = (key, patch) => setGroups((current) => current.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  const updateMember = (key, id, patch) =>
    setGroups((current) =>
      current.map((g) => (g.key === key ? { ...g, confirming: false, members: g.members.map((m) => (m._id === id ? { ...m, ...patch } : m)) } : g))
    );

  const apply = async (group) => {
    updateGroup(group.key, { status: "saving", message: "" });
    try {
      const members = group.members
        .filter((m) => m.include)
        .map((m) => ({ product: m._id, label: m.label, typeKey: m.typeKey }));
      const res = await axios.post(
        "/api/products/admin/format-groups/apply",
        { name: group.name, members },
        { headers: getAuthHeaders() }
      );
      updateGroup(group.key, { status: "done", confirming: false, parentId: res.data?.product?._id || "", message: res.data?.message || "Grouped." });
      onGrouped?.();
    } catch (err) {
      updateGroup(group.key, { status: "", confirming: false, message: err.response?.data?.message || "Could not group these products." });
    }
  };

  // Undo straight away: the new main product goes to the Recycle Bin, the products return to the shop
  const revert = async (group) => {
    updateGroup(group.key, { status: "reverting" });
    try {
      await axios.delete(`/api/products/${group.parentId}`, { headers: getAuthHeaders() });
      updateGroup(group.key, { status: "", parentId: "", message: "Reverted. The products are back in the shop as before." });
      onGrouped?.();
    } catch (err) {
      updateGroup(group.key, { status: "done", message: err.response?.data?.message || "Could not revert." });
    }
  };

  const labelFor = (typeKey) => productTypes.find((t) => t.key === typeKey)?.label || typeKey;

  return (
    <section className="card fgp">
      <div className="fgp-head">
        <div>
          <h3><Layers size={17} className="ui-inline-icon" aria-hidden="true" />Group existing products into types</h3>
          <p className="pf-hint">
            Finds products that are one title in several types, like &quot;Gita Dhyanam&quot; and &quot;Gita Dhyanam - Web
            Version&quot;. Check each suggestion, untick anything that doesn&apos;t belong, then press Group. Each product keeps
            its orders, reviews, stock, My Library access and old link (it opens the main product with that type chosen).
            To undo, move the new main product to the Recycle Bin: the products come back to the shop.
          </p>
        </div>
        <button type="button" onClick={loadPreview} disabled={isLoading}>
          {groups ? <RefreshCw size={14} className="ui-inline-icon" aria-hidden="true" /> : <Search size={14} className="ui-inline-icon" aria-hidden="true" />}
          {isLoading ? "Checking..." : groups ? "Check again" : "Find products to group"}
        </button>
      </div>

      {error ? <p className="fgp-error">{error}</p> : null}
      {groups && groups.length === 0 ? <p className="mkt-empty">No products to group were found.</p> : null}

      {groups?.map((group) => {
        const included = group.members.filter((m) => m.include);
        const labels = included.map((m) => m.label.trim().toLowerCase());
        const duplicateLabel = labels.find((l, i) => labels.indexOf(l) !== i);
        const canGroup = group.status !== "done" && group.name.trim().length >= 3 && included.length >= 2 && !duplicateLabel;
        return (
          <div key={group.key} className={`fgp-group${group.status === "done" ? " is-done" : ""}`}>
            <label className="fgp-name">
              <span>Main product name (customers see this)</span>
              <input
                type="text"
                maxLength={200}
                value={group.name}
                disabled={group.status === "done"}
                onChange={(e) => updateGroup(group.key, { name: e.target.value, confirming: false })}
              />
            </label>
            <table className="fgp-table">
              <thead>
                <tr>
                  <th scope="col">Include</th>
                  <th scope="col">Existing product</th>
                  <th scope="col">Type</th>
                  <th scope="col">Price</th>
                </tr>
              </thead>
              <tbody>
                {group.members.map((m) => (
                  <tr key={m._id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={m.include}
                        disabled={group.status === "done"}
                        aria-label={`Include ${m.name}`}
                        onChange={(e) => updateMember(group.key, m._id, { include: e.target.checked })}
                      />
                    </td>
                    <td>
                      {m.name}
                      <span className="fgp-sub">{m.isDigital ? "Digital" : `Physical · stock ${m.stock}`}</span>
                    </td>
                    <td>
                      <select
                        value={m.typeKey}
                        disabled={group.status === "done"}
                        aria-label={`Type of ${m.name}`}
                        onChange={(e) => updateMember(group.key, m._id, { typeKey: e.target.value, label: labelFor(e.target.value) })}
                      >
                        {productTypes.map((t) => (
                          <option key={t.key} value={t.key}>{t.label}</option>
                        ))}
                        {/* A suggested type that isn't in Settings yet stays as suggested, never silently changed */}
                        {m.typeKey && !productTypes.some((t) => t.key === m.typeKey) ? (
                          <option value={m.typeKey}>{m.label} (add it in Product types)</option>
                        ) : null}
                      </select>
                      {m.guessed ? <span className="fgp-sub">Guessed: check it</span> : null}
                    </td>
                    <td>Rs {m.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {duplicateLabel ? <p className="fgp-error">Two ticked products are the same type. Untick one or change its type.</p> : null}
            {group.message ? (
              <p className={group.status === "done" || group.message.startsWith("Reverted") ? "fgp-done" : "fgp-error"}>
                {group.status === "done" ? <CheckCircle2 size={14} className="ui-inline-icon" aria-hidden="true" /> : null}
                {group.message}
              </p>
            ) : null}
            {(group.status === "done" || group.status === "reverting") && group.parentId ? (
              <button type="button" className="secondary" onClick={() => revert(group)} disabled={group.status === "reverting"}>
                <Undo2 size={14} className="ui-inline-icon" aria-hidden="true" />
                {group.status === "reverting" ? "Reverting..." : "Revert"}
              </button>
            ) : null}
            {group.status !== "done" && group.status !== "reverting" ? (
              group.confirming ? (
                <div className="fgp-confirm">
                  <span>
                    Create &quot;{group.name.trim()}&quot; with {included.length} types ({included.map((m) => m.label).join(", ")})?
                    The products are hidden from the shop and sold through it.
                  </span>
                  <button type="button" onClick={() => apply(group)} disabled={group.status === "saving"}>
                    {group.status === "saving" ? "Grouping..." : "Yes, group them"}
                  </button>
                  <button type="button" className="secondary" onClick={() => updateGroup(group.key, { confirming: false })}>Cancel</button>
                </div>
              ) : (
                <button type="button" onClick={() => updateGroup(group.key, { confirming: true })} disabled={!canGroup}>
                  <Layers size={14} className="ui-inline-icon" aria-hidden="true" />Group {included.length} products
                </button>
              )
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

export default FormatGroupingPanel;
