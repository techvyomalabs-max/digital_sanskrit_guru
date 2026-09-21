import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { MessageCircle, CheckCircle2, AlertCircle, RefreshCw, X, ShieldCheck } from "lucide-react";
import "./WhatsAppOtpModal.css";

export default function WhatsAppOtpModal({
  phone,
  isOpen,
  onClose,
  onVerified,
  autoSend = true
}) {
  const [otpValues, setOtpValues] = useState(["", "", "", "", "", ""]);
  const [timer, setTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const inputRefs = useRef([]);

  // Send OTP
  const sendOtp = async () => {
    if (!phone) return;
    setIsSending(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const res = await axios.post("/api/auth/send-whatsapp-otp", { phone });
      setStatusMessage(res.data?.message || `OTP sent to WhatsApp (+${phone.replace(/^\+/, "")})`);
      setTimer(60);
      setCanResend(false);
      setOtpValues(["", "", "", "", "", ""]);
      setTimeout(() => {
        if (inputRefs.current[0]) inputRefs.current[0].focus();
      }, 100);
    } catch (err) {
      setErrorMessage(err?.response?.data?.message || "Failed to send WhatsApp OTP. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setIsSuccess(false);
      setOtpValues(["", "", "", "", "", ""]);
      setErrorMessage("");
      setStatusMessage("");
      if (autoSend) {
        sendOtp();
      }
    }
  }, [isOpen, phone]);

  // Countdown timer
  useEffect(() => {
    let interval = null;
    if (isOpen && timer > 0 && !canResend) {
      interval = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            setCanResend(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isOpen, timer, canResend]);

  const handleOtpChange = (index, value) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const newOtp = [...otpValues];
    newOtp[index] = digit;
    setOtpValues(newOtp);
    setErrorMessage("");

    // Auto-advance to next input
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto verify if all 6 digits entered
    if (digit && index === 5 && newOtp.every((d) => d !== "")) {
      verifyOtp(newOtp.join(""));
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otpValues[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pastedData) return;

    const newOtp = ["", "", "", "", "", ""];
    for (let i = 0; i < pastedData.length; i++) {
      newOtp[i] = pastedData[i];
    }
    setOtpValues(newOtp);
    setErrorMessage("");

    const targetIdx = Math.min(pastedData.length, 5);
    inputRefs.current[targetIdx]?.focus();

    if (pastedData.length === 6) {
      verifyOtp(pastedData);
    }
  };

  const verifyOtp = async (codeToVerify) => {
    const code = codeToVerify || otpValues.join("");
    if (code.length < 6) {
      setErrorMessage("Please enter all 6 digits of the OTP.");
      return;
    }

    setIsVerifying(true);
    setErrorMessage("");
    try {
      const res = await axios.post("/api/auth/verify-whatsapp-otp", {
        phone,
        otp: code
      });

      if (res.data?.success) {
        setIsSuccess(true);
        setStatusMessage("Phone number verified successfully!");
        setTimeout(() => {
          if (onVerified) {
            onVerified({
              phone: res.data.phone || phone,
              phoneVerificationToken: res.data.phoneVerificationToken
            });
          }
          if (onClose) onClose();
        }, 1200);
      } else {
        setErrorMessage(res.data?.message || "Verification failed. Please try again.");
      }
    } catch (err) {
      setErrorMessage(err?.response?.data?.message || "Invalid or expired OTP code.");
    } finally {
      setIsVerifying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="whatsapp-otp-overlay" onClick={onClose} role="presentation">
      <div className="whatsapp-otp-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button type="button" className="whatsapp-otp-close-btn" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        <div className="whatsapp-otp-icon-header">
          <div className="whatsapp-otp-icon-bubble">
            <MessageCircle size={32} className="whatsapp-green-icon" />
          </div>
          <span className="whatsapp-otp-brand-badge">
            <ShieldCheck size={13} /> WhatsApp Verification
          </span>
        </div>

        <h3 className="whatsapp-otp-title">Verify Phone Number</h3>
        <p className="whatsapp-otp-subtitle">
          We have sent a 6-digit verification code to your WhatsApp:
          <strong className="whatsapp-otp-phone-display">+{phone.replace(/^\+/, "")}</strong>
        </p>

        {isSuccess ? (
          <div className="whatsapp-otp-success-card">
            <CheckCircle2 size={36} className="whatsapp-success-icon" />
            <h4>Verified Successfully!</h4>
            <p>Your phone number is confirmed.</p>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              verifyOtp();
            }}
            className="whatsapp-otp-form"
          >
            <div className="whatsapp-otp-digits-wrap" onPaste={handlePaste}>
              {otpValues.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => (inputRefs.current[index] = el)}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  disabled={isVerifying || isSuccess}
                  className={`whatsapp-otp-digit-box ${digit ? "filled" : ""}`}
                  autoComplete="one-time-code"
                />
              ))}
            </div>

            {statusMessage && !errorMessage && (
              <p className="whatsapp-otp-status-msg">
                <CheckCircle2 size={14} /> {statusMessage}
              </p>
            )}

            {errorMessage && (
              <p className="whatsapp-otp-error-msg">
                <AlertCircle size={14} /> {errorMessage}
              </p>
            )}

            <button
              type="submit"
              className="whatsapp-otp-verify-btn"
              disabled={isVerifying || isSending || otpValues.some((d) => !d)}
            >
              {isVerifying ? (
                <>
                  <RefreshCw size={16} className="spin" /> Verifying OTP...
                </>
              ) : (
                "Verify Code"
              )}
            </button>

            <div className="whatsapp-otp-resend-row">
              {canResend ? (
                <button
                  type="button"
                  className="whatsapp-otp-resend-btn"
                  onClick={sendOtp}
                  disabled={isSending}
                >
                  <RefreshCw size={13} className={isSending ? "spin" : ""} /> Resend OTP on WhatsApp
                </button>
              ) : (
                <span className="whatsapp-otp-timer-text">
                  Resend code in <strong>{timer}s</strong>
                </span>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
