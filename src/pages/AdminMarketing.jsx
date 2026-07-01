import { useEffect, useRef, useState } from "react";
import axios from "axios";
import AdminSidebar from "../components/admin/AdminSidebar";
import { useAuth } from "../hooks/useAuth";
import "./AdminMarketing.css";
import "./AdminShared.css";

const TABS = ["Overview", "Email Campaign", "Push Notification", "Customer Segments", "Low-Stock Alerts", "Order Email Draft", "Sponsors"];

function AdminMarketing() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState(0);

  // ── Sponsors state ────────────────────────────────────────────────────────
  const [sponsors, setSponsors] = useState([]);
  const [sponsorName, setSponsorName] = useState("");
  const [sponsorDesc, setSponsorDesc] = useState("");
  const [sponsorLogoUrl, setSponsorLogoUrl] = useState("");
  const [sponsorWebsiteUrl, setSponsorWebsiteUrl] = useState("");
  const [editingSponsorId, setEditingSponsorId] = useState(null);
  const [isSavingSponsors, setIsSavingSponsors] = useState(false);
  const [sponsorsMsg, setSponsorsMsg] = useState("");

  // ── Overview state ─────────────────────────────────────────────────────────
  const [stats, setStats] = useState(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // ── Email campaign state ───────────────────────────────────────────────────
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");
  const [emailLog, setEmailLog] = useState([]);
  const [isLoadingLog, setIsLoadingLog] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState("");
  const [isSendingTest, setIsSendingTest] = useState(false);

  // ── Customer Targeting states ──────────────────────────────────────────────
  const [targetingOptions, setTargetingOptions] = useState({ categories: [], products: [] });
  const [filterType, setFilterType] = useState("all");
  const [filterValue, setFilterValue] = useState("");
  const [recipientCount, setRecipientCount] = useState(0);
  const [recipientPreview, setRecipientPreview] = useState([]);
  // ── Customer Segments states ───────────────────────────────────────────────
  const [segFilterType, setSegFilterType] = useState("all");
  const [segFilterValue, setSegFilterValue] = useState("");
  const [segmentedCustomers, setSegmentedCustomers] = useState([]);
  const [isLoadingSegments, setIsLoadingSegments] = useState(false);

  // ── Push notification state ────────────────────────────────────────────────
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [pushUrl, setPushUrl] = useState("/");
  const [isSendingPush, setIsSendingPush] = useState(false);
  const [pushMsg, setPushMsg] = useState("");
  const [pushPermission, setPushPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );

  // ── Low-stock state ────────────────────────────────────────────────────────
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [threshold, setThreshold] = useState(5);
  const [notifEmail, setNotifEmail] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [isLoadingStock, setIsLoadingStock] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSendingAlert, setIsSendingAlert] = useState(false);
  const [stockMsg, setStockMsg] = useState("");

  // ── Order Email Draft state ───────────────────────────────────────────────
  const [orderEmailSubject, setOrderEmailSubject] = useState("");
  const [orderEmailBody, setOrderEmailBody] = useState("");
  const [orderEmailHeaderBg, setOrderEmailHeaderBg] = useState("#1a1a2e");
  const [orderEmailAccent, setOrderEmailAccent] = useState("#e94560");
  const [orderEmailHeaderText, setOrderEmailHeaderText] = useState("Digital Sanskrit Guru");
  const [orderEmailHeaderSub, setOrderEmailHeaderSub] = useState("Spreading the wisdom of Sanskrit");
  const [isSavingOrderEmail, setIsSavingOrderEmail] = useState(false);
  const [orderEmailMsg, setOrderEmailMsg] = useState("");

  const headers = { Authorization: `Bearer ${token}` };

  // ── Load stats ────────────────────────────────────────────────────────────
  const loadStats = async () => {
    setIsLoadingStats(true);
    try {
      const res = await axios.get("/api/marketing/subscribers", { headers });
      setStats(res.data);
      setThreshold(res.data.lowStockThreshold ?? 5);
      setNotifEmail(res.data.notificationEmail || "");
      setEmailEnabled(res.data.emailEnabled !== false);
      setPushEnabled(res.data.pushEnabled !== false);
    } catch {
      setStats(null);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const loadLowStock = async () => {
    setIsLoadingStock(true);
    try {
      const res = await axios.get("/api/marketing/low-stock", { headers });
      setLowStockProducts(res.data.products || []);
    } catch {
      setLowStockProducts([]);
    } finally {
      setIsLoadingStock(false);
    }
  };

  const loadEmailLog = async () => {
    setIsLoadingLog(true);
    try {
      const res = await axios.get("/api/marketing/email-log?limit=30", { headers });
      setEmailLog(Array.isArray(res.data) ? res.data : []);
    } catch {
      setEmailLog([]);
    } finally {
      setIsLoadingLog(false);
    }
  };

  const loadOrderEmailSettings = async () => {
    try {
      const res = await axios.get("/api/settings", { headers });
      if (res.data?.orderConfirmationEmail) {
        const config = res.data.orderConfirmationEmail;
        setOrderEmailSubject(config.subjectTemplate || "Order Confirmed — {{SITE_NAME}}");
        setOrderEmailBody(config.bodyTemplate || "");
        setOrderEmailHeaderBg(config.headerBgColor || "#1a1a2e");
        setOrderEmailAccent(config.accentColor || "#e94560");
        setOrderEmailHeaderText(config.headerText || "Digital Sanskrit Guru");
        setOrderEmailHeaderSub(config.headerSubtext || "Spreading the wisdom of Sanskrit");
      }
      if (res.data?.sponsors) {
        setSponsors(res.data.sponsors);
      }
    } catch (err) {
      console.error("Failed to load settings data", err);
    }
  };

  const loadTargetingOptions = async () => {
    try {
      const res = await axios.get("/api/marketing/targeting-options", { headers });
      setTargetingOptions(res.data);
    } catch (err) {
      console.error("Failed to load targeting options", err);
    }
  };

  const loadRecipientPreview = async () => {
    setIsLoadingPreview(true);
    try {
      const res = await axios.post("/api/marketing/recipient-preview", {
        filterType,
        filterValue
      }, { headers });
      setRecipientCount(res.data.count);
      setRecipientPreview(res.data.recipients || []);
    } catch (err) {
      console.error("Failed to load recipient preview", err);
      setRecipientCount(0);
      setRecipientPreview([]);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const loadSegmentedCustomers = async () => {
    setIsLoadingSegments(true);
    try {
      const res = await axios.post("/api/marketing/segmented-customers", {
        filterType: segFilterType,
        filterValue: segFilterValue
      }, { headers });
      setSegmentedCustomers(res.data.customers || []);
    } catch (err) {
      console.error("Failed to load segmented customers", err);
      setSegmentedCustomers([]);
    } finally {
      setIsLoadingSegments(false);
    }
  };

  useEffect(() => {
    if (activeTab === 3) {
      loadSegmentedCustomers();
    }
  }, [segFilterType, segFilterValue, activeTab]);

  useEffect(() => {
    loadStats();
    loadLowStock();
    loadOrderEmailSettings();
    loadTargetingOptions();
  }, []);

  useEffect(() => {
    loadRecipientPreview();
  }, [filterType, filterValue]);

  useEffect(() => { if (activeTab === 1) loadEmailLog(); }, [activeTab]);

  // ── Push permission ───────────────────────────────────────────────────────
  const requestPushPermission = async () => {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPushPermission(result);

    if (result !== "granted") return;
    try {
      const sw = await navigator.serviceWorker.ready;
      const keyRes = await fetch("/api/push/vapid-key");
      if (!keyRes.ok) return;
      const { publicKey } = await keyRes.json();
      if (!publicKey) return;

      const existing = await sw.pushManager.getSubscription();
      if (existing) return;

      const padding = "=".repeat((4 - (publicKey.length % 4)) % 4);
      const base64 = (publicKey + padding).replace(/-/g, "+").replace(/_/g, "/");
      const raw = window.atob(base64);
      const key = Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));

      const sub = await sw.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await axios.post("/api/push/subscribe", sub.toJSON(), { headers });
      loadStats();
    } catch {
      // ignore
    }
  };

  // ── Actions ───────────────────────────────────────────────────────────────
  const sendEmailCampaign = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) {
      setEmailMsg("Subject and body are required.");
      return;
    }
    setIsSendingEmail(true);
    setEmailMsg("");
    try {
      const res = await axios.post("/api/marketing/broadcast/email", {
        subject: emailSubject,
        html: `<p style="line-height:1.7;color:#555">${emailBody.replace(/\n/g, "<br/>")}</p>`,
        filterType,
        filterValue
      }, { headers });
      setEmailMsg(res.data.message || "Sending...");
      setEmailSubject("");
      setEmailBody("");
      setTimeout(loadEmailLog, 3000);
    } catch (err) {
      setEmailMsg(err?.response?.data?.message || "Failed to send.");
    } finally {
      setIsSendingEmail(false);
    }
  };

  const sendTestEmail = async () => {
    if (!testEmailTo.trim()) { setEmailMsg("Enter email address."); return; }
    setIsSendingTest(true);
    setEmailMsg("");
    try {
      const res = await axios.post("/api/marketing/test-email", { to: testEmailTo }, { headers });
      setEmailMsg(res.data.message);
    } catch (err) {
      setEmailMsg(err?.response?.data?.message || "Test failed.");
    } finally {
      setIsSendingTest(false);
    }
  };

  const sendBroadcastPush = async () => {
    if (!pushTitle.trim() || !pushBody.trim()) {
      setPushMsg("Title and body are required.");
      return;
    }
    setIsSendingPush(true);
    setPushMsg("");
    try {
      const res = await axios.post("/api/marketing/broadcast/push", {
        title: pushTitle, body: pushBody, url: pushUrl
      }, { headers });
      setPushMsg(res.data.message || "Sent!");
      setPushTitle(""); setPushBody(""); setPushUrl("/");
    } catch (err) {
      setPushMsg(err?.response?.data?.message || "Failed to send.");
    } finally {
      setIsSendingPush(false);
    }
  };

  const saveSettings = async () => {
    setIsSavingSettings(true);
    setStockMsg("");
    try {
      await axios.put("/api/marketing/settings", {
        lowStockThreshold: threshold,
        notificationEmail: notifEmail,
        emailEnabled,
        pushEnabled
      }, { headers });
      setStockMsg("Settings saved.");
      loadStats();
      loadLowStock();
    } catch {
      setStockMsg("Failed to save settings.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const saveOrderEmailSettings = async () => {
    setIsSavingOrderEmail(true);
    setOrderEmailMsg("");
    try {
      await axios.put(
        "/api/settings",
        {
          orderConfirmationEmail: {
            subjectTemplate: orderEmailSubject,
            bodyTemplate: orderEmailBody,
            headerBgColor: orderEmailHeaderBg,
            accentColor: orderEmailAccent,
            headerText: orderEmailHeaderText,
            headerSubtext: orderEmailHeaderSub
          }
        },
        { headers }
      );
      setOrderEmailMsg("Order confirmation email draft & design saved successfully.");
      window.dispatchEvent(new CustomEvent("siteSettingsUpdated"));
    } catch (err) {
      setOrderEmailMsg(err?.response?.data?.message || "Failed to save settings.");
    } finally {
      setIsSavingOrderEmail(false);
    }
  };

  const sendLowStockAlert = async () => {
    setIsSendingAlert(true);
    setStockMsg("");
    try {
      const res = await axios.post("/api/marketing/alert/low-stock", {}, { headers });
      setStockMsg(res.data.message || "Alerts sent.");
      loadLowStock();
    } catch (err) {
      setStockMsg(err?.response?.data?.message || "Failed to send alerts.");
    } finally {
      setIsSendingAlert(false);
    }
  };

  // ── Sponsors handlers ──────────────────────────────────────────────────────
  const handleAddOrUpdateSponsor = (e) => {
    e.preventDefault();
    if (!sponsorName.trim()) {
      setSponsorsMsg("Sponsor name is required.");
      return;
    }

    if (editingSponsorId !== null) {
      setSponsors((prev) =>
        prev.map((item, idx) =>
          item._id === editingSponsorId || idx === editingSponsorId
            ? {
                ...item,
                name: sponsorName,
                description: sponsorDesc,
                logoUrl: sponsorLogoUrl,
                websiteUrl: sponsorWebsiteUrl
              }
            : item
        )
      );
      setEditingSponsorId(null);
      setSponsorsMsg("Sponsor details updated in list. Save to write to DB.");
    } else {
      const tempId = `temp-${Date.now()}`;
      setSponsors((prev) => [
        ...prev,
        {
          _id: tempId,
          name: sponsorName,
          description: sponsorDesc,
          logoUrl: sponsorLogoUrl,
          websiteUrl: sponsorWebsiteUrl
        }
      ]);
      setSponsorsMsg("Sponsor added to list. Save to write to DB.");
    }

    setSponsorName("");
    setSponsorDesc("");
    setSponsorLogoUrl("");
    setSponsorWebsiteUrl("");
  };

  const handleEditSponsorClick = (sponsor, idx) => {
    setEditingSponsorId(sponsor._id || idx);
    setSponsorName(sponsor.name);
    setSponsorDesc(sponsor.description || "");
    setSponsorLogoUrl(sponsor.logoUrl || "");
    setSponsorWebsiteUrl(sponsor.websiteUrl || "");
    setSponsorsMsg("");
  };

  const handleDeleteSponsorClick = (sponsorId, idx) => {
    setSponsors((prev) =>
      prev.filter((item, index) => item._id !== sponsorId && index !== idx)
    );
    setSponsorsMsg("Sponsor removed. Save to write to DB.");
  };

  const handleCancelSponsorEdit = () => {
    setEditingSponsorId(null);
    setSponsorName("");
    setSponsorDesc("");
    setSponsorLogoUrl("");
    setSponsorWebsiteUrl("");
    setSponsorsMsg("");
  };

  const saveSponsorsSettings = async () => {
    setIsSavingSponsors(true);
    setSponsorsMsg("");
    try {
      const payloadSponsors = sponsors.map((item) => ({
        name: item.name,
        description: item.description,
        logoUrl: item.logoUrl,
        websiteUrl: item.websiteUrl
      }));

      const res = await axios.put(
        "/api/settings",
        { sponsors: payloadSponsors },
        { headers }
      );
      setSponsorsMsg("Sponsors configuration saved successfully.");
      if (res.data?.sponsors) {
        setSponsors(res.data.sponsors);
      }
      window.dispatchEvent(new CustomEvent("siteSettingsUpdated"));
    } catch (err) {
      setSponsorsMsg(
        err?.response?.data?.message || "Failed to save sponsors settings."
      );
    } finally {
      setIsSavingSponsors(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="admin-layout">
      <AdminSidebar />

      <main className="admin-main">
        <div className="admin-header">
          <h1>Marketing</h1>
          <p>Reach your customers with email campaigns, push notifications, and stock alerts.</p>
        </div>

        {/* Tab bar */}
        <div className="mkt-tabs">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              type="button"
              className={`mkt-tab ${activeTab === i ? "active" : ""}`}
              onClick={() => setActiveTab(i)}
            >
              {tab}
              {i === 3 && stats?.lowStockCount > 0 && (
                <span className="mkt-badge">{stats.lowStockCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab 0: Overview ── */}
        {activeTab === 0 && (
          <div className="mkt-section">
            {isLoadingStats ? (
              <p className="mkt-empty">Loading stats...</p>
            ) : stats ? (
              <>
                <div className="mkt-stat-grid">
                  <div className="mkt-stat-card">
                    <span className="mkt-stat-icon">🔔</span>
                    <div>
                      <p className="mkt-stat-label">Push Subscribers</p>
                      <p className="mkt-stat-value">{stats.pushSubscribers}</p>
                    </div>
                  </div>
                  <div className="mkt-stat-card">
                    <span className="mkt-stat-icon">✉️</span>
                    <div>
                      <p className="mkt-stat-label">Email Recipients</p>
                      <p className="mkt-stat-value">{stats.emailSubscribers}</p>
                    </div>
                  </div>
                  <div className={`mkt-stat-card ${stats.lowStockCount > 0 ? "mkt-stat-warn" : ""}`}>
                    <span className="mkt-stat-icon">⚠️</span>
                    <div>
                      <p className="mkt-stat-label">Low-Stock Products</p>
                      <p className="mkt-stat-value">{stats.lowStockCount}</p>
                    </div>
                  </div>
                </div>

                <div className="mkt-status-row">
                  <span className={`mkt-status-dot ${stats.emailEnabled ? "on" : "off"}`} />
                  Email notifications {stats.emailEnabled ? "enabled" : "disabled"}
                  &nbsp;&nbsp;
                  <span className={`mkt-status-dot ${stats.pushEnabled ? "on" : "off"}`} />
                  Push notifications {stats.pushEnabled ? "enabled" : "disabled"}
                </div>

                <div className="mkt-push-banner">
                  <p className="mkt-push-label">Your browser push status:&nbsp;
                    <strong>{pushPermission === "granted" ? "✅ Subscribed" : pushPermission === "denied" ? "❌ Blocked" : "⏳ Not enabled"}</strong>
                  </p>
                  {pushPermission !== "granted" && pushPermission !== "denied" && (
                    <button className="primary-btn" onClick={requestPushPermission}>
                      Enable Push Notifications
                    </button>
                  )}
                  {pushPermission === "denied" && (
                    <p className="mkt-hint">Push notifications are blocked. Enable them in your browser settings.</p>
                  )}
                </div>
              </>
            ) : (
              <p className="mkt-empty">Could not load stats.</p>
            )}
          </div>
        )}

        {/* ── Tab 1: Email Campaign ── */}
        {activeTab === 1 && (
          <div className="mkt-section">
            <div className="card mkt-card">
              <h3>Send Email Campaign</h3>
              <p className="mkt-hint">Sends to all registered users. Email must be configured in backend/.env first.</p>
              <div className="mkt-field">
                <label>Target Audience Group</label>
                <select
                  value={filterType}
                  onChange={(e) => {
                    setFilterType(e.target.value);
                    setFilterValue("");
                  }}
                >
                  <option value="all">All Registered Users</option>
                  <option value="category">Users who purchased a Category</option>
                  <option value="product">Users who purchased a specific Product</option>
                  <option value="minSpend">Users who spent at least (Minimum Spend)</option>
                </select>
              </div>

              {filterType === "category" && (
                <div className="mkt-field">
                  <label>Select Product Category</label>
                  <select
                    value={filterValue}
                    onChange={(e) => setFilterValue(e.target.value)}
                  >
                    <option value="">-- Choose Category --</option>
                    {targetingOptions.categories?.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              )}

              {filterType === "product" && (
                <div className="mkt-field">
                  <label>Select Purchased Product</label>
                  <select
                    value={filterValue}
                    onChange={(e) => setFilterValue(e.target.value)}
                  >
                    <option value="">-- Choose Product --</option>
                    {targetingOptions.products?.map(prod => (
                      <option key={prod._id} value={prod._id}>{prod.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {filterType === "minSpend" && (
                <div className="mkt-field">
                  <label>Minimum Total Spend amount (INR)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Enter amount (e.g. 500)"
                    value={filterValue}
                    onChange={(e) => setFilterValue(e.target.value)}
                  />
                </div>
              )}

              <div className="mkt-preview-box">
                <p>
                  Targeting: <strong>{isLoadingPreview ? "..." : recipientCount}</strong> matching customer(s).
                </p>
                {recipientPreview.length > 0 && (
                  <div className="mkt-preview-list">
                    <span>Matches: </span>
                    {recipientPreview.map((r, i) => r.name || r.email || "User").join(", ")}
                    {recipientCount > 10 ? "..." : ""}
                  </div>
                )}
              </div>

              <div className="mkt-field">
                <label>Subject</label>
                <input
                  placeholder="Your email subject..."
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                />
              </div>
              <div className="mkt-field">
                <label>Body (plain text or HTML)</label>
                <textarea
                  rows={7}
                  placeholder="Write your message here..."
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                />
              </div>
              {emailMsg && <p className="mkt-msg">{emailMsg}</p>}
              <div className="mkt-actions">
                <button className="primary-btn" onClick={sendEmailCampaign} disabled={isSendingEmail}>
                  {isSendingEmail ? "Sending..." : `Send Email Campaign (${isLoadingPreview ? "..." : recipientCount} recipients)`}
                </button>
              </div>
            </div>

            <div className="card mkt-card">
              <h3>Send Test Email</h3>
              <div className="mkt-inline">
                <input
                  placeholder="admin@example.com"
                  value={testEmailTo}
                  onChange={(e) => setTestEmailTo(e.target.value)}
                />
                <button className="secondary-btn" onClick={sendTestEmail} disabled={isSendingTest}>
                  {isSendingTest ? "Sending..." : "Send Test"}
                </button>
              </div>
            </div>

            <div className="card mkt-card">
              <h3>Email Log <span className="mkt-badge-inline">{emailLog.length}</span></h3>
              {isLoadingLog ? (
                <p className="mkt-empty">Loading...</p>
              ) : emailLog.length === 0 ? (
                <p className="mkt-empty">No emails sent yet.</p>
              ) : (
                <div className="mkt-table-wrap">
                  <table className="mkt-table">
                    <thead>
                      <tr><th>To</th><th>Subject</th><th>Type</th><th>Status</th><th>Error</th><th>Sent At</th></tr>
                    </thead>
                    <tbody>
                      {emailLog.map((log) => (
                        <tr key={log._id}>
                          <td>{log.to}</td>
                          <td>{log.subject || "—"}</td>
                          <td><span className="mkt-type-badge">{log.type}</span></td>
                          <td>
                            <span className={`mkt-status-badge ${log.status === "sent" ? "ok" : "fail"}`}>
                              {log.status}
                            </span>
                          </td>
                          <td style={{ fontSize: "12px", color: "var(--site-text-soft)", maxWidth: "200px", wordBreak: "break-all" }}>
                            {log.error || "—"}
                          </td>
                          <td>{log.sentAt ? new Date(log.sentAt).toLocaleString("en-IN") : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab 2: Push Notification ── */}
        {activeTab === 2 && (
          <div className="mkt-section">
            <div className="mkt-push-banner">
              <p className="mkt-push-label">Browser push status:&nbsp;
                <strong>{pushPermission === "granted" ? "✅ Granted" : pushPermission === "denied" ? "❌ Blocked" : "⏳ Not requested"}</strong>
              </p>
              {pushPermission !== "granted" && pushPermission !== "denied" && (
                <button className="primary-btn" onClick={requestPushPermission}>
                  Enable Push Notifications
                </button>
              )}
            </div>

            <div className="card mkt-card">
              <h3>Broadcast Push Notification</h3>
              <p className="mkt-hint">Sends to all {stats?.pushSubscribers ?? "?"} subscribed browsers.</p>
              <div className="mkt-field">
                <label>Title</label>
                <input
                  placeholder="Notification title..."
                  value={pushTitle}
                  onChange={(e) => setPushTitle(e.target.value)}
                />
              </div>
              <div className="mkt-field">
                <label>Message</label>
                <textarea
                  rows={3}
                  placeholder="Notification body..."
                  value={pushBody}
                  onChange={(e) => setPushBody(e.target.value)}
                />
              </div>
              <div className="mkt-field">
                <label>Link URL (optional)</label>
                <input
                  placeholder="/#/collection"
                  value={pushUrl}
                  onChange={(e) => setPushUrl(e.target.value)}
                />
              </div>
              {pushMsg && <p className="mkt-msg">{pushMsg}</p>}
              <div className="mkt-actions">
                <button className="primary-btn" onClick={sendBroadcastPush} disabled={isSendingPush}>
                  {isSendingPush ? "Sending..." : `Send Push to ${stats?.pushSubscribers ?? "?"} Subscribers`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Tab 3: Customer Segments ── */}
        {activeTab === 3 && (
          <div className="mkt-section">
            <div className="card mkt-card">
              <h3>Customer Segment Search</h3>
              <p className="mkt-hint">Filter and inspect customer lists based on their purchase history.</p>
              
              <div className="mkt-field">
                <label>Segment Group</label>
                <select
                  value={segFilterType}
                  onChange={(e) => {
                    setSegFilterType(e.target.value);
                    setSegFilterValue("");
                  }}
                >
                  <option value="all">All Registered Customers</option>
                  <option value="category">Purchased from Category</option>
                  <option value="product">Purchased specific Product</option>
                  <option value="minSpend">Spent at least (Minimum Spend)</option>
                </select>
              </div>

              {segFilterType === "category" && (
                <div className="mkt-field">
                  <label>Select Product Category</label>
                  <select
                    value={segFilterValue}
                    onChange={(e) => setSegFilterValue(e.target.value)}
                  >
                    <option value="">-- Choose Category --</option>
                    {targetingOptions.categories?.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              )}

              {segFilterType === "product" && (
                <div className="mkt-field">
                  <label>Select Purchased Product</label>
                  <select
                    value={segFilterValue}
                    onChange={(e) => setSegFilterValue(e.target.value)}
                  >
                    <option value="">-- Choose Product --</option>
                    {targetingOptions.products?.map(prod => (
                      <option key={prod._id} value={prod._id}>{prod.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {segFilterType === "minSpend" && (
                <div className="mkt-field">
                  <label>Minimum Total Spend amount (INR)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Enter amount (e.g. 500)"
                    value={segFilterValue}
                    onChange={(e) => setSegFilterValue(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="card mkt-card">
              <h3>Segment Customers <span className="mkt-badge-inline">{segmentedCustomers.length}</span></h3>
              {isLoadingSegments ? (
                <p className="mkt-empty">Loading customers...</p>
              ) : segmentedCustomers.length === 0 ? (
                <p className="mkt-empty">No customers found matching this segment.</p>
              ) : (
                <div className="mkt-table-wrap">
                  <table className="mkt-table">
                    <thead>
                      <tr>
                        <th>Customer Name</th>
                        <th>Email</th>
                        <th>Total Orders</th>
                        <th>Lifetime Spend</th>
                        <th style={{ textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {segmentedCustomers.map((cust) => (
                        <tr key={cust._id}>
                          <td><strong>{cust.name}</strong></td>
                          <td>{cust.email || "—"}</td>
                          <td>{cust.orderCount}</td>
                          <td>Rs {cust.totalSpent.toFixed(2)}</td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              className="secondary-btn btn-sm"
                              onClick={() => {
                                setFilterType(segFilterType);
                                setFilterValue(segFilterValue);
                                setActiveTab(1);
                              }}
                            >
                              Send Email
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab 4: Low-Stock Alerts ── */}
        {activeTab === 4 && (
          <div className="mkt-section">
            <div className="card mkt-card">
              <h3>Alert Settings</h3>
              <div className="mkt-field-row">
                <div className="mkt-field">
                  <label>Low-Stock Threshold (units)</label>
                  <input
                    type="number"
                    min="0"
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                  />
                </div>
                <div className="mkt-field">
                  <label>Admin Notification Email</label>
                  <input
                    type="email"
                    placeholder="admin@example.com"
                    value={notifEmail}
                    onChange={(e) => setNotifEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="mkt-toggle-row">
                <label className="mkt-toggle">
                  <input type="checkbox" checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} />
                  <span>Email notifications enabled</span>
                </label>
                <label className="mkt-toggle">
                  <input type="checkbox" checked={pushEnabled} onChange={(e) => setPushEnabled(e.target.checked)} />
                  <span>Push notifications enabled</span>
                </label>
              </div>
              {stockMsg && <p className="mkt-msg">{stockMsg}</p>}
              <div className="mkt-actions">
                <button className="primary-btn" onClick={saveSettings} disabled={isSavingSettings}>
                  {isSavingSettings ? "Saving..." : "Save Settings"}
                </button>
                <button
                  className="danger-btn"
                  onClick={sendLowStockAlert}
                  disabled={isSendingAlert || lowStockProducts.length === 0}
                >
                  {isSendingAlert ? "Sending..." : `Send Alerts Now (${lowStockProducts.length} products)`}
                </button>
              </div>
            </div>

            <div className="card mkt-card">
              <div className="mkt-stock-header">
                <h3>Low-Stock Products</h3>
                <button className="secondary-btn" onClick={loadLowStock} disabled={isLoadingStock}>
                  {isLoadingStock ? "Refreshing..." : "Refresh"}
                </button>
              </div>
              {isLoadingStock ? (
                <p className="mkt-empty">Loading...</p>
              ) : lowStockProducts.length === 0 ? (
                <p className="mkt-empty">✅ No products are below the threshold of {threshold} units.</p>
              ) : (
                <div className="mkt-table-wrap">
                  <table className="mkt-table">
                    <thead>
                      <tr><th>Product</th><th>Category</th><th>Stock</th><th>Wishlisted By</th></tr>
                    </thead>
                    <tbody>
                      {lowStockProducts.map((p) => (
                        <tr key={p._id} className={p.stock === 0 ? "mkt-row-critical" : ""}>
                          <td><strong>{p.name}</strong></td>
                          <td>{p.category || "—"}</td>
                          <td>
                            <span className={`mkt-stock-badge ${p.stock === 0 ? "critical" : "low"}`}>
                              {p.stock === 0 ? "Out of stock" : `${p.stock} left`}
                            </span>
                          </td>
                          <td>
                            {p.wishlistCount > 0 ? (
                              <span className="mkt-wishlist-count">❤️ {p.wishlistCount} user(s)</span>
                            ) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab 5: Order Email Draft ── */}
        {activeTab === 5 && (
          <div className="mkt-section">
            <div className="card mkt-card">
              <h3>Order Confirmation Email Template</h3>
              <p className="mkt-hint">
                Customize the automated transactional email sent to users after successful checkout.
              </p>

              <div className="mkt-field-row">
                <div className="mkt-field">
                  <label>Header Display Name</label>
                  <input
                    value={orderEmailHeaderText}
                    onChange={(e) => setOrderEmailHeaderText(e.target.value)}
                    placeholder="e.g. Digital Sanskrit Guru"
                  />
                </div>
                <div className="mkt-field">
                  <label>Header Subtitle</label>
                  <input
                    value={orderEmailHeaderSub}
                    onChange={(e) => setOrderEmailHeaderSub(e.target.value)}
                    placeholder="e.g. Spreading the wisdom of Sanskrit"
                  />
                </div>
              </div>

              <div className="mkt-field-row">
                <div className="mkt-field">
                  <label>Header Background Color</label>
                  <div className="mkt-color-input-wrap">
                    <input
                      type="color"
                      value={orderEmailHeaderBg}
                      onChange={(e) => setOrderEmailHeaderBg(e.target.value)}
                    />
                    <input
                      type="text"
                      maxLength={7}
                      value={orderEmailHeaderBg}
                      onChange={(e) => setOrderEmailHeaderBg(e.target.value)}
                    />
                  </div>
                </div>
                <div className="mkt-field">
                  <label>Accent / CTA Button Color</label>
                  <div className="mkt-color-input-wrap">
                    <input
                      type="color"
                      value={orderEmailAccent}
                      onChange={(e) => setOrderEmailAccent(e.target.value)}
                    />
                    <input
                      type="text"
                      maxLength={7}
                      value={orderEmailAccent}
                      onChange={(e) => setOrderEmailAccent(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="mkt-field">
                <label>Subject Template</label>
                <input
                  value={orderEmailSubject}
                  onChange={(e) => setOrderEmailSubject(e.target.value)}
                  placeholder="Order Confirmed — {{SITE_NAME}}"
                />
              </div>

              <div className="mkt-field">
                <label>Body Template (HTML supported)</label>
                <textarea
                  rows={12}
                  value={orderEmailBody}
                  onChange={(e) => setOrderEmailBody(e.target.value)}
                  placeholder="<h2>Thank you for your order! 🎉</h2>..."
                />
              </div>

              <div className="mkt-template-docs">
                <h4>💡 Supported Placeholders</h4>
                <p>Use these tags inside the Subject or Body to insert order details dynamically:</p>
                <ul>
                  <li><code>{"{{USER_NAME}}"}</code>: Customer's display name</li>
                  <li><code>{"{{ORDER_ID}}"}</code>: Short 8-character Order ID</li>
                  <li><code>{"{{ORDER_TOTAL}}"}</code>: Formatted total amount with currency</li>
                  <li><code>{"{{ITEMS_TABLE}}"}</code>: Table showing purchased products, quantities, and prices</li>
                  <li><code>{"{{SUMMARY_TABLE}}"}</code>: Summary table of subtotals, GST, shipping fees, and discount</li>
                  <li><code>{"{{SHIPPING_INFO}}"}</code>: Shipping address details</li>
                  <li><code>{"{{SITE_NAME}}"}</code>: Site title</li>
                </ul>
              </div>

              {orderEmailMsg && (
                <p className={`mkt-msg ${orderEmailMsg.includes("Failed") ? "error" : "success"}`}>
                  {orderEmailMsg}
                </p>
              )}

              <div className="mkt-actions">
                <button className="primary-btn" onClick={saveOrderEmailSettings} disabled={isSavingOrderEmail}>
                  {isSavingOrderEmail ? "Saving..." : "Save Template Settings"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Tab 6: Sponsors ── */}
        {activeTab === 6 && (
          <div className="mkt-section">
            <div className="mkt-sponsor-split">
              {/* Form card */}
              <div className="card mkt-card mkt-sponsor-form-card">
                <h3>{editingSponsorId !== null ? "Edit Sponsor" : "Add New Sponsor"}</h3>
                <p className="mkt-hint">
                  Custom sponsors display their logo image. Leaving "Logo URL" empty maps the sponsor to its preset vector SVG icon (or fallback icon) matching its name.
                </p>
                <form onSubmit={handleAddOrUpdateSponsor}>
                  <div className="mkt-field">
                    <label>Sponsor/Company Name</label>
                    <input
                      required
                      placeholder="e.g. Sanskrit Academy"
                      value={sponsorName}
                      onChange={(e) => setSponsorName(e.target.value)}
                    />
                  </div>
                  <div className="mkt-field">
                    <label>Tagline / Description</label>
                    <input
                      placeholder="e.g. Preserving Ancient Wisdom"
                      value={sponsorDesc}
                      onChange={(e) => setSponsorDesc(e.target.value)}
                    />
                  </div>
                  <div className="mkt-field">
                    <label>Logo URL (optional)</label>
                    <input
                      type="url"
                      placeholder="e.g. https://example.com/logo.png"
                      value={sponsorLogoUrl}
                      onChange={(e) => setSponsorLogoUrl(e.target.value)}
                    />
                  </div>
                  <div className="mkt-field">
                    <label>Website URL (optional)</label>
                    <input
                      type="url"
                      placeholder="e.g. https://sanskritacademy.org"
                      value={sponsorWebsiteUrl}
                      onChange={(e) => setSponsorWebsiteUrl(e.target.value)}
                    />
                  </div>
                  <div className="mkt-actions-inline">
                    <button type="submit" className="primary-btn">
                      {editingSponsorId !== null ? "Update Sponsor" : "Add to List"}
                    </button>
                    {editingSponsorId !== null ? (
                      <button type="button" className="secondary-btn" onClick={handleCancelSponsorEdit}>
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </form>
              </div>

              {/* List card */}
              <div className="card mkt-card mkt-sponsor-list-card">
                <div className="mkt-sponsor-list-head">
                  <h3>Sponsor List</h3>
                  <button className="primary-btn" onClick={saveSponsorsSettings} disabled={isSavingSponsors || sponsors.length === 0}>
                    {isSavingSponsors ? "Saving..." : "Save Sponsors Configuration"}
                  </button>
                </div>

                {sponsorsMsg && (
                  <p className={`mkt-msg ${sponsorsMsg.includes("Failed") ? "error" : "success"}`}>
                    {sponsorsMsg}
                  </p>
                )}

                {sponsors.length === 0 ? (
                  <p className="mkt-empty">No sponsors added yet. Use the form on the left to add one.</p>
                ) : (
                  <div className="mkt-sponsor-list">
                    {sponsors.map((sponsor, idx) => (
                      <div key={sponsor._id || idx} className="mkt-sponsor-item">
                        <div className="mkt-sponsor-item-info">
                          {sponsor.logoUrl ? (
                            <img src={sponsor.logoUrl} alt={sponsor.name} className="mkt-sponsor-item-logo" />
                          ) : (
                            <span className="mkt-sponsor-item-logo-placeholder">SVG</span>
                          )}
                          <div>
                            <strong>{sponsor.name}</strong>
                            <p>{sponsor.description || "No description"}</p>
                            {sponsor.websiteUrl ? (
                              <a href={sponsor.websiteUrl} target="_blank" rel="noreferrer" className="mkt-sponsor-link">
                                {sponsor.websiteUrl}
                              </a>
                            ) : null}
                          </div>
                        </div>
                        <div className="mkt-sponsor-item-actions">
                          <button type="button" className="secondary-btn btn-sm" onClick={() => handleEditSponsorClick(sponsor, idx)}>
                            Edit
                          </button>
                          <button type="button" className="danger-btn btn-sm" onClick={() => handleDeleteSponsorClick(sponsor._id, idx)}>
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default AdminMarketing;
