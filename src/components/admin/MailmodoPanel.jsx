import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { CheckCircle2, Clock, RefreshCw, Send, ServerCog, UserMinus, Users, XCircle } from "lucide-react";
import { formatDate, formatTime } from "../../utils/date";
import "./MailmodoPanel.css";

const POLL_MS = 3000;

function StatusItem({ on, label, offLabel }) {
  const Icon = on ? CheckCircle2 : XCircle;
  return (
    <li className={`mailmodo-check ${on ? "on" : "off"}`}>
      <Icon size={16} aria-hidden="true" />
      <span>{on ? label : offLabel}</span>
    </li>
  );
}

function describeResult(result) {
  if (!result) return "";
  const parts = [`${result.added || 0} added`, `${result.removed || 0} unsubscribed`];
  if (result.resubscribed) parts.push(`${result.resubscribed} re-added after reactivation`);
  if (result.failed) parts.push(`${result.failed} failed`);
  return parts.join(" · ");
}

function MailmodoPanel({ getAuthHeaders, defaultTestEmail = "" }) {
  const [status, setStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [syncMsg, setSyncMsg] = useState({ text: "", error: false });
  const [isStarting, setIsStarting] = useState(false);
  const [testTo, setTestTo] = useState(defaultTestEmail);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testMsg, setTestMsg] = useState({ text: "", error: false });

  const loadStatus = useCallback(async () => {
    try {
      const res = await axios.get("/api/marketing/mailmodo/status", { headers: getAuthHeaders() });
      setStatus(res.data);
      setLoadError("");
    } catch (err) {
      setLoadError(err.response?.data?.message || "Could not load the Mailmodo status.");
    } finally {
      setIsLoading(false);
    }
    // getAuthHeaders is recreated each render by the parent; the token is what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Refresh while a sync is running so the counts update by themselves
  useEffect(() => {
    if (!status?.running) return undefined;
    const timer = setInterval(loadStatus, POLL_MS);
    return () => clearInterval(timer);
  }, [status?.running, loadStatus]);

  const startSync = async (full) => {
    setIsStarting(true);
    setSyncMsg({ text: "", error: false });
    try {
      const res = await axios.post("/api/marketing/mailmodo/sync", { full }, { headers: getAuthHeaders() });
      setSyncMsg({ text: res.data?.message || "Sync started.", error: false });
      setStatus((prev) => (prev ? { ...prev, running: true } : prev));
      setTimeout(loadStatus, 1000);
    } catch (err) {
      setSyncMsg({ text: err.response?.data?.message || "Could not start the sync.", error: true });
    } finally {
      setIsStarting(false);
    }
  };

  const sendPromoTest = async (event) => {
    event.preventDefault();
    setIsSendingTest(true);
    setTestMsg({ text: "", error: false });
    try {
      const res = await axios.post(
        "/api/marketing/test-email",
        { to: testTo.trim(), stream: "marketing" },
        { headers: getAuthHeaders() }
      );
      setTestMsg({ text: res.data?.message || "Test email sent.", error: false });
    } catch (err) {
      setTestMsg({ text: err.response?.data?.message || "Test email failed.", error: true });
    } finally {
      setIsSendingTest(false);
    }
  };

  if (isLoading) return <p className="mkt-empty">Loading Mailmodo status...</p>;
  if (!status) return <p className="mkt-empty">{loadError || "Could not load the Mailmodo status."}</p>;

  const lastResult = status.lastResult;

  return (
    <div className="mailmodo-panel">
      <div className="card mkt-card">
        <div className="mkt-stock-header">
          <div>
            <h3 className="mailmodo-title">Mailmodo promotions</h3>
            <p className="mkt-hint mailmodo-intro">
              Customers who haven't unsubscribed are kept on your Mailmodo list, so you can design and send
              newsletters, offers and journeys from Mailmodo. Order, payment and password emails never go through Mailmodo.
            </p>
          </div>
          <button type="button" className="secondary-btn" onClick={loadStatus} aria-label="Refresh Mailmodo status">
            <RefreshCw size={15} className="ui-inline-icon" aria-hidden="true" />Refresh
          </button>
        </div>

        <ul className="mailmodo-checks">
          <StatusItem on={status.configured} label={`Connected to list "${status.listName}"`} offLabel="Mailmodo not connected" />
          <StatusItem on={status.autoSync} label="Syncs new customers every hour" offLabel="Automatic sync off" />
          <StatusItem on={status.webhookConfigured} label="Unsubscribes in Mailmodo sync back here" offLabel="Unsubscribe webhook not set up" />
          <StatusItem on={status.marketingSmtpConfigured} label="Site promotions use a separate email server" offLabel="Site promotions use the main email server" />
        </ul>

        {!status.configured && (
          <div className="mailmodo-setup">
            <p><strong>To connect Mailmodo</strong>, add these to the server settings (<code>backend/.env</code>) and restart the server:</p>
            <ul>
              <li><code>MAILMODO_API_KEY</code>: from Mailmodo → Settings → API Keys</li>
              <li><code>MAILMODO_LIST_NAME</code>: the contact list customers are added to, for example <em>DSG Customers</em></li>
              <li><code>MAILMODO_WEBHOOK_SECRET</code>: any long random text, used in the webhook address below</li>
            </ul>
          </div>
        )}

        {status.configured && !status.webhookConfigured && (
          <p className="mkt-hint mailmodo-warn">
            Add <code>MAILMODO_WEBHOOK_SECRET</code> so people who unsubscribe inside Mailmodo also stop getting the site's own promotional emails.
          </p>
        )}

        {status.webhookConfigured && (
          <p className="mkt-hint">
            Webhook address for Mailmodo (unsubscribe and spam events):{" "}
            <code className="mailmodo-code">{window.location.origin}/api/mailmodo/webhook?token=&lt;MAILMODO_WEBHOOK_SECRET&gt;</code>
          </p>
        )}
      </div>

      <div className="mkt-stat-grid">
        <div className="mkt-stat-card">
          <span className="mkt-stat-icon"><Users size={22} aria-hidden="true" /></span>
          <div>
            <p className="mkt-stat-label">On the Mailmodo list</p>
            <p className="mkt-stat-value">{status.syncedCount}</p>
          </div>
        </div>
        <div className="mkt-stat-card">
          <span className="mkt-stat-icon"><Clock size={22} aria-hidden="true" /></span>
          <div>
            <p className="mkt-stat-label">Waiting to sync</p>
            <p className="mkt-stat-value">{status.pendingCount}</p>
          </div>
        </div>
        <div className="mkt-stat-card">
          <span className="mkt-stat-icon"><UserMinus size={22} aria-hidden="true" /></span>
          <div>
            <p className="mkt-stat-label">Unsubscribed from promotions</p>
            <p className="mkt-stat-value">{status.optedOutCount}</p>
          </div>
        </div>
      </div>

      <div className="card mkt-card">
        <h3 className="mailmodo-title">Sync</h3>
        <p className="mkt-hint">
          <strong>Sync now</strong> adds customers who aren't on the list yet and removes anyone who unsubscribed,
          was blocked or was deleted. <strong>Full resync</strong> also refreshes the names of everyone already on the list.
          Customers from the last 7 days are added so they can enter a Mailmodo welcome journey; older customers are added
          without starting journeys.
        </p>

        <div className="mkt-status-row" aria-live="polite">
          {status.running ? (
            <><RefreshCw size={14} className="mailmodo-spin" aria-hidden="true" />Sync in progress...</>
          ) : status.lastRunAt ? (
            <>
              <span className={`mkt-status-dot ${lastResult?.error ? "off" : "on"}`} />
              Last sync {formatDate(status.lastRunAt)} {formatTime(status.lastRunAt)}: {describeResult(lastResult)}
            </>
          ) : (
            <>No sync has run yet.</>
          )}
        </div>
        {!status.running && lastResult?.error && (
          <p className="mkt-msg error">Last sync stopped: {lastResult.error}</p>
        )}

        <div className="mkt-actions">
          <button
            type="button"
            className="primary-btn"
            onClick={() => startSync(false)}
            disabled={!status.configured || status.running || isStarting}
          >
            <RefreshCw size={15} className="ui-inline-icon" aria-hidden="true" />
            {isStarting ? "Starting..." : "Sync now"}
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => startSync(true)}
            disabled={!status.configured || status.running || isStarting}
          >
            Full resync
          </button>
        </div>
        {syncMsg.text && <p className={`mkt-msg ${syncMsg.error ? "error" : "success"}`}>{syncMsg.text}</p>}
      </div>

      <div className="card mkt-card">
        <h3 className="mailmodo-title"><ServerCog size={17} className="ui-inline-icon" aria-hidden="true" />Promotional email server</h3>
        <p className="mkt-hint">
          The site's own promotions (Email Campaign broadcasts and wishlist reminders) go through a second email server when
          <code> MARKETING_SMTP_HOST</code>, <code>MARKETING_SMTP_USER</code> and <code>MARKETING_SMTP_PASS</code> are set
          (optionally <code>MARKETING_SMTP_PORT</code> and <code>MARKETING_SENDER_EMAIL</code>). Until then they use the main server.
        </p>
        <form className="mailmodo-test" onSubmit={sendPromoTest}>
          <div className="mkt-field">
            <label htmlFor="mailmodo-test-to">Send a test through the promotional server</label>
            <input
              id="mailmodo-test-to"
              type="email"
              required
              placeholder="you@example.com"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
            />
          </div>
          <button type="submit" className="secondary-btn" disabled={isSendingTest || !status.marketingSmtpConfigured}>
            <Send size={15} className="ui-inline-icon" aria-hidden="true" />
            {isSendingTest ? "Sending..." : "Send test"}
          </button>
        </form>
        {testMsg.text && <p className={`mkt-msg ${testMsg.error ? "error" : "success"}`}>{testMsg.text}</p>}
      </div>
    </div>
  );
}

export default MailmodoPanel;
