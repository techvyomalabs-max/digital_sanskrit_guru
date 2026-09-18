import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import axios from "axios";
import TurnstileWidget from "../components/common/TurnstileWidget";
import "./Login.css";

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [honeyPot, setHoneyPot] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setMessage("");

    if (!token) {
      setErrorMessage("Reset token is missing from the URL.");
      return;
    }
    if (!password) {
      setErrorMessage("Password is required.");
      return;
    }
    if (password.startsWith(" ") || password.endsWith(" ")) {
      setErrorMessage("Password cannot start or end with a space.");
      return;
    }
    if (password.trim().length < 8) {
      setErrorMessage("Password must be at least 8 characters long.");
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setErrorMessage("Password must contain at least one letter and one number.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    if (!turnstileToken) {
      setErrorMessage("Please complete the security verification before resetting your password.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await axios.post("/api/auth/reset-password", {
        token,
        password,
        honey_pot_field: honeyPot,
        turnstileToken
      });
      setMessage(res.data?.message || "Password reset successfully!");
      setPassword("");
      setConfirmPassword("");
      setTimeout(() => {
        navigate("/login");
      }, 3000);
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to reset password. Link may have expired.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="login-page">
      <div className="login-shell">
        <div className="login-brand">
          <p className="login-kicker">Secure Account</p>
          <h1>Set a new password</h1>
          <p>Create a secure, strong password to safeguard your digital account access.</p>
        </div>

        <div className="login-card">
          <h2>Reset Password</h2>

          {errorMessage && <p className="login-error">{errorMessage}</p>}
          {message && (
            <p className="login-success-msg">
              {message}
            </p>
          )}

          {!token ? (
            <div className="login-invalid-link-box">
              <p className="login-invalid-link-title">Invalid link.</p>
              <p>The password reset link is invalid or expired. Please request another one.</p>
              <Link to="/login" className="login-back-link">
                Back to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="login-form">
              {/* Invisible Honeypot field */}
              <input
                type="text"
                name="honey_pot_field"
                value={honeyPot}
                onChange={(e) => setHoneyPot(e.target.value)}
                style={{ display: "none", position: "absolute", left: "-9999px" }}
                tabIndex="-1"
                autoComplete="off"
              />

              <label htmlFor="reset-password">New Password</label>
              <div className="password-input-wrapper">
                <input
                  id="reset-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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

              <label htmlFor="reset-confirm-password">Confirm Password</label>
              <div className="password-input-wrapper">
                <input
                  id="reset-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  title={showConfirmPassword ? "Hide password" : "Show password"}
                  tabIndex="-1"
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {/* Cloudflare Turnstile Bot Verification */}
              <TurnstileWidget
                onVerify={(tok) => setTurnstileToken(tok)}
                onExpire={() => setTurnstileToken("")}
              />

              <button type="submit" disabled={isSubmitting || !turnstileToken}>
                {isSubmitting ? "Updating..." : !turnstileToken ? "Verifying Security..." : "Update Password"}
              </button>
            </form>
          )}

          <p className="login-footer-text">
            Remember your password? <Link to="/login">Sign In</Link>
          </p>
        </div>
      </div>
    </section>
  );
}

export default ResetPassword;
