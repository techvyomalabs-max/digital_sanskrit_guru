import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../hooks/useAuth";
import { useDialog } from "../hooks/useDialog";
import AdminSidebar from "../components/admin/AdminSidebar";
import SalesChart from "../components/SalesChart";
import { formatDate, formatDateForFileName, formatTime } from "../utils/date";
import {
  normalizeDistancePricing,
  normalizeInternationalDelivery,
  normalizeWarehouseLocation,
  parseGoogleMapsCoordinates
} from "../utils/deliveryPricing";
import { COUNTRY_OPTIONS } from "../utils/countryOptions";
import { storePricingConfig, SUPPORTED_PRICING_CURRENCIES } from "../utils/productPricing";
import {
  Package,
  ShoppingCart,
  IndianRupee,
  BarChart3,
  CalendarDays,
  CalendarRange,
  TrendingUp,
  Wallet,
  AlertTriangle,
  CheckCircle2,
  Bell,
  RefreshCw,
  Download,
  Settings2,
  Clock,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  MessageCircle,
  Zap,
  ShieldCheck,
  ExternalLink,
  Check,
  Lock,
  Phone,
  Slash,
  X,
  Building2
} from "lucide-react";
import {
  GST_STATE_CODES,
  normalizeGstin,
  isValidGstinFormat,
  isValidGstinChecksum,
  codeByStateName
} from "../utils/gstin";
import "./AdminShared.css";
import "./AdminDashboard.css";

const LOW_STOCK_THRESHOLD = 5;
const NON_DISMISSIBLE_NOTIFICATION_IDS = [
  "return-requests",
  "returns-received",
  "returns-overdue",
  "cancel-refunds",
  "refund-processing",
  "unmatched-payments",
  "access-pending"
];

function normalizeStatus(status) {
  if (status === "Shipped" || status === "Delivered" || status === "Cancelled") return status;
  return "Pending";
}

function formatCurrency(value) {
  return `Rs ${Math.round(Number(value) || 0).toLocaleString("en-IN")}`;
}

function formatPercent(value) {
  return `${Math.round(Number(value) || 0)}%`;
}

function createCsvCell(value) {
  return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
}

function normalizePricingMarketsInput(pricingMarkets = []) {
  return Array.isArray(pricingMarkets)
    ? pricingMarkets.map((market) => ({
        name: String(market?.name || ""),
        currency: String(market?.currency || "USD").toUpperCase(),
        countries: Array.isArray(market?.countries) ? market.countries.map((country) => String(country || "")) : []
      }))
    : [];
}

function formatPricingSettingsFromData(data = {}) {
  return {
    businessDetails: {
      legalName: String(data?.businessDetails?.legalName || ""),
      gstin: String(data?.businessDetails?.gstin || ""),
      address: String(data?.businessDetails?.address || ""),
      state: String(data?.businessDetails?.state || ""),
      stateCode: String(data?.businessDetails?.stateCode || ""),
      email: String(data?.businessDetails?.email || "")
    },
    enableCurrentLocation: data?.enableCurrentLocation !== false,
    gstPercent: String(Number(data?.gstPercent || 0)),
    deliveryCharge: String(Number(data?.deliveryCharge || 0)),
    warehouseLocation: {
      name: String(data?.warehouseLocation?.name || ""),
      address: String(data?.warehouseLocation?.address || ""),
      mapUrl: String(data?.warehouseLocation?.mapUrl || ""),
      latitude:
        data?.warehouseLocation?.latitude === null || data?.warehouseLocation?.latitude === undefined
          ? ""
          : String(data.warehouseLocation.latitude),
      longitude:
        data?.warehouseLocation?.longitude === null || data?.warehouseLocation?.longitude === undefined
          ? ""
          : String(data.warehouseLocation.longitude)
    },
    distancePricing: {
      enabled: data?.distancePricing?.enabled !== false,
      baseFee: String(Number(data?.distancePricing?.baseFee ?? data?.deliveryCharge ?? 0)),
      perKmCharge: String(Number(data?.distancePricing?.perKmCharge || 0)),
      freeRadiusKm: String(Number(data?.distancePricing?.freeRadiusKm || 0)),
      maxCharge:
        data?.distancePricing?.maxCharge === null || data?.distancePricing?.maxCharge === undefined
          ? ""
          : String(Number(data.distancePricing.maxCharge))
    },
    internationalDelivery: {
      enabled: data?.internationalDelivery?.enabled === true,
      domesticCountry: String(data?.internationalDelivery?.domesticCountry || "India"),
      defaultFee: String(Number(data?.internationalDelivery?.defaultFee ?? data?.deliveryCharge ?? 0)),
      countryRates: Array.isArray(data?.internationalDelivery?.countryRates)
        ? data.internationalDelivery.countryRates.map((item) => ({
            country: String(item?.country || ""),
            fee: String(Number(item?.fee || 0))
          }))
        : []
    },
    pricingMarkets: normalizePricingMarketsInput(data?.pricingMarkets || []),
    internationalPricingDefaults: {
      currency: String(data?.internationalPricingDefaults?.currency || "USD").toUpperCase()
    },
    currencyConversionRates: {
      INR: String(Number(data?.currencyConversionRates?.INR || 1)),
      USD: String(Number(data?.currencyConversionRates?.USD || 0.012)),
      EUR: String(Number(data?.currencyConversionRates?.EUR || 0.011)),
      GBP: String(Number(data?.currencyConversionRates?.GBP || 0.009)),
      AED: String(Number(data?.currencyConversionRates?.AED || 0.044)),
      CAD: String(Number(data?.currencyConversionRates?.CAD || 0.016)),
      AUD: String(Number(data?.currencyConversionRates?.AUD || 0.019))
    },
    homeSectionVisibility: {
      festiveOffers: data?.homeSectionVisibility?.festiveOffers !== false
    },
    collectionFilterVisibility: {
      festiveOffers: data?.collectionFilterVisibility?.festiveOffers !== false
    },
    whatsappSettings: {
      mode: data?.whatsappSettings?.mode || "free",
      phoneNumber: data?.whatsappSettings?.phoneNumber || "",
      welcomeMessage: data?.whatsappSettings?.welcomeMessage || "",
      metaPhoneNumberId: data?.whatsappSettings?.metaPhoneNumberId || "",
      metaAccessTokenSet: Boolean(data?.whatsappSettings?.metaAccessTokenSet),
      metaAccessTokenLast4: String(data?.whatsappSettings?.metaAccessTokenLast4 || ""),
      newAccessToken: "",
      clearAccessToken: false,
      apiConfigured: Boolean(data?.whatsappSettings?.apiConfigured),
      metaWabaId: data?.whatsappSettings?.metaWabaId || "",
      autoSendOrderConfirmation: data?.whatsappSettings?.autoSendOrderConfirmation !== false,
      enableOtpVerification: data?.whatsappSettings?.enableOtpVerification !== false
    },
    lastUpdatedByName: String(data?.lastUpdatedByName || ""),
    lastUpdatedByEmail: String(data?.lastUpdatedByEmail || ""),
    lastUpdatedAt: data?.lastUpdatedAt || null
  };
}

function getPricingChangesList(saved = {}, next = {}) {
  const lines = [];

  const prevGstin = String(saved?.businessDetails?.gstin || "").trim();
  const nextGstin = String(next?.businessDetails?.gstin || "").trim();
  if (prevGstin !== nextGstin) {
    lines.push(`GSTIN: ${prevGstin || "None"} → ${nextGstin || "None"}`);
  }

  const prevState = String(saved?.businessDetails?.state || "").trim();
  const nextState = String(next?.businessDetails?.state || "").trim();
  if (prevState !== nextState) {
    lines.push(`Business state: ${prevState || "None"} → ${nextState || "None"}`);
  }

  const prevLegalName = String(saved?.businessDetails?.legalName || "").trim();
  const nextLegalName = String(next?.businessDetails?.legalName || "").trim();
  if (prevLegalName !== nextLegalName) {
    lines.push("Legal name updated");
  }

  const prevAddress = String(saved?.businessDetails?.address || "").trim();
  const nextAddress = String(next?.businessDetails?.address || "").trim();
  if (prevAddress !== nextAddress) {
    lines.push("Business address updated");
  }

  const prevEmail = String(saved?.businessDetails?.email || "").trim();
  const nextEmail = String(next?.businessDetails?.email || "").trim();
  if (prevEmail !== nextEmail) {
    lines.push("Business email updated");
  }

  const prevGst = Number(saved?.gstPercent || 0);
  const nextGst = Math.max(0, Number(next?.gstPercent || 0));
  if (prevGst !== nextGst) {
    lines.push(`GST: ${prevGst}% → ${nextGst}%`);
  }

  const prevDelivery = Number(saved?.deliveryCharge || 0);
  const nextDelivery = Math.max(0, Number(next?.deliveryCharge || 0));
  if (prevDelivery !== nextDelivery) {
    lines.push(`Base delivery fee: Rs ${prevDelivery} → Rs ${nextDelivery}`);
  }

  const prevDistEnabled = saved?.distancePricing?.enabled !== false;
  const nextDistEnabled = next?.distancePricing?.enabled !== false;
  if (prevDistEnabled !== nextDistEnabled) {
    lines.push(`Distance pricing: ${prevDistEnabled ? "Enabled" : "Disabled"} → ${nextDistEnabled ? "Enabled" : "Disabled"}`);
  }

  const prevDistBase = Number(saved?.distancePricing?.baseFee ?? saved?.deliveryCharge ?? 0);
  const nextDistBase = Number(next?.distancePricing?.baseFee ?? next?.deliveryCharge ?? 0);
  if (prevDistBase !== nextDistBase) {
    lines.push(`Distance base fee: Rs ${prevDistBase} → Rs ${nextDistBase}`);
  }

  const prevPerKm = Number(saved?.distancePricing?.perKmCharge || 0);
  const nextPerKm = Number(next?.distancePricing?.perKmCharge || 0);
  if (prevPerKm !== nextPerKm) {
    lines.push(`Distance per-km charge: Rs ${prevPerKm} → Rs ${nextPerKm}`);
  }

  const prevFreeRadius = Number(saved?.distancePricing?.freeRadiusKm || 0);
  const nextFreeRadius = Number(next?.distancePricing?.freeRadiusKm || 0);
  if (prevFreeRadius !== nextFreeRadius) {
    lines.push(`Distance free radius: ${prevFreeRadius} km → ${nextFreeRadius} km`);
  }

  const prevMaxCharge = saved?.distancePricing?.maxCharge ? Number(saved.distancePricing.maxCharge) : null;
  const nextMaxCharge = next?.distancePricing?.maxCharge ? Number(next.distancePricing.maxCharge) : null;
  if (prevMaxCharge !== nextMaxCharge) {
    lines.push(`Distance max fee: ${prevMaxCharge !== null ? `Rs ${prevMaxCharge}` : "None"} → ${nextMaxCharge !== null ? `Rs ${nextMaxCharge}` : "None"}`);
  }

  const prevIntlEnabled = saved?.internationalDelivery?.enabled === true;
  const nextIntlEnabled = next?.internationalDelivery?.enabled === true;
  if (prevIntlEnabled !== nextIntlEnabled) {
    lines.push(`International delivery: ${prevIntlEnabled ? "Enabled" : "Disabled"} → ${nextIntlEnabled ? "Enabled" : "Disabled"}`);
  }

  const prevIntlDefaultFee = Number(saved?.internationalDelivery?.defaultFee ?? saved?.deliveryCharge ?? 0);
  const nextIntlDefaultFee = Number(next?.internationalDelivery?.defaultFee ?? next?.deliveryCharge ?? 0);
  if (prevIntlDefaultFee !== nextIntlDefaultFee) {
    lines.push(`International default fee: Rs ${prevIntlDefaultFee} → Rs ${nextIntlDefaultFee}`);
  }

  const prevCountryRates = JSON.stringify(saved?.internationalDelivery?.countryRates || []);
  const nextCountryRates = JSON.stringify(next?.internationalDelivery?.countryRates || []);
  if (prevCountryRates !== nextCountryRates) {
    lines.push("International country shipping rates changed");
  }

  const prevCurRates = saved?.currencyConversionRates || {};
  const nextCurRates = next?.currencyConversionRates || {};
  SUPPORTED_PRICING_CURRENCIES.forEach((code) => {
    if (code === "INR") return;
    const prevRate = Number(prevCurRates[code] || 0);
    const nextRate = Number(nextCurRates[code] || 0);
    if (prevRate !== nextRate) {
      lines.push(`Currency conversion rate ${code}: ${prevRate} → ${nextRate}`);
    }
  });

  const prevMarkets = JSON.stringify(normalizePricingMarketsInput(saved?.pricingMarkets || []));
  const nextMarkets = JSON.stringify(normalizePricingMarketsInput(next?.pricingMarkets || []));
  if (prevMarkets !== nextMarkets) {
    lines.push("Pricing markets changed");
  }

  const prevFallbackCurrency = String(saved?.internationalPricingDefaults?.currency || "USD").toUpperCase();
  const nextFallbackCurrency = String(next?.internationalPricingDefaults?.currency || "USD").toUpperCase();
  if (prevFallbackCurrency !== nextFallbackCurrency) {
    lines.push(`International fallback currency: ${prevFallbackCurrency} → ${nextFallbackCurrency}`);
  }

  if (JSON.stringify(saved?.warehouseLocation || {}) !== JSON.stringify(next?.warehouseLocation || {})) {
    lines.push("Warehouse location updated");
  }
  if (Boolean(saved?.enableCurrentLocation) !== Boolean(next?.enableCurrentLocation)) {
    lines.push(`Customer geolocation button: ${saved?.enableCurrentLocation ? "Enabled" : "Disabled"} → ${next?.enableCurrentLocation ? "Enabled" : "Disabled"}`);
  }
  if (Boolean(saved?.homeSectionVisibility?.festiveOffers) !== Boolean(next?.homeSectionVisibility?.festiveOffers)) {
    lines.push(`Homepage festive offers: ${saved?.homeSectionVisibility?.festiveOffers ? "Show" : "Hide"} → ${next?.homeSectionVisibility?.festiveOffers ? "Show" : "Hide"}`);
  }
  if (Boolean(saved?.collectionFilterVisibility?.festiveOffers) !== Boolean(next?.collectionFilterVisibility?.festiveOffers)) {
    lines.push(`Collection festive filter: ${saved?.collectionFilterVisibility?.festiveOffers ? "Show" : "Hide"} → ${next?.collectionFilterVisibility?.festiveOffers ? "Show" : "Hide"}`);
  }

  if (next?.whatsappSettings?.clearAccessToken) {
    lines.push("WhatsApp access token removed");
  } else if (next?.whatsappSettings?.newAccessToken) {
    lines.push("WhatsApp access token replaced");
  }
  if (saved?.whatsappSettings?.mode !== next?.whatsappSettings?.mode) {
    lines.push(`WhatsApp mode: ${saved?.whatsappSettings?.mode || "free"} → ${next?.whatsappSettings?.mode || "free"}`);
  }
  if (saved?.whatsappSettings?.metaPhoneNumberId !== next?.whatsappSettings?.metaPhoneNumberId) {
    lines.push("WhatsApp Phone Number ID updated");
  }
  if (saved?.whatsappSettings?.metaWabaId !== next?.whatsappSettings?.metaWabaId) {
    lines.push("WhatsApp WABA ID updated");
  }
  if (saved?.whatsappSettings?.phoneNumber !== next?.whatsappSettings?.phoneNumber) {
    lines.push("WhatsApp support phone number updated");
  }
  if (saved?.whatsappSettings?.welcomeMessage !== next?.whatsappSettings?.welcomeMessage) {
    lines.push("WhatsApp welcome message updated");
  }
  if (saved?.whatsappSettings?.autoSendOrderConfirmation !== next?.whatsappSettings?.autoSendOrderConfirmation) {
    lines.push(`WhatsApp order receipts: ${next?.whatsappSettings?.autoSendOrderConfirmation !== false ? "Enabled" : "Disabled"}`);
  }
  if (saved?.whatsappSettings?.enableOtpVerification !== next?.whatsappSettings?.enableOtpVerification) {
    lines.push(`WhatsApp OTP verification: ${next?.whatsappSettings?.enableOtpVerification !== false ? "Enabled" : "Disabled"}`);
  }

  return lines;
}

function AdminDashboard() {
  const { confirm } = useDialog();
  const { token, user } = useAuth();
  const isSuperAdmin = Number(user?.adminLevel) === 1;
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [orderLoadError, setOrderLoadError] = useState("");
  const [dismissedNotifications, setDismissedNotifications] = useState([]);
  const [unmatchedPaymentsCount, setUnmatchedPaymentsCount] = useState(0);
  const [pendingAccessCount, setPendingAccessCount] = useState(0);
  const adminLevel = Number(user?.adminLevel || 1);
  const allowedPages = Array.isArray(user?.allowedPages) ? user.allowedPages : ["dashboard"];
  const canAccessOrders = Boolean(user?.isAdmin) && (adminLevel === 1 || allowedPages.includes("orders"));
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const [isPricingUnlocked, setIsPricingUnlocked] = useState(false);
  const [savedPricingSettings, setSavedPricingSettings] = useState(null);
  const [pricingSettings, setPricingSettings] = useState(() => formatPricingSettingsFromData({}));
  const [isSavingPricing, setIsSavingPricing] = useState(false);
  const [isGettingWarehouseLocation, setIsGettingWarehouseLocation] = useState(false);
  const [pricingMessage, setPricingMessage] = useState("");
  useEffect(() => {
    let active = true;

    const loadDashboard = async (silent = false) => {
      if (!silent && active) {
        setIsRefreshing(true);
      }

      try {
        const [productRes, orderRes] = await Promise.all([
          axios.get("/api/products", { params: { includeHidden: 1 } }),
          axios.get("/api/orders?limit=all", {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);
        if (!active) return;
        setProducts(productRes.data);
        const data = orderRes.data || {};
        const ordersArray = Array.isArray(data) ? data : (Array.isArray(data.orders) ? data.orders : []);
        setOrders(ordersArray);
        setOrderLoadError("");
        setLastUpdatedAt(new Date());
      } catch {
        if (!active) return;
        setProducts([]);
        setOrders([]);
        setOrderLoadError("Could not load orders. Top selling products may be unavailable.");
      } finally {
        if (active) {
          setIsInitialLoading(false);
        }
        if (!silent && active) {
          setIsRefreshing(false);
        }
      }

      if (canAccessOrders && token) {
        try {
          const orphanRes = await axios.get("/api/admin/payments/orphans?status=orphan", {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!active) return;
          const data = orphanRes.data;
          const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
          const count = typeof data?.count === "number" ? data.count : items.length;
          setUnmatchedPaymentsCount(count);
        } catch {
          if (!active) return;
          setUnmatchedPaymentsCount(0);
        }

        try {
          const accessRes = await axios.get("/api/orders/admin/access-pending", {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!active) return;
          const data = accessRes.data;
          const count = typeof data?.count === "number" ? data.count : (Array.isArray(data?.orders) ? data.orders.length : 0);
          setPendingAccessCount(count);
        } catch {
          if (!active) return;
          setPendingAccessCount(0);
        }
      }
    };

    loadDashboard();
    const pollId = setInterval(() => {
      loadDashboard(true);
    }, 15000);

    return () => {
      active = false;
      clearInterval(pollId);
    };
  }, [token, canAccessOrders]);

  useEffect(() => {
    let active = true;
    axios
      .get("/api/settings", {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then((res) => {
        if (!active) return;
        storePricingConfig({
          pricingMarkets: res.data?.pricingMarkets || [],
          internationalPricingDefaults: res.data?.internationalPricingDefaults || {},
          currencyConversionRates: res.data?.currencyConversionRates || {}
        });
        const formatted = formatPricingSettingsFromData(res.data);
        setPricingSettings(formatted);
        setSavedPricingSettings(formatted);
      })
      .catch(() => {
        if (!active) return;
        const fallback = formatPricingSettingsFromData({});
        setPricingSettings(fallback);
        setSavedPricingSettings(fallback);
      });

    return () => {
      active = false;
    };
  }, [token]);

  const handleCancelPricingEdit = () => {
    if (savedPricingSettings) {
      setPricingSettings(JSON.parse(JSON.stringify(savedPricingSettings)));
    }
    setIsPricingUnlocked(false);
    setPricingMessage("");
  };

  const currentGstin = normalizeGstin(pricingSettings.businessDetails?.gstin);
  const currentSelectedState = String(pricingSettings.businessDetails?.state || "").trim();
  const currentSelectedStateCode = String(pricingSettings.businessDetails?.stateCode || "").trim();

  let gstinError = "";
  let gstinWarning = "";
  if (currentGstin) {
    if (!isValidGstinFormat(currentGstin)) {
      gstinError = "Enter a valid 15-character GSTIN (e.g. 29AAAAA0000A1Z5).";
    } else if (currentSelectedStateCode && currentGstin.slice(0, 2) !== currentSelectedStateCode) {
      gstinError = `GSTIN state code (${currentGstin.slice(0, 2)}) does not match the selected state (${currentSelectedState || "selected"}).`;
    } else if (!isValidGstinChecksum(currentGstin)) {
      gstinWarning = "The check digit does not match. Please re-check the number against your GST certificate.";
    }
  }

  const savePricingSettings = async () => {
    setPricingMessage("");
    if (gstinError) {
      setPricingMessage("Please fix the GSTIN validation errors before saving.");
      return;
    }
    const lines = getPricingChangesList(savedPricingSettings, pricingSettings);
    if (lines.length === 0) {
      setPricingMessage("No changes to save.");
      return;
    }

    const confirmed = await confirm({
      title: "Apply new pricing settings?",
      message: `These changes apply to all new orders immediately:\n\n${lines.join("\n")}`,
      tone: "danger",
      confirmText: "Save changes"
    });
    if (!confirmed) {
      return;
    }

    setIsSavingPricing(true);
    try {
      const payload = {
        businessDetails: {
          legalName: String(pricingSettings.businessDetails?.legalName || "").trim(),
          gstin: normalizeGstin(pricingSettings.businessDetails?.gstin),
          address: String(pricingSettings.businessDetails?.address || "").trim(),
          state: String(pricingSettings.businessDetails?.state || "").trim(),
          stateCode: String(pricingSettings.businessDetails?.stateCode || "").trim(),
          email: String(pricingSettings.businessDetails?.email || "").trim()
        },
        enableCurrentLocation: pricingSettings.enableCurrentLocation,
        gstPercent: Math.max(0, Number(pricingSettings.gstPercent || 0)),
        deliveryCharge: Math.max(0, Number(pricingSettings.deliveryCharge || 0)),
        warehouseLocation: normalizeWarehouseLocation(pricingSettings.warehouseLocation),
        distancePricing: normalizeDistancePricing(pricingSettings.distancePricing, pricingSettings.deliveryCharge),
        internationalDelivery: normalizeInternationalDelivery(
          pricingSettings.internationalDelivery,
          pricingSettings.deliveryCharge
        ),
        pricingMarkets: pricingSettings.pricingMarkets
          .map((market) => ({
            name: String(market?.name || "").trim(),
            currency: String(market?.currency || "USD").trim().toUpperCase(),
            countries: Array.isArray(market?.countries)
              ? market.countries.map((country) => String(country || "").trim()).filter(Boolean)
              : []
          }))
          .filter((market) => market.name),
        internationalPricingDefaults: {
          currency: String(pricingSettings.internationalPricingDefaults?.currency || "USD").trim().toUpperCase()
        },
        currencyConversionRates: Object.fromEntries(
          Object.entries(pricingSettings.currencyConversionRates || {}).map(([currencyCode, value]) => [
            currencyCode,
            Number(value || 0)
          ])
        ),
        homeSectionVisibility: {
          festiveOffers: pricingSettings.homeSectionVisibility.festiveOffers
        },
        collectionFilterVisibility: {
          festiveOffers: pricingSettings.collectionFilterVisibility.festiveOffers
        },
        whatsappSettings: {
          mode: pricingSettings.whatsappSettings?.mode || "free",
          phoneNumber: pricingSettings.whatsappSettings?.phoneNumber || "",
          welcomeMessage: pricingSettings.whatsappSettings?.welcomeMessage || "",
          ...(isSuperAdmin ? {
            metaPhoneNumberId: pricingSettings.whatsappSettings?.metaPhoneNumberId || "",
            metaWabaId: pricingSettings.whatsappSettings?.metaWabaId || "",
            ...(pricingSettings.whatsappSettings?.newAccessToken
              ? { metaAccessToken: pricingSettings.whatsappSettings.newAccessToken }
              : {}),
            ...(pricingSettings.whatsappSettings?.clearAccessToken
              ? { clearAccessToken: true }
              : {})
          } : {}),
          autoSendOrderConfirmation: pricingSettings.whatsappSettings?.autoSendOrderConfirmation !== false,
          enableOtpVerification: pricingSettings.whatsappSettings?.enableOtpVerification !== false
        }
      };

      const res = await axios.put("/api/settings", payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const formatted = formatPricingSettingsFromData(res.data);
      setPricingSettings(formatted);
      setSavedPricingSettings(formatted);
      setIsPricingUnlocked(false);

      storePricingConfig({
        pricingMarkets: res.data?.pricingMarkets || [],
        internationalPricingDefaults: res.data?.internationalPricingDefaults || {},
        currencyConversionRates: res.data?.currencyConversionRates || {}
      });
      setPricingMessage("Pricing settings updated.");
      window.dispatchEvent(new CustomEvent("siteSettingsUpdated"));
    } catch (err) {
      setPricingMessage(err?.response?.data?.message || "Could not save pricing settings.");
    } finally {
      setIsSavingPricing(false);
    }
  };

  const updateBusinessDetailsField = (field, value) => {
    setPricingSettings((prev) => {
      const nextDetails = { ...(prev.businessDetails || {}), [field]: value };
      if (field === "gstin") {
        nextDetails.gstin = String(value || "").toUpperCase();
      }
      if (field === "state") {
        nextDetails.stateCode = codeByStateName(value) || "";
      }
      return { ...prev, businessDetails: nextDetails };
    });
  };

  const updateWarehouseField = (field, value) => {
    setPricingSettings((prev) => ({
      ...prev,
      warehouseLocation: { ...prev.warehouseLocation, [field]: value }
    }));
  };

  const updateDistancePricingField = (field, value) => {
    setPricingSettings((prev) => ({
      ...prev,
      distancePricing: { ...prev.distancePricing, [field]: value }
    }));
  };

  const updateInternationalDeliveryField = (field, value) => {
    setPricingSettings((prev) => ({
      ...prev,
      internationalDelivery: { ...prev.internationalDelivery, [field]: value }
    }));
  };

  const updateVisibilityField = (section, field, value) => {
    setPricingSettings((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const updateInternationalCountryRate = (index, field, value) => {
    setPricingSettings((prev) => ({
      ...prev,
      internationalDelivery: {
        ...prev.internationalDelivery,
        countryRates: prev.internationalDelivery.countryRates.map((item, itemIndex) =>
          itemIndex === index ? { ...item, [field]: value } : item
        )
      }
    }));
  };

  const addInternationalCountryRate = () => {
    setPricingSettings((prev) => ({
      ...prev,
      internationalDelivery: {
        ...prev.internationalDelivery,
        countryRates: [...prev.internationalDelivery.countryRates, { country: "", fee: "0" }]
      }
    }));
  };

  const removeInternationalCountryRate = (index) => {
    setPricingSettings((prev) => ({
      ...prev,
      internationalDelivery: {
        ...prev.internationalDelivery,
        countryRates: prev.internationalDelivery.countryRates.filter((_, itemIndex) => itemIndex !== index)
      }
    }));
  };

  const updatePricingMarketField = (index, field, value) => {
    setPricingSettings((prev) => ({
      ...prev,
      pricingMarkets: prev.pricingMarkets.map((market, marketIndex) =>
        marketIndex === index ? { ...market, [field]: value } : market
      )
    }));
  };

  const updatePricingMarketCountries = (index, selectedOptions) => {
    const countries = Array.from(selectedOptions || []).map((option) => option.value);
    updatePricingMarketField(index, "countries", countries);
  };

  const addPricingMarket = () => {
    setPricingSettings((prev) => ({
      ...prev,
      pricingMarkets: [...prev.pricingMarkets, { name: "", currency: "USD", countries: [] }]
    }));
  };

  const removePricingMarket = (index) => {
    setPricingSettings((prev) => ({
      ...prev,
      pricingMarkets: prev.pricingMarkets.filter((_, marketIndex) => marketIndex !== index)
    }));
  };

  const updateInternationalPricingDefaultField = (field, value) => {
    setPricingSettings((prev) => ({
      ...prev,
      internationalPricingDefaults: {
        ...prev.internationalPricingDefaults,
        [field]: value
      }
    }));
  };

  const updateCurrencyConversionRate = (currencyCode, value) => {
    setPricingSettings((prev) => ({
      ...prev,
      currencyConversionRates: {
        ...prev.currencyConversionRates,
        [currencyCode]: value
      }
    }));
  };

  const applyGoogleMapsLocation = () => {
    const parsed = parseGoogleMapsCoordinates(pricingSettings.warehouseLocation.mapUrl);

    if (!parsed) {
      setPricingMessage("Could not read coordinates from the Google Maps link.");
      return;
    }

    setPricingSettings((prev) => ({
      ...prev,
      warehouseLocation: {
        ...prev.warehouseLocation,
        latitude: String(parsed.latitude),
        longitude: String(parsed.longitude)
      }
    }));
    setPricingMessage("Warehouse coordinates extracted from Google Maps link.");
  };

  const useCurrentWarehouseLocation = () => {
    if (!navigator.geolocation) {
      setPricingMessage("Geolocation is not supported on this device.");
      return;
    }

    setIsGettingWarehouseLocation(true);
    setPricingMessage("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPricingSettings((prev) => ({
          ...prev,
          warehouseLocation: {
            ...prev.warehouseLocation,
            latitude: String(position?.coords?.latitude ?? ""),
            longitude: String(position?.coords?.longitude ?? "")
          }
        }));
        setPricingMessage("Warehouse coordinates updated from current location.");
        setIsGettingWarehouseLocation(false);
      },
      () => {
        setPricingMessage("Could not get the current location for the warehouse.");
        setIsGettingWarehouseLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };



  const topProducts = useMemo(() => {
    const salesByName = orders.reduce((acc, order) => {
      (order.items || []).forEach((item) => {
        const itemName = String(item?.name || item?.product?.name || item?.title || "").trim();
        if (!itemName) return;
        acc[itemName] = (acc[itemName] || 0) + Number(item?.quantity || 1);
      });
      return acc;
    }, {});

    return Object.entries(salesByName)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [orders]);

  const topSellingProducts = useMemo(() => {
    const salesByProduct = orders.reduce((acc, order) => {
      (order.items || []).forEach((item) => {
        const itemName = String(item?.name || item?.product?.name || item?.title || "").trim();
        if (!itemName) return;

        if (!acc[itemName]) {
          acc[itemName] = { name: itemName, quantity: 0, sales: 0 };
        }

        const quantity = Number(item?.quantity || 1);
        acc[itemName].quantity += quantity;
        acc[itemName].sales += Number(item?.price || 0) * quantity;
      });

      return acc;
    }, {});

    return Object.values(salesByProduct)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);
  }, [orders]);

  const analytics = useMemo(() => {
    const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const totalQuantity = orders.reduce((sum, order) => {
      return sum + (order.items || []).reduce((itemSum, item) => itemSum + Number(item.quantity || 1), 0);
    }, 0);
    const averageOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;
    const statuses = orders.reduce(
      (acc, order) => {
        acc[normalizeStatus(order?.status)] += 1;
        return acc;
      },
      { Pending: 0, Shipped: 0, Delivered: 0 }
    );
    const customers = orders.reduce((acc, order) => {
      const key = String(order?.user?._id || order?.user?.email || order?.shipping?.phone || "").trim();
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const uniqueCustomers = Object.keys(customers).length;
    const repeatCustomers = Object.values(customers).filter((count) => count > 1).length;

    return {
      totalRevenue,
      totalQuantity,
      averageOrderValue,
      statuses,
      uniqueCustomers,
      repeatCustomers,
      repeatRate: uniqueCustomers > 0 ? (repeatCustomers / uniqueCustomers) * 100 : 0
    };
  }, [orders]);

  const revenueKpis = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const last7d = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const last30d = now.getTime() - 30 * 24 * 60 * 60 * 1000;

    return orders.reduce(
      (acc, order) => {
        const orderTs = new Date(order?.createdAt).getTime();
        const total = Number(order?.total || 0);
        if (Number.isNaN(orderTs)) return acc;

        if (orderTs >= startOfToday) acc.today += total;
        if (orderTs >= last7d) acc.last7Days += total;
        if (orderTs >= last30d) acc.last30Days += total;
        acc.total += total;
        return acc;
      },
      { today: 0, last7Days: 0, last30Days: 0, total: 0 }
    );
  }, [orders]);

  const lowStockProducts = useMemo(() => {
    return products
      .filter((product) => Number(product?.stock ?? 0) <= LOW_STOCK_THRESHOLD)
      .sort((a, b) => Number(a?.stock ?? 0) - Number(b?.stock ?? 0))
      .slice(0, 6);
  }, [products]);

  const aiPredictions = useMemo(() => {
    const monthlyRevenueMap = orders.reduce((acc, order) => {
      const date = new Date(order?.createdAt);
      if (Number.isNaN(date.getTime())) return acc;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      acc[key] = (acc[key] || 0) + Number(order?.total || 0);
      return acc;
    }, {});

    const monthlyPoints = Object.entries(monthlyRevenueMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([, value], index) => ({ x: index, y: Number(value || 0) }));

    if (monthlyPoints.length < 2) {
      const fallback = monthlyPoints[monthlyPoints.length - 1]?.y || 0;
      return {
        nextMonthRevenue: fallback,
        confidence: 42,
        trend: "Insufficient data",
        monthlyPoints: monthlyPoints.map((point) => point.y)
      };
    }

    const n = monthlyPoints.length;
    const sumX = monthlyPoints.reduce((sum, point) => sum + point.x, 0);
    const sumY = monthlyPoints.reduce((sum, point) => sum + point.y, 0);
    const sumXY = monthlyPoints.reduce((sum, point) => sum + point.x * point.y, 0);
    const sumX2 = monthlyPoints.reduce((sum, point) => sum + point.x * point.x, 0);
    const denominator = n * sumX2 - sumX * sumX;
    const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;
    const nextX = n;
    const predicted = Math.max(0, intercept + slope * nextX);

    const avgAbsDelta =
      monthlyPoints.slice(1).reduce((sum, point, idx) => {
        return sum + Math.abs(point.y - monthlyPoints[idx].y);
      }, 0) /
      Math.max(1, monthlyPoints.length - 1);
    const volatility = sumY > 0 ? Math.min(1, avgAbsDelta / (sumY / n || 1)) : 1;
    const confidence = Math.max(35, Math.round((1 - volatility) * 100));

    return {
      nextMonthRevenue: predicted,
      confidence,
      trend: slope > 0 ? "Upward trend" : slope < 0 ? "Downward trend" : "Stable trend",
      monthlyPoints: monthlyPoints.map((point) => point.y)
    };
  }, [orders]);

  const weeklyStats = useMemo(() => {
    const weeklyStatsMap = orders.reduce((acc, order) => {
      const date = new Date(order.createdAt);
      if (Number.isNaN(date.getTime())) return acc;

      const day = date.getDay();
      const diff = date.getDate() - day;
      const sunday = new Date(date);
      sunday.setDate(diff);
      sunday.setHours(0, 0, 0, 0);

      const key = sunday.toISOString().split("T")[0];
      const weekLabel = sunday.toLocaleDateString("en-US", { month: "short", day: "numeric" });

      if (!acc[key]) {
        acc[key] = {
          weekStart: key,
          label: `Week of ${weekLabel}`,
          revenue: 0,
          ordersCount: 0,
          purchasingUsers: new Set()
        };
      }

      acc[key].revenue += Number(order.total || 0);
      acc[key].ordersCount += 1;

      const userKey = order.user?._id || order.user?.email || order.shipping?.phone || order.shipping?.name || "Guest";
      acc[key].purchasingUsers.add(String(userKey));

      return acc;
    }, {});

    return Object.values(weeklyStatsMap)
      .map((w) => ({
        ...w,
        uniqueUsersCount: w.purchasingUsers.size
      }))
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
      .slice(0, 8);
  }, [orders]);

  const advancedAnalytics = useMemo(() => {
    const now = new Date();
    const last30Start = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    const prev30Start = now.getTime() - 60 * 24 * 60 * 60 * 1000;

    const last30 = orders.filter((order) => new Date(order?.createdAt).getTime() >= last30Start);
    const prev30 = orders.filter((order) => {
      const ts = new Date(order?.createdAt).getTime();
      return ts >= prev30Start && ts < last30Start;
    });

    const last30Revenue = last30.reduce((sum, order) => sum + Number(order?.total || 0), 0);
    const prev30Revenue = prev30.reduce((sum, order) => sum + Number(order?.total || 0), 0);
    const revenueGrowth =
      prev30Revenue > 0 ? ((last30Revenue - prev30Revenue) / prev30Revenue) * 100 : last30Revenue > 0 ? 100 : 0;

    const statusCounts = orders.reduce(
      (acc, order) => {
        const status = normalizeStatus(order?.status);
        acc[status] += 1;
        return acc;
      },
      { Pending: 0, Shipped: 0, Delivered: 0 }
    );

    const weekdayRevenue = orders.reduce((acc, order) => {
      const date = new Date(order?.createdAt);
      if (Number.isNaN(date.getTime())) return acc;
      const day = date.toLocaleDateString("en-IN", { weekday: "short" });
      acc[day] = (acc[day] || 0) + Number(order?.total || 0);
      return acc;
    }, {});
    const weekdaySeries = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => ({
      day,
      value: weekdayRevenue[day] || 0
    }));

    const customerSpendMap = orders.reduce((acc, order) => {
      const name = String(order?.user?.name || order?.shipping?.name || "Customer").trim();
      acc[name] = (acc[name] || 0) + Number(order?.total || 0);
      return acc;
    }, {});
    const topCustomerEntry = Object.entries(customerSpendMap).sort((a, b) => b[1] - a[1])[0];

    return {
      last30Revenue,
      prev30Revenue,
      revenueGrowth,
      statusCounts,
      weekdaySeries,
      topCustomer: topCustomerEntry ? { name: topCustomerEntry[0], spend: topCustomerEntry[1] } : null
    };
  }, [orders]);

  const exportSalesReport = () => {
    const itemQuantity = orders.reduce(
      (sum, order) => sum + (order?.items || []).reduce((itemSum, item) => itemSum + Number(item?.quantity || 1), 0),
      0
    );

    const summaryRows = [
      ["Report Name", "Sales Report"],
      ["Generated At", new Date().toISOString()],
      ["Total Orders", orders.length],
      ["Total Revenue INR", Math.round(Number(revenueKpis.total || 0))],
      ["Revenue Today INR", Math.round(Number(revenueKpis.today || 0))],
      ["Revenue Last 7 Days INR", Math.round(Number(revenueKpis.last7Days || 0))],
      ["Revenue Last 30 Days INR", Math.round(Number(revenueKpis.last30Days || 0))],
      ["Average Order Value INR", Math.round(Number(analytics.averageOrderValue || 0))],
      ["Total Units Sold", itemQuantity],
      ["Delivered Orders", analytics.statuses.Delivered],
      ["Pending Orders", analytics.statuses.Pending],
      ["Cancelled Orders", analytics.statuses.Cancelled],
      ["Repeat Customer Rate", formatPercent(analytics.repeatRate)]
    ];

    const detailHeaders = [
      "Order ID",
      "Order Date",
      "Customer Name",
      "Customer Email",
      "Items Count",
      "Units Sold",
      "Subtotal INR",
      "GST INR",
      "Delivery INR",
      "Discount INR",
      "Total INR",
      "Display Currency",
      "Display Amount",
      "Order Status",
      "Payment Status",
      "Refund Status"
    ];

    const detailRows = orders.map((order) => {
      const itemsCount = Array.isArray(order?.items) ? order.items.length : 0;
      const unitsSold = (order?.items || []).reduce((sum, item) => sum + Number(item?.quantity || 1), 0);

      return [
        order?._id || "",
        order?.createdAt ? new Date(order.createdAt).toISOString() : "",
        order?.user?.name || order?.shipping?.name || "Unknown",
        order?.user?.email || "",
        itemsCount,
        unitsSold,
        Math.round(Number(order?.subtotal || 0)),
        Math.round(Number(order?.gstAmount || 0)),
        Math.round(Number(order?.deliveryCharge || 0)),
        Math.round(Number(order?.discount || 0)),
        Math.round(Number(order?.total || 0)),
        order?.currencyDisplay?.currency || "INR",
        order?.currencyDisplay?.amount ?? "",
        normalizeStatus(order?.status),
        order?.paymentStatus || "Pending",
        order?.refundStatus || "Not Applicable"
      ];
    });

    const productHeaders = ["Product", "Units Sold", "Estimated Revenue INR"];
    const productRows = topSellingProducts.map((item) => [
      item?.name || "",
      Number(item?.quantity || 0),
      Math.round(Number(item?.sales || 0))
    ]);

    const csvSections = [
      ["Sales Report Summary"],
      ...summaryRows,
      [],
      ["Order Details"],
      detailHeaders,
      ...detailRows,
      [],
      ["Top Selling Products"],
      productHeaders,
      ...productRows
    ];

    const csv = csvSections
      .map((row) => row.map((cell) => createCsvCell(cell)).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sales-report-${formatDateForFileName(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const notifications = useMemo(() => {
    const list = [];
    let returnRequestsCount = 0;
    let returnsReceivedCount = 0;
    let returnsOverdueCount = 0;
    const nowMs = Date.now();

    orders.forEach((o) => {
      if (o?.refundStatus === "Refunded") return;
      if (Array.isArray(o?.items)) {
        o.items.forEach((item) => {
          const s = item?.returnRequest?.status;
          if (s === "Requested") {
            returnRequestsCount++;
          } else if (s === "Received") {
            returnsReceivedCount++;
          } else if (s === "Approved" && item?.returnRequest?.approvedAt) {
            const ms = nowMs - new Date(item.returnRequest.approvedAt).getTime();
            if (ms > 14 * 24 * 60 * 60 * 1000) {
              returnsOverdueCount++;
            }
          }
        });
      }
    });

    if (returnRequestsCount > 0) {
      list.push({
        id: "return-requests",
        type: "alert",
        text: `${returnRequestsCount} return request(s) waiting for review.`,
        link: "/admin/orders?tab=returns"
      });
    }

    if (returnsReceivedCount > 0) {
      list.push({
        id: "returns-received",
        type: "alert",
        text: `${returnsReceivedCount} returned item(s) received, awaiting refund.`,
        link: "/admin/orders?tab=returns"
      });
    }

    if (returnsOverdueCount > 0) {
      list.push({
        id: "returns-overdue",
        type: "alert",
        text: `${returnsOverdueCount} approved return(s) not received after 14 days.`,
        link: "/admin/orders?tab=returns"
      });
    }

    const cancelRefunds = orders.filter(
      (o) => o?.status === "Cancelled" && o?.refundStatus === "Pending"
    ).length;
    if (cancelRefunds > 0) {
      list.push({
        id: "cancel-refunds",
        type: "alert",
        text: `${cancelRefunds} cancelled order(s) awaiting refund.`,
        link: "/admin/orders?tab=cancelled"
      });
    }

    const refundProcessing = orders.filter((o) => o?.refundStatus === "Processing").length;
    if (refundProcessing > 0) {
      list.push({
        id: "refund-processing",
        type: "warning",
        text: `${refundProcessing} refund(s) in progress.`,
        link: "/admin/orders"
      });
    }
    if (unmatchedPaymentsCount > 0) {
      list.push({
        id: "unmatched-payments",
        type: "alert",
        text: `${unmatchedPaymentsCount} payment(s) received without an order.`,
        link: "/admin/unmatched-payments"
      });
    }
    if (pendingAccessCount > 0) {
      list.push({
        id: "access-pending",
        type: "alert",
        text: `${pendingAccessCount} order(s) waiting for access to be granted.`,
        link: "/admin/orders?tab=access-pending"
      });
    }
    if (analytics.statuses.Pending >= 5) {
      list.push({
        id: "pending",
        type: "warning",
        text: `${analytics.statuses.Pending} orders are still pending shipment.`
      });
    }
    if (lowStockProducts.length > 0) {
      list.push({
        id: "low-stock",
        type: "alert",
        text: `${lowStockProducts.length} products are low on stock.`
      });
    }
    if (analytics.repeatRate >= 30) {
      list.push({
        id: "repeat-customers",
        type: "success",
        text: `Repeat customer rate is ${Math.round(analytics.repeatRate)}%.`
      });
    }
    return list.filter((item) => NON_DISMISSIBLE_NOTIFICATION_IDS.includes(item.id) || !dismissedNotifications.includes(item.id));
  }, [
    orders,
    unmatchedPaymentsCount,
    pendingAccessCount,
    analytics.statuses.Pending,
    analytics.repeatRate,
    dismissedNotifications,
    lowStockProducts.length
  ]);

  return (
    <div className="admin-layout">
      <AdminSidebar />

      <main className="admin-main">
        <div className="admin-header">
          <div className="admin-header-left">
            <div className="admin-header-title-row">
              <BarChart3 size={22} className="admin-header-icon" />
              <h1>Admin Dashboard</h1>
            </div>
            <p className="admin-header-subtitle">
              {isRefreshing
                ? <><RefreshCw size={12} className="admin-spin" /> Refreshing live data...</>
                : <><Clock size={12} /> Live updates every 15s{lastUpdatedAt ? ` · Updated ${formatTime(lastUpdatedAt)}` : ""}</>
              }
            </p>
          </div>
          <div className="admin-header-actions">
            <button type="button" className="admin-header-link-btn" onClick={exportSalesReport}>
              <Download size={14} /> Export Report
            </button>
            <Link className="admin-header-link-btn" to="/admin/theme">
              <Settings2 size={14} /> Theme Settings
            </Link>
          </div>
        </div>

        <section className="card pricing-controls-card">
          <button
            type="button"
            className="pricing-controls-toggle"
            onClick={() => {
              setIsPricingOpen((prev) => {
                const next = !prev;
                if (!next) {
                  setIsPricingUnlocked(false);
                }
                return next;
              });
            }}
            aria-expanded={isPricingOpen}
          >
            <div className="pricing-controls-toggle-left">
              <h3>Tax &amp; Delivery Controls</h3>
              <p>Configure pricing rules applied automatically at checkout.</p>
            </div>
            <div className="pricing-controls-toggle-right">
              <div className="pricing-preview-chips-inline">
                <span className="pricing-preview-chip">
                  <span>GST</span>
                  <strong>{Number(pricingSettings.gstPercent || 0)}%</strong>
                </span>
                <span className="pricing-preview-chip">
                  <span>Delivery</span>
                  <strong>{formatCurrency(Number(pricingSettings.deliveryCharge || 0))}</strong>
                </span>
              </div>
              <span className="pricing-badge">Live Pricing</span>
              {isPricingOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
          </button>

          {isPricingOpen && (<>
          <div className="pricing-lock-toolbar">
            <div className="pricing-lock-status-group">
              <span className={`pricing-lock-pill ${isPricingUnlocked ? "pricing-lock-pill--unlocked" : "pricing-lock-pill--locked"}`}>
                {isPricingUnlocked ? "🔓 Editing" : "🔒 Locked"}
              </span>
              {!isSuperAdmin && (
                <span className="pricing-lock-notice">Only super admins can change these settings.</span>
              )}
            </div>
            <div className="pricing-lock-actions">
              {isSuperAdmin && !isPricingUnlocked && (
                <button
                  type="button"
                  className="pricing-unlock-btn"
                  onClick={() => {
                    setIsPricingUnlocked(true);
                    setPricingMessage("");
                  }}
                >
                  Unlock to edit
                </button>
              )}
              {isSuperAdmin && isPricingUnlocked && (
                <>
                  <button
                    type="button"
                    className="pricing-cancel-btn"
                    onClick={handleCancelPricingEdit}
                    disabled={isSavingPricing}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="pricing-save-btn pricing-save-btn--sm"
                    onClick={savePricingSettings}
                    disabled={isSavingPricing}
                  >
                    {isSavingPricing ? "Saving..." : "Save All Settings"}
                  </button>
                </>
              )}
            </div>
          </div>

          <fieldset disabled={!isPricingUnlocked} className="pricing-fieldset">

          {/* Section: Business & GST Details */}
          <div className="pricing-panel">
            <div className="pricing-panel-header">
              <Building2 size={16} className="pricing-panel-icon pricing-panel-icon--blue" />
              <div>
                <h4>Business &amp; GST details</h4>
                <p>Printed on every new invoice. Leave GSTIN blank if you are not GST registered.</p>
              </div>
            </div>
            <div className="pricing-panel-grid pricing-panel-grid--3">
              <label className="pricing-field">
                <span className="pricing-label">Legal / Trade Name</span>
                <input
                  type="text"
                  className="pricing-text-input"
                  placeholder="e.g. Vyoma Linguistic Labs Foundation"
                  maxLength={150}
                  value={pricingSettings.businessDetails?.legalName || ""}
                  onChange={(e) => updateBusinessDetailsField("legalName", e.target.value)}
                />
              </label>

              <label className="pricing-field">
                <span className="pricing-label">GSTIN</span>
                <input
                  type="text"
                  className="pricing-text-input pricing-input--monospace"
                  placeholder="15-character GSTIN from your GST certificate"
                  maxLength={15}
                  value={pricingSettings.businessDetails?.gstin || ""}
                  onChange={(e) => updateBusinessDetailsField("gstin", e.target.value)}
                />
                {gstinError && <span className="gstin-validation-error">{gstinError}</span>}
                {!gstinError && gstinWarning && (
                  <span className="gstin-validation-warning">{gstinWarning}</span>
                )}
              </label>

              <label className="pricing-field">
                <div className="pricing-label-with-badge">
                  <span className="pricing-label">Business State</span>
                  <span className="gstin-state-code-badge">
                    State code: {pricingSettings.businessDetails?.stateCode || "--"}
                  </span>
                </div>
                <select
                  className="pricing-select-input"
                  value={pricingSettings.businessDetails?.state || ""}
                  onChange={(e) => updateBusinessDetailsField("state", e.target.value)}
                >
                  <option value="">-- Select state --</option>
                  {GST_STATE_CODES.map((st) => (
                    <option key={st.code} value={st.name}>
                      {st.code} - {st.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="pricing-panel-grid" style={{ marginTop: "12px" }}>
              <label className="pricing-field pricing-field-wide">
                <span className="pricing-label">Registered Address</span>
                <textarea
                  className="pricing-textarea-input"
                  rows={2}
                  maxLength={300}
                  placeholder="Registered business address printed on invoices"
                  value={pricingSettings.businessDetails?.address || ""}
                  onChange={(e) => updateBusinessDetailsField("address", e.target.value)}
                />
              </label>

              <label className="pricing-field">
                <span className="pricing-label">Business Email</span>
                <input
                  type="email"
                  className="pricing-text-input"
                  placeholder="e.g. support@vyomalabs.in"
                  maxLength={150}
                  value={pricingSettings.businessDetails?.email || ""}
                  onChange={(e) => updateBusinessDetailsField("email", e.target.value)}
                />
              </label>
            </div>
          </div>

          {/* Section 1: Core Tax & Delivery */}
          <div className="pricing-panel">
            <div className="pricing-panel-header">
              <IndianRupee size={16} className="pricing-panel-icon pricing-panel-icon--amber" />
              <div>
                <h4>Tax &amp; Base Delivery</h4>
                <p>Core charges applied to every order at checkout.</p>
              </div>
            </div>
            <div className="pricing-panel-grid">
              <label className="pricing-field">
                <span className="pricing-label">GST Rate</span>
                <span className="pricing-hint">Tax percentage applied on subtotal</span>
                <div className="pricing-input-wrap">
                  <input type="number" min="0" max="50" step="0.1" value={pricingSettings.gstPercent}
                    onChange={(e) => setPricingSettings((prev) => ({ ...prev, gstPercent: e.target.value }))} />
                  <em>%</em>
                </div>
              </label>
              <label className="pricing-field">
                <span className="pricing-label">Fallback Delivery Fee</span>
                <span className="pricing-hint">Used when coordinates are unavailable</span>
                <div className="pricing-input-wrap">
                  <input type="number" min="0" step="1" value={pricingSettings.deliveryCharge}
                    onChange={(e) => setPricingSettings((prev) => ({ ...prev, deliveryCharge: e.target.value }))} />
                  <em>Flat</em>
                </div>
              </label>
            </div>
          </div>

          {/* Section 2: Warehouse Location */}
          <div className="pricing-panel">
            <div className="pricing-panel-header">
              <TrendingUp size={16} className="pricing-panel-icon pricing-panel-icon--blue" />
              <div>
                <h4>Warehouse Location</h4>
                <p>Used to calculate distance-based delivery fees for customers.</p>
              </div>
              <button type="button" className="pricing-link-btn pricing-link-btn--sm"
                onClick={useCurrentWarehouseLocation} disabled={isGettingWarehouseLocation}>
                {isGettingWarehouseLocation ? "Locating..." : "Use Current Location"}
              </button>
            </div>
            <div className="pricing-panel-grid pricing-panel-grid--3">
              <label className="pricing-field">
                <span className="pricing-label">Warehouse Name</span>
                <input type="text" className="pricing-text-input" placeholder="e.g. DSG Warehouse"
                  value={pricingSettings.warehouseLocation.name} onChange={(e) => updateWarehouseField("name", e.target.value)} />
              </label>
              <label className="pricing-field pricing-field-wide">
                <span className="pricing-label">Address</span>
                <input type="text" className="pricing-text-input" placeholder="e.g. Noida, Uttar Pradesh"
                  value={pricingSettings.warehouseLocation.address} onChange={(e) => updateWarehouseField("address", e.target.value)} />
              </label>
              <label className="pricing-field pricing-field-wide">
                <span className="pricing-label">Google Maps Link</span>
                <div className="warehouse-map-url-row">
                  <input type="text" className="pricing-text-input" placeholder="Paste Google Maps link to auto-extract coordinates"
                    value={pricingSettings.warehouseLocation.mapUrl} onChange={(e) => updateWarehouseField("mapUrl", e.target.value)} />
                  <button type="button" className="pricing-link-btn pricing-link-btn--sm" onClick={applyGoogleMapsLocation}>Extract</button>
                </div>
              </label>
              <label className="pricing-field">
                <span className="pricing-label">Latitude</span>
                <input type="number" step="any" className="pricing-text-input" placeholder="28.6139"
                  value={pricingSettings.warehouseLocation.latitude} onChange={(e) => updateWarehouseField("latitude", e.target.value)} />
              </label>
              <label className="pricing-field">
                <span className="pricing-label">Longitude</span>
                <input type="number" step="any" className="pricing-text-input" placeholder="77.2090"
                  value={pricingSettings.warehouseLocation.longitude} onChange={(e) => updateWarehouseField("longitude", e.target.value)} />
              </label>
            </div>
          </div>

          {/* Section 3: Distance Pricing */}
          <div className="pricing-panel">
            <div className="pricing-panel-header">
              <BarChart3 size={16} className="pricing-panel-icon pricing-panel-icon--green" />
              <div>
                <h4>Distance Pricing Formula</h4>
                <p>Fee = base fee + ((distance - free radius) x per km rate)</p>
              </div>
            </div>
            <div className="pricing-panel-grid pricing-panel-grid--3">
              <label className="pricing-field">
                <span className="pricing-label">Distance Pricing</span>
                <select className="pricing-text-input"
                  value={pricingSettings.distancePricing.enabled ? "enabled" : "disabled"}
                  onChange={(e) => updateDistancePricingField("enabled", e.target.value === "enabled")}>
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
              <label className="pricing-field">
                <span className="pricing-label">Base Fee (Rs)</span>
                <input type="number" min="0" step="1" className="pricing-text-input"
                  value={pricingSettings.distancePricing.baseFee}
                  onChange={(e) => updateDistancePricingField("baseFee", e.target.value)} />
              </label>
              <label className="pricing-field">
                <span className="pricing-label">Per KM Charge (Rs)</span>
                <input type="number" min="0" step="0.1" className="pricing-text-input"
                  value={pricingSettings.distancePricing.perKmCharge}
                  onChange={(e) => updateDistancePricingField("perKmCharge", e.target.value)} />
              </label>
              <label className="pricing-field">
                <span className="pricing-label">Free Radius (KM)</span>
                <input type="number" min="0" step="0.1" className="pricing-text-input"
                  value={pricingSettings.distancePricing.freeRadiusKm}
                  onChange={(e) => updateDistancePricingField("freeRadiusKm", e.target.value)} />
              </label>
              <label className="pricing-field">
                <span className="pricing-label">Max Charge Cap (Rs)</span>
                <input type="number" min="0" step="1" className="pricing-text-input" placeholder="Optional"
                  value={pricingSettings.distancePricing.maxCharge}
                  onChange={(e) => updateDistancePricingField("maxCharge", e.target.value)} />
              </label>
            </div>
          </div>

          {/* Section 4: International Delivery */}
          <div className="pricing-panel">
            <div className="pricing-panel-header">
              <Wallet size={16} className="pricing-panel-icon pricing-panel-icon--purple" />
              <div>
                <h4>International Delivery</h4>
                <p>Apply country-based fees when shipping outside your domestic country.</p>
              </div>
              <button type="button" className="pricing-link-btn pricing-link-btn--sm" onClick={addInternationalCountryRate}>
                + Add Country Rate
              </button>
            </div>
            <div className="pricing-panel-grid pricing-panel-grid--3">
              <label className="pricing-field">
                <span className="pricing-label">International Pricing</span>
                <select className="pricing-text-input"
                  value={pricingSettings.internationalDelivery.enabled ? "enabled" : "disabled"}
                  onChange={(e) => updateInternationalDeliveryField("enabled", e.target.value === "enabled")}>
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
              <label className="pricing-field">
                <span className="pricing-label">Domestic Country</span>
                <input type="text" className="pricing-text-input" placeholder="e.g. India"
                  value={pricingSettings.internationalDelivery.domesticCountry}
                  onChange={(e) => updateInternationalDeliveryField("domesticCountry", e.target.value)} />
              </label>
              <label className="pricing-field">
                <span className="pricing-label">Default International Fee (Rs)</span>
                <input type="number" min="0" step="1" className="pricing-text-input"
                  value={pricingSettings.internationalDelivery.defaultFee}
                  onChange={(e) => updateInternationalDeliveryField("defaultFee", e.target.value)} />
              </label>
            </div>
            {pricingSettings.internationalDelivery.countryRates.length > 0 ? (
              <div className="delivery-zone-list">
                {pricingSettings.internationalDelivery.countryRates.map((item, index) => (
                  <div key={`intl-country-rate-${index}`} className="delivery-zone-card">
                    <div className="delivery-zone-card-header">
                      <strong>Country Rate {index + 1}</strong>
                      <button type="button" onClick={() => removeInternationalCountryRate(index)}><X size={14} /> Remove</button>
                    </div>
                    <div className="delivery-zone-grid">
                      <label className="pricing-field">
                        <span className="pricing-label">Country</span>
                        <input type="text" className="pricing-text-input" placeholder="e.g. United States"
                          value={item.country} onChange={(e) => updateInternationalCountryRate(index, "country", e.target.value)} />
                      </label>
                      <label className="pricing-field">
                        <span className="pricing-label">Delivery Fee (Rs)</span>
                        <input type="number" min="0" step="1" className="pricing-text-input"
                          value={item.fee} onChange={(e) => updateInternationalCountryRate(index, "fee", e.target.value)} />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="delivery-zone-empty">No country-specific rates yet. Click "+ Add Country Rate" to configure one.</div>
            )}
          </div>

          {/* Section 5: Pricing Markets and Currency */}
          <div className="pricing-panel">
            <div className="pricing-panel-header">
              <CalendarRange size={16} className="pricing-panel-icon pricing-panel-icon--indigo" />
              <div>
                <h4>Pricing Markets &amp; Currency</h4>
                <p>Group countries into reusable markets with per-market currencies.</p>
              </div>
              <button type="button" className="pricing-link-btn pricing-link-btn--sm" onClick={addPricingMarket}>
                + Add Market
              </button>
            </div>
            {pricingSettings.pricingMarkets.length > 0 ? (
              <div className="delivery-zone-list">
                {pricingSettings.pricingMarkets.map((market, index) => (
                  <div key={`pricing-market-${index}`} className="delivery-zone-card">
                    <div className="delivery-zone-card-header">
                      <strong>Market {index + 1}{market.name ? ` -- ${market.name}` : ""}</strong>
                      <button type="button" onClick={() => removePricingMarket(index)}><X size={14} /> Remove</button>
                    </div>
                    <div className="delivery-zone-grid">
                      <label className="pricing-field">
                        <span className="pricing-label">Market Name</span>
                        <input type="text" className="pricing-text-input" placeholder="e.g. North America"
                          value={market.name} onChange={(e) => updatePricingMarketField(index, "name", e.target.value)} />
                      </label>
                      <label className="pricing-field">
                        <span className="pricing-label">Currency</span>
                        <select className="pricing-text-input" value={market.currency || "USD"}
                          onChange={(e) => updatePricingMarketField(index, "currency", e.target.value)}>
                          {SUPPORTED_PRICING_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </label>
                      <label className="pricing-field pricing-field-wide">
                        <span className="pricing-label">Countries In This Market</span>
                        <select multiple value={market.countries} className="pricing-multiselect"
                          onChange={(e) => updatePricingMarketCountries(index, e.target.selectedOptions)}>
                          {COUNTRY_OPTIONS.filter((c) => c !== "India").map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <span className="pricing-hint">Hold Ctrl / Cmd to multi-select. {market.countries.length} selected.</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="delivery-zone-empty">No pricing markets yet. Add one to enable region-based pricing.</div>
            )}
            <div className="pricing-panel-subgrid">
              <div className="pricing-panel-subcard">
                <span className="pricing-panel-subcard-label">Fallback International Currency</span>
                <select className="pricing-text-input"
                  value={pricingSettings.internationalPricingDefaults?.currency || "USD"}
                  onChange={(e) => updateInternationalPricingDefaultField("currency", e.target.value)}>
                  {SUPPORTED_PRICING_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="pricing-currency-rates">
              <span className="pricing-panel-subcard-label">Conversion Rates from INR</span>
              <div className="pricing-currency-rates-grid">
                {SUPPORTED_PRICING_CURRENCIES.map((currencyCode) => (
                  <label key={currencyCode} className="pricing-currency-rate-item">
                    <span className="pricing-currency-code">{currencyCode}</span>
                    <input type="number" min="0" step="0.000001" className="pricing-text-input"
                      value={pricingSettings.currencyConversionRates?.[currencyCode] ?? ""}
                      onChange={(e) => updateCurrencyConversionRate(currencyCode, e.target.value)}
                      disabled={currencyCode === "INR"} />
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Section 6: Visibility Controls */}
          <div className="pricing-panel">
            <div className="pricing-panel-header">
              <CheckCircle2 size={16} className="pricing-panel-icon pricing-panel-icon--teal" />
              <div>
                <h4>Feature Visibility</h4>
                <p>Toggle festive offer sections and customer geolocation on the storefront.</p>
              </div>
            </div>
            <div className="pricing-panel-grid pricing-panel-grid--3">
              <label className="pricing-field">
                <span className="pricing-label">Homepage Festive Offers</span>
                <select className="pricing-text-input"
                  value={pricingSettings.homeSectionVisibility.festiveOffers ? "shown" : "hidden"}
                  onChange={(e) => updateVisibilityField("homeSectionVisibility", "festiveOffers", e.target.value === "shown")}>
                  <option value="shown">Show</option>
                  <option value="hidden">Hide</option>
                </select>
              </label>
              <label className="pricing-field">
                <span className="pricing-label">Collection Festive Filter</span>
                <select className="pricing-text-input"
                  value={pricingSettings.collectionFilterVisibility.festiveOffers ? "shown" : "hidden"}
                  onChange={(e) => updateVisibilityField("collectionFilterVisibility", "festiveOffers", e.target.value === "shown")}>
                  <option value="shown">Show</option>
                  <option value="hidden">Hide</option>
                </select>
              </label>
              <label className="pricing-field">
                <span className="pricing-label">Customer Geolocation Button</span>
                <select className="pricing-text-input"
                  value={pricingSettings.enableCurrentLocation ? "enabled" : "disabled"}
                  onChange={(e) => setPricingSettings((prev) => ({ ...prev, enableCurrentLocation: e.target.value === "enabled" }))}>
                  <option value="enabled">Enabled (Visible)</option>
                  <option value="disabled">Disabled (Hidden)</option>
                </select>
              </label>
            </div>
          </div>

          {/* Section 7: WhatsApp Integration */}
          <div className="pricing-panel wa-admin-section">
            <div className="wa-header-row">
              <div className="pricing-panel-header" style={{ margin: 0 }}>
                <div style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ffffff"
                }}>
                  <MessageSquare size={18} />
                </div>
                <div>
                  <h4 style={{ fontSize: "16px", fontWeight: "700", margin: 0 }}>WhatsApp Integration & Controls</h4>
                  <p style={{ margin: "3px 0 0", fontSize: "13px", color: "var(--admin-muted)" }}>
                    Configure customer chat widgets, automated WhatsApp Cloud API receipts, and WhatsApp OTP phone verification.
                  </p>
                </div>
              </div>

              <div>
                <span className={`wa-status-pill ${pricingSettings.whatsappSettings?.mode || "free"}`}>
                  <span className={`wa-status-dot ${(pricingSettings.whatsappSettings?.mode === "api") ? "blue" : (pricingSettings.whatsappSettings?.mode === "free") ? "green" : "gray"}`} />
                  {pricingSettings.whatsappSettings?.mode === "api"
                    ? "⚡ Automated API Mode"
                    : pricingSettings.whatsappSettings?.mode === "disabled"
                    ? "🚫 Disabled"
                    : "💬 Free Mode (Click-to-Chat)"}
                </span>
              </div>
            </div>

            {/* 3 Interactive Mode Selector Cards */}
            <div className="wa-mode-grid">
              {/* Mode 1: Free Mode */}
              <div
                className={`wa-mode-card ${pricingSettings.whatsappSettings?.mode === "free" ? "active" : ""}`}
                onClick={() => {
                  if (!isPricingUnlocked) return;
                  setPricingSettings((prev) => ({
                    ...prev,
                    whatsappSettings: { ...prev.whatsappSettings, mode: "free" }
                  }));
                }}
              >
                <div className="wa-mode-card-top">
                  <div className="wa-mode-icon-wrap">
                    <MessageCircle size={20} />
                  </div>
                  <span className="wa-mode-badge free">100% Free • No API Keys</span>
                </div>
                <div>
                  <h5 className="wa-mode-card-title">Free Mode (Click-to-Chat)</h5>
                  <p className="wa-mode-card-desc">
                    Floating WhatsApp chat button for direct customer inquiries. Opens WhatsApp Web / App directly with your number.
                  </p>
                </div>
                <ul className="wa-mode-features">
                  <li><Check size={14} /> Floating store chat widget</li>
                  <li><Check size={14} /> Pre-filled custom chat message</li>
                  <li><Check size={14} /> Zero Meta API fees / No OTP hurdles</li>
                </ul>
              </div>

              {/* Mode 2: Automated API Mode */}
              <div
                className={`wa-mode-card ${pricingSettings.whatsappSettings?.mode === "api" ? "active" : ""}`}
                onClick={() => {
                  if (!isPricingUnlocked) return;
                  setPricingSettings((prev) => ({
                    ...prev,
                    whatsappSettings: { ...prev.whatsappSettings, mode: "api" }
                  }));
                }}
              >
                <div className="wa-mode-card-top">
                  <div className="wa-mode-icon-wrap" style={{ background: "#ecfdf5", color: "#047857" }}>
                    <Zap size={20} />
                  </div>
                  <span className="wa-mode-badge api">Automated & OTP</span>
                </div>
                <div>
                  <h5 className="wa-mode-card-title">Automated Meta Cloud API</h5>
                  <p className="wa-mode-card-desc">
                    Connect official Meta WhatsApp Cloud API for automated notifications and security verification.
                  </p>
                </div>
                <ul className="wa-mode-features">
                  <li><Check size={14} /> Automated order confirmation receipts</li>
                  <li><Check size={14} /> 6-digit WhatsApp OTP on registration</li>
                  <li><Check size={14} /> Requires Meta Cloud API credentials</li>
                </ul>
              </div>

              {/* Mode 3: Disabled */}
              <div
                className={`wa-mode-card ${pricingSettings.whatsappSettings?.mode === "disabled" ? "active" : ""}`}
                onClick={() => {
                  if (!isPricingUnlocked) return;
                  setPricingSettings((prev) => ({
                    ...prev,
                    whatsappSettings: { ...prev.whatsappSettings, mode: "disabled" }
                  }));
                }}
              >
                <div className="wa-mode-card-top">
                  <div className="wa-mode-icon-wrap" style={{ background: "#f1f5f9", color: "#64748b" }}>
                    <Slash size={20} />
                  </div>
                  <span className="wa-mode-badge off">Off</span>
                </div>
                <div>
                  <h5 className="wa-mode-card-title">Disabled</h5>
                  <p className="wa-mode-card-desc">
                    Hides the WhatsApp chat button across the entire store and turns off all automated messages.
                  </p>
                </div>
                <ul className="wa-mode-features">
                  <li><Check size={14} /> No floating chat widget</li>
                  <li><Check size={14} /> No WhatsApp order notifications</li>
                  <li><Check size={14} /> No OTP verification requested</li>
                </ul>
              </div>
            </div>

            {/* Mode-Specific Configuration Panel */}
            {pricingSettings.whatsappSettings?.mode === "free" && (
              <div className="wa-config-box">
                <div className="wa-config-box-header">
                  <h5>
                    <MessageCircle size={17} color="#059669" />
                    Free Mode Settings
                  </h5>
                  <span style={{ fontSize: "12px", color: "#059669", fontWeight: "600" }}>
                    ✅ Instant 1-Click WhatsApp Chat
                  </span>
                </div>

                <div className="pricing-panel-grid pricing-panel-grid--2">
                  <label className="pricing-field">
                    <span className="pricing-label">Support WhatsApp Phone Number</span>
                    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                      <span style={{
                        position: "absolute",
                        left: "12px",
                        fontSize: "13px",
                        fontWeight: "700",
                        color: "#059669",
                        pointerEvents: "none"
                      }}>
                        🇮🇳 +
                      </span>
                      <input
                        type="text"
                        className="pricing-text-input"
                        style={{ paddingLeft: "52px" }}
                        placeholder="919480865623 (with country code)"
                        value={pricingSettings.whatsappSettings?.phoneNumber || ""}
                        onChange={(e) =>
                          setPricingSettings((prev) => ({
                            ...prev,
                            whatsappSettings: { ...prev.whatsappSettings, phoneNumber: e.target.value.replace(/[^\d+]/g, "") }
                          }))
                        }
                      />
                    </div>
                    <small style={{ fontSize: "11.5px", color: "var(--admin-muted)", marginTop: "4px", display: "block" }}>
                      Customers will open a chat with this number when clicking the widget.
                    </small>
                  </label>

                  <label className="pricing-field">
                    <span className="pricing-label">Pre-filled Customer Welcome Message</span>
                    <input
                      type="text"
                      className="pricing-text-input"
                      placeholder="e.g. Hello! I have a question about your products on Digital Sanskrit Guru."
                      value={pricingSettings.whatsappSettings?.welcomeMessage || ""}
                      onChange={(e) =>
                        setPricingSettings((prev) => ({
                          ...prev,
                          whatsappSettings: { ...prev.whatsappSettings, welcomeMessage: e.target.value }
                        }))
                      }
                    />
                    <small style={{ fontSize: "11.5px", color: "var(--admin-muted)", marginTop: "4px", display: "block" }}>
                      This text is automatically pre-typed into the customer&apos;s WhatsApp input.
                    </small>
                  </label>
                </div>

                {/* Live Message Bubble Preview */}
                <div>
                  <span style={{ fontSize: "12px", fontWeight: "700", color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Customer Chat Preview:
                  </span>
                  <div className="wa-preview-bubble">
                    <p style={{ margin: 0 }}>
                      {pricingSettings.whatsappSettings?.welcomeMessage || "Hello! I am interested in learning more about your products on Digital Sanskrit Guru."}
                    </p>
                    <div className="wa-preview-meta">
                      <span>Just now • Sent from store widget ✓✓</span>
                    </div>
                  </div>
                </div>

                {/* Free Mode Notice */}
                <div style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  fontSize: "12.5px",
                  color: "#166534"
                }}>
                  <ShieldCheck size={18} color="#16a34a" style={{ flexShrink: 0 }} />
                  <span>
                    <strong>Free Mode Active:</strong> WhatsApp OTP authentication is <strong>turned off</strong>. Customers can register smoothly with standard 10-digit phone format validation without requiring OTP codes.
                  </span>
                </div>
              </div>
            )}

            {pricingSettings.whatsappSettings?.mode === "api" && (
              <div className="wa-config-box api-box">
                <div className="wa-config-box-header">
                  <h5>
                    <Zap size={17} color="#059669" />
                    Meta WhatsApp Cloud API Credentials
                  </h5>
                  <a
                    href="https://developers.facebook.com/apps/"
                    target="_blank"
                    rel="noreferrer"
                    className="wa-doc-link"
                  >
                    Meta Developer Dashboard <ExternalLink size={12} />
                  </a>
                </div>

                {!isSuperAdmin ? (
                  <div style={{
                    background: pricingSettings.whatsappSettings?.apiConfigured ? "#f0fdf4" : "#f8fafc",
                    border: `1px solid ${pricingSettings.whatsappSettings?.apiConfigured ? "#bbf7d0" : "var(--admin-border)"}`,
                    padding: "14px 16px",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    fontSize: "13px",
                    color: pricingSettings.whatsappSettings?.apiConfigured ? "#166534" : "var(--admin-muted)"
                  }}>
                    <ShieldCheck size={18} color={pricingSettings.whatsappSettings?.apiConfigured ? "#16a34a" : "#64748b"} style={{ flexShrink: 0 }} />
                    <span>
                      WhatsApp Business API: <strong>{pricingSettings.whatsappSettings?.apiConfigured ? "Connected" : "Not configured"}</strong> (managed by super admin)
                    </span>
                  </div>
                ) : (
                  <div className="pricing-panel-grid pricing-panel-grid--3">
                    <label className="pricing-field">
                      <span className="pricing-label">Phone Number ID <strong style={{ color: "#ef4444" }}>*</strong></span>
                      <input
                        type="text"
                        className="pricing-text-input"
                        placeholder="e.g. 10482910482019"
                        value={pricingSettings.whatsappSettings?.metaPhoneNumberId || ""}
                        onChange={(e) =>
                          setPricingSettings((prev) => ({
                            ...prev,
                            whatsappSettings: {
                              ...prev.whatsappSettings,
                              metaPhoneNumberId: e.target.value.trim()
                            }
                          }))
                        }
                      />
                    </label>

                    <label className="pricing-field">
                      <span className="pricing-label">Permanent System User Token <strong style={{ color: "#ef4444" }}>*</strong></span>
                      <span className="pricing-hint">
                        {pricingSettings.whatsappSettings?.clearAccessToken
                          ? "Token will be removed on save"
                          : pricingSettings.whatsappSettings?.metaAccessTokenSet
                            ? `Access token saved (ending ••••${pricingSettings.whatsappSettings?.metaAccessTokenLast4 || "XXXX"})`
                            : "No access token saved"}
                      </span>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <input
                          type="password"
                          className="pricing-text-input"
                          placeholder="Replace access token"
                          value={pricingSettings.whatsappSettings?.newAccessToken || ""}
                          onChange={(e) =>
                            setPricingSettings((prev) => ({
                              ...prev,
                              whatsappSettings: {
                                ...prev.whatsappSettings,
                                newAccessToken: e.target.value.trim(),
                                clearAccessToken: false
                              }
                            }))
                          }
                        />
                        {(pricingSettings.whatsappSettings?.metaAccessTokenSet || pricingSettings.whatsappSettings?.newAccessToken) && !pricingSettings.whatsappSettings?.clearAccessToken && (
                          <button
                            type="button"
                            className="pricing-link-btn pricing-link-btn--sm"
                            style={{ color: "#dc2626", borderColor: "#fca5a5", whiteSpace: "nowrap" }}
                            onClick={async () => {
                              const ok = await confirm({
                                title: "Remove WhatsApp access token?",
                                tone: "danger"
                              });
                              if (ok) {
                                setPricingSettings((prev) => ({
                                  ...prev,
                                  whatsappSettings: {
                                    ...prev.whatsappSettings,
                                    clearAccessToken: true,
                                    newAccessToken: ""
                                  }
                                }));
                              }
                            }}
                          >
                            Remove token
                          </button>
                        )}
                      </div>
                    </label>

                    <label className="pricing-field">
                      <span className="pricing-label">WhatsApp Business Account ID (WABA)</span>
                      <input
                        type="text"
                        className="pricing-text-input"
                        placeholder="e.g. 102938475610293 (Optional)"
                        value={pricingSettings.whatsappSettings?.metaWabaId || ""}
                        onChange={(e) =>
                          setPricingSettings((prev) => ({
                            ...prev,
                            whatsappSettings: {
                              ...prev.whatsappSettings,
                              metaWabaId: e.target.value.trim()
                            }
                          }))
                        }
                      />
                    </label>
                  </div>
                )}

                {/* 2 Feature Toggle Switch Cards */}
                <div>
                  <span style={{ fontSize: "12px", fontWeight: "700", color: "#166534", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Automated Messaging Features:
                  </span>
                  <div className="wa-toggles-grid">
                    <label className="wa-toggle-card">
                      <input
                        type="checkbox"
                        style={{ marginTop: "3px", width: "16px", height: "16px", accentColor: "#10b981", cursor: "pointer" }}
                        checked={pricingSettings.whatsappSettings?.autoSendOrderConfirmation !== false}
                        onChange={(e) =>
                          setPricingSettings((prev) => ({
                            ...prev,
                            whatsappSettings: {
                              ...prev.whatsappSettings,
                              autoSendOrderConfirmation: e.target.checked
                            }
                          }))
                        }
                      />
                      <div className="wa-toggle-copy">
                        <strong>📦 Automated Order Receipts</strong>
                        <span>Automatically dispatch WhatsApp order confirmation receipts to customers immediately upon successful checkout.</span>
                      </div>
                    </label>

                    <label className="wa-toggle-card">
                      <input
                        type="checkbox"
                        style={{ marginTop: "3px", width: "16px", height: "16px", accentColor: "#10b981", cursor: "pointer" }}
                        checked={pricingSettings.whatsappSettings?.enableOtpVerification !== false}
                        onChange={(e) =>
                          setPricingSettings((prev) => ({
                            ...prev,
                            whatsappSettings: {
                              ...prev.whatsappSettings,
                              enableOtpVerification: e.target.checked
                            }
                          }))
                        }
                      />
                      <div className="wa-toggle-copy">
                        <strong>📲 WhatsApp OTP Verification</strong>
                        <span>Send 6-digit WhatsApp OTP verification codes to authenticate customer mobile numbers during registration and account updates.</span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
          </fieldset>

          {/* Save Row */}
          <div className="pricing-save-row">
            <div className="pricing-save-row-left">
              <button
                className="pricing-save-btn"
                onClick={savePricingSettings}
                disabled={!isSuperAdmin || !isPricingUnlocked || isSavingPricing}
              >
                {isSavingPricing ? "Saving..." : "Save All Settings"}
              </button>
              {pricingMessage && (
                <span className={`pricing-message ${pricingMessage.includes("updated") ? "success" : "error"}`}>
                  {pricingMessage}
                </span>
              )}
            </div>
            <p className="pricing-save-note">
              {pricingSettings.lastUpdatedAt
                ? `Last saved by ${pricingSettings.lastUpdatedByName || pricingSettings.lastUpdatedByEmail || "Admin"} · ${formatDate(pricingSettings.lastUpdatedAt)} ${formatTime(pricingSettings.lastUpdatedAt)}`
                : "Changes apply to all new orders immediately after saving."}
            </p>
          </div>

          </>)}
        </section>



        {notifications.length > 0 && (
          <section className="card notifications-card">
            <div className="notifications-header">
              <div className="notifications-header-left">
                <Bell size={16} />
                <h3>Admin Notifications</h3>
              </div>
              <span className="notifications-count-badge">{notifications.length} new</span>
            </div>
            <div className="notifications-list">
              {notifications.map((item) => (
                <div key={item.id} className={`notification-item notification-${item.type}`}>
                  <span className="notification-icon">
                    {item.type === "warning" && <AlertTriangle size={16} />}
                    {item.type === "alert" && <AlertTriangle size={16} />}
                    {item.type === "success" && <CheckCircle2 size={16} />}
                  </span>
                  <p>
                    {item.link ? (
                      <Link
                        to={item.link}
                        style={{
                          color: "inherit",
                          textDecoration: "none",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px"
                        }}
                      >
                        <span>{item.text}</span>
                        <span style={{ fontSize: "12px", opacity: 0.85, textDecoration: "underline", whiteSpace: "nowrap" }}>
                          View &rarr;
                        </span>
                      </Link>
                    ) : (
                      item.text
                    )}
                  </p>
                  {!NON_DISMISSIBLE_NOTIFICATION_IDS.includes(item.id) && (
                    <button onClick={() => setDismissedNotifications((prev) => [...prev, item.id])}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {isInitialLoading ? (
          <section className="stats">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={`dash-stat-skeleton-${idx}`} className="card analytics-card">
                <div className="skeleton-block skeleton-heading" />
                <div className="skeleton-block skeleton-value" />
                <div className="skeleton-block skeleton-meta" />
              </div>
            ))}
          </section>
        ) : (
          <div className="stats">
            <div className="card analytics-card analytics-card--blue">
              <div className="analytics-card-icon"><Package size={20} /></div>
              <div className="analytics-card-body">
                <h3>Total Products</h3>
                <p>{products.length}</p>
                <span>Catalog size</span>
              </div>
            </div>
            <div className="card analytics-card analytics-card--amber">
              <div className="analytics-card-icon"><ShoppingCart size={20} /></div>
              <div className="analytics-card-body">
                <h3>Total Orders</h3>
                <p>{orders.length}</p>
                <span>{analytics.statuses.Pending} pending</span>
              </div>
            </div>
            <div className="card analytics-card analytics-card--green">
              <div className="analytics-card-icon"><IndianRupee size={20} /></div>
              <div className="analytics-card-body">
                <h3>Total Revenue</h3>
                <p>{formatCurrency(analytics.totalRevenue)}</p>
                <span>From all orders</span>
              </div>
            </div>
            <div className="card analytics-card analytics-card--purple">
              <div className="analytics-card-icon"><TrendingUp size={20} /></div>
              <div className="analytics-card-body">
                <h3>Average Order</h3>
                <p>{formatCurrency(analytics.averageOrderValue)}</p>
                <span>{analytics.totalQuantity} units sold</span>
              </div>
            </div>
          </div>
        )}

        <section className="revenue-kpi-grid">
          <div className="card revenue-kpi-card revenue-kpi-today">
            <div className="revenue-kpi-icon"><CalendarDays size={18} /></div>
            <h4>Revenue Today</h4>
            <p>{formatCurrency(revenueKpis.today)}</p>
          </div>
          <div className="card revenue-kpi-card revenue-kpi-7d">
            <div className="revenue-kpi-icon"><CalendarRange size={18} /></div>
            <h4>Last 7 Days</h4>
            <p>{formatCurrency(revenueKpis.last7Days)}</p>
          </div>
          <div className="card revenue-kpi-card revenue-kpi-30d">
            <div className="revenue-kpi-icon"><BarChart3 size={18} /></div>
            <h4>Last 30 Days</h4>
            <p>{formatCurrency(revenueKpis.last30Days)}</p>
          </div>
          <div className="card revenue-kpi-card revenue-kpi-total">
            <div className="revenue-kpi-icon"><Wallet size={18} /></div>
            <h4>Total Revenue</h4>
            <p>{formatCurrency(revenueKpis.total)}</p>
          </div>
        </section>

        <section className="card ai-prediction-card">
          <div className="ai-prediction-header">
            <div>
              <h3>AI Sales Predictions</h3>
              <p>Trend-based forecast generated from recent monthly revenue.</p>
            </div>
            <div className="ai-confidence-wrap">
              <span className="ai-confidence">Confidence: {formatPercent(aiPredictions.confidence)}</span>
              <div className="ai-confidence-track">
                <div className="ai-confidence-fill" style={{ width: `${Math.max(8, aiPredictions.confidence)}%` }} />
              </div>
            </div>
          </div>
          <div className="ai-prediction-grid">
            <div className="ai-prediction-metric">
              <span>Predicted Next Month Revenue</span>
              <strong>{formatCurrency(aiPredictions.nextMonthRevenue)}</strong>
              <p className="ai-trend-note">{aiPredictions.trend}</p>
              <div className="ai-insight-tags">
                <span>Model: Linear trend</span>
                <span>Window: Last 6 months</span>
              </div>
            </div>
            <div className="ai-prediction-sparkline">
              {aiPredictions.monthlyPoints.length === 0 ? (
                <p>Not enough historical data.</p>
              ) : (
                aiPredictions.monthlyPoints.map((value, index) => {
                  const max = Math.max(...aiPredictions.monthlyPoints, 1);
                  const h = Math.max(10, Math.round((value / max) * 100));
                  return (
                    <div key={`${value}-${index}`} className="spark-col">
                      <div className="spark-bar" style={{ height: `${h}%` }} />
                      <span>M{index + 1}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <section className="card weekly-stats-card">
          <div className="weekly-stats-header">
            <h3>Weekly User Purchase Stats</h3>
            <p>Order volume, active purchasing users, and weekly revenue metrics.</p>
          </div>
          <div className="weekly-stats-table-wrapper">
            <table className="weekly-stats-table">
              <thead>
                <tr>
                  <th>Week</th>
                  <th style={{ textAlign: "right" }}>Unique Buyers</th>
                  <th style={{ textAlign: "right" }}>Orders Count</th>
                  <th style={{ textAlign: "right" }}>Weekly Revenue</th>
                </tr>
              </thead>
              <tbody>
                {weeklyStats.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ textAlign: "center", color: "var(--site-text-soft)", padding: "20px 0" }}>
                      No purchase statistics available.
                    </td>
                  </tr>
                ) : (
                  weeklyStats.map((week) => (
                    <tr key={week.weekStart}>
                      <td>
                        <strong>{week.label}</strong>
                      </td>
                      <td style={{ textAlign: "right" }}>{week.uniqueUsersCount}</td>
                      <td style={{ textAlign: "right" }}>{week.ordersCount}</td>
                      <td style={{ textAlign: "right", fontWeight: "600", color: "var(--site-link)" }}>
                        {formatCurrency(week.revenue)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <h3>Advanced Analytics Dashboard</h3>
          <div className="advanced-analytics-grid">
            <div className="advanced-analytics-panel advanced-analytics-highlight">
              <h4>Revenue Performance (30d)</h4>
              <p>{formatCurrency(advancedAnalytics.last30Revenue)}</p>
              <span className={advancedAnalytics.revenueGrowth >= 0 ? "trend-positive" : "trend-negative"}>
                vs previous 30d: {formatPercent(advancedAnalytics.revenueGrowth)}
              </span>
            </div>
            <div className="advanced-analytics-panel">
              <h4>Status Funnel</h4>
              <div className="status-funnel-list">
                <div>
                  <span>Pending</span>
                  <strong>{advancedAnalytics.statusCounts.Pending}</strong>
                </div>
                <div>
                  <span>Shipped</span>
                  <strong>{advancedAnalytics.statusCounts.Shipped}</strong>
                </div>
                <div>
                  <span>Delivered</span>
                  <strong>{advancedAnalytics.statusCounts.Delivered}</strong>
                </div>
              </div>
            </div>
            <div className="advanced-analytics-panel">
              <h4>Top Customer</h4>
              {advancedAnalytics.topCustomer ? (
                <>
                  <p>{advancedAnalytics.topCustomer.name}</p>
                  <span>{formatCurrency(advancedAnalytics.topCustomer.spend)} total spend</span>
                </>
              ) : (
                <span>No customer spend data</span>
              )}
            </div>
            <div className="advanced-analytics-panel">
              <h4>Weekday Revenue Pattern</h4>
              <div className="weekday-bars">
                {advancedAnalytics.weekdaySeries.map((entry) => {
                  const max = Math.max(...advancedAnalytics.weekdaySeries.map((d) => d.value), 1);
                  const barW = Math.max(6, Math.round((entry.value / max) * 100));
                  return (
                    <div key={entry.day} className="weekday-row">
                      <span>{entry.day}</span>
                      <div className="weekday-track">
                        <div className="weekday-fill" style={{ width: `${barW}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="charts-grid">
          <div className="card">
            <SalesChart orders={orders} />
          </div>
          <div className="card">
            <h3 style={{ margin: "0 0 14px" }}>Best Selling Product Chart</h3>
            {isInitialLoading ? (
              <p>Loading sales data...</p>
            ) : topProducts.length === 0 ? (
              <p>No sales data yet.</p>
            ) : (
              <div className="best-products-chart">
                {topProducts.map(([productName, soldCount], index) => {
                  const percent = Math.max(8, Math.round((soldCount / topProducts[0][1]) * 100));
                  return (
                    <div key={productName} className="best-product-row">
                      <span>{productName}</span>
                      <div className="best-product-bar-track">
                        <div
                          className="best-product-bar"
                          style={{ width: `${percent}%`, animationDelay: `${index * 120}ms` }}
                        />
                      </div>
                      <strong>{soldCount}</strong>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="dashboard-grid">
          <div className="card">
            <h3>Low Stock Alerts</h3>
            {isInitialLoading ? (
              <p>Checking inventory levels...</p>
            ) : lowStockProducts.length === 0 ? (
              <p>No low-stock items right now.</p>
            ) : (
              lowStockProducts.map((product) => (
                <div key={product._id} className="row">
                  <span>{product.name}</span>
                  <strong className={Number(product.stock || 0) === 0 ? "stock-critical" : "stock-warning"}>
                    {Number(product.stock || 0) === 0 ? "Out of stock" : `${product.stock} left`}
                  </strong>
                </div>
              ))
            )}
          </div>
          <div className="card">
            <h3>Customer Analytics</h3>
            <div className="customer-metrics">
              <div>
                <span>Unique Customers</span>
                <strong>{analytics.uniqueCustomers}</strong>
              </div>
              <div>
                <span>Repeat Customers</span>
                <strong>{analytics.repeatCustomers}</strong>
              </div>
              <div>
                <span>Repeat Rate</span>
                <strong>{Math.round(analytics.repeatRate)}%</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <h3>Recent Orders</h3>
          {orderLoadError && <p>{orderLoadError}</p>}
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 8).map((order) => {
                  const status = normalizeStatus(order?.status);
                  const itemCount = (order.items || []).reduce(
                    (sum, item) => sum + Number(item.quantity || 1),
                    0
                  );

                  return (
                    <tr key={order._id}>
                      <td>#{order._id.slice(-6).toUpperCase()}</td>
                      <td>{order.user?.name || "Unknown"}</td>
                      <td>{formatDate(order.createdAt)}</td>
                      <td>{itemCount}</td>
                      <td>Rs {Math.round(order.total || 0)}</td>
                      <td>
                        <span className={`table-status status-${status.toLowerCase()}`}>{status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {isInitialLoading ? (
              <p style={{ margin: "12px 0 0", color: "var(--site-text-soft)" }}>Loading recent orders...</p>
            ) : orders.length === 0 ? (
              <p style={{ margin: "12px 0 0" }}>No orders found.</p>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}

export default AdminDashboard;

