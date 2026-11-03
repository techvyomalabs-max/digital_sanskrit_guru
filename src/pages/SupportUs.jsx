import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import { BookOpen, Building2, CheckCircle2, HandCoins, HandHeart, HeartHandshake, MessageSquare, SendHorizontal } from "lucide-react";
import TurnstileWidget from "../components/common/TurnstileWidget";
import { useAuth } from "../hooks/useAuth";
import { useDocumentMetadata } from "../hooks/useDocumentMetadata";
import "./SupportUs.css";

// Mirrors SUPPORT_TYPES in backend/utils/supportInterest.js, which validates the choice
const SUPPORT_TYPES = [
  { value: "sponsor", label: "Sponsor a product or course", icon: BookOpen, hint: "Help us create and share more learning material." },
  { value: "institution", label: "Partner as an institution", icon: Building2, hint: "Schools, universities and organisations working with us." },
  { value: "donate", label: "Make a donation", icon: HandCoins, hint: "Support the work of keeping Sanskrit learning accessible." },
  { value: "volunteer", label: "Volunteer my time or skills", icon: HeartHandshake, hint: "Teaching, reviewing, translating, design or technology." },
  { value: "other", label: "Something else", icon: MessageSquare, hint: "Have another idea? Tell us about it." }
];

const MESSAGE_MAX = 2000;
// Top-to-bottom order of the form, so the first problem on screen gets focus
const FIELD_ORDER = ["supportType", "name", "email", "phone", "organisation", "message", "consent"];

function SupportUs() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState(() => ({
    name: user?.name || "",
    email: user?.email || "",
    phone: "",
    organisation: "",
    // The home page tiles link here with ?type= to pre-select that option
    supportType: SUPPORT_TYPES.some((type) => type.value === searchParams.get("type")) ? searchParams.get("type") : "",
    message: "",
    consent: false
  }));
  const [honeypot, setHoneypot] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  useDocumentMetadata(
    "Support Us",
    "Sponsor, partner with, donate to or volunteer for Digital Sanskrit Guru, and help keep Sanskrit learning accessible."
  );

  const update = (field) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const chooseType = (value) => {
    setForm((prev) => ({ ...prev, supportType: value }));
    if (errors.supportType) setErrors((prev) => ({ ...prev, supportType: "" }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    setFormError("");

    if (!turnstileToken) {
      setFormError("Please wait a moment while we verify the page, then try again.");
      return;
    }

    setIsSubmitting(true);
    try {
      await axios.post("/api/support-interest", { ...form, honey_pot_field: honeypot, turnstileToken });
      setSubmitted({ firstName: form.name.trim().split(/\s+/)[0] || "" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      const data = err?.response?.data;
      if (data?.errors && typeof data.errors === "object") {
        setErrors(data.errors);
        const firstField = FIELD_ORDER.find((field) => data.errors[field]);
        document.getElementById(`support-${firstField}`)?.focus();
      }
      setFormError(data?.message || "We could not send your request just now. Please try again in a moment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const fieldProps = (field) => ({
    id: `support-${field}`,
    "aria-invalid": errors[field] ? "true" : undefined,
    "aria-describedby": errors[field] ? `support-${field}-error` : undefined
  });

  const fieldError = (field) =>
    errors[field] ? (
      <p className="support-field-error" id={`support-${field}-error`}>
        {errors[field]}
      </p>
    ) : null;

  if (submitted) {
    return (
      <div className="support-page">
        <section className="support-success" role="status">
          <CheckCircle2 size={56} aria-hidden="true" />
          <h1>Thank you{submitted.firstName ? `, ${submitted.firstName}` : ""}!</h1>
          <p>
            We have received your request. Our team will get in touch with you by email soon to talk about how we
            can work together.
          </p>
          <div className="support-success-actions">
            <Link to="/" className="support-btn support-btn-primary">Back to home</Link>
            <Link to="/collection" className="support-btn support-btn-secondary">Browse the store</Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="support-page">
      <section className="support-hero">
        <span className="support-hero-icon" aria-hidden="true">
          <HandHeart size={34} />
        </span>
        <h1>Support Digital Sanskrit Guru</h1>
        <p>
          Our books, courses and learning tools exist to make Sanskrit easier to learn for everyone. If you would like
          to sponsor, partner with us, donate or volunteer, tell us a little about yourself and we will get in touch.
        </p>
      </section>

      <div className="support-layout">
        <aside className="support-ways" aria-label="Ways you can help">
          <h2>Ways you can help</h2>
          <ul>
            {SUPPORT_TYPES.map((type) => {
              const Icon = type.icon;
              return (
                <li key={type.value}>
                  <span className="support-ways-icon" aria-hidden="true"><Icon size={20} /></span>
                  <span>
                    <strong>{type.label}</strong>
                    <span>{type.hint}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </aside>

        <form className="support-form" onSubmit={handleSubmit} noValidate>
          <h2>Tell us about yourself</h2>
          <p className="support-form-note">Fields marked * are required.</p>

          {formError && (
            <div className="support-form-alert" role="alert">
              {formError}
            </div>
          )}

          <fieldset className="support-type-group" aria-describedby={errors.supportType ? "support-supportType-error" : undefined}>
            <legend>How would you like to support us? *</legend>
            <div className="support-type-options" id="support-supportType" tabIndex={-1}>
              {SUPPORT_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <label key={type.value} className={`support-type-option${form.supportType === type.value ? " is-selected" : ""}`}>
                    <input
                      type="radio"
                      name="supportType"
                      value={type.value}
                      checked={form.supportType === type.value}
                      onChange={() => chooseType(type.value)}
                    />
                    <Icon size={18} aria-hidden="true" />
                    <span>{type.label}</span>
                  </label>
                );
              })}
            </div>
            {fieldError("supportType")}
          </fieldset>

          <div className="support-form-grid">
            <div className="support-field">
              <label htmlFor="support-name">Full name *</label>
              <input type="text" autoComplete="name" maxLength={100} value={form.name} onChange={update("name")} {...fieldProps("name")} />
              {fieldError("name")}
            </div>

            <div className="support-field">
              <label htmlFor="support-email">Email *</label>
              <input type="email" autoComplete="email" maxLength={254} value={form.email} onChange={update("email")} {...fieldProps("email")} />
              {fieldError("email")}
            </div>

            <div className="support-field">
              <label htmlFor="support-phone">Phone (optional)</label>
              <input type="tel" autoComplete="tel" maxLength={20} value={form.phone} onChange={update("phone")} {...fieldProps("phone")} />
              {fieldError("phone")}
            </div>

            <div className="support-field">
              <label htmlFor="support-organisation">Organisation (optional)</label>
              <input
                type="text"
                autoComplete="organization"
                maxLength={150}
                value={form.organisation}
                onChange={update("organisation")}
                {...fieldProps("organisation")}
              />
              {fieldError("organisation")}
            </div>
          </div>

          <div className="support-field">
            <label htmlFor="support-message">How would you like to help? *</label>
            <textarea
              rows={5}
              maxLength={MESSAGE_MAX}
              value={form.message}
              onChange={update("message")}
              placeholder="For example: which product or course you would like to sponsor, or the skills you can offer."
              {...fieldProps("message")}
            />
            <span className="support-char-count">{form.message.length} / {MESSAGE_MAX}</span>
            {fieldError("message")}
          </div>

          {/* Left empty by people; bots that fill every field are discarded by the server */}
          <div className="support-hp" aria-hidden="true">
            <label htmlFor="support-website">Website</label>
            <input id="support-website" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </div>

          <label className="support-consent">
            <input type="checkbox" checked={form.consent} onChange={update("consent")} {...fieldProps("consent")} />
            <span>I agree to be contacted by the Digital Sanskrit Guru team about this request. *</span>
          </label>
          {fieldError("consent")}

          <TurnstileWidget onVerify={(token) => setTurnstileToken(token)} onExpire={() => setTurnstileToken("")} />

          <button type="submit" className="support-btn support-btn-primary support-submit" disabled={isSubmitting}>
            <SendHorizontal size={18} aria-hidden="true" />
            {isSubmitting ? "Sending..." : "Send my request"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default SupportUs;
