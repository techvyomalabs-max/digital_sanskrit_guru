import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import "./RedeemGift.css";

function RedeemGift() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [giftCode, setGiftCode] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [redeemedProduct, setRedeemedProduct] = useState(null);

  const handleRedeem = async (e) => {
    e.preventDefault();
    const cleanCode = giftCode.trim().toUpperCase();
    if (!cleanCode) {
      setErrorMsg("Please enter your Gift Pass Code.");
      return;
    }

    if (!token) {
      setErrorMsg("Please log in or create an account to redeem your gift pass.");
      navigate("/login", { state: { from: "/redeem-gift" } });
      return;
    }

    setIsRedeeming(true);
    setErrorMsg("");

    try {
      const response = await axios.post(
        "/api/gifts/redeem",
        { code: cleanCode },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data?.success) {
        showToast(response.data.message || "Gift Pass redeemed successfully!");
        setRedeemedProduct(response.data.product);
      }
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to redeem Gift Pass. Please check the code.";
      setErrorMsg(msg);
    } finally {
      setIsRedeeming(false);
    }
  };

  return (
    <div className="redeem-container">
      <div className="redeem-card">
        <div className="redeem-header">
          <div className="redeem-icon">🎟️</div>
          <h2>Redeem Your Gift Pass</h2>
          <p>Enter the 1-Time Gift Code you received to unlock your digital book or flipbook.</p>
        </div>

        {errorMsg && <div className="redeem-alert-error">{errorMsg}</div>}

        <form onSubmit={handleRedeem} className="redeem-form">
          <label className="redeem-field-label">
            <span>Gift Pass Code</span>
            <input
              type="text"
              placeholder="e.g. GIFT-DSG-849201"
              value={giftCode}
              onChange={(e) => setGiftCode(e.target.value.toUpperCase())}
              className="redeem-input"
              maxLength={20}
              required
            />
          </label>

          <button
            type="submit"
            className="redeem-submit-btn"
            disabled={isRedeeming || !giftCode.trim()}
          >
            {isRedeeming ? "Redeeming Pass..." : "Unlock My Gift"}
          </button>
        </form>

        <div className="redeem-footer-note">
          <p>💡 <strong>Note:</strong> Once redeemed, your gift will be permanently saved under <strong>Your Account -&gt; My Orders</strong>.</p>
        </div>
      </div>

      {redeemedProduct && (
        <div className="review-redirect-modal-backdrop" onClick={() => setRedeemedProduct(null)}>
          <div className="review-redirect-modal redeem-success-modal" onClick={(e) => e.stopPropagation()}>
            <div className="redeem-success-icon">🎉</div>
            <h3 className="redeem-success-title">Gift Unlocked Successfully!</h3>
            <p className="redeem-success-desc">
              You now have full access to <strong>{redeemedProduct.name}</strong>.
            </p>

            <div className="redeem-success-actions">
              <button
                type="button"
                className="review-redirect-btn-primary"
                onClick={() => {
                  setRedeemedProduct(null);
                  navigate("/my-orders");
                }}
              >
                Go to My Orders & Read 📖
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RedeemGift;
