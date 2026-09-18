import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import TurnstileWidget from "../components/common/TurnstileWidget";
import "./Register.css";

function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [honeyPot, setHoneyPot] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [error, setError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setPhoneError("");
    setPasswordError("");

    const digits = String(phone || "").replace(/\D/g, "");
    if (!digits) {
      setPhoneError("Phone number is required.");
      return;
    }

    if (!/^[6-9]\d{9}$/.test(digits) && (digits.length < 7 || digits.length > 15)) {
      setPhoneError("Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9 (e.g. 9876543210).");
      return;
    }

    if (!password) {
      setPasswordError("Password is required.");
      return;
    }
    if (password.startsWith(" ") || password.endsWith(" ")) {
      setPasswordError("Password cannot start or end with a space.");
      return;
    }
    if (password.trim().length < 8) {
      setPasswordError("Password must be at least 8 characters long.");
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setPasswordError("Password must contain at least one letter and one number.");
      return;
    }

    if (!turnstileToken) {
      setError("Please complete the security verification before creating an account.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      await register(name, email, password, phone, rememberMe, {
        honey_pot_field: honeyPot,
        turnstileToken
      });
      navigate("/");
    } catch (err) {
      setError(err?.response?.data?.message || "Registration failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="register-page">
      <div className="register-shell">
        <section className="register-brand">
          <p className="register-kicker">Join the platform</p>
          <h1>Create your Digital Sanskrit account</h1>
          <p>
            Save your learning cart, track orders, and keep your Sanskrit study journey in one
            place.
          </p>
        </section>

        <section className="register-card">
          <h2>Create Account</h2>
          {error && <p className="register-error">{error}</p>}

          <form onSubmit={handleSubmit} className="register-form">
            {/* Invisible Honeypot field for bot trapping */}
            <input
              type="text"
              name="honey_pot_field"
              value={honeyPot}
              onChange={(e) => setHoneyPot(e.target.value)}
              style={{ display: "none", position: "absolute", left: "-9999px" }}
              tabIndex="-1"
              autoComplete="off"
            />

            <label htmlFor="register-name">Full Name</label>
            <input
              id="register-name"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <label htmlFor="register-email">Email</label>
            <input
              id="register-email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <label htmlFor="register-phone">
              Phone Number <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              id="register-phone"
              type="tel"
              maxLength={15}
              placeholder="e.g. 9876543210"
              value={phone}
              className={phoneError ? "invalid-input" : ""}
              onChange={(e) => {
                setPhone(e.target.value.replace(/[^\d+]/g, ""));
                if (phoneError) setPhoneError("");
              }}
              required
            />
            {phoneError && (
              <span className="register-field-error" style={{ color: "#dc2626", fontSize: "12px", fontWeight: "600", marginTop: "4px", display: "block" }}>
                ⚠️ {phoneError}
              </span>
            )}

            <label htmlFor="register-password">Password</label>
            <div className="password-input-wrapper">
              <input
                id="register-password"
                type={showPassword ? "text" : "password"}
                placeholder="At least 8 characters with letter & number"
                value={password}
                className={passwordError ? "invalid-input" : ""}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordError) setPasswordError("");
                }}
                required
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
                tabIndex="-1"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {passwordError && (
              <span className="register-field-error" style={{ color: "#dc2626", fontSize: "12px", fontWeight: "600", marginTop: "4px", display: "block" }}>
                ⚠️ {passwordError}
              </span>
            )}

            <label className="register-remember">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Remember me on this device</span>
            </label>

            {/* Cloudflare Turnstile Bot Verification */}
            <TurnstileWidget
              onVerify={(token) => setTurnstileToken(token)}
              onExpire={() => setTurnstileToken("")}
            />

            <button type="submit" disabled={isSubmitting || !turnstileToken}>
              {isSubmitting ? "Creating..." : !turnstileToken ? "Verifying Security..." : "Register"}
            </button>
          </form>

          <p className="register-footer-text">
            Already have an account? <Link to="/login">Login</Link>
          </p>
        </section>
      </div>
    </div>
  );
}

export default Register;
