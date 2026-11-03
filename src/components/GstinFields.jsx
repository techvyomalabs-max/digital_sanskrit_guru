import { cleanGstin, gstinError } from "../utils/gstin";
import "./GstinFields.css";

/**
 * Optional business GSTIN at checkout. value: { enabled, gstin, businessName }.
 * Shown on the tax invoice so a business buyer can claim input tax credit.
 */
export default function GstinFields({ value, onChange, idPrefix = "checkout" }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const error = value.enabled && value.gstin ? gstinError(value.gstin) : "";

  return (
    <div className="gstin-fields">
      <label className="gstin-toggle" htmlFor={`${idPrefix}-gstin-toggle`}>
        <input
          id={`${idPrefix}-gstin-toggle`}
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
        />
        <span>
          I want a GST invoice for my business <em>(optional)</em>
        </span>
      </label>

      {value.enabled && (
        <div className="gstin-inputs">
          <div className="gstin-field">
            <label htmlFor={`${idPrefix}-gstin`}>GSTIN</label>
            <input
              id={`${idPrefix}-gstin`}
              type="text"
              inputMode="text"
              autoComplete="off"
              maxLength={20}
              placeholder="15-character GSTIN"
              value={value.gstin}
              onChange={(e) => set({ gstin: cleanGstin(e.target.value).slice(0, 15) })}
              aria-invalid={error ? "true" : "false"}
              aria-describedby={`${idPrefix}-gstin-help`}
            />
          </div>
          <div className="gstin-field">
            <label htmlFor={`${idPrefix}-business-name`}>Business name</label>
            <input
              id={`${idPrefix}-business-name`}
              type="text"
              autoComplete="organization"
              maxLength={120}
              placeholder="As registered for GST"
              value={value.businessName}
              onChange={(e) => set({ businessName: e.target.value })}
            />
          </div>
          <p id={`${idPrefix}-gstin-help`} className={error ? "gstin-help gstin-help-error" : "gstin-help"}>
            {error || "Printed on your tax invoice. It can't be added after payment."}
          </p>
        </div>
      )}
    </div>
  );
}
