import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import axios from "axios";
import "./Login.css";

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await axios.post("/api/auth/reset-password", {
        token,
        password
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
              <label htmlFor="reset-password">New Password</label>
              <input
                id="reset-password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <label htmlFor="reset-confirm-password">Confirm Password</label>
              <input
                id="reset-confirm-password"
                type="password"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />

              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Updating..." : "Update Password"}
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
