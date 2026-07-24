import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../hooks/useAuth";
import AdminSidebar from "../components/admin/AdminSidebar";
import { applySiteTheme, DEFAULT_SITE_THEME, getSiteThemeOptions } from "../utils/siteTheme";
import "./AdminShared.css";
import "./AdminThemeSettings.css";

const EMPTY_THEME_FORM = {
  name: "",
  description: "",
  bg: "#f6efe7",
  surface: "#ffffff",
  text: "#1f2937",
  header: "#7c2d12",
  accent: "#9a3412",
  button: "#fb923c",
  navBottom: "#1c2735",
  footerBg: "#1c1c1e",
  footerText: "#ffffff",
  sectionBg: "#f2f2f7",
  sectionText: "#1c1c1e"
};

const ANIMATION_TYPES = [
  { value: "diwali",    emoji: "🪔", label: "Diwali",    desc: "Gold & orange sparks" },
  { value: "holi",      emoji: "🎨", label: "Holi",      desc: "Colourful powder puffs" },
  { value: "christmas", emoji: "❄️", label: "Christmas",  desc: "Drifting snowflakes" },
  { value: "newyear",   emoji: "🎆", label: "New Year",   desc: "Rising fireworks" },
  { value: "confetti",  emoji: "🎉", label: "Confetti",  desc: "Rainbow confetti" }
];

const INTENSITIES = [
  { value: "subtle",  label: "Subtle",  desc: "~30 particles" },
  { value: "medium",  label: "Medium",  desc: "~55 particles" },
  { value: "heavy",   label: "Heavy",   desc: "~95 particles" }
];


function toThemeId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function AdminThemeSettings() {
  const { token } = useAuth();
  const [siteTheme, setSiteTheme] = useState(DEFAULT_SITE_THEME);
  const [customThemes, setCustomThemes] = useState([]);
  const [themeForm, setThemeForm] = useState(EMPTY_THEME_FORM);
  const [isLoadingTheme, setIsLoadingTheme] = useState(true);
  const [isSavingTheme, setIsSavingTheme] = useState(false);
  const [isCreatingTheme, setIsCreatingTheme] = useState(false);
  const [themeMessage, setThemeMessage] = useState("");

  // Festive animation state
  const [festiveEnabled,       setFestiveEnabled]       = useState(false);
  const [festiveType,          setFestiveType]          = useState("diwali");
  const [festiveIntensity,     setFestiveIntensity]     = useState("subtle");
  const [festiveCustomColors,  setFestiveCustomColors]  = useState(["","","","","",""]);
  const [festiveCustomAnims,   setFestiveCustomAnims]   = useState([]);
  const [newAnimName,          setNewAnimName]          = useState("");
  const [newAnimUrl,           setNewAnimUrl]           = useState("");
  const [newAnimError,         setNewAnimError]         = useState("");
  const [isSavingFestive,      setIsSavingFestive]      = useState(false);
  const [festiveMessage,       setFestiveMessage]       = useState("");

  // Festive banner state
  const [bannerEnabled,   setBannerEnabled]   = useState(false);
  const [bannerText,      setBannerText]      = useState("🎉 Festive Sale is Live!");
  const [bannerBgFrom,    setBannerBgFrom]    = useState("#FF6B00");
  const [bannerBgTo,      setBannerBgTo]      = useState("#FFD700");
  const [bannerTextColor, setBannerTextColor] = useState("#ffffff");
  const [bannerLinkUrl,   setBannerLinkUrl]   = useState("");
  const [bannerLinkText,  setBannerLinkText]  = useState("Shop Now");
  const [bannerMessage,   setBannerMessage]   = useState("");
  const [isSavingBanner,  setIsSavingBanner]  = useState(false);

  // Website Icons state
  const [storeIcons, setStoreIcons] = useState({
    home: "🏠",
    categories: "📚",
    wishlist: "❤️",
    cart: "🛒",
    profile: "👤",
    search: "🔍"
  });
  const [isSavingIcons, setIsSavingIcons] = useState(false);
  const [iconsMessage, setIconsMessage] = useState("");

  const themeOptions = useMemo(() => getSiteThemeOptions(customThemes), [customThemes]);

  const activeTheme =
    themeOptions.find((option) => option.value === siteTheme) ||
    themeOptions.find((option) => option.value === DEFAULT_SITE_THEME) ||
    themeOptions[0];

  useEffect(() => {
    let active = true;

    axios
      .get("/api/settings")
      .then((res) => {
        if (!active) return;
        const nextCustomThemes = Array.isArray(res.data?.customThemes) ? res.data.customThemes : [];
        const nextTheme = String(res.data?.siteTheme || DEFAULT_SITE_THEME);
        setCustomThemes(nextCustomThemes);
        setSiteTheme(nextTheme);
        applySiteTheme(nextTheme, nextCustomThemes);
        // Load festive animation settings
        if (res.data?.festiveAnimation) {
          setFestiveEnabled(Boolean(res.data.festiveAnimation.enabled));
          setFestiveType(String(res.data.festiveAnimation.type      || "diwali"));
          setFestiveIntensity(String(res.data.festiveAnimation.intensity || "subtle"));
          const loaded = Array.isArray(res.data.festiveAnimation.customColors)
            ? res.data.festiveAnimation.customColors.slice(0, 6)
            : [];
          setFestiveCustomColors([...loaded, ...Array(6).fill("")].slice(0, 6));
          setFestiveCustomAnims(
            Array.isArray(res.data.festiveAnimation.customAnimations)
              ? res.data.festiveAnimation.customAnimations
              : []
          );
        }
        // Load festive banner settings
        if (res.data?.festiveBanner) {
          setBannerEnabled(Boolean(res.data.festiveBanner.enabled));
          setBannerText(String(res.data.festiveBanner.text      || "🎉 Festive Sale is Live!"));
          setBannerBgFrom(String(res.data.festiveBanner.bgFrom  || "#FF6B00"));
          setBannerBgTo(String(res.data.festiveBanner.bgTo      || "#FFD700"));
          setBannerTextColor(String(res.data.festiveBanner.textColor || "#ffffff"));
          setBannerLinkUrl(String(res.data.festiveBanner.linkUrl  || ""));
          setBannerLinkText(String(res.data.festiveBanner.linkText || "Shop Now"));
        }
        // Load website icons settings
        if (res.data?.storeIcons) {
          setStoreIcons({
            home: String(res.data.storeIcons.home || "🏠"),
            categories: String(res.data.storeIcons.categories || "📚"),
            wishlist: String(res.data.storeIcons.wishlist || "❤️"),
            cart: String(res.data.storeIcons.cart || "🛒"),
            profile: String(res.data.storeIcons.profile || "👤"),
            search: String(res.data.storeIcons.search || "🔍")
          });
        }
      })
      .catch(() => {
        if (!active) return;
        setSiteTheme(DEFAULT_SITE_THEME);
        setCustomThemes([]);
      })
      .finally(() => {
        if (!active) return;
        setIsLoadingTheme(false);
      });

    return () => { active = false; };
  }, []);

  const saveActiveTheme = async () => {
    setIsSavingTheme(true);
    setThemeMessage("");

    try {
      const res = await axios.put(
        "/api/settings",
        { siteTheme },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const nextCustomThemes = Array.isArray(res.data?.customThemes) ? res.data.customThemes : [];
      const nextTheme = String(res.data?.siteTheme || DEFAULT_SITE_THEME);
      setCustomThemes(nextCustomThemes);
      setSiteTheme(nextTheme);
      applySiteTheme(nextTheme, nextCustomThemes);
      setThemeMessage("Store theme updated.");
      window.dispatchEvent(new CustomEvent("siteSettingsUpdated"));
    } catch (err) {
      setThemeMessage(err?.response?.data?.message || "Could not save theme settings.");
    } finally {
      setIsSavingTheme(false);
    }
  };

  const saveFestiveAnimation = async () => {
    setIsSavingFestive(true);
    setFestiveMessage("");
    try {
      const cleanColors = festiveCustomColors.map(c => String(c || "").trim()).filter(Boolean);
      await axios.put(
        "/api/settings",
        { festiveAnimation: {
            enabled:          festiveEnabled,
            type:             festiveType,
            intensity:        festiveIntensity,
            customColors:     cleanColors,
            customAnimations: festiveCustomAnims
          } },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setFestiveMessage(festiveEnabled
        ? `Animation enabled (${festiveType}, ${festiveIntensity})${cleanColors.length > 0 ? " with custom colours" : ""}.`
        : "Animation disabled.");
      window.dispatchEvent(new CustomEvent("siteSettingsUpdated"));
    } catch (err) {
      setFestiveMessage(err?.response?.data?.message || "Could not save festive animation settings.");
    } finally {
      setIsSavingFestive(false);
    }
  };

  // Add a new Lottie animation from external URL
  const handleAddCustomAnim = async () => {
    setNewAnimError("");
    const name = newAnimName.trim();
    const url  = newAnimUrl.trim();
    if (!name) { setNewAnimError("Enter a name for this animation."); return; }
    if (!url)  { setNewAnimError("Paste a Lottie JSON URL."); return; }
    if (!/^https?:\/\//i.test(url)) { setNewAnimError("URL must start with http:// or https://"); return; }
    if (festiveCustomAnims.length >= 20) { setNewAnimError("Maximum 20 custom animations."); return; }

    const id = `custom_${Date.now()}`;
    const updated = [...festiveCustomAnims, { id, name, sourceUrl: url, sourceType: "lottie" }];
    setFestiveCustomAnims(updated);
    setNewAnimName("");
    setNewAnimUrl("");

    // Immediately save so it's available to select
    setIsSavingFestive(true);
    setFestiveMessage("");
    try {
      const cleanColors = festiveCustomColors.map(c => String(c || "").trim()).filter(Boolean);
      await axios.put(
        "/api/settings",
        { festiveAnimation: {
            enabled:          festiveEnabled,
            type:             festiveType,
            intensity:        festiveIntensity,
            customColors:     cleanColors,
            customAnimations: updated
          } },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setFestiveMessage(`"${name}" added.`);
      window.dispatchEvent(new CustomEvent("siteSettingsUpdated"));
    } catch (err) {
      setFestiveMessage(err?.response?.data?.message || "Saved locally but couldn't persist. Save again.");
    } finally {
      setIsSavingFestive(false);
    }
  };

  const handleDeleteCustomAnim = async (id) => {
    const updated = festiveCustomAnims.filter(a => a.id !== id);
    // If the deleted anim was selected, reset to diwali
    if (festiveType === id) setFestiveType("diwali");
    setFestiveCustomAnims(updated);
    setIsSavingFestive(true);
    try {
      const cleanColors = festiveCustomColors.map(c => String(c || "").trim()).filter(Boolean);
      await axios.put(
        "/api/settings",
        { festiveAnimation: {
            enabled:          festiveEnabled,
            type:             festiveType === id ? "diwali" : festiveType,
            intensity:        festiveIntensity,
            customColors:     cleanColors,
            customAnimations: updated
          } },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      window.dispatchEvent(new CustomEvent("siteSettingsUpdated"));
    } finally {
      setIsSavingFestive(false);
    }
  };

  const saveFestiveBanner = async () => {
    setIsSavingBanner(true);
    setBannerMessage("");
    try {
      await axios.put(
        "/api/settings",
        { festiveBanner: { enabled: bannerEnabled, text: bannerText, bgFrom: bannerBgFrom, bgTo: bannerBgTo,
            textColor: bannerTextColor, linkUrl: bannerLinkUrl, linkText: bannerLinkText } },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setBannerMessage(bannerEnabled ? "Festive banner enabled and live." : "Festive banner disabled.");
      window.dispatchEvent(new CustomEvent("siteSettingsUpdated"));
    } catch (err) {
      setBannerMessage(err?.response?.data?.message || "Could not save banner settings.");
    } finally {
      setIsSavingBanner(false);
    }
  };

  const saveStoreIcons = async () => {
    setIsSavingIcons(true);
    setIconsMessage("");
    try {
      await axios.put(
        "/api/settings",
        { storeIcons },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setIconsMessage("Website icons updated successfully.");
      window.dispatchEvent(new CustomEvent("siteSettingsUpdated"));
    } catch (err) {
      setIconsMessage(err?.response?.data?.message || "Could not save website icons.");
    } finally {
      setIsSavingIcons(false);
    }
  };

  const createCustomTheme = async () => {
    const name = String(themeForm.name || "").trim();
    if (!name) {
      setThemeMessage("Enter a theme name.");
      return;
    }

    const nextThemeId = toThemeId(name);
    if (!nextThemeId) {
      setThemeMessage("Theme name must include letters or numbers.");
      return;
    }

    if (themeOptions.some((option) => option.value === nextThemeId)) {
      setThemeMessage("Theme name already exists. Choose a different name.");
      return;
    }

    const nextCustomTheme = {
      id: nextThemeId,
      name,
      description: String(themeForm.description || "").trim(),
      palette: {
        bg: themeForm.bg,
        surface: themeForm.surface,
        text: themeForm.text,
        header: themeForm.header,
        accent: themeForm.accent,
        button: themeForm.button,
        navBottom: themeForm.navBottom || "#1c2735",
        footerBg: themeForm.footerBg,
        footerText: themeForm.footerText,
        sectionBg: themeForm.sectionBg,
        sectionText: themeForm.sectionText
      }
    };

    setIsCreatingTheme(true);
    setThemeMessage("");

    try {
      const res = await axios.put(
        "/api/settings",
        {
          siteTheme: nextThemeId,
          customThemes: [...customThemes, nextCustomTheme]
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const nextCustomThemes = Array.isArray(res.data?.customThemes) ? res.data.customThemes : [];
      const nextTheme = String(res.data?.siteTheme || DEFAULT_SITE_THEME);
      setCustomThemes(nextCustomThemes);
      setSiteTheme(nextTheme);
      setThemeForm(EMPTY_THEME_FORM);
      applySiteTheme(nextTheme, nextCustomThemes);
      setThemeMessage("Custom theme created and selected.");
      window.dispatchEvent(new CustomEvent("siteSettingsUpdated"));
    } catch (err) {
      setThemeMessage(err?.response?.data?.message || "Could not create custom theme.");
    } finally {
      setIsCreatingTheme(false);
    }
  };

  const deleteCustomTheme = async (themeId) => {
    if (!window.confirm("Are you sure you want to delete this custom theme?")) {
      return;
    }

    const updatedThemes = customThemes.filter((t) => t.id !== themeId);
    let nextTheme = siteTheme;

    // If active theme was deleted, fallback to default
    if (siteTheme === themeId) {
      nextTheme = DEFAULT_SITE_THEME;
    }

    setIsSavingTheme(true);
    setThemeMessage("");

    try {
      const res = await axios.put(
        "/api/settings",
        {
          siteTheme: nextTheme,
          customThemes: updatedThemes
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const nextCustomThemes = Array.isArray(res.data?.customThemes) ? res.data.customThemes : [];
      const appliedTheme = String(res.data?.siteTheme || DEFAULT_SITE_THEME);
      setCustomThemes(nextCustomThemes);
      setSiteTheme(appliedTheme);
      applySiteTheme(appliedTheme, nextCustomThemes);
      setThemeMessage("Custom theme deleted successfully.");
      window.dispatchEvent(new CustomEvent("siteSettingsUpdated"));
    } catch (err) {
      setThemeMessage(err?.response?.data?.message || "Could not delete custom theme.");
    } finally {
      setIsSavingTheme(false);
    }
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />

      <main className="admin-main">
        <div className="admin-header">
          <h1>Theme Settings</h1>
          <p style={{ margin: "6px 0 0", fontSize: "13px", color: "var(--admin-muted)" }}>
            Choose the storefront palette customers see across the website.
          </p>
        </div>

        <section className="card pricing-controls-card">
          <div className="pricing-controls-header">
            <div>
              <h3>Website Theme</h3>
              <p>Switch the store between built-in palettes or custom themes created by admins.</p>
            </div>
            <span className="pricing-badge">Live Theme</span>
          </div>

          <div className="pricing-preview-row pricing-preview-row-theme">
            <div className="pricing-preview-chip">
              <span>Current Theme</span>
              <strong>{activeTheme?.label || "Sunrise"}</strong>
            </div>
            <div className="pricing-preview-chip">
              <span>Experience</span>
              <strong>{activeTheme?.description || "Warm saffron and sandstone accents"}</strong>
            </div>
          </div>

          {isLoadingTheme ? (
            <p className="theme-settings-note">Loading theme settings...</p>
          ) : (
            <div className="theme-preset-grid">
              {themeOptions.map((option) => {
                const isActive = siteTheme === option.value;
                return (
                  <div key={option.value} className="theme-preset-wrapper">
                    <button
                      type="button"
                      className={isActive ? "theme-preset-card active" : "theme-preset-card"}
                      onClick={() => {
                        setSiteTheme(option.value);
                        applySiteTheme(option.value, customThemes);
                      }}
                    >
                      <strong>{option.label}</strong>
                      <span>{option.description}</span>
                    </button>
                    {option.isCustom && (
                      <button
                        type="button"
                        className="theme-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteCustomTheme(option.value);
                        }}
                        title="Delete custom theme"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="pricing-actions-row">
            <button className="pricing-save-btn" onClick={saveActiveTheme} disabled={isSavingTheme}>
              {isSavingTheme ? "Saving..." : "Save Theme"}
            </button>
            <Link className="pricing-link-btn" to="/admin">
              Back to Dashboard
            </Link>
          </div>
          {themeMessage && (
            <p className={`pricing-message ${themeMessage.includes("Could not") || themeMessage.includes("Enter") || themeMessage.includes("exists") ? "error" : "success"}`}>
              {themeMessage}
            </p>
          )}
        </section>

        {/* ── Festive Animation ── */}
        <section className="card">
          <div className="pricing-controls-header">
            <div>
              <h3>Festive Animation</h3>
              <p>Display a festive particle animation across the entire storefront for celebrations.</p>
            </div>
            <span className={`pricing-badge${festiveEnabled ? " pricing-badge-active" : ""}`}>
              {festiveEnabled ? "🎉 Active" : "Off"}
            </span>
          </div>

          {/* Enable toggle */}
          <div className="festive-toggle-row">
            <label className="festive-toggle-label">
              <div
                className={`festive-toggle${festiveEnabled ? " on" : ""}`}
                onClick={() => setFestiveEnabled(v => !v)}
                role="switch"
                aria-checked={festiveEnabled}
                tabIndex={0}
                onKeyDown={e => e.key === " " && setFestiveEnabled(v => !v)}
              >
                <span className="festive-toggle-thumb" />
              </div>
              <span className="festive-toggle-text">
                {festiveEnabled ? "Animation is ON — customers will see this" : "Animation is OFF"}
              </span>
            </label>
          </div>

          {/* Animation type grid — presets + custom Lottie */}
          <div className="festive-section-title">Animation Type</div>
          <div className="festive-type-grid festive-type-grid-extended">
            {ANIMATION_TYPES.map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`festive-type-card${festiveType === opt.value ? " active" : ""}`}
                onClick={() => setFestiveType(opt.value)}
              >
                <span className="festive-type-emoji">{opt.emoji}</span>
                <strong>{opt.label}</strong>
                <small>{opt.desc}</small>
              </button>
            ))}
            {/* Custom Lottie animations */}
            {festiveCustomAnims.map(anim => (
              <div
                key={anim.id}
                className={`festive-type-card festive-type-card-custom${festiveType === anim.id ? " active" : ""}`}
              >
                <button
                  type="button"
                  className="festive-type-card-select"
                  onClick={() => setFestiveType(anim.id)}
                >
                  <span className="festive-type-emoji">🌐</span>
                  <strong>{anim.name}</strong>
                  <small>Lottie</small>
                </button>
                <button
                  type="button"
                  className="festive-custom-anim-delete"
                  onClick={() => handleDeleteCustomAnim(anim.id)}
                  title={`Delete ${anim.name}`}
                >✕</button>
              </div>
            ))}
          </div>

          {/* Particle intensity — only relevant for canvas presets, not Lottie */}
          {!festiveCustomAnims.find(a => a.id === festiveType) && (
            <>
              <div className="festive-section-title">Particle Intensity</div>
              <div className="festive-intensity-row">
                {INTENSITIES.map(opt => (
                  <label key={opt.value} className={`festive-intensity-chip${festiveIntensity === opt.value ? " active" : ""}`}>
                    <input
                      type="radio"
                      name="festiveIntensity"
                      value={opt.value}
                      checked={festiveIntensity === opt.value}
                      onChange={() => setFestiveIntensity(opt.value)}
                    />
                    <span>{opt.label}</span>
                    <small>{opt.desc}</small>
                  </label>
                ))}
              </div>
            </>
          )}

          {/* Add external Lottie animation */}
          <div className="festive-section-title">Add External Animation (Lottie)</div>
          <div className="festive-add-anim-form">
            <label className="pricing-field">
              <span className="pricing-label">Animation Name</span>
              <input
                type="text"
                value={newAnimName}
                onChange={e => { setNewAnimName(e.target.value); setNewAnimError(""); }}
                placeholder="e.g. Dussehra Special"
                maxLength={60}
              />
            </label>
            <label className="pricing-field">
              <span className="pricing-label">Lottie JSON URL</span>
              <input
                type="url"
                value={newAnimUrl}
                onChange={e => { setNewAnimUrl(e.target.value); setNewAnimError(""); }}
                placeholder="https://assets.lottiefiles.com/packages/…/animation.json"
              />
            </label>
            <div className="festive-add-anim-actions">
              <a
                href="https://lottiefiles.com/featured"
                target="_blank"
                rel="noopener noreferrer"
                className="festive-lottiefiles-link"
              >
                Browse LottieFiles.com →
              </a>
              <button
                type="button"
                className="pricing-save-btn"
                onClick={handleAddCustomAnim}
                disabled={isSavingFestive}
              >
                {isSavingFestive ? "Saving..." : "Add Animation"}
              </button>
            </div>
            {newAnimError && <p className="pricing-message error">{newAnimError}</p>}
          </div>

          <div className="pricing-actions-row">
            <button className="pricing-save-btn" onClick={saveFestiveAnimation} disabled={isSavingFestive}>
              {isSavingFestive ? "Saving..." : "Save Animation Settings"}
            </button>
          </div>
          {festiveMessage && (
            <p className={`pricing-message ${festiveMessage.includes("Could not") ? "error" : "success"}`}>
              {festiveMessage}
            </p>
          )}
        </section>

        {/* ── Custom Particle Colours ── */}
        <section className="card">
          <div className="pricing-controls-header">
            <div>
              <h3>Custom Particle Colours</h3>
              <p>Override the default colour palette for the selected animation type (up to 6 colours). Leave all blank to use the preset colours.</p>
            </div>
            <span className="pricing-badge">Animation</span>
          </div>

          <div className="festive-color-grid">
            {festiveCustomColors.map((col, i) => (
              <label key={i} className="festive-color-slot">
                <span className="festive-color-slot-label">Colour {i + 1}</span>
                <div className="festive-color-slot-row">
                  <input
                    type="color"
                    value={col || "#ffffff"}
                    onChange={e => {
                      const next = [...festiveCustomColors];
                      next[i] = e.target.value;
                      setFestiveCustomColors(next);
                    }}
                  />
                  <input
                    type="text"
                    value={col}
                    placeholder="#RRGGBB"
                    maxLength={7}
                    className="festive-color-hex"
                    onChange={e => {
                      const next = [...festiveCustomColors];
                      next[i] = e.target.value;
                      setFestiveCustomColors(next);
                    }}
                  />
                  {col && (
                    <button
                      type="button"
                      className="festive-color-clear"
                      onClick={() => {
                        const next = [...festiveCustomColors];
                        next[i] = "";
                        setFestiveCustomColors(next);
                      }}
                      title="Clear"
                    >✕</button>
                  )}
                </div>
              </label>
            ))}
          </div>

          {/* Live colour swatch preview */}
          <div className="festive-color-preview">
            {festiveCustomColors.filter(Boolean).length > 0
              ? festiveCustomColors.filter(Boolean).map((c, i) => (
                  <span key={i} className="festive-color-swatch" style={{ background: c }} title={c} />
                ))
              : <span className="festive-color-preview-hint">No custom colours set — preset palette will be used.</span>
            }
          </div>

          <div className="pricing-actions-row">
            <button
              type="button"
              className="pricing-link-btn"
              onClick={() => setFestiveCustomColors(["","","","","",""])}
            >
              Reset to Preset
            </button>
            <button className="pricing-save-btn" onClick={saveFestiveAnimation} disabled={isSavingFestive}>
              {isSavingFestive ? "Saving..." : "Save Colours"}
            </button>
          </div>
        </section>

        {/* ── Festive Banner ── */}
        <section className="card">
          <div className="pricing-controls-header">
            <div>
              <h3>Festive Announcement Banner</h3>
              <p>A fixed bar at the top of every page. Customers can dismiss it. Changes are live immediately after saving.</p>
            </div>
            <span className={`pricing-badge${bannerEnabled ? " pricing-badge-active" : ""}`}>
              {bannerEnabled ? "🎉 Live" : "Off"}
            </span>
          </div>

          {/* Toggle */}
          <div className="festive-toggle-row">
            <label className="festive-toggle-label">
              <div
                className={`festive-toggle${bannerEnabled ? " on" : ""}`}
                onClick={() => setBannerEnabled(v => !v)}
                role="switch"
                aria-checked={bannerEnabled}
                tabIndex={0}
                onKeyDown={e => e.key === " " && setBannerEnabled(v => !v)}
              >
                <span className="festive-toggle-thumb" />
              </div>
              <span className="festive-toggle-text">
                {bannerEnabled ? "Banner is ON — visible to all customers" : "Banner is OFF"}
              </span>
            </label>
          </div>

          {/* Live preview */}
          <div
            className="festive-banner-preview"
            style={{
              background: `linear-gradient(90deg, ${bannerBgFrom}, ${bannerBgTo})`,
              color: bannerTextColor
            }}
          >
            <span>{bannerText || "Your festive message appears here"}</span>
            {bannerLinkUrl && (
              <span className="festive-banner-preview-link">
                {bannerLinkText || "Shop Now"} →
              </span>
            )}
          </div>

          {/* Fields */}
          <div className="festive-banner-fields">
            <label className="pricing-field" style={{ gridColumn: "1 / -1" }}>
              <span className="pricing-label">Banner Text</span>
              <input
                type="text"
                value={bannerText}
                onChange={e => setBannerText(e.target.value)}
                placeholder="e.g. 🎉 Diwali Sale is Live!"
                maxLength={120}
              />
            </label>

            <label className="pricing-field">
              <span className="pricing-label">Gradient Start</span>
              <div className="theme-color-input">
                <input type="color" value={bannerBgFrom} onChange={e => setBannerBgFrom(e.target.value)} />
                <span>{bannerBgFrom}</span>
              </div>
            </label>

            <label className="pricing-field">
              <span className="pricing-label">Gradient End</span>
              <div className="theme-color-input">
                <input type="color" value={bannerBgTo} onChange={e => setBannerBgTo(e.target.value)} />
                <span>{bannerBgTo}</span>
              </div>
            </label>

            <label className="pricing-field">
              <span className="pricing-label">Text Color</span>
              <div className="theme-color-input">
                <input type="color" value={bannerTextColor} onChange={e => setBannerTextColor(e.target.value)} />
                <span>{bannerTextColor}</span>
              </div>
            </label>

            <label className="pricing-field">
              <span className="pricing-label">Link URL <small style={{fontWeight:400,color:"var(--admin-muted)"}}>(optional)</small></span>
              <input
                type="url"
                value={bannerLinkUrl}
                onChange={e => setBannerLinkUrl(e.target.value)}
                placeholder="https://yoursite.com/sale"
              />
            </label>

            <label className="pricing-field">
              <span className="pricing-label">Link Button Text</span>
              <input
                type="text"
                value={bannerLinkText}
                onChange={e => setBannerLinkText(e.target.value)}
                placeholder="Shop Now"
                maxLength={40}
              />
            </label>
          </div>

          <div className="pricing-actions-row">
            <button className="pricing-save-btn" onClick={saveFestiveBanner} disabled={isSavingBanner}>
              {isSavingBanner ? "Saving..." : "Save Banner Settings"}
            </button>
          </div>
          {bannerMessage && (
            <p className={`pricing-message ${bannerMessage.includes("Could not") ? "error" : "success"}`}>
              {bannerMessage}
            </p>
          )}
        </section>

        {/* ── Website Icons Settings ── */}
        <section className="card">
          <div className="pricing-controls-header">
            <div>
              <h3>Website Icons</h3>
              <p>Configure the custom emojis, icons, or text characters displayed across the storefront links.</p>
            </div>
            <span className="pricing-badge">Storefront Icons</span>
          </div>

          <div className="theme-creator-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "20px", marginTop: "20px" }}>
            <label className="pricing-field">
              <span className="pricing-label">Home Link Icon</span>
              <input
                type="text"
                value={storeIcons.home}
                onChange={(e) => setStoreIcons((prev) => ({ ...prev, home: e.target.value }))}
                placeholder="🏠"
                style={{ fontSize: "1.1rem" }}
              />
            </label>

            <label className="pricing-field">
              <span className="pricing-label">Categories Link Icon</span>
              <input
                type="text"
                value={storeIcons.categories}
                onChange={(e) => setStoreIcons((prev) => ({ ...prev, categories: e.target.value }))}
                placeholder="📚"
                style={{ fontSize: "1.1rem" }}
              />
            </label>

            <label className="pricing-field">
              <span className="pricing-label">Wishlist Link Icon</span>
              <input
                type="text"
                value={storeIcons.wishlist}
                onChange={(e) => setStoreIcons((prev) => ({ ...prev, wishlist: e.target.value }))}
                placeholder="❤️"
                style={{ fontSize: "1.1rem" }}
              />
            </label>

            <label className="pricing-field">
              <span className="pricing-label">Cart Link Icon</span>
              <input
                type="text"
                value={storeIcons.cart}
                onChange={(e) => setStoreIcons((prev) => ({ ...prev, cart: e.target.value }))}
                placeholder="🛒"
                style={{ fontSize: "1.1rem" }}
              />
            </label>

            <label className="pricing-field">
              <span className="pricing-label">Profile Link Icon</span>
              <input
                type="text"
                value={storeIcons.profile}
                onChange={(e) => setStoreIcons((prev) => ({ ...prev, profile: e.target.value }))}
                placeholder="👤"
                style={{ fontSize: "1.1rem" }}
              />
            </label>

            <label className="pricing-field">
              <span className="pricing-label">Search Form Icon</span>
              <input
                type="text"
                value={storeIcons.search}
                onChange={(e) => setStoreIcons((prev) => ({ ...prev, search: e.target.value }))}
                placeholder="🔍"
                style={{ fontSize: "1.1rem" }}
              />
            </label>
          </div>

          <div className="pricing-actions-row" style={{ marginTop: "24px" }}>
            <button className="pricing-save-btn" onClick={saveStoreIcons} disabled={isSavingIcons}>
              {isSavingIcons ? "Saving..." : "Save Website Icons"}
            </button>
          </div>
          {iconsMessage && (
            <p className={`pricing-message ${iconsMessage.includes("Could not") ? "error" : "success"}`}>
              {iconsMessage}
            </p>
          )}
        </section>

        <section className="card">
          <div className="pricing-controls-header">
            <div>
              <h3>Create Custom Theme</h3>
              <p>Add a new theme by defining the core storefront colors.</p>
            </div>
            <span className="pricing-badge">Custom</span>
          </div>

          <div className="theme-creator-grid">
            <label className="pricing-field">
              <span className="pricing-label">Theme Name</span>
              <input
                value={themeForm.name}
                onChange={(e) => setThemeForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Lotus"
              />
            </label>
            <label className="pricing-field">
              <span className="pricing-label">Description</span>
              <input
                value={themeForm.description}
                onChange={(e) => setThemeForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Short theme description"
              />
            </label>
            <label className="pricing-field">
              <span className="pricing-label">Page Background</span>
              <div className="theme-color-input">
                <input
                  type="color"
                  value={themeForm.bg}
                  onChange={(e) => setThemeForm((prev) => ({ ...prev, bg: e.target.value }))}
                />
                <span>{themeForm.bg}</span>
              </div>
            </label>
            <label className="pricing-field">
              <span className="pricing-label">Surface</span>
              <div className="theme-color-input">
                <input
                  type="color"
                  value={themeForm.surface}
                  onChange={(e) => setThemeForm((prev) => ({ ...prev, surface: e.target.value }))}
                />
                <span>{themeForm.surface}</span>
              </div>
            </label>
            <label className="pricing-field">
              <span className="pricing-label">Text</span>
              <div className="theme-color-input">
                <input
                  type="color"
                  value={themeForm.text}
                  onChange={(e) => setThemeForm((prev) => ({ ...prev, text: e.target.value }))}
                />
                <span>{themeForm.text}</span>
              </div>
            </label>
            <label className="pricing-field">
              <span className="pricing-label">Header</span>
              <div className="theme-color-input">
                <input
                  type="color"
                  value={themeForm.header}
                  onChange={(e) => setThemeForm((prev) => ({ ...prev, header: e.target.value }))}
                />
                <span>{themeForm.header}</span>
              </div>
            </label>
            <label className="pricing-field">
              <span className="pricing-label">Accent</span>
              <div className="theme-color-input">
                <input
                  type="color"
                  value={themeForm.accent}
                  onChange={(e) => setThemeForm((prev) => ({ ...prev, accent: e.target.value }))}
                />
                <span>{themeForm.accent}</span>
              </div>
            </label>
            <label className="pricing-field">
              <span className="pricing-label">Button</span>
              <div className="theme-color-input">
                <input
                  type="color"
                  value={themeForm.button}
                  onChange={(e) => setThemeForm((prev) => ({ ...prev, button: e.target.value }))}
                />
                <span>{themeForm.button}</span>
              </div>
            </label>
            <label className="pricing-field">
              <span className="pricing-label">Navbar Bottom Bar</span>
              <div className="theme-color-input">
                <input
                  type="color"
                  value={themeForm.navBottom || "#1c2735"}
                  onChange={(e) => setThemeForm((prev) => ({ ...prev, navBottom: e.target.value }))}
                />
                <span>{themeForm.navBottom || "#1c2735"}</span>
              </div>
            </label>
            <label className="pricing-field">
              <span className="pricing-label">Footer Background</span>
              <div className="theme-color-input">
                <input
                  type="color"
                  value={themeForm.footerBg || "#1c1c1e"}
                  onChange={(e) => setThemeForm((prev) => ({ ...prev, footerBg: e.target.value }))}
                />
                <span>{themeForm.footerBg || "#1c1c1e"}</span>
              </div>
            </label>
            <label className="pricing-field">
              <span className="pricing-label">Footer Text</span>
              <div className="theme-color-input">
                <input
                  type="color"
                  value={themeForm.footerText || "#ffffff"}
                  onChange={(e) => setThemeForm((prev) => ({ ...prev, footerText: e.target.value }))}
                />
                <span>{themeForm.footerText || "#ffffff"}</span>
              </div>
            </label>
            <label className="pricing-field">
              <span className="pricing-label">Secondary Section Background</span>
              <div className="theme-color-input">
                <input
                  type="color"
                  value={themeForm.sectionBg || "#f2f2f7"}
                  onChange={(e) => setThemeForm((prev) => ({ ...prev, sectionBg: e.target.value }))}
                />
                <span>{themeForm.sectionBg || "#f2f2f7"}</span>
              </div>
            </label>
            <label className="pricing-field">
              <span className="pricing-label">Secondary Section Text</span>
              <div className="theme-color-input">
                <input
                  type="color"
                  value={themeForm.sectionText || "#1c1c1e"}
                  onChange={(e) => setThemeForm((prev) => ({ ...prev, sectionText: e.target.value }))}
                />
                <span>{themeForm.sectionText || "#1c1c1e"}</span>
              </div>
            </label>
          </div>

          <div className="pricing-actions-row">
            <button className="pricing-save-btn" onClick={createCustomTheme} disabled={isCreatingTheme}>
              {isCreatingTheme ? "Creating..." : "Add New Theme"}
            </button>
            <span>New custom themes are saved to store settings and become selectable immediately.</span>
          </div>
        </section>
      </main>
    </div>
  );
}

export default AdminThemeSettings;

