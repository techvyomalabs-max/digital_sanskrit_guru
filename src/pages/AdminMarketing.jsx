import { useEffect, useState } from "react";
import { BarChart3, Mail, Bell, Users, AlertTriangle, FileText, Handshake, CheckCircle2, XCircle, Hourglass, Palette, Save, Rocket, Smartphone, Building2, Gift, Heart, Lightbulb } from "lucide-react";
import axios from "axios";
import { apiBaseUrl } from "../lib/api";
import AdminSidebar from "../components/admin/AdminSidebar";
import { useAuth } from "../hooks/useAuth";
import { uploadImageDataUrl } from "../utils/mediaUpload";
import "./AdminMarketing.css";
import "./AdminShared.css";

const TABS = [
  { label: "Overview", icon: BarChart3 },
  { label: "Email Campaign", icon: Mail },
  { label: "Push Notification", icon: Bell },
  { label: "Customer Segments", icon: Users },
  { label: "Low-Stock Alerts", icon: AlertTriangle },
  { label: "Order Email Draft", icon: FileText },
  { label: "Sponsors", icon: Handshake }
];

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

  // ── Wishlist Reminder Automation State ─────────────────────────────────────
  const [testWishlistEmailTo, setTestWishlistEmailTo] = useState("");
  const [isSendingWishlistTest, setIsSendingWishlistTest] = useState(false);
  const [isTriggeringWishlistNudges, setIsTriggeringWishlistNudges] = useState(false);
  const [wishlistTestMsg, setWishlistTestMsg] = useState("");

  // ── Campaign Email Branding state ──────────────────────────────────────────
  const [campaignLogoUrl, setCampaignLogoUrl] = useState("");
  const [campaignHeaderBg, setCampaignHeaderBg] = useState("#0f172a");
  const [campaignBrandColor, setCampaignBrandColor] = useState("#0284c7");
  const [campaignHeaderText, setCampaignHeaderText] = useState("Digital Sanskrit Guru");
  const [campaignFooterText, setCampaignFooterText] = useState("© Digital Sanskrit Guru. All rights reserved.");
  const [isUploadingCampaignLogo, setIsUploadingCampaignLogo] = useState(false);
  const [isSavingCampaignBranding, setIsSavingCampaignBranding] = useState(false);

  // ── Customer Targeting states ──────────────────────────────────────────────
  const [targetingOptions, setTargetingOptions] = useState({ categories: [], products: [] });
  const [filterType, setFilterType] = useState("all");
  const [filterValue, setFilterValue] = useState("");
  const [recipientCount, setRecipientCount] = useState(0);
  const [recipientPreview, setRecipientPreview] = useState([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
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
  const [orderEmailLogoUrl, setOrderEmailLogoUrl] = useState("");
  const [isUploadingOrderLogo, setIsUploadingOrderLogo] = useState(false);
  const [isSavingOrderEmail, setIsSavingOrderEmail] = useState(false);
  const [orderEmailMsg, setOrderEmailMsg] = useState("");

  const getAuthHeaders = () => {
    const activeToken = token || localStorage.getItem("token");
    return activeToken ? { Authorization: `Bearer ${activeToken}` } : {};
  };

  // ── Load stats ────────────────────────────────────────────────────────────
  const loadStats = async () => {
    setIsLoadingStats(true);
    try {
      const res = await axios.get("/api/marketing/subscribers", { headers: getAuthHeaders() });
      setStats(res.data);
      setThreshold(res.data.lowStockThreshold ?? 5);
      setNotifEmail(res.data.notificationEmail || "");
      setEmailEnabled(res.data.emailEnabled !== false);
      setPushEnabled(res.data.pushEnabled !== false);
    } catch (err) {
      console.error("Failed to load marketing stats:", err);
      setStats(null);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const loadLowStock = async () => {
    setIsLoadingStock(true);
    try {
      const res = await axios.get("/api/marketing/low-stock", { headers: getAuthHeaders() });
      setLowStockProducts(res.data.products || []);
    } catch (err) {
      console.error("Failed to load low stock:", err);
      setLowStockProducts([]);
    } finally {
      setIsLoadingStock(false);
    }
  };

  const loadEmailLog = async () => {
    setIsLoadingLog(true);
    try {
      const res = await axios.get("/api/marketing/email-log?limit=30", { headers: getAuthHeaders() });
      setEmailLog(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load email log:", err);
      setEmailLog([]);
    } finally {
      setIsLoadingLog(false);
    }
  };

  const loadOrderEmailSettings = async () => {
    try {
      const res = await axios.get("/api/settings", { headers: getAuthHeaders() });
      if (res.data?.orderConfirmationEmail) {
        const config = res.data.orderConfirmationEmail;
        setOrderEmailSubject(config.subjectTemplate || "Order Confirmed — {{SITE_NAME}}");
        setOrderEmailBody(config.bodyTemplate || "");
        setOrderEmailHeaderBg(config.headerBgColor || "#1a1a2e");
        setOrderEmailAccent(config.accentColor || "#e94560");
        setOrderEmailHeaderText(config.headerText || "Digital Sanskrit Guru");
        setOrderEmailHeaderSub(config.headerSubtext || "Spreading the wisdom of Sanskrit");
        setOrderEmailLogoUrl(config.logoUrl || "");
      }
      if (res.data?.campaignEmailBranding) {
        const cConfig = res.data.campaignEmailBranding;
        setCampaignLogoUrl(cConfig.logoUrl || "");
        setCampaignHeaderBg(cConfig.headerBg || "#0f172a");
        setCampaignBrandColor(cConfig.brandColor || "#0284c7");
        setCampaignHeaderText(cConfig.headerText || "Digital Sanskrit Guru");
        setCampaignFooterText(cConfig.footerText || "© Digital Sanskrit Guru. All rights reserved.");
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
      const res = await axios.get("/api/marketing/targeting-options", { headers: getAuthHeaders() });
      setTargetingOptions(res.data || { categories: [], products: [] });
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
      }, { headers: getAuthHeaders() });
      setRecipientCount(res.data?.count || 0);
      setRecipientPreview(res.data?.recipients || []);
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
      }, { headers: getAuthHeaders() });
      setSegmentedCustomers(res.data?.customers || []);
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
  }, [segFilterType, segFilterValue, activeTab, token]);

  useEffect(() => {
    loadStats();
    loadLowStock();
    loadOrderEmailSettings();
    loadTargetingOptions();
  }, [token]);

  useEffect(() => {
    loadRecipientPreview();
  }, [filterType, filterValue, token]);

  useEffect(() => {
    if (activeTab === 1) loadEmailLog();
  }, [activeTab, token]);

  // ── Push permission ───────────────────────────────────────────────────────
  const requestPushPermission = async () => {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPushPermission(result);

    if (result !== "granted") return;
    try {
      const sw = await navigator.serviceWorker.ready;
      let sub = await sw.pushManager.getSubscription();

      if (!sub) {
        const keyRes = await fetch(`${apiBaseUrl || ""}/api/push/vapid-key`);
        if (!keyRes.ok) return;
        const { publicKey } = await keyRes.json();
        if (!publicKey) return;

        const padding = "=".repeat((4 - (publicKey.length % 4)) % 4);
        const base64 = (publicKey + padding).replace(/-/g, "+").replace(/_/g, "/");
        const raw = window.atob(base64);
        const key = Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));

        sub = await sw.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      }

      if (sub) {
        await axios.post("/api/push/subscribe", sub.toJSON(), { headers: getAuthHeaders() });
      }
      loadStats();
    } catch {
      // ignore
    }
  };

  const saveCampaignBrandingSettings = async () => {
    setIsSavingCampaignBranding(true);
    setEmailMsg("");
    try {
      await axios.put(
        "/api/settings",
        {
          campaignEmailBranding: {
            logoUrl: campaignLogoUrl,
            headerBg: campaignHeaderBg,
            brandColor: campaignBrandColor,
            headerText: campaignHeaderText,
            footerText: campaignFooterText
          }
        },
        { headers: getAuthHeaders() }
      );
      setEmailMsg("Campaign email branding & logo saved successfully.");
      window.dispatchEvent(new CustomEvent("siteSettingsUpdated"));
    } catch (err) {
      setEmailMsg(err?.response?.data?.message || "Failed to save branding settings.");
    } finally {
      setIsSavingCampaignBranding(false);
    }
  };

  const downscaleImageFile = (file, maxWidth = 1600, quality = 0.85) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read logo file."));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Could not process logo image."));
        img.onload = () => {
          const width = img.naturalWidth || img.width;
          const height = img.naturalHeight || img.height;
          const scale = Math.min(maxWidth / width, 1);
          const targetWidth = Math.max(1, Math.round(width * scale));
          const targetHeight = Math.max(1, Math.round(height * scale));

          const canvas = document.createElement("canvas");
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(String(reader.result || ""));
            return;
          }
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
          const mimeMatch = String(reader.result || "").match(/^data:([^;]+);base64/);
          const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
          const outputMime = mimeType === "image/png" ? "image/png" : "image/jpeg";
          resolve(canvas.toDataURL(outputMime, outputMime === "image/jpeg" ? quality : undefined));
        };
        img.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    });
  };

  const handleCampaignLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingCampaignLogo(true);
    setEmailMsg("");
    try {
      const dataUrl = await downscaleImageFile(file, 1600, 0.85);
      const publicUrl = await uploadImageDataUrl(dataUrl, { kind: "banner", token });
      setCampaignLogoUrl(publicUrl);
      setEmailMsg("Logo attached. Save branding to persist.");
    } catch (err) {
      setEmailMsg(err?.message || "Failed to upload logo.");
    } finally {
      setIsUploadingCampaignLogo(false);
      e.target.value = "";
    }
  };

  const buildCampaignHtml = (bodyContent) => {
    const formattedBody = bodyContent
      ? bodyContent.replace(/\n/g, "<br/>")
      : "Your email content message will appear here...";

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px 12px; color: #334155;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 16px rgba(0,0,0,0.04);">
    <div style="background: ${campaignHeaderBg}; padding: 26px 24px; text-align: center;">
      ${campaignLogoUrl.trim() ? `<img src="${campaignLogoUrl.trim()}" alt="Logo" style="max-height: 52px; width: auto; margin-bottom: 8px; display: inline-block; object-fit: contain;" />` : ''}
      <h2 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">${campaignHeaderText || 'Digital Sanskrit Guru'}</h2>
    </div>
    <div style="padding: 28px 24px; font-size: 15px; line-height: 1.7; color: #334155; min-height: 120px;">
      ${formattedBody}
    </div>
    <div style="background: #f8fafc; padding: 18px 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
      <p style="margin: 0;">${campaignFooterText || '© Digital Sanskrit Guru. All rights reserved.'}</p>
    </div>
  </div>
</body>
</html>`;
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
        html: buildCampaignHtml(emailBody),
        filterType,
        filterValue
      }, { headers: getAuthHeaders() });
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
      const res = await axios.post("/api/marketing/test-email", {
        to: testEmailTo,
        subject: emailSubject ? `[TEST] ${emailSubject}` : "[TEST] Campaign Email",
        html: buildCampaignHtml(emailBody || "This is a test marketing email with your customized company logo and branding.")
      }, { headers: getAuthHeaders() });
      setEmailMsg(res.data.message);
    } catch (err) {
      setEmailMsg(err?.response?.data?.message || "Test failed.");
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleSendTestWishlistEmail = async () => {
    setIsSendingWishlistTest(true);
    setWishlistTestMsg("");
    try {
      const res = await axios.post("/api/marketing/test-wishlist-email", { to: testWishlistEmailTo }, { headers: getAuthHeaders() });
      setWishlistTestMsg(res.data?.message || "Test wishlist email sent successfully!");
    } catch (err) {
      setWishlistTestMsg(err?.response?.data?.message || "Failed to send test wishlist email.");
    } finally {
      setIsSendingWishlistTest(false);
    }
  };

  const handleTriggerWishlistNudges = async () => {
    setIsTriggeringWishlistNudges(true);
    setWishlistTestMsg("");
    try {
      const res = await axios.post("/api/marketing/trigger-wishlist-nudges", {}, { headers: getAuthHeaders() });
      const sentCount = res.data?.result?.sentCount ?? 0;
      setWishlistTestMsg(`Wishlist nudges executed! Sent ${sentCount} reminder email(s).`);
    } catch (err) {
      setWishlistTestMsg(err?.response?.data?.message || "Failed to run wishlist nudges.");
    } finally {
      setIsTriggeringWishlistNudges(false);
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
      }, { headers: getAuthHeaders() });
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
      }, { headers: getAuthHeaders() });
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
            headerSubtext: orderEmailHeaderSub,
            logoUrl: orderEmailLogoUrl
          }
        },
        { headers: getAuthHeaders() }
      );
      setOrderEmailMsg("Order confirmation email draft & design saved successfully.");
      window.dispatchEvent(new CustomEvent("siteSettingsUpdated"));
    } catch (err) {
      setOrderEmailMsg(err?.response?.data?.message || "Failed to save settings.");
    } finally {
      setIsSavingOrderEmail(false);
    }
  };

  const handleOrderLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingOrderLogo(true);
    setOrderEmailMsg("");
    try {
      const dataUrl = await downscaleImageFile(file, 1600, 0.85);
      const publicUrl = await uploadImageDataUrl(dataUrl, { kind: "banner", token });
      setOrderEmailLogoUrl(publicUrl);
      setOrderEmailMsg("Logo attached. Save template settings to persist.");
    } catch (err) {
      setOrderEmailMsg(err?.message || "Failed to upload logo.");
    } finally {
      setIsUploadingOrderLogo(false);
      e.target.value = "";
    }
  };

  const sendLowStockAlert = async () => {
    setIsSendingAlert(true);
    setStockMsg("");
    try {
      const res = await axios.post("/api/marketing/alert/low-stock", {}, { headers: getAuthHeaders() });
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
        { headers: getAuthHeaders() }
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
              key={tab.label}
              type="button"
              className={`mkt-tab ${activeTab === i ? "active" : ""}`}
              onClick={() => setActiveTab(i)}
            >
              <span className="mkt-tab-icon"><tab.icon size={16} aria-hidden="true" /></span>
              <span>{tab.label}</span>
              {i === 4 && stats?.lowStockCount > 0 && (
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
                    <span className="mkt-stat-icon"><Bell size={22} aria-hidden="true" /></span>
                    <div>
                      <p className="mkt-stat-label">Push Subscribers</p>
                      <p className="mkt-stat-value">{stats.pushSubscribers}</p>
                    </div>
                  </div>
                  <div className="mkt-stat-card">
                    <span className="mkt-stat-icon"><Mail size={22} aria-hidden="true" /></span>
                    <div>
                      <p className="mkt-stat-label">Email Recipients</p>
                      <p className="mkt-stat-value">{stats.emailSubscribers}</p>
                    </div>
                  </div>
                  <div className={`mkt-stat-card ${stats.lowStockCount > 0 ? "mkt-stat-warn" : ""}`}>
                    <span className="mkt-stat-icon"><AlertTriangle size={22} aria-hidden="true" /></span>
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
                    <strong>
                      {pushPermission === "granted" ? (
                        <><CheckCircle2 size={14} className="ui-inline-icon" aria-hidden="true" />Subscribed</>
                      ) : pushPermission === "denied" ? (
                        <><XCircle size={14} className="ui-inline-icon" aria-hidden="true" />Blocked</>
                      ) : (
                        <><Hourglass size={14} className="ui-inline-icon" aria-hidden="true" />Not enabled</>
                      )}
                    </strong>
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
            {/* Campaign Branding Customizer Card */}
            <div className="card mkt-card">
              <div className="mkt-stock-header">
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}><Palette size={17} className="ui-inline-icon" aria-hidden="true" />Email Branding & Company Logo</h3>
                  <p className="mkt-hint" style={{ margin: "4px 0 0" }}>Customize your company logo, header branding color, and footer notice for campaign broadcasts.</p>
                </div>
                <button
                  type="button"
                  className="secondary-btn btn-sm"
                  onClick={saveCampaignBrandingSettings}
                  disabled={isSavingCampaignBranding}
                >
                  {isSavingCampaignBranding ? "Saving..." : <><Save size={14} className="ui-inline-icon" aria-hidden="true" />Save Branding Defaults</>}
                </button>
              </div>

              <div className="mkt-field-row" style={{ marginTop: "12px" }}>
                <div className="mkt-field">
                  <label>Company Logo URL / File</label>
                  <div className="mkt-inline">
                    <input
                      type="text"
                      placeholder="https://... or upload logo image"
                      value={campaignLogoUrl}
                      onChange={(e) => setCampaignLogoUrl(e.target.value)}
                    />
                    <label className="secondary-btn btn-sm" style={{ display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
                      {isUploadingCampaignLogo ? "..." : "Upload Logo"}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={handleCampaignLogoUpload}
                        disabled={isUploadingCampaignLogo}
                      />
                    </label>
                    {campaignLogoUrl && (
                      <button
                        type="button"
                        className="secondary-btn btn-sm"
                        style={{ color: "#ef4444" }}
                        onClick={() => setCampaignLogoUrl("")}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <div className="mkt-field">
                  <label>Header Brand Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Digital Sanskrit Guru"
                    value={campaignHeaderText}
                    onChange={(e) => setCampaignHeaderText(e.target.value)}
                  />
                </div>
              </div>

              <div className="mkt-field-row">
                <div className="mkt-field">
                  <label>Header Background Color</label>
                  <div className="mkt-color-input-wrap">
                    <input
                      type="color"
                      value={campaignHeaderBg}
                      onChange={(e) => setCampaignHeaderBg(e.target.value)}
                    />
                    <input
                      type="text"
                      value={campaignHeaderBg}
                      onChange={(e) => setCampaignHeaderBg(e.target.value)}
                    />
                  </div>
                </div>

                <div className="mkt-field">
                  <label>Footer Notice Text</label>
                  <input
                    type="text"
                    placeholder="e.g. © Digital Sanskrit Guru. All rights reserved."
                    value={campaignFooterText}
                    onChange={(e) => setCampaignFooterText(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Campaign Composer & Live Email Preview Split Layout */}
            <div className="mkt-email-split-layout">
              {/* Left Column: Email Composer */}
              <div className="card mkt-card">
                <h3>Send Email Campaign</h3>
                <p className="mkt-hint">Sends to targeted customers. Live preview is shown on the right.</p>

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
                      {recipientPreview.map((r) => r.name || r.email || "User").join(", ")}
                      {recipientCount > 10 ? "..." : ""}
                    </div>
                  )}
                </div>

                <div className="mkt-field">
                  <label>Subject Line</label>
                  <input
                    placeholder="Your email subject line..."
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                  />
                </div>

                <div className="mkt-field">
                  <label>Message Body</label>
                  <textarea
                    rows={8}
                    placeholder="Write your email message body here..."
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                  />
                </div>

                {emailMsg && <p className="mkt-msg">{emailMsg}</p>}

                <div className="mkt-actions">
                  <button className="primary-btn" onClick={sendEmailCampaign} disabled={isSendingEmail}>
                    {isSendingEmail ? "Sending..." : <><Rocket size={14} className="ui-inline-icon" aria-hidden="true" />{`Send Broadcast (${isLoadingPreview ? "..." : recipientCount} recipients)`}</>}
                  </button>
                </div>
              </div>

              {/* Right Column: Live Email Inbox Preview Stage */}
              <div className="card mkt-card mkt-live-email-card">
                <div className="mkt-live-header">
                  <span className="mkt-live-title"><Smartphone size={14} className="ui-inline-icon" aria-hidden="true" />Live Inbox Preview</span>
                  <span className="mkt-live-tag">HTML Preview</span>
                </div>

                <div className="mkt-email-preview-frame">
                  <div className="mkt-email-header-preview" style={{ background: campaignHeaderBg }}>
                    {campaignLogoUrl.trim() ? (
                      <img src={campaignLogoUrl.trim()} alt="Company Logo" className="mkt-email-logo-img" />
                    ) : (
                      <div className="mkt-email-logo-placeholder"><Building2 size={14} className="ui-inline-icon" aria-hidden="true" />Company Logo</div>
                    )}
                    <h4>{campaignHeaderText || "Digital Sanskrit Guru"}</h4>
                  </div>

                  <div className="mkt-email-body-preview">
                    <div className="mkt-email-subject-badge">
                      <strong>Subject:</strong> {emailSubject || "Your Email Subject Line"}
                    </div>
                    <div className="mkt-email-text-content">
                      {emailBody.trim() ? (
                        emailBody.split("\n").map((paragraph, index) => (
                          <p key={index}>{paragraph}</p>
                        ))
                      ) : (
                        <p style={{ color: "#94a3b8", fontStyle: "italic" }}>
                          Type your message body on the left to see the live HTML email preview here...
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mkt-email-footer-preview">
                    <p>{campaignFooterText || "© Digital Sanskrit Guru. All rights reserved."}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="card mkt-card">
              <h3>Send Test Email</h3>
              <p className="mkt-hint">Send a single test email with your customized branding to verify formatting before broadcasting.</p>
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
              <h3><Gift size={18} className="ui-inline-icon" aria-hidden="true" />Automated Abandoned Wishlist Reminders</h3>
              <p className="mkt-hint">
                Automatically sends personalized HTML reminder emails to registered users who saved products to their Wishlist but haven't purchased after 24 hours. Includes direct <strong>Buy Now</strong> buttons & product thumbnails.
              </p>
              <div className="mkt-inline" style={{ marginTop: "12px", gap: "10px", flexWrap: "wrap" }}>
                <input
                  type="email"
                  placeholder="admin@example.com (enter email to receive test)"
                  value={testWishlistEmailTo}
                  onChange={(e) => setTestWishlistEmailTo(e.target.value)}
                  style={{ flex: 1, minWidth: "220px" }}
                />
                <button className="secondary-btn" onClick={handleSendTestWishlistEmail} disabled={isSendingWishlistTest}>
                  {isSendingWishlistTest ? "Sending Test..." : <><Mail size={14} className="ui-inline-icon" aria-hidden="true" />Send Test Wishlist Email</>}
                </button>
                <button className="primary-btn" onClick={handleTriggerWishlistNudges} disabled={isTriggeringWishlistNudges}>
                  {isTriggeringWishlistNudges ? "Running..." : <><Rocket size={14} className="ui-inline-icon" aria-hidden="true" />Run Wishlist Nudges Now</>}
                </button>
              </div>
              {wishlistTestMsg && (
                <p className="mkt-msg" style={{ marginTop: "10px", color: wishlistTestMsg.toLowerCase().includes("fail") ? "#ef4444" : "#10b981", fontWeight: 600 }}>
                  {wishlistTestMsg}
                </p>
              )}
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
                <strong>
                  {pushPermission === "granted" ? (
                    <><CheckCircle2 size={14} className="ui-inline-icon" aria-hidden="true" />Granted</>
                  ) : pushPermission === "denied" ? (
                    <><XCircle size={14} className="ui-inline-icon" aria-hidden="true" />Blocked</>
                  ) : (
                    <><Hourglass size={14} className="ui-inline-icon" aria-hidden="true" />Not requested</>
                  )}
                </strong>
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
                  placeholder="/collection"
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
                <p className="mkt-empty"><CheckCircle2 size={15} className="ui-inline-icon" aria-hidden="true" />No products are below the threshold of {threshold} units.</p>
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
                              <span className="mkt-wishlist-count"><Heart size={13} className="ui-inline-icon" aria-hidden="true" />{p.wishlistCount} user(s)</span>
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

              <div className="mkt-field">
                <label>Company Logo URL / File Upload</label>
                <div className="mkt-inline">
                  <input
                    type="text"
                    placeholder="https://... or upload logo image"
                    value={orderEmailLogoUrl}
                    onChange={(e) => setOrderEmailLogoUrl(e.target.value)}
                  />
                  <label className="secondary-btn btn-sm" style={{ display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
                    {isUploadingOrderLogo ? "..." : "Upload Logo"}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={handleOrderLogoUpload}
                      disabled={isUploadingOrderLogo}
                    />
                  </label>
                  {orderEmailLogoUrl && (
                    <button
                      type="button"
                      className="secondary-btn btn-sm"
                      style={{ color: "#ef4444" }}
                      onClick={() => setOrderEmailLogoUrl("")}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

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
                  placeholder="<h2>Thank you for your order!</h2>..."
                />
              </div>

              <div className="mkt-template-docs">
                <h4><Lightbulb size={15} className="ui-inline-icon" aria-hidden="true" />Supported Placeholders</h4>
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
