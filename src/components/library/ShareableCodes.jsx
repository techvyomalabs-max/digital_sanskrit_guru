import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Gift, Copy, Check, Share2, ChevronDown } from "lucide-react";
import "./ShareableCodes.css";

const STATUS_LABEL = { available: "Ready to share", redeemed: "Redeemed", revoked: "No longer valid" };

/**
 * The codes this customer bought: gift orders and extra copies of digital products. Each code
 * gives one person the product in their own library (Redeem Gift Pass). Hidden when there are none.
 */
function ShareableCodes({ token, refreshKey = 0 }) {
  const [codes, setCodes] = useState([]);
  const [copied, setCopied] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    axios
      .get("/api/gifts/my-codes", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (active) setCodes(Array.isArray(res.data?.codes) ? res.data.codes : []);
      })
      .catch(() => {
        if (active) setCodes([]);
      });
    return () => {
      active = false;
    };
  }, [token, refreshKey]);

  const available = useMemo(() => codes.filter((c) => c.status === "available"), [codes]);
  const visible = showAll ? codes : codes.slice(0, 6);
  if (codes.length === 0) return null;

  const shareText = (c) =>
    `Here's your copy of "${c.productName}" from Digital Sanskrit Guru. Sign in at ${window.location.origin}/my-library, choose "Redeem Gift Pass" and enter: ${c.code}`;

  const copyCode = async (c) => {
    try {
      await navigator.clipboard.writeText(shareText(c));
      setCopied(c.id);
      setTimeout(() => setCopied((cur) => (cur === c.id ? "" : cur)), 2000);
    } catch {
      setCopied("");
    }
  };

  const shareCode = async (c) => {
    if (navigator.share) {
      try {
        await navigator.share({ title: c.productName, text: shareText(c) });
        return;
      } catch {
        // cancelled or unavailable: fall back to copying
      }
    }
    copyCode(c);
  };

  return (
    <section className="shareable-codes" aria-labelledby="shareable-codes-title">
      <div className="shareable-codes-head">
        <h2 id="shareable-codes-title">
          <Gift size={18} aria-hidden="true" />
          My shareable copies
        </h2>
        <p>
          {available.length > 0
            ? `${available.length} ${available.length === 1 ? "code is" : "codes are"} ready to give. Each code gives one person the item in their own library.`
            : "All your codes have been used."}
        </p>
      </div>

      <ul className="shareable-codes-list">
        {visible.map((c) => (
          <li key={c.id} className={`shareable-code is-${c.status}`}>
            <div className="shareable-code-main">
              <strong>{c.productName}</strong>
              <span className="shareable-code-meta">
                Order #{c.orderRef}
                {c.status === "redeemed" && c.redeemedByName ? ` · redeemed by ${c.redeemedByName}` : ""}
              </span>
            </div>
            <div className="shareable-code-side">
              {c.status === "available" ? (
                <>
                  <code className="shareable-code-value">{c.code}</code>
                  <button type="button" className="shareable-code-btn" onClick={() => copyCode(c)} aria-label={`Copy code for ${c.productName}`}>
                    {copied === c.id ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                    {copied === c.id ? "Copied" : "Copy"}
                  </button>
                  <button type="button" className="shareable-code-btn" onClick={() => shareCode(c)} aria-label={`Share code for ${c.productName}`}>
                    <Share2 size={15} aria-hidden="true" />
                    Share
                  </button>
                </>
              ) : (
                <span className={`shareable-code-status is-${c.status}`}>{STATUS_LABEL[c.status]}</span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {codes.length > 6 && (
        <button type="button" className="shareable-codes-more" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
          <ChevronDown size={16} aria-hidden="true" className={showAll ? "is-open" : ""} />
          {showAll ? "Show fewer" : `Show all ${codes.length} codes`}
        </button>
      )}
    </section>
  );
}

export default ShareableCodes;
