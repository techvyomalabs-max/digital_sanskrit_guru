import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../hooks/useAuth";
import AdminSidebar from "../components/admin/AdminSidebar";
import { applySiteTheme, DEFAULT_SITE_THEME, getSiteThemeOptions } from "../utils/siteTheme";
import "./AdminDashboard.css";

const EMPTY_THEME_FORM = {
  name: "",
  description: "",
  bg: "#f6efe7",
  surface: "#ffffff",
  text: "#1f2937",
  header: "#7c2d12",
  accent: "#9a3412",
  button: "#fb923c"
};

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

    return () => {
      active = false;
    };
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
    } catch (err) {
      setThemeMessage(err?.response?.data?.message || "Could not save theme settings.");
    } finally {
      setIsSavingTheme(false);
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
        button: themeForm.button
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
    } catch (err) {
      setThemeMessage(err?.response?.data?.message || "Could not create custom theme.");
    } finally {
      setIsCreatingTheme(false);
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
                  <button
                    key={option.value}
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

