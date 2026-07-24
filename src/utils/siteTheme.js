export const DEFAULT_SITE_THEME = "sunrise";
const SITE_THEME_STORAGE_KEY = "site-theme-settings";

const BUILT_IN_THEME_DEFINITIONS = [
  {
    value: "sunrise",
    label: "Sunrise",
    description: "Premium saffron gold and deep navy theme",
    palette: {
      bg: "#fbfaf7",
      surface: "#ffffff",
      text: "#0f172a",
      header: "#0f172a",
      accent: "#d97706",
      button: "#d97706",
      navBottom: "#1e293b",
      footerBg: "#0f172a",
      footerText: "#ffffff",
      sectionBg: "#f1f5f9",
      sectionText: "#0f172a"
    }
  },
  {
    value: "forest",
    label: "Forest",
    description: "Premium emerald and mint theme",
    palette: {
      bg: "#f2f7f4",
      surface: "#ffffff",
      text: "#064e3b",
      header: "#064e3b",
      accent: "#059669",
      button: "#059669",
      navBottom: "#022c22",
      footerBg: "#022c22",
      footerText: "#ffffff",
      sectionBg: "#eef7f2",
      sectionText: "#064e3b"
    }
  },
  {
    value: "midnight",
    label: "Midnight",
    description: "Premium dark slate and gold theme",
    palette: {
      bg: "#0b0f19",
      surface: "#1e293b",
      text: "#f8fafc",
      header: "#0f172a",
      accent: "#f59e0b",
      button: "#38bdf8",
      navBottom: "#020617",
      footerBg: "#020617",
      footerText: "#ffffff",
      sectionBg: "#111827",
      sectionText: "#f8fafc"
    }
  }
];

const HEX_COLOR_REGEX = /^#([0-9a-f]{6})$/i;

function hexToRgb(hex) {
  const normalized = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return { r: 0, g: 0, b: 0 };
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixColors(colorA, colorB, ratio = 0.5) {
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);
  const t = Math.max(0, Math.min(1, Number(ratio) || 0));

  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t
  });
}

function darken(color, amount = 0.15) {
  return mixColors(color, "#000000", amount);
}

function toRgba(color, alpha = 1) {
  const { r, g, b } = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

function getReadableTextColor(color) {
  const { r, g, b } = hexToRgb(color);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? "#111827" : "#f8fafc";
}

function buildThemeVariables(theme) {
  const palette = theme.palette;
  const headerText = getReadableTextColor(palette.header);
  const buttonText = getReadableTextColor(palette.button);
  const accentText = getReadableTextColor(palette.accent);
  const navBottomBg = palette.navBottom || "#1c2735";
  const navBottomText = getReadableTextColor(navBottomBg);

  const footerBgColor = palette.footerBg || darken(palette.header, 0.24);
  const footerTextColor = palette.footerText || getReadableTextColor(footerBgColor);
  const sectionBgColor = palette.sectionBg || mixColors(palette.surface, palette.bg, 0.4);
  const sectionTextColor = palette.sectionText || palette.text;

  return {
    "--site-bg": palette.bg,
    "--site-surface": palette.surface,
    "--site-surface-muted": mixColors(palette.surface, palette.bg, 0.4),
    "--site-text": palette.text,
    "--site-text-soft": mixColors(palette.text, palette.surface, 0.45),
    "--site-border": mixColors(palette.text, palette.surface, 0.18),
    "--site-link": palette.accent,
    "--site-link-hover": darken(palette.accent, 0.12),
    "--site-header-bg": palette.header,
    "--site-header-bg-glass": toRgba(palette.header, 0.96),
    "--site-header-border": darken(palette.header, 0.18),
    "--site-header-text": headerText,
    "--site-search-border": palette.accent,
    "--site-search-focus": palette.button,
    "--site-badge-bg": mixColors(palette.button, palette.accent, 0.4),
    "--site-badge-text": accentText,
    "--site-button-bg": palette.button,
    "--site-button-hover": darken(palette.button, 0.12),
    "--site-button-text": buttonText,
    "--site-footer-bg": footerBgColor,
    "--site-footer-border": darken(footerBgColor, 0.12),
    "--site-footer-text": footerTextColor,
    "--site-section-bg": sectionBgColor,
    "--site-section-text": sectionTextColor,
    "--site-hero-start": palette.header,
    "--site-hero-end": palette.button,
    "--site-card-shadow": `0 16px 40px ${toRgba(palette.header, 0.14)}`,
    "--site-nav-bottom-bg": navBottomBg,
    "--site-nav-bottom-bg-glass": toRgba(navBottomBg, 0.95),
    "--site-nav-bottom-text": navBottomText
  };
}

function normalizeCustomTheme(theme) {
  const bg = String(theme?.palette?.bg || "").trim();
  const surface = String(theme?.palette?.surface || "").trim();
  const text = String(theme?.palette?.text || "").trim();
  const header = String(theme?.palette?.header || "").trim();
  const accent = String(theme?.palette?.accent || "").trim();
  const button = String(theme?.palette?.button || "").trim();
  const navBottom = String(theme?.palette?.navBottom || "").trim() || "#1c2735";

  const footerBg = String(theme?.palette?.footerBg || "").trim() || darken(header, 0.24);
  const footerText = String(theme?.palette?.footerText || "").trim() || getReadableTextColor(footerBg);
  const sectionBg = String(theme?.palette?.sectionBg || "").trim() || mixColors(surface, bg, 0.4);
  const sectionText = String(theme?.palette?.sectionText || "").trim() || text;

  const palette = {
    bg,
    surface,
    text,
    header,
    accent,
    button,
    navBottom,
    footerBg,
    footerText,
    sectionBg,
    sectionText
  };

  const coreColors = [palette.bg, palette.surface, palette.text, palette.header, palette.accent, palette.button];
  const coreValid = coreColors.every((color) => HEX_COLOR_REGEX.test(color));

  const optionalColors = [
    palette.navBottom,
    palette.footerBg,
    palette.footerText,
    palette.sectionBg,
    palette.sectionText
  ].filter(Boolean);
  const optionalValid = optionalColors.every((color) => HEX_COLOR_REGEX.test(color));

  if (!coreValid || !optionalValid) {
    return null;
  }

  const value = String(theme?.id || "").trim().toLowerCase();
  if (!value) {
    return null;
  }

  return {
    value,
    label: String(theme?.name || "Custom Theme").trim(),
    description: String(theme?.description || "Custom storefront palette").trim(),
    palette,
    isCustom: true
  };
}

export function getSiteThemeOptions(customThemes = []) {
  const normalizedCustomThemes = Array.isArray(customThemes)
    ? customThemes.map(normalizeCustomTheme).filter(Boolean)
    : [];

  return [
    ...BUILT_IN_THEME_DEFINITIONS.map((theme) => ({ ...theme, isCustom: false })),
    ...normalizedCustomThemes
  ];
}

export function readStoredSiteTheme() {
  if (typeof window === "undefined") return null;

  try {
    const rawValue = window.localStorage.getItem(SITE_THEME_STORAGE_KEY);
    if (!rawValue) return null;

    const parsed = JSON.parse(rawValue);
    return {
      siteTheme: String(parsed?.siteTheme || DEFAULT_SITE_THEME),
      customThemes: Array.isArray(parsed?.customThemes) ? parsed.customThemes : []
    };
  } catch {
    return null;
  }
}

export function persistSiteTheme(themeValue, customThemes = []) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      SITE_THEME_STORAGE_KEY,
      JSON.stringify({
        siteTheme: String(themeValue || DEFAULT_SITE_THEME),
        customThemes: Array.isArray(customThemes) ? customThemes : []
      })
    );
  } catch {
    // Ignore storage failures and continue with in-memory theme application.
  }
}

export function applySiteTheme(themeValue, customThemes = []) {
  if (typeof document === "undefined") return;

  const themeOptions = getSiteThemeOptions(customThemes);
  const activeTheme =
    themeOptions.find((theme) => theme.value === themeValue) ||
    themeOptions.find((theme) => theme.value === DEFAULT_SITE_THEME) ||
    BUILT_IN_THEME_DEFINITIONS[0];

  const root = document.documentElement;
  root.setAttribute("data-site-theme", activeTheme.value);

  Object.entries(buildThemeVariables(activeTheme)).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  persistSiteTheme(activeTheme.value, customThemes);
}
