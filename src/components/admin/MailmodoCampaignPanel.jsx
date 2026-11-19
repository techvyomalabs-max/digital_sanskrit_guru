import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { AlertTriangle, BarChart3, CheckCircle2, Clock, FlaskConical, ImagePlus, RefreshCw, Send, Users, XCircle } from "lucide-react";
import { formatDate, formatTime } from "../../utils/date";
import "./MailmodoCampaignPanel.css";

const EMPTY_CONTENT = { subject: "", heading: "", body: "", imageUrl: "", buttonText: "", buttonLink: "" };
const POLL_MS = 4000;

const STATUS_LABELS = {
  preparing: { label: "Sending", Icon: Clock, tone: "busy" },
  sending: { label: "Sending", Icon: Clock, tone: "busy" },
  sent: { label: "Sent", Icon: CheckCircle2, tone: "ok" },
  failed: { label: "Failed", Icon: XCircle, tone: "fail" }
};

function StatusBadge({ status }) {
  const { label, Icon, tone } = STATUS_LABELS[status] || STATUS_LABELS.preparing;
  return (
    <span className={`mmc-status ${tone}`}>
      <Icon size={13} aria-hidden="true" />
      {label}
    </span>
  );
}

function statValue(value) {
  return value === null || value === undefined ? "—" : Number(value).toLocaleString("en-IN");
}

/**
 * Write a promotion, test it on the team, and send it to a customer group through
 * Mailmodo — all from the admin dashboard. Mailmodo only supplies the template design.
 */
function MailmodoCampaignPanel({ getAuthHeaders, targetingOptions, uploadImage }) {
  const [content, setContent] = useState(EMPTY_CONTENT);
  const [filterType, setFilterType] = useState("all");
  const [filterValue, setFilterValue] = useState("");
  const [count, setCount] = useState(null);
  const [isCounting, setIsCounting] = useState(false);

  const [setup, setSetup] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(true);

  const [isTesting, setIsTesting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [refreshingId, setRefreshingId] = useState("");
  const [msg, setMsg] = useState({ text: "", error: false });

  const headers = useCallback(() => ({ headers: getAuthHeaders() }), [getAuthHeaders]);

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await axios.get("/api/marketing/mailmodo/campaigns", headers());
      setCampaigns(res.data?.campaigns || []);
      setSetup({
        ready: Boolean(res.data?.ready),
        hasApiKey: Boolean(res.data?.hasApiKey),
        hasCampaignId: Boolean(res.data?.hasCampaignId),
        teamOnly: Boolean(res.data?.teamOnly),
        teamEmails: res.data?.teamEmails || []
      });
    } catch (err) {
      setMsg({ text: err.response?.data?.message || "Could not load campaigns.", error: true });
    } finally {
      setIsLoadingCampaigns(false);
    }
    // getAuthHeaders is recreated each render by the parent; the token is what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  // Keep the history fresh while a campaign is still going out
  const hasBusyCampaign = campaigns.some((c) => c.status === "preparing" || c.status === "sending");
  useEffect(() => {
    if (!hasBusyCampaign) return undefined;
    const timer = setInterval(loadCampaigns, POLL_MS);
    return () => clearInterval(timer);
  }, [hasBusyCampaign, loadCampaigns]);

  // Live count of who would get it
  useEffect(() => {
    let cancelled = false;
    setIsConfirming(false);
    const needsValue = filterType !== "all" && !String(filterValue).trim();
    if (needsValue) {
      setCount(null);
      return undefined;
    }
    setIsCounting(true);
    const timer = setTimeout(async () => {
      try {
        const res = await axios.post("/api/marketing/recipient-preview", { filterType, filterValue }, headers());
        if (!cancelled) setCount(Number(res.data?.count || 0));
      } catch {
        if (!cancelled) setCount(null);
      } finally {
        if (!cancelled) setIsCounting(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterValue]);

  const update = (field) => (e) => {
    setContent((prev) => ({ ...prev, [field]: e.target.value }));
    setIsConfirming(false);
  };

  const handleImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !uploadImage) return;
    setIsUploading(true);
    try {
      const url = await uploadImage(file);
      setContent((prev) => ({ ...prev, imageUrl: url }));
    } catch (err) {
      setMsg({ text: err?.message || "Image upload failed.", error: true });
    } finally {
      setIsUploading(false);
    }
  };

  const sendTest = async () => {
    setIsTesting(true);
    setMsg({ text: "", error: false });
    try {
      const res = await axios.post("/api/marketing/mailmodo/campaigns/test", content, headers());
      setMsg({ text: res.data?.message || "Test sent.", error: false });
    } catch (err) {
      setMsg({ text: err.response?.data?.message || "Test failed.", error: true });
    } finally {
      setIsTesting(false);
    }
  };

  const send = async () => {
    setIsSending(true);
    setMsg({ text: "", error: false });
    try {
      const res = await axios.post(
        "/api/marketing/mailmodo/campaigns",
        { ...content, filterType, filterValue, confirmCount: count },
        headers()
      );
      setMsg({ text: res.data?.message || "Sending.", error: false });
      setContent(EMPTY_CONTENT);
      setIsConfirming(false);
      loadCampaigns();
    } catch (err) {
      const data = err.response?.data;
      if (typeof data?.count === "number") setCount(data.count);
      setMsg({ text: data?.message || "Could not send.", error: true });
      setIsConfirming(false);
    } finally {
      setIsSending(false);
    }
  };

  const refreshStats = async (id) => {
    setRefreshingId(id);
    try {
      const res = await axios.post(`/api/marketing/mailmodo/campaigns/${id}/stats`, {}, headers());
      const updated = res.data?.campaign;
      if (updated) setCampaigns((prev) => prev.map((c) => (c._id === id ? updated : c)));
    } catch (err) {
      setMsg({ text: err.response?.data?.message || "Could not load results.", error: true });
    } finally {
      setRefreshingId("");
    }
  };

  const ready = Boolean(setup?.ready);
  const hasContent = content.subject.trim() && content.body.trim();
  const canSend = ready && hasContent && Number(count) > 0 && !isCounting;
  const previewHeading = content.heading.trim() || content.subject.trim() || "Your heading";
  const previewParagraphs = content.body.trim() ? content.body.trim().split(/\n{2,}/) : [];

  return (
    <div className="mmc-panel">
      <div className="card mkt-card">
        <div className="mmc-head">
          <div>
            <h3 className="mmc-title"><Send size={17} className="ui-inline-icon" aria-hidden="true" />Send a promotion through Mailmodo</h3>
            <p className="mkt-hint mmc-intro">
              Write it here, send a test to the team, then send it to a customer group. Mailmodo delivers it using your
              template and handles unsubscribes. Order and account emails never go through Mailmodo.
            </p>
          </div>
        </div>

        {setup && !ready && (
          <div className="mmc-notice warn">
            <AlertTriangle size={16} aria-hidden="true" />
            <div>
              <strong>Not set up yet.</strong>{" "}
              {!setup.hasApiKey && <>Add <code>MAILMODO_API_KEY</code>. </>}
              {!setup.hasCampaignId && (
                <>Create one <em>triggered campaign</em> in Mailmodo with the slots{" "}
                  <code>{"{{heading}}"}</code> <code>{"{{body_html}}"}</code> <code>{"{{image_url}}"}</code>{" "}
                  <code>{"{{button_text}}"}</code> <code>{"{{button_link}}"}</code>, then add its ID as{" "}
                  <code>MAILMODO_CAMPAIGN_ID</code> in the server settings and restart.</>
              )}
            </div>
          </div>
        )}

        {setup?.teamOnly && (
          <div className="mmc-notice info">
            <FlaskConical size={16} aria-hidden="true" />
            <div>
              <strong>Team-only mode:</strong> every send goes only to {setup.teamEmails.join(", ")}. No real customer
              gets anything. Remove <code>MAILMODO_TEST_EMAILS</code> on the live server to send to customers.
            </div>
          </div>
        )}

        <div className="mkt-email-split-layout mmc-layout">
          <div>
            <div className="mkt-field">
              <label htmlFor="mmc-audience">Who gets it</label>
              <select
                id="mmc-audience"
                value={filterType}
                onChange={(e) => {
                  setFilterType(e.target.value);
                  setFilterValue("");
                }}
              >
                <option value="all">All customers</option>
                <option value="category">Customers who bought from a category</option>
                <option value="product">Customers who bought a product</option>
                <option value="minSpend">Customers who spent at least</option>
              </select>
            </div>

            {filterType === "category" && (
              <div className="mkt-field">
                <label htmlFor="mmc-category">Category</label>
                <select id="mmc-category" value={filterValue} onChange={(e) => setFilterValue(e.target.value)}>
                  <option value="">Choose a category</option>
                  {targetingOptions?.categories?.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
            )}
            {filterType === "product" && (
              <div className="mkt-field">
                <label htmlFor="mmc-product">Product</label>
                <select id="mmc-product" value={filterValue} onChange={(e) => setFilterValue(e.target.value)}>
                  <option value="">Choose a product</option>
                  {targetingOptions?.products?.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
              </div>
            )}
            {filterType === "minSpend" && (
              <div className="mkt-field">
                <label htmlFor="mmc-spend">Minimum total spend (₹)</label>
                <input id="mmc-spend" type="number" min="0" placeholder="For example 500" value={filterValue} onChange={(e) => setFilterValue(e.target.value)} />
              </div>
            )}

            <p className="mmc-count" aria-live="polite">
              <Users size={15} aria-hidden="true" />
              {isCounting ? "Counting..." : count === null ? "Choose a group to see how many customers it reaches." : (
                <><strong>{count.toLocaleString("en-IN")}</strong>&nbsp;customer{count === 1 ? "" : "s"} (paid orders only; unsubscribed and blocked customers left out)</>
              )}
            </p>

            <div className="mkt-field">
              <label htmlFor="mmc-subject">Subject line</label>
              <input id="mmc-subject" maxLength={150} placeholder="For example: 20% off all Sanskrit books this Diwali" value={content.subject} onChange={update("subject")} />
            </div>
            <div className="mkt-field">
              <label htmlFor="mmc-heading">Heading <span className="mmc-optional">(optional, uses the subject if empty)</span></label>
              <input id="mmc-heading" maxLength={150} value={content.heading} onChange={update("heading")} />
            </div>
            <div className="mkt-field">
              <label htmlFor="mmc-body">Message</label>
              <textarea id="mmc-body" rows={7} maxLength={5000} placeholder="Leave an empty line between paragraphs." value={content.body} onChange={update("body")} />
            </div>
            <div className="mkt-field">
              <label htmlFor="mmc-image">Image <span className="mmc-optional">(optional)</span></label>
              <div className="mkt-inline">
                <input id="mmc-image" placeholder="https://..." value={content.imageUrl} onChange={update("imageUrl")} />
                {uploadImage && (
                  <label className="secondary-btn btn-sm mmc-upload">
                    <ImagePlus size={14} aria-hidden="true" />
                    {isUploading ? "Uploading..." : "Upload"}
                    <input type="file" accept="image/*" hidden onChange={handleImage} disabled={isUploading} />
                  </label>
                )}
              </div>
            </div>
            <div className="mkt-field-row">
              <div className="mkt-field">
                <label htmlFor="mmc-btn-text">Button text <span className="mmc-optional">(optional)</span></label>
                <input id="mmc-btn-text" maxLength={40} placeholder="Shop now" value={content.buttonText} onChange={update("buttonText")} />
              </div>
              <div className="mkt-field">
                <label htmlFor="mmc-btn-link">Button link</label>
                <input id="mmc-btn-link" placeholder="/collection or https://..." value={content.buttonLink} onChange={update("buttonLink")} />
              </div>
            </div>

            {msg.text && <p className={`mkt-msg ${msg.error ? "mmc-error" : ""}`}>{msg.text}</p>}

            <div className="mkt-actions">
              <button type="button" className="secondary-btn" onClick={sendTest} disabled={!ready || !hasContent || isTesting}>
                <FlaskConical size={15} className="ui-inline-icon" aria-hidden="true" />
                {isTesting ? "Sending test..." : "Send test to team"}
              </button>
              {!isConfirming ? (
                <button type="button" className="primary-btn" onClick={() => setIsConfirming(true)} disabled={!canSend || isSending}>
                  <Send size={15} className="ui-inline-icon" aria-hidden="true" />
                  Send to {count === null ? "..." : count.toLocaleString("en-IN")} customer{count === 1 ? "" : "s"}
                </button>
              ) : null}
            </div>

            {isConfirming && (
              <div className="mmc-confirm" role="alertdialog" aria-label="Confirm sending">
                <p>
                  This sends <strong>"{content.subject.trim()}"</strong> to{" "}
                  <strong>{Number(count).toLocaleString("en-IN")} customer{count === 1 ? "" : "s"}</strong>
                  {setup?.teamOnly ? " (team-only mode)" : ""}. It can't be undone.
                </p>
                <div className="mkt-actions">
                  <button type="button" className="primary-btn" onClick={send} disabled={isSending}>
                    {isSending ? "Sending..." : "Yes, send it"}
                  </button>
                  <button type="button" className="secondary-btn" onClick={() => setIsConfirming(false)} disabled={isSending}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="card mkt-card mkt-live-email-card">
            <div className="mkt-live-header">
              <span className="mkt-live-title">Preview</span>
              <span className="mkt-live-tag">Content only</span>
            </div>
            <div className="mkt-email-preview-frame mmc-preview">
              <p className="mmc-preview-subject"><strong>Subject:</strong> {content.subject || "Your subject line"}</p>
              {content.imageUrl.trim().startsWith("https://") && (
                <img src={content.imageUrl.trim()} alt="" className="mmc-preview-image" />
              )}
              <h4>{previewHeading}</h4>
              {previewParagraphs.length > 0 ? (
                previewParagraphs.map((p, i) => <p key={i}>{p}</p>)
              ) : (
                <p className="mmc-placeholder">Your message appears here.</p>
              )}
              {content.buttonText.trim() && <span className="mmc-preview-button">{content.buttonText}</span>}
              <p className="mmc-preview-note">Logo, colours, footer and the unsubscribe link come from the Mailmodo template.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card mkt-card">
        <div className="mmc-head">
          <h3 className="mmc-title"><BarChart3 size={17} className="ui-inline-icon" aria-hidden="true" />Past campaigns</h3>
          <button type="button" className="secondary-btn btn-sm" onClick={loadCampaigns}>
            <RefreshCw size={14} className="ui-inline-icon" aria-hidden="true" />Refresh
          </button>
        </div>
        {isLoadingCampaigns ? (
          <p className="mkt-empty">Loading...</p>
        ) : campaigns.length === 0 ? (
          <p className="mkt-empty">No campaigns sent yet.</p>
        ) : (
          <div className="mkt-table-wrap">
            <table className="mkt-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Subject</th>
                  <th>Group</th>
                  <th>Customers</th>
                  <th>Status</th>
                  <th>Opened</th>
                  <th>Clicked</th>
                  <th>Unsub.</th>
                  <th>Sent by</th>
                  <th aria-label="Results" />
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c._id}>
                    <td>{formatDate(c.sentAt || c.createdAt)} {formatTime(c.sentAt || c.createdAt)}</td>
                    <td>
                      {c.subject}
                      <span className="mmc-channel">{c.channel === "smtp" ? "Site email server" : "Mailmodo"}{c.teamOnly ? " · team only" : ""}</span>
                    </td>
                    <td>{c.audience?.label || "—"}</td>
                    <td>{Number(c.recipientCount || 0).toLocaleString("en-IN")}</td>
                    <td>
                      <StatusBadge status={c.status} />
                      {c.error && <span className="mmc-row-error">{c.error}</span>}
                    </td>
                    <td>{statValue(c.stats?.opened)}</td>
                    <td>{statValue(c.stats?.clicked)}</td>
                    <td>{statValue(c.stats?.unsubscribed)}</td>
                    <td>{c.createdBy?.name || c.createdBy?.email || "—"}</td>
                    <td>
                      {c.channel === "mailmodo" && c.status === "sent" && (
                        <button
                          type="button"
                          className="secondary-btn btn-sm"
                          onClick={() => refreshStats(c._id)}
                          disabled={refreshingId === c._id}
                          title={c.stats?.error || "Get the latest results from Mailmodo"}
                        >
                          <RefreshCw size={13} className={refreshingId === c._id ? "mmc-spin" : ""} aria-hidden="true" />
                          <span className="mmc-sr">Refresh results</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mkt-hint mmc-footnote">
          Results come from Mailmodo and cover the day the campaign was sent, so they're exact when you send one campaign a day.
        </p>
      </div>
    </div>
  );
}

export default MailmodoCampaignPanel;
