import { useEffect, useMemo, useState, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import axios from "axios";
import { apiBaseUrl } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { useWishlist } from "../hooks/useWishlist";
import { useDeliveryLocation } from "../hooks/useDeliveryLocation";
import { formatCurrencyForUser } from "../utils/currency";
import { formatDate } from "../utils/date";
import { reverseGeocodeCoordinates, getCurrentDevicePosition } from "../utils/geoAddress";
import {
  COUNTRIES,
  getStatesForCountry,
  getDistrictsForState,
  matchBestOption
} from "../utils/locationData";
import {
  COUNTRY_PHONE_CODES,
  getCountryPhoneData,
  extractPhoneAndCountry
} from "../utils/countryPhoneCodes";
import { validatePhoneNumber } from "../utils/phoneValidation";
import WhatsAppOtpModal from "../components/common/WhatsAppOtpModal";
import "./MyAccount.css";
import LoadingSpinner from "../components/common/LoadingSpinner";
import {
  Bell,
  BellOff,
  Eye,
  EyeOff,
  User,
  Mail,
  Phone,
  ShieldCheck,
  CheckCircle2,
  Lock,
  KeyRound,
  MapPin,
  Sparkles,
  AlertCircle,
  Edit3,
  X,
  Shield,
  Compass,
  Building,
  Globe,
  Navigation,
  Hash,
  MessageCircle,
  Trash2,
  Package,
  Truck,
  Heart,
  BookOpen,
  Gift,
  LayoutDashboard,
  ChevronRight,
  ChevronDown,
  Copy
} from "lucide-react";

function getPasswordStrength(pwd) {
  if (!pwd) return { score: 0, label: "None", color: "#cbd5e1" };
  let score = 0;
  if (pwd.length >= 8) score += 1;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 1;
  if (/\d/.test(pwd)) score += 1;
  if (/[^A-Za-z0-9]/.test(pwd) || pwd.length >= 12) score += 1;

  if (score <= 1) return { score: 1, label: "Weak", color: "#ef4444" };
  if (score === 2) return { score: 2, label: "Fair", color: "#f59e0b" };
  if (score === 3) return { score: 3, label: "Good", color: "#3b82f6" };
  return { score: 4, label: "Strong", color: "#10b981" };
}

// ── Push Notification Subscribe Section ──────────────────────────────────────
function PushSubscribeSection({ token }) {
  const [permission, setPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const [status, setStatus] = useState("");
  const [isSubscribing, setIsSubscribing] = useState(false);

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  }

  const subscribe = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("Push notifications are not supported by your browser.");
      return;
    }
    setIsSubscribing(true);
    setStatus("");
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") {
        setStatus("Notification permission denied. Enable it in browser settings.");
        return;
      }
      const sw = await navigator.serviceWorker.ready;
      const existing = await sw.pushManager.getSubscription();
      if (existing) {
        setStatus("✅ You are already subscribed to push notifications.");
        return;
      }
      const keyRes = await fetch(`${apiBaseUrl || ""}/api/push/vapid-key`);
      if (!keyRes.ok) throw new Error("Could not get push key.");
      const { publicKey } = await keyRes.json();
      const sub = await sw.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
      if (token) {
        await axios.post("/api/push/subscribe", sub.toJSON(), {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      setStatus("✅ Subscribed! You'll receive notifications for orders and stock alerts.");
    } catch (err) {
      setStatus(err?.message || "Failed to subscribe.");
    } finally {
      setIsSubscribing(false);
    }
  };

  const unsubscribe = async () => {
    setIsSubscribing(true);
    setStatus("");
    try {
      const sw = await navigator.serviceWorker.ready;
      const sub = await sw.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        if (token) {
          await axios.delete("/api/push/unsubscribe", {
            headers: { Authorization: `Bearer ${token}` },
            data: { endpoint: sub.endpoint }
          });
        }
      }
      setPermission("default");
      setStatus("Unsubscribed from push notifications.");
    } catch {
      setStatus("Failed to unsubscribe.");
    } finally {
      setIsSubscribing(false);
    }
  };

  const isGranted = permission === "granted";

  return (
    <section className="my-account-panel my-account-panel-compact">
      <div className="my-account-panel-head">
        <div className="my-account-panel-head-flex">
          <div className={`my-account-bell-icon-badge ${isGranted ? "active" : ""}`}>
            {isGranted ? <Bell size={20} /> : <BellOff size={20} />}
          </div>
          <div>
            <p className="my-account-section-kicker">Notifications</p>
            <h2>Push Notifications</h2>
          </div>
        </div>
      </div>

      <div className="my-account-push-box">
        <p className="my-account-push-desc">
          Get instant alerts for order updates, delivery status, and low-stock warnings for your wishlist items.
        </p>

        <div className="notifications-toggle-card">
          <div className="notifications-toggle-info">
            <span className="notifications-toggle-text">
              {isSubscribing
                ? "Updating settings..."
                : isGranted
                ? "Push Notifications Active"
                : "Push Notifications Off"}
            </span>
            <div className="notifications-status-row">
              <span className={`notifications-status-pill ${isGranted ? "active" : ""}`}>
                {isGranted ? "Enabled" : permission === "denied" ? "Blocked in browser" : "Disabled"}
              </span>
            </div>
          </div>

          <button
            type="button"
            className={`notifications-toggle${isGranted ? " on" : ""}`}
            onClick={isGranted ? unsubscribe : subscribe}
            disabled={isSubscribing || permission === "denied"}
            role="switch"
            aria-checked={isGranted}
            aria-label="Toggle push notifications"
          >
            <span className="notifications-toggle-thumb">
              {isSubscribing ? (
                <span className="notifications-spinner-dot" />
              ) : isGranted ? (
                <Bell size={12} className="my-account-bell-active" />
              ) : (
                <BellOff size={12} className="my-account-bell-inactive" />
              )}
            </span>
          </button>
        </div>

        {status && <p className="my-account-push-msg">{status}</p>}

        {permission === "denied" && (
          <p className="my-account-push-hint my-account-push-hint-text">
            🔒 To re-enable, click the lock icon in your browser address bar → Notifications → Allow.
          </p>
        )}
      </div>
    </section>
  );
}


async function fetchCoordinatesForAddress(parts = {}) {
  const queryCandidates = [
    [parts.address, parts.landmark, parts.city, parts.state, parts.pincode, parts.country],
    [parts.landmark, parts.city, parts.state, parts.pincode, parts.country],
    [parts.city, parts.state, parts.country],
    [parts.pincode, parts.country]
  ]
    .map((arr) => arr.map((item) => String(item || "").trim()).filter(Boolean).join(", "))
    .filter(Boolean);

  const seen = new Set();
  for (const query of queryCandidates) {
    if (seen.has(query)) continue;
    seen.add(query);

    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      limit: "1",
      addressdetails: "1"
    });

    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      });

      if (!response.ok) continue;

      const results = await response.json();
      const first = Array.isArray(results) ? results[0] : null;
      const latitude = Number(first?.lat);
      const longitude = Number(first?.lon);

      if (!Number.isNaN(latitude) && !Number.isNaN(longitude)) {
        return { latitude, longitude };
      }
    } catch {
      // Continue to next candidate query
    }
  }

  return { latitude: null, longitude: null };
}

function MyAccount() {
  const { user, token, updateProfileState } = useAuth();
  const { wishlist } = useWishlist();
  const { addresses, isLoadingAddresses, addAddress, updateAddress, removeAddress, setDefaultAddress } = useDeliveryLocation();
  const location = useLocation();
  const addressFormRef = useRef(null);
  const nameInputRef = useRef(null);
  const [orders, setOrders] = useState([]);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [addressToDelete, setAddressToDelete] = useState(null);
  const [addressError, setAddressError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [addressLabel, setAddressLabel] = useState("Home");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [country, setCountry] = useState("India");
  const [phoneCountry, setPhoneCountry] = useState("India");
  const currentPhoneData = useMemo(() => getCountryPhoneData(phoneCountry), [phoneCountry]);
  const [isDefaultAddress, setIsDefaultAddress] = useState(false);
  const [enableCurrentLocation, setEnableCurrentLocation] = useState(true);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [locationStatusMessage, setLocationStatusMessage] = useState("");
  const [addressToast, setAddressToast] = useState("");
  const [copiedAddressIndex, setCopiedAddressIndex] = useState(null);
  const [isDetectingPincode, setIsDetectingPincode] = useState(false);
  const [pincodeLookupMsg, setPincodeLookupMsg] = useState("");

  const showAddressToast = (msg) => {
    setAddressToast(msg);
    setTimeout(() => {
      setAddressToast((curr) => (curr === msg ? "" : curr));
    }, 3500);
  };

  const copyAddressToClipboard = (item, index) => {
    const fullText = [
      item.name,
      item.phone,
      item.address,
      item.landmark ? `Landmark: ${item.landmark}` : "",
      [item.city, item.state, item.pincode, item.country].filter(Boolean).join(", ")
    ]
      .filter(Boolean)
      .join("\n");

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(fullText).then(() => {
        setCopiedAddressIndex(index);
        setTimeout(() => setCopiedAddressIndex(null), 2000);
        showAddressToast("Address copied to clipboard!");
      });
    }
  };

  const handlePincodeChange = async (val) => {
    const clean = val.replace(/\D/g, "").slice(0, 6);
    setPincode(clean);
    if (fieldErrors.pincode) {
      setFieldErrors((prev) => ({ ...prev, pincode: "" }));
    }

    if (clean.length === 6 && country === "India") {
      setIsDetectingPincode(true);
      setPincodeLookupMsg("");
      try {
        const res = await fetch(`https://api.postalpincode.in/pincode/${clean}`);
        const data = await res.json();
        if (Array.isArray(data) && data[0]?.Status === "Success" && Array.isArray(data[0]?.PostOffice) && data[0].PostOffice.length > 0) {
          const po = data[0].PostOffice[0];
          const detectedState = po.State || "";
          const detectedDistrict = po.District || po.Block || "";

          const matchedState = matchBestOption(detectedState, getStatesForCountry("India")) || detectedState;
          if (matchedState) setState(matchedState);

          const districts = getDistrictsForState("India", matchedState);
          const matchedCity = matchBestOption(detectedDistrict, districts) || detectedDistrict;
          if (matchedCity) setCity(matchedCity);

          setPincodeLookupMsg(`Auto-detected: ${matchedCity}, ${matchedState}`);
          setFieldErrors((prev) => {
            const next = { ...prev };
            delete next.pincode;
            delete next.state;
            delete next.city;
            return next;
          });
        } else {
          setPincodeLookupMsg("Could not find location details for this PIN code.");
        }
      } catch {
        setPincodeLookupMsg("");
      } finally {
        setIsDetectingPincode(false);
      }
    } else {
      setPincodeLookupMsg("");
    }
  };

  useEffect(() => {
    if (!addressToDelete) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setAddressToDelete(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [addressToDelete]);

  const availableStates = useMemo(() => {
    return getStatesForCountry(country);
  }, [country]);

  const availableDistricts = useMemo(() => {
    return getDistrictsForState(country, state);
  }, [country, state]);

  const handleCountryChange = (newCountry) => {
    setCountry(newCountry);
    setPhoneCountry(newCountry);
    if (fieldErrors.country) setFieldErrors((prev) => ({ ...prev, country: "" }));

    const nextStates = getStatesForCountry(newCountry);
    if (nextStates.length > 0) {
      if (!nextStates.some((s) => s.toLowerCase() === state.trim().toLowerCase())) {
        setState("");
        setCity("");
      }
    }
  };

  const handlePhoneCountryChange = (newPhoneCountry) => {
    setPhoneCountry(newPhoneCountry);
    if (newPhoneCountry && country !== newPhoneCountry) {
      setCountry(newPhoneCountry);
      const nextStates = getStatesForCountry(newPhoneCountry);
      if (nextStates.length > 0) {
        if (!nextStates.some((s) => s.toLowerCase() === state.trim().toLowerCase())) {
          setState("");
          setCity("");
        }
      }
    }
    if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: "" }));
  };

  const handleStateChange = (newState) => {
    setState(newState);
    if (fieldErrors.state) setFieldErrors((prev) => ({ ...prev, state: "" }));

    const nextDistricts = getDistrictsForState(country, newState);
    if (nextDistricts.length > 0) {
      if (!nextDistricts.some((d) => d.toLowerCase() === city.trim().toLowerCase())) {
        setCity("");
      }
    }
  };

  const handleCityChange = (newCity) => {
    setCity(newCity);
    if (fieldErrors.city) setFieldErrors((prev) => ({ ...prev, city: "" }));
  };

  useEffect(() => {
    axios
      .get("/api/settings/public")
      .then((res) => {
        if (res.data?.enableCurrentLocation !== undefined) {
          setEnableCurrentLocation(res.data.enableCurrentLocation);
        }
      })
      .catch(() => {});
  }, []);

  const resetAddressForm = () => {
    setAddressLabel("Home");
    setName(user?.name || "");
    const extracted = extractPhoneAndCountry(user?.phone || "", "India");
    setPhoneCountry(extracted.country || "India");
    setPhone(extracted.localPhone || "");
    setAddress("");
    setLandmark("");
    setCity("");
    setState("");
    setPincode("");
    setCountry(extracted.country || "India");
    setIsDefaultAddress(addresses.length === 0);
    setEditingIndex(null);
    setAddressError("");
    setFieldErrors({});
  };

  const closeAddressForm = () => {
    resetAddressForm();
    setShowAddressForm(false);
  };

  const openNewAddressForm = () => {
    resetAddressForm();
    setIsDefaultAddress(addresses.length === 0);
    setShowAddressForm(true);
    setTimeout(() => {
      const targetEl = addressFormRef.current || document.getElementById("manage-address");
      if (targetEl) {
        const navOffset = 140;
        const elementPosition = targetEl.getBoundingClientRect().top + window.pageYOffset;
        window.scrollTo({
          top: Math.max(0, elementPosition - navOffset),
          behavior: "smooth"
        });
        targetEl.classList.add("my-account-panel-highlight");
        setTimeout(() => targetEl.classList.remove("my-account-panel-highlight"), 2500);
      }
      if (nameInputRef.current) {
        nameInputRef.current.focus();
      }
    }, 120);
  };

  const handleUseCurrentLocation = async () => {
    if (isDetectingLocation) return;
    setIsDetectingLocation(true);
    setLocationStatusMessage("Detecting your location...");

    try {
      const position = await getCurrentDevicePosition();
      const latitude = Number(position?.coords?.latitude);
      const longitude = Number(position?.coords?.longitude);

      if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
        throw new Error("Could not read coordinates from device.");
      }

      const resolved = await reverseGeocodeCoordinates(latitude, longitude);
      const detectedCountry = matchBestOption(resolved.country || "India", COUNTRIES) || resolved.country || "India";
      const statesList = getStatesForCountry(detectedCountry);
      const detectedState = matchBestOption(resolved.state || "", statesList) || resolved.state || "";
      const districtsList = getDistrictsForState(detectedCountry, detectedState);
      const detectedCity = matchBestOption(resolved.city || "", districtsList) || resolved.city || "";

      if (resolved.address) setAddress(resolved.address);
      if (resolved.landmark) setLandmark(resolved.landmark);
      setCountry(detectedCountry);
      setPhoneCountry(detectedCountry);
      if (detectedState) setState(detectedState);
      if (detectedCity) setCity(detectedCity);
      if (resolved.pincode) setPincode(resolved.pincode);

      setLocationStatusMessage("Location detected! Please review and complete your Flat / House number.");
    } catch (err) {
      setLocationStatusMessage(err?.message || "Could not detect current location.");
    } finally {
      setIsDetectingLocation(false);
    }
  };

  const editAddress = (index) => {
    const current = addresses[index];
    if (!current) return;

    const matchedCountry = matchBestOption(current.country || "India", COUNTRIES) || current.country || "India";
    const extracted = extractPhoneAndCountry(current.phone || "", matchedCountry);
    const statesList = getStatesForCountry(matchedCountry);
    const matchedState = matchBestOption(current.state || "", statesList) || current.state || "";
    const districtsList = getDistrictsForState(matchedCountry, matchedState);
    const matchedCity = matchBestOption(current.city || "", districtsList) || current.city || "";

    setAddressLabel(current.label || "Home");
    setName(current.name || "");
    setCountry(matchedCountry);
    setPhoneCountry(extracted.country || matchedCountry);
    setPhone(extracted.localPhone || "");
    setAddress(current.address || "");
    setLandmark(current.landmark || "");
    setState(matchedState);
    setCity(matchedCity);
    setPincode(current.pincode || "");
    setIsDefaultAddress(Boolean(current.isDefault));
    setEditingIndex(index);
    setShowAddressForm(true);
    setAddressError("");

    setTimeout(() => {
      const cardEl = document.getElementById(`my-account-addr-card-${index}`);
      const formEl = addressFormRef.current || document.getElementById("manage-address");
      const targetEl = formEl || cardEl;
      if (targetEl) {
        const navOffset = 140;
        const elementPosition = targetEl.getBoundingClientRect().top + window.pageYOffset;
        window.scrollTo({
          top: Math.max(0, elementPosition - navOffset),
          behavior: "smooth"
        });
      }
      if (nameInputRef.current) {
        nameInputRef.current.focus();
      }
    }, 120);
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const editAddressParam = params.get("editAddress");
    const editIdx =
      location.state?.editAddressIndex !== undefined && location.state?.editAddressIndex !== null
        ? Number(location.state.editAddressIndex)
        : editAddressParam !== null && editAddressParam !== ""
        ? Number(editAddressParam)
        : null;

    if (editIdx !== null && !Number.isNaN(editIdx) && addresses && addresses[editIdx]) {
      editAddress(editIdx);
      return;
    }

    const isUseCurrentLocation =
      params.get("useCurrentLocation") === "true" ||
      params.get("action") === "use-current-location" ||
      location.state?.action === "use-current-location";

    if (isUseCurrentLocation) {
      openNewAddressForm();
      handleUseCurrentLocation();
      return;
    }

    const isAddNewAddress =
      params.get("addNewAddress") === "true" ||
      params.get("action") === "add-address" ||
      location.state?.action === "add-address" ||
      location.hash === "#add-address";

    if (isAddNewAddress) {
      openNewAddressForm();
      return;
    }

    const isAddressTarget =
      location.hash === "#manage-address" ||
      location.hash === "#addresses" ||
      location.search.includes("section=address") ||
      location.state?.targetSection === "manage-address";

    if (isAddressTarget) {
      const scrollToAddress = () => {
        const el = document.getElementById("manage-address");
        if (el) {
          const navOffset = 140;
          const elementPosition = el.getBoundingClientRect().top + window.pageYOffset;
          window.scrollTo({
            top: Math.max(0, elementPosition - navOffset),
            behavior: "smooth"
          });
          el.classList.add("my-account-panel-highlight");
          setTimeout(() => {
            el.classList.remove("my-account-panel-highlight");
          }, 2500);
        }
      };

      const timer1 = setTimeout(scrollToAddress, 100);
      const timer2 = setTimeout(scrollToAddress, 400);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [location.hash, location.search, location.state, addresses]);

  useEffect(() => {
    const handleCustomEdit = (e) => {
      const idx = e.detail?.index;
      if (idx !== undefined && idx !== null && addresses && addresses[idx]) {
        editAddress(Number(idx));
      }
    };
    const handleCustomAdd = () => {
      openNewAddressForm();
    };
    const handleCustomLocation = () => {
      openNewAddressForm();
      handleUseCurrentLocation();
    };
    window.addEventListener("editAccountAddress", handleCustomEdit);
    window.addEventListener("addNewAccountAddress", handleCustomAdd);
    window.addEventListener("useCurrentLocationAccountAddress", handleCustomLocation);
    return () => {
      window.removeEventListener("editAccountAddress", handleCustomEdit);
      window.removeEventListener("addNewAccountAddress", handleCustomAdd);
      window.removeEventListener("useCurrentLocationAccountAddress", handleCustomLocation);
    };
  }, [addresses]);

  // Profile Edit states (separated for Personal Information vs Login & Security)
  const [editingSection, setEditingSection] = useState(null); // 'personal' | 'security' | null
  const [profileName, setProfileName] = useState(user?.name || "");
  const [profileEmail, setProfileEmail] = useState(user?.email || "");
  const [profilePhone, setProfilePhone] = useState(user?.phone || "");
  const [profilePassword, setProfilePassword] = useState("");
  const [profilePasswordConfirm, setProfilePasswordConfirm] = useState("");
  const [showProfilePassword, setShowProfilePassword] = useState(false);
  const [showProfileConfirmPassword, setShowProfileConfirmPassword] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Store WhatsApp settings
  const [whatsappSettings, setWhatsappSettings] = useState(null);

  useEffect(() => {
    let active = true;
    const fetchSettings = () => {
      axios
        .get("/api/settings/public")
        .then((res) => {
          if (active && res.data?.whatsappSettings) {
            setWhatsappSettings(res.data.whatsappSettings);
          }
        })
        .catch(() => {});
    };
    fetchSettings();
    window.addEventListener("siteSettingsUpdated", fetchSettings);
    return () => {
      active = false;
      window.removeEventListener("siteSettingsUpdated", fetchSettings);
    };
  }, []);

  const isOtpRequired = Boolean(
    whatsappSettings?.mode === "api" && whatsappSettings?.enableOtpVerification !== false
  );

  // WhatsApp OTP verification states for profile
  const [isPhoneOtpModalOpen, setIsPhoneOtpModalOpen] = useState(false);
  const [isProfilePhoneVerified, setIsProfilePhoneVerified] = useState(true);
  const [phoneVerificationToken, setPhoneVerificationToken] = useState("");

  const pwdStrength = useMemo(() => getPasswordStrength(profilePassword), [profilePassword]);

  const userInitials = useMemo(() => {
    if (user?.name && user.name.trim()) {
      const parts = user.name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return parts[0].slice(0, 2).toUpperCase();
    }
    if (user?.email && user.email.trim()) {
      return user.email.slice(0, 2).toUpperCase();
    }
    return "DS";
  }, [user?.name, user?.email]);

  const handleScrollToAddresses = (e) => {
    if (e) e.preventDefault();
    const el = document.getElementById("manage-address");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("my-account-panel-highlight");
      setTimeout(() => {
        el.classList.remove("my-account-panel-highlight");
      }, 2000);
    }
  };

  useEffect(() => {
    if (user) {
      setProfileName(user.name || "");
      setProfileEmail(user.email || "");
      setProfilePhone(user.phone || "");
      setIsProfilePhoneVerified(true);
      setPhoneVerificationToken("");
    }
  }, [user]);

  const handleProfileOtpVerified = ({ phone: verifiedPhone, phoneVerificationToken: token }) => {
    setIsProfilePhoneVerified(true);
    setPhoneVerificationToken(token);
    setProfilePhone(verifiedPhone);
    setProfileError("");
  };

  const resetProfileForms = () => {
    setEditingSection(null);
    setProfileName(user?.name || "");
    setProfileEmail(user?.email || "");
    setProfilePhone(user?.phone || "");
    setProfilePassword("");
    setProfilePasswordConfirm("");
    setShowProfilePassword(false);
    setShowProfileConfirmPassword(false);
    setProfileError("");
  };

  const handlePersonalSave = async (e) => {
    e.preventDefault();
    setProfileMessage("");
    setProfileError("");

    const cleanName = String(profileName || "").trim();
    const cleanPhone = String(profilePhone || "").trim();

    if (!cleanName) {
      setProfileError("Full Name is required.");
      return;
    }

    let validatedPhone = "";
    if (cleanPhone) {
      const phoneValidation = validatePhoneNumber(cleanPhone);
      if (!phoneValidation.isValid) {
        setProfileError(phoneValidation.message);
        return;
      }
      validatedPhone = phoneValidation.cleanPhone;

      if (isOtpRequired && cleanPhone !== (user?.phone || "") && !isProfilePhoneVerified) {
        setIsPhoneOtpModalOpen(true);
        return;
      }
    }

    setIsSavingProfile(true);
    try {
      const res = await axios.put(
        "/api/auth/profile",
        {
          name: cleanName,
          phone: validatedPhone || cleanPhone,
          phoneVerificationToken: isProfilePhoneVerified && phoneVerificationToken ? phoneVerificationToken : undefined
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (res.data?.success) {
        updateProfileState(res.data);
        setProfileMessage("Personal details updated successfully!");
        setEditingSection(null);
        setIsProfilePhoneVerified(true);
        setPhoneVerificationToken("");
      } else {
        setProfileError("Failed to update personal details.");
      }
    } catch (err) {
      console.error(err);
      setProfileError(err.response?.data?.message || "Failed to update personal details.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSecuritySave = async (e) => {
    e.preventDefault();
    setProfileMessage("");
    setProfileError("");

    const cleanEmail = String(profileEmail || "").trim();

    if (!cleanEmail) {
      setProfileError("Email Address is required.");
      return;
    }

    if (!profilePassword) {
      setProfileError("Please enter a new password.");
      return;
    }

    if (profilePassword.startsWith(" ") || profilePassword.endsWith(" ")) {
      setProfileError("Password cannot start or end with a space.");
      return;
    }
    if (profilePassword.trim().length < 8) {
      setProfileError("Password must be at least 8 characters long.");
      return;
    }
    if (!/[A-Za-z]/.test(profilePassword) || !/\d/.test(profilePassword)) {
      setProfileError("Password must contain at least one letter and one number.");
      return;
    }
    if (profilePassword !== profilePasswordConfirm) {
      setProfileError("Passwords do not match.");
      return;
    }

    setIsSavingProfile(true);
    try {
      const res = await axios.put(
        "/api/auth/profile",
        {
          email: cleanEmail,
          password: profilePassword
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (res.data?.success) {
        updateProfileState(res.data);
        setProfileMessage("Password and security settings updated successfully!");
        setProfilePassword("");
        setProfilePasswordConfirm("");
        setShowProfilePassword(false);
        setShowProfileConfirmPassword(false);
        setEditingSection(null);
      } else {
        setProfileError("Failed to update security settings.");
      }
    } catch (err) {
      console.error(err);
      setProfileError(err.response?.data?.message || "Failed to update security settings.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (
      params.get("editAddress") ||
      params.get("addNewAddress") === "true" ||
      params.get("useCurrentLocation") === "true" ||
      params.get("action") === "add-address" ||
      params.get("action") === "use-current-location" ||
      location.state?.action === "add-address" ||
      location.state?.action === "use-current-location"
    ) {
      return;
    }
    const shouldOpenAddressForm = params.get("openAddressForm") === "1";
    const shouldScrollToAddresses = location.hash === "#manage-address" || shouldOpenAddressForm;

    if (!shouldOpenAddressForm && !shouldScrollToAddresses) return;

    if (shouldOpenAddressForm) {
      setEditingIndex(null);
      setShowAddressForm(true);
    }

    window.requestAnimationFrame(() => {
      document.getElementById("manage-address")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [location.hash, location.search]);

  useEffect(() => {
    if (!token) return;

    let active = true;
    axios
      .get("/api/orders/my", {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then((res) => {
        if (!active) return;
        setOrders(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        if (!active) return;
        setOrders([]);
      });

    return () => {
      active = false;
    };
  }, [token]);

  const orderSummary = useMemo(() => {
    const delivered = orders.filter((order) => String(order?.status || "").toLowerCase() === "delivered").length;
    const open = orders.filter((order) => {
      const status = String(order?.status || "").toLowerCase();
      return status && status !== "delivered";
    }).length;
    const latestOrder = orders[0] || null;

    return {
      total: orders.length,
      delivered,
      open,
      latestOrder
    };
  }, [orders]);

  const manageTiles = [
    {
      eyebrow: "Orders & Invoices",
      title: "Your Orders",
      text: "Track packages, view order history, initiate returns, and download tax invoices.",
      meta: `${orderSummary.total} total orders`,
      link: "/my-orders",
      action: "View orders",
      icon: Package,
      iconTheme: "orders"
    },
    {
      eyebrow: "Shipping Locations",
      title: "Address Book",
      text: "Add, edit, or set default delivery addresses for 1-click checkout.",
      meta: `${addresses.length} saved ${addresses.length === 1 ? "address" : "addresses"}`,
      link: "#manage-address",
      action: "Manage addresses",
      icon: MapPin,
      iconTheme: "address",
      onClick: handleScrollToAddresses
    },
    {
      eyebrow: "Account Security",
      title: "Login & Security",
      text: "Update name, contact email, mobile number, and password credentials.",
      meta: user?.email || "Account credentials",
      link: "#account-details",
      action: "Edit credentials",
      icon: ShieldCheck,
      iconTheme: "security",
      onClick: () => {
        setEditingSection("security");
        setProfileMessage("");
        setProfileError("");
        setTimeout(() => {
          const el = document.getElementById("account-details");
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            const targetInput = el.querySelector("input[type='password']") || el.querySelector("input");
            if (targetInput) targetInput.focus();
          }
        }, 80);
      }
    },
    {
      eyebrow: "Digital Content",
      title: "Digital Library",
      text: "Access your purchased digital books, interactive flipbooks, and learning material.",
      meta: "Your digital content",
      link: "/my-library",
      action: "Open library",
      icon: BookOpen,
      iconTheme: "library"
    },
    {
      eyebrow: "Credits & Offers",
      title: "Gift Cards & Vouchers",
      text: "Redeem gift vouchers, check credit balance, and apply promotional discounts.",
      meta: "Redeem gift code",
      link: "/redeem-gift",
      action: "Redeem voucher",
      icon: Gift,
      iconTheme: "gift"
    },
    {
      eyebrow: "Saved For Later",
      title: "Saved Wishlist",
      text: "Revisit items you love and keep track of availability and special discounts.",
      meta: `${wishlist.length} saved ${wishlist.length === 1 ? "item" : "items"}`,
      link: "/wishlist",
      action: "Open wishlist",
      icon: Heart,
      iconTheme: "wishlist"
    }
  ];

  if (user?.isAdmin) {
    manageTiles.push({
      eyebrow: "Store Administration",
      title: "Admin Console",
      text: "Manage store catalog, warehouse inventory, user accounts, and financial analytics.",
      meta: "Administrator workspace",
      link: "/admin",
      action: "Open console",
      icon: LayoutDashboard,
      iconTheme: "admin"
    });
  }



  const saveAddress = async () => {
    const errors = {};
    const digits = String(phone || "").replace(/\D/g, "");
    const cleanPhone = String(phone || "").trim();
    const cleanName = String(name || "").trim();
    const cleanAddress = String(address || "").trim();
    const cleanLandmark = String(landmark || "").trim();
    const cleanCity = String(city || "").trim();
    const cleanState = String(state || "").trim();
    const cleanPincode = String(pincode || "").trim();
    const cleanCountry = String(country || "").trim();

    if (!cleanName) errors.name = "Full Name is required.";
    if (!cleanAddress) errors.address = "Complete Address is required.";
    if (!cleanCity) errors.city = "City is required.";
    if (!cleanState) errors.state = "State is required.";
    if (!cleanCountry) errors.country = "Country is required.";

    const phoneData = getCountryPhoneData(phoneCountry || cleanCountry);
    let fullPhoneToSave = cleanPhone;
    if (cleanPhone) {
      if (phoneData.code !== "+91" && !cleanPhone.startsWith("+")) {
        fullPhoneToSave = `${phoneData.code} ${cleanPhone}`;
      }
    }

    const phoneValidation = validatePhoneNumber(fullPhoneToSave, cleanCountry || phoneCountry);
    if (!phoneValidation.isValid) {
      errors.phone = phoneValidation.message;
    }

    if (!cleanPincode) {
      errors.pincode = "Postal code is required.";
    } else if (!/^[A-Za-z0-9\s-]{3,12}$/.test(cleanPincode)) {
      errors.pincode = "Enter a valid postal code (e.g. 560072 or 110001).";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setAddressError("Please fix the highlighted errors below.");
      return;
    }

    setFieldErrors({});
    setAddressError("");

    const existingAddress = editingIndex === null ? null : addresses[editingIndex] || null;
    const nextCoordinates = await fetchCoordinatesForAddress({
      address: cleanAddress,
      landmark: cleanLandmark,
      city: cleanCity,
      state: cleanState,
      pincode: cleanPincode,
      country: cleanCountry
    });

    const payload = {
      label: addressLabel,
      name: cleanName,
      phone: fullPhoneToSave || phoneValidation.cleanPhone || cleanPhone,
      address: cleanAddress,
      landmark: cleanLandmark,
      city: cleanCity,
      state: cleanState,
      pincode: cleanPincode,
      country: cleanCountry,
      latitude:
        nextCoordinates.latitude !== null
          ? nextCoordinates.latitude
          : existingAddress?.latitude ?? null,
      longitude:
        nextCoordinates.longitude !== null
          ? nextCoordinates.longitude
          : existingAddress?.longitude ?? null,
      isDefault: isDefaultAddress || addresses.length === 0
    };

    if (editingIndex === null) {
      addAddress(payload);
      showAddressToast("New delivery address added successfully!");
    } else {
      updateAddress(editingIndex, payload);
      showAddressToast("Address details updated successfully!");
    }

    resetAddressForm();
    setShowAddressForm(false);
    setAddressError("");
  };



  const deleteAddress = (index) => {
    const target = addresses[index];
    removeAddress(index);
    if (editingIndex === index) {
      resetAddressForm();
    }
    showAddressToast(`Address for ${target?.name || "recipient"} removed.`);
  };

  const handleSetDefaultAddress = (index) => {
    const target = addresses[index];
    setDefaultAddress(index);
    showAddressToast(`Default delivery address set to ${target?.name || "selected address"}.`);
  };

  return (
    <div className="my-account-page">
      <section className="my-account-header">
        <div className="my-account-hero-content">
          <div className="my-account-hero-identity">
            <div className="my-account-hero-avatar-ring">
              <div className="my-account-hero-avatar">
                {userInitials}
              </div>
              <span className="my-account-hero-pulse" title="Active Account" />
            </div>

            <div className="my-account-hero-details">
              <div className="my-account-hero-badges-row">
                <span className="my-account-pill-badge active">
                  <span className="pulse-dot" /> Active Account
                </span>
                {user?.isAdmin ? (
                  <span className="my-account-pill-badge admin">
                    <ShieldCheck size={12} /> Administrator
                  </span>
                ) : (
                  <span className="my-account-pill-badge customer">
                    <CheckCircle2 size={12} /> Verified Customer
                  </span>
                )}
              </div>

              <h1 className="my-account-hero-title">
                Hello, {user?.name || "Customer"}!
              </h1>
              <p className="my-account-subtitle">
                Manage your personal profile, addresses, digital library, and orders in one central hub.
              </p>

              <div className="my-account-hero-meta-row">
                {user?.email && (
                  <span className="my-account-hero-meta-item">
                    <Mail size={13} /> {user.email}
                  </span>
                )}
                {user?.phone && (
                  <span className="my-account-hero-meta-item">
                    <Phone size={13} /> {user.phone}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {orderSummary.open > 0 && (
          <div className="my-account-hero-open-orders-banner">
            <div className="my-account-hero-open-orders-icon">
              <Truck size={17} />
            </div>
            <div className="my-account-hero-open-orders-text">
              <strong>{orderSummary.open} {orderSummary.open === 1 ? "shipment" : "shipments"} on the way</strong>
              <span>Track live delivery progress directly in Your Orders.</span>
            </div>
            <Link to="/my-orders" className="my-account-hero-track-btn">
              Track Deliveries →
            </Link>
          </div>
        )}
      </section>

      <section className="my-account-section my-account-section-compact">
        <div className="my-account-section-head">
          <div>
            <p className="my-account-section-kicker">Account Services</p>
            <h2>Services & Settings</h2>
          </div>
        </div>

        <div className="my-account-tile-grid">
          {manageTiles.map((tile) => {
            const IconComp = tile.icon || Package;
            const cardContent = (
              <>
                <div className={`my-account-tile-icon theme-${tile.iconTheme || "orders"}`} aria-hidden="true">
                  <IconComp size={20} />
                </div>
                <div className="my-account-tile-copy">
                  <p className="my-account-tile-eyebrow">{tile.eyebrow}</p>
                  <h3>{tile.title}</h3>
                  <p>{tile.text}</p>
                  <div className="my-account-tile-footer">
                    <span title={tile.meta}>{tile.meta}</span>
                    <strong className="my-account-tile-action-link">
                      {tile.action} <ChevronRight size={14} className="my-account-tile-arrow" />
                    </strong>
                  </div>
                </div>
              </>
            );

            if (tile.onClick) {
              return (
                <div
                  key={tile.title}
                  role="button"
                  tabIndex={0}
                  onClick={tile.onClick}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      tile.onClick();
                    }
                  }}
                  className="my-account-tile"
                >
                  {cardContent}
                </div>
              );
            }

            return (
              <Link key={tile.title} to={tile.link} className="my-account-tile">
                {cardContent}
              </Link>
            );
          })}
        </div>
      </section>

      <section id="account-details" className="my-account-panel my-account-panel-compact my-account-profile-panel">
        <div className="my-account-panel-head">
          <div>
            <p className="my-account-section-kicker">Profile & Credentials</p>
            <h2>Account details</h2>
            <p className="my-account-section-sub">
              Manage your personal identity, contact phone number, and login credentials.
            </p>
          </div>
          <div className="my-account-panel-head-actions">
            <span className="my-account-status-badge">
              <span className="my-account-pulse-dot" />
              Active Account
            </span>
          </div>
        </div>

        {profileMessage && (
          <div className="my-account-profile-success-msg">
            <CheckCircle2 size={16} />
            <span>{profileMessage}</span>
            <button
              type="button"
              className="my-account-toast-dismiss"
              onClick={() => setProfileMessage("")}
              aria-label="Dismiss message"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div className="my-account-cards-grid">
          {/* Card 1: Personal Information */}
          <div className={`my-account-info-card ${editingSection === "personal" ? "is-editing" : ""}`}>
            <div className="my-account-card-header">
              <div className="my-account-card-title-wrap">
                <div className="my-account-avatar-wrap">
                  {userInitials}
                </div>
                <div>
                  <h4>Personal Information</h4>
                  <span className="my-account-card-sublabel">Identity & Contact</span>
                </div>
              </div>
              {editingSection === "personal" ? (
                <button
                  type="button"
                  className="my-account-card-close-btn"
                  title="Close edit form"
                  onClick={resetProfileForms}
                >
                  <X size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  className="my-account-card-edit-btn"
                  title="Edit Personal Information"
                  onClick={() => {
                    setEditingSection("personal");
                    setProfileMessage("");
                    setProfileError("");
                    setTimeout(() => {
                      const el = document.getElementById("profile-name-input");
                      if (el) el.focus();
                    }, 80);
                  }}
                >
                  <Edit3 size={14} /> Edit
                </button>
              )}
            </div>

            {editingSection === "personal" ? (
              <form onSubmit={handlePersonalSave} className="my-account-card-edit-form">
                <div className="my-account-form-fields-stack">
                  <label className="my-account-form-field">
                    <span className="my-account-input-label">
                      Full Name <strong className="required-star">*</strong>
                    </span>
                    <div className="my-account-input-with-icon">
                      <User size={16} className="my-account-input-icon" />
                      <input
                        id="profile-name-input"
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        placeholder="Enter your full name"
                        required
                      />
                    </div>
                  </label>

                  <label className="my-account-form-field">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span className="my-account-input-label" style={{ marginBottom: 0 }}>
                        Phone Number
                      </span>
                      {isOtpRequired && (isProfilePhoneVerified || (profilePhone && profilePhone === user?.phone)) ? (
                        <span className="my-account-phone-verified-tag">
                          <CheckCircle2 size={12} /> WhatsApp Verified
                        </span>
                      ) : null}
                    </div>
                    <div className="my-account-phone-field-row">
                      <div className="my-account-phone-input-group">
                        <span className="my-account-phone-prefix">🇮🇳 +91</span>
                        <input
                          id="profile-phone-input"
                          type="tel"
                          maxLength={15}
                          value={profilePhone}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^\d+]/g, "");
                            setProfilePhone(val);
                            if (val !== (user?.phone || "")) {
                              setIsProfilePhoneVerified(false);
                              setPhoneVerificationToken("");
                            } else {
                              setIsProfilePhoneVerified(true);
                            }
                          }}
                          placeholder="9876543210"
                        />
                      </div>
                      {isOtpRequired && profilePhone && profilePhone !== (user?.phone || "") && !isProfilePhoneVerified && (
                        <button
                          type="button"
                          className="my-account-verify-wa-btn"
                          onClick={() => {
                            const validation = validatePhoneNumber(profilePhone);
                            if (!validation.isValid) {
                              setProfileError(validation.message);
                              return;
                            }
                            setProfileError("");
                            setIsPhoneOtpModalOpen(true);
                          }}
                          title="Verify phone number via WhatsApp OTP"
                        >
                          <MessageCircle size={14} /> Verify
                        </button>
                      )}
                    </div>
                    <small className="my-account-input-hint">Used for order delivery updates & WhatsApp alerts.</small>
                  </label>
                </div>

                {profileError && (
                  <div className="my-account-form-error-alert">
                    <AlertCircle size={15} />
                    <span>{profileError}</span>
                  </div>
                )}

                <div className="my-account-card-form-actions">
                  <button type="submit" className="primary my-account-save-btn" disabled={isSavingProfile}>
                    {isSavingProfile ? "Saving..." : "Save Details"}
                  </button>
                  <button type="button" className="my-account-cancel-btn" onClick={resetProfileForms}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="my-account-card-rows">
                <div className="my-account-card-row">
                  <span className="my-account-card-field-label">Full Name</span>
                  <strong className="my-account-card-field-val">{user?.name || "Not provided"}</strong>
                </div>

                <div className="my-account-card-row">
                  <span className="my-account-card-field-label">Phone Number</span>
                  <div className="my-account-card-field-val-wrap">
                    {user?.phone ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <strong className="my-account-card-field-val">🇮🇳 +91 {user.phone.replace(/^91/, "")}</strong>
                        <span className="my-account-verified-badge" title="Phone verified on WhatsApp">
                          <CheckCircle2 size={12} /> WhatsApp
                        </span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="my-account-add-phone-btn"
                        onClick={() => {
                          setEditingSection("personal");
                          setProfileMessage("");
                          setProfileError("");
                          setTimeout(() => {
                            const el = document.getElementById("profile-phone-input");
                            if (el) el.focus();
                          }, 80);
                        }}
                      >
                        + Add phone number
                      </button>
                    )}
                  </div>
                </div>

                <div className="my-account-card-row">
                  <span className="my-account-card-field-label">Primary Address</span>
                  <div className="my-account-card-field-val-wrap">
                    <strong className="my-account-card-field-val" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <MapPin size={13} className="text-sky" />
                      {addresses.length > 0
                        ? `${addresses[0].city || "Saved"}, ${addresses[0].state || "India"}`
                        : "No address saved"}
                    </strong>
                    <button
                      type="button"
                      className="my-account-address-link"
                      onClick={handleScrollToAddresses}
                      title="Scroll to manage delivery addresses"
                    >
                      Manage addresses ↓
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Login & Security */}
          <div className={`my-account-info-card ${editingSection === "security" ? "is-editing" : ""}`}>
            <div className="my-account-card-header">
              <div className="my-account-card-title-wrap">
                <div className="my-account-security-icon-wrap">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h4>Login & Security</h4>
                  <span className="my-account-card-sublabel">Credentials & Access</span>
                </div>
              </div>
              {editingSection === "security" ? (
                <button
                  type="button"
                  className="my-account-card-close-btn"
                  title="Close edit form"
                  onClick={resetProfileForms}
                >
                  <X size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  className="my-account-card-edit-btn"
                  title="Edit Security Settings"
                  onClick={() => {
                    setEditingSection("security");
                    setProfileMessage("");
                    setProfileError("");
                    setTimeout(() => {
                      const el = document.getElementById("profile-password-input");
                      if (el) el.focus();
                    }, 80);
                  }}
                >
                  <KeyRound size={14} /> Edit
                </button>
              )}
            </div>

            {editingSection === "security" ? (
              <form onSubmit={handleSecuritySave} className="my-account-card-edit-form">
                <div className="my-account-form-fields-stack">
                  <label className="my-account-form-field">
                    <span className="my-account-input-label">
                      Email Address <strong className="required-star">*</strong>
                    </span>
                    <div className="my-account-input-with-icon">
                      <Mail size={16} className="my-account-input-icon" />
                      <input
                        id="profile-email-input"
                        type="email"
                        value={profileEmail}
                        onChange={(e) => setProfileEmail(e.target.value)}
                        placeholder="name@example.com"
                        required
                      />
                    </div>
                  </label>

                  <label className="my-account-form-field">
                    <span className="my-account-input-label">
                      New Password <strong className="required-star">*</strong>
                    </span>
                    <div className="password-input-wrapper">
                      <input
                        id="profile-password-input"
                        type={showProfilePassword ? "text" : "password"}
                        value={profilePassword}
                        onChange={(e) => setProfilePassword(e.target.value)}
                        placeholder="At least 8 chars with letter & number"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => setShowProfilePassword((prev) => !prev)}
                        aria-label={showProfilePassword ? "Hide password" : "Show password"}
                      >
                        {showProfilePassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>

                    {profilePassword ? (
                      <div className="my-account-pwd-strength-wrap">
                        <div className="my-account-pwd-bars">
                          {[1, 2, 3, 4].map((step) => (
                            <div
                              key={step}
                              className={`my-account-pwd-bar ${pwdStrength.score >= step ? "active" : ""}`}
                              style={{
                                backgroundColor: pwdStrength.score >= step ? pwdStrength.color : "#e2e8f0"
                              }}
                            />
                          ))}
                        </div>
                        <div className="my-account-pwd-header-row">
                          <span className="my-account-pwd-label" style={{ color: pwdStrength.color }}>
                            Strength: {pwdStrength.label}
                          </span>
                        </div>
                        <div className="my-account-pwd-checklist">
                          <span className={`my-account-pwd-check-item ${profilePassword.length >= 8 ? "met" : ""}`}>
                            <CheckCircle2 size={12} /> 8+ characters
                          </span>
                          <span className={`my-account-pwd-check-item ${/[a-z]/.test(profilePassword) && /[A-Z]/.test(profilePassword) ? "met" : ""}`}>
                            <CheckCircle2 size={12} /> Upper & lowercase
                          </span>
                          <span className={`my-account-pwd-check-item ${/\d/.test(profilePassword) || /[^A-Za-z0-9]/.test(profilePassword) ? "met" : ""}`}>
                            <CheckCircle2 size={12} /> Number or symbol
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </label>

                  <label className="my-account-form-field">
                    <span className="my-account-input-label">
                      Confirm New Password <strong className="required-star">*</strong>
                    </span>
                    <div className="password-input-wrapper">
                      <input
                        type={showProfileConfirmPassword ? "text" : "password"}
                        value={profilePasswordConfirm}
                        onChange={(e) => setProfilePasswordConfirm(e.target.value)}
                        placeholder="Re-enter your new password"
                        disabled={!profilePassword}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => setShowProfileConfirmPassword((prev) => !prev)}
                        disabled={!profilePassword}
                        aria-label={showProfileConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                      >
                        {showProfileConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {profilePassword && profilePasswordConfirm ? (
                      <div className="my-account-match-status">
                        {profilePassword === profilePasswordConfirm ? (
                          <span className="text-emerald"><CheckCircle2 size={13} /> Passwords match</span>
                        ) : (
                          <span className="text-rose"><AlertCircle size={13} /> Passwords do not match</span>
                        )}
                      </div>
                    ) : null}
                  </label>
                </div>

                {profileError && (
                  <div className="my-account-form-error-alert">
                    <AlertCircle size={15} />
                    <span>{profileError}</span>
                  </div>
                )}

                <div className="my-account-card-form-actions">
                  <button type="submit" className="primary my-account-save-btn" disabled={isSavingProfile}>
                    {isSavingProfile ? "Updating..." : "Update Security"}
                  </button>
                  <button type="button" className="my-account-cancel-btn" onClick={resetProfileForms}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="my-account-card-rows">
                <div className="my-account-card-row">
                  <span className="my-account-card-field-label">Email Address</span>
                  <div className="my-account-card-field-val-wrap">
                    <strong className="my-account-card-field-val">{user?.email || "Not provided"}</strong>
                    <span className="my-account-verified-badge"><CheckCircle2 size={12} /> Verified</span>
                  </div>
                </div>

                <div className="my-account-card-row">
                  <span className="my-account-card-field-label">Password</span>
                  <div className="my-account-card-field-val-wrap">
                    <span className="my-account-password-dots">••••••••••••</span>
                    <button
                      type="button"
                      className="my-account-card-action-btn"
                      onClick={() => {
                        setEditingSection("security");
                        setProfileMessage("");
                        setProfileError("");
                        setTimeout(() => {
                          const el = document.getElementById("profile-password-input");
                          if (el) el.focus();
                        }, 80);
                      }}
                    >
                      Change
                    </button>
                  </div>
                </div>

                <div className="my-account-card-row">
                  <span className="my-account-card-field-label">Account Role</span>
                  <div className="my-account-card-field-val-wrap">
                    <span className={`my-account-role-badge ${user?.isAdmin ? "admin" : "customer"}`}>
                      {user?.isAdmin ? "Administrator" : "Customer"}
                    </span>
                  </div>
                </div>

                <div className="my-account-card-row">
                  <span className="my-account-card-field-label">Login Security</span>
                  <div className="my-account-card-field-val-wrap">
                    <span className="my-account-security-status-tag">
                      <Lock size={12} />
                      {isOtpRequired ? "WhatsApp 2-Step OTP Protected" : "Password Protected"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section id="manage-address" className="my-account-panel my-account-panel-compact my-account-address-panel">
        <div className="my-account-panel-head">
          <div>
            <p className="my-account-section-kicker">Address Book</p>
            <h2>Manage addresses</h2>
          </div>
          <div className="my-account-panel-head-actions">
            {showAddressForm ? (
              <button
                type="button"
                className="my-account-inline-link my-account-inline-btn"
                onClick={closeAddressForm}
              >
                <X size={14} /> Close Form
              </button>
            ) : null}
            <button
              type="button"
              className="my-account-inline-link my-account-inline-btn primary-tint"
              onClick={openNewAddressForm}
            >
              <MapPin size={14} /> Add New Address
            </button>
          </div>
        </div>

        {addressToast && (
          <div className="my-account-address-toast">
            <CheckCircle2 size={16} />
            <span>{addressToast}</span>
            <button
              type="button"
              className="my-account-toast-dismiss"
              onClick={() => setAddressToast("")}
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {isLoadingAddresses ? (
          <LoadingSpinner text="Loading saved addresses..." minHeight="160px" />
        ) : addresses.length > 0 ? (
          <div className="my-account-address-cards-grid">
            {addresses.map((item, index) => {
              const isEditingThisCard = editingIndex === index && showAddressForm;

              return (
                <div
                  key={`${item.name}-${item.pincode}-${index}`}
                  id={`my-account-addr-card-${index}`}
                  className={`my-account-addr-card ${isEditingThisCard ? "editing-active" : ""}`}
                >
                  <div className="my-account-addr-card-head">
                    <div className="my-account-addr-title-group">
                      <span className={`my-account-addr-label-tag ${(item.label || "Home").toLowerCase()}`}>
                        {item.label === "Work" ? "🏢 Work" : item.label === "Other" ? "📍 Other" : "🏠 Home"}
                      </span>
                      <strong className="my-account-addr-recipient">{item.name || "Recipient"}</strong>
                    </div>
                    {item.isDefault ? (
                      <span className="my-account-default-badge">
                        <CheckCircle2 size={12} /> Default
                      </span>
                    ) : null}
                  </div>

                  <div className="my-account-addr-card-body">
                    <div className="my-account-addr-row">
                      <Phone size={14} className="my-account-addr-icon" />
                      <span>{item.phone || "No phone added"}</span>
                    </div>
                    <div className="my-account-addr-row">
                      <MapPin size={14} className="my-account-addr-icon" />
                      <span>
                        {item.address}
                        {item.landmark ? ` (Landmark: ${item.landmark})` : ""}
                      </span>
                    </div>
                    <p className="my-account-addr-city-line">
                      {[item.city, item.state, item.pincode, item.country].filter(Boolean).join(", ")}
                    </p>
                  </div>

                  <div className="my-account-addr-card-footer">
                    <div className="my-account-addr-action-btns">
                      <button
                        type="button"
                        className="my-account-addr-btn"
                        title="Copy full address"
                        onClick={() => copyAddressToClipboard(item, index)}
                      >
                        {copiedAddressIndex === index ? (
                          <>
                            <CheckCircle2 size={13} className="text-emerald" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy size={13} /> Copy
                          </>
                        )}
                      </button>

                      {isEditingThisCard ? (
                        <button
                          type="button"
                          className="my-account-addr-cancel-edit-btn"
                          onClick={() => {
                            resetAddressForm();
                            setShowAddressForm(false);
                            setAddressError("");
                          }}
                        >
                          <X size={13} /> Cancel
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="my-account-addr-btn"
                          onClick={() => editAddress(index)}
                        >
                          <Edit3 size={13} /> Edit
                        </button>
                      )}

                      <button
                        type="button"
                        className="my-account-addr-btn danger"
                        onClick={() => setAddressToDelete({ index, address: item })}
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>

                    {!item.isDefault ? (
                      <button
                        type="button"
                        className="my-account-set-default-btn"
                        onClick={() => handleSetDefaultAddress(index)}
                      >
                        Set as Default
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="my-account-empty-address-card">
            <div className="my-account-empty-icon-wrap">
              <MapPin size={32} />
            </div>
            <h4>No saved delivery addresses</h4>
            <p>Add your home or office address for fast, 1-click checkout on all your orders.</p>
            <button
              type="button"
              className="primary my-account-empty-add-btn"
              onClick={openNewAddressForm}
            >
              ➕ Add Delivery Address
            </button>
          </div>
        )}

        {showAddressForm ? (
          <div ref={addressFormRef} className="my-account-address-form-wrapper">
            <div className="my-account-address-form-header">
              <div className="my-account-address-form-title-group">
                <div className="my-account-form-icon-badge">
                  <MapPin size={22} />
                </div>
                <div>
                  <h3>
                    {editingIndex !== null
                      ? `Edit Delivery Address (${addresses[editingIndex]?.name || name || "Address"})`
                      : "Add New Delivery Address"}
                  </h3>
                  <p className="my-account-form-subtitle">
                    {editingIndex !== null
                      ? "Update your recipient and location details below."
                      : "Add your full shipping details for seamless, 1-click checkout."}
                  </p>
                </div>
              </div>
              <div className="my-account-address-head-actions">
                {enableCurrentLocation && (
                  <button
                    type="button"
                    className="my-account-loc-autofill-btn"
                    onClick={handleUseCurrentLocation}
                    disabled={isDetectingLocation}
                  >
                    <Compass size={14} className={isDetectingLocation ? "spin" : ""} />
                    <span>{isDetectingLocation ? "Detecting GPS..." : "Autofill via Location"}</span>
                  </button>
                )}
                <button
                  type="button"
                  className="my-account-form-close-btn"
                  onClick={closeAddressForm}
                  aria-label="Close address form"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {locationStatusMessage ? (
              <p className="my-account-loc-status-msg">
                <Sparkles size={14} /> {locationStatusMessage}
              </p>
            ) : null}

            {/* Address Type Selector */}
            <div className="my-account-address-type-box">
              <span className="my-account-field-heading">Address Type</span>
              <div className="my-account-type-chips">
                {[
                  { key: "Home", icon: "🏠", label: "Home", desc: "All day delivery" },
                  { key: "Work", icon: "🏢", label: "Work / Office", desc: "10 AM - 6 PM" },
                  { key: "Other", icon: "📍", label: "Other", desc: "Specific timing" }
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`my-account-type-chip ${addressLabel === item.key ? "active" : ""}`}
                    onClick={() => setAddressLabel(item.key)}
                  >
                    <span className="my-account-chip-icon">{item.icon}</span>
                    <div className="my-account-chip-copy">
                      <strong>{item.label}</strong>
                      <small>{item.desc}</small>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="my-account-address-form-body">
              {/* Section 1: Contact Details */}
              <div className="my-account-form-card">
                <div className="my-account-form-card-header">
                  <User size={16} className="my-account-form-card-icon" />
                  <h4>Contact Details</h4>
                </div>
                <div className="my-account-form-grid">
                  <label>
                    <span className="my-account-input-label">
                      Full Name <strong className="required-star">*</strong>
                    </span>
                    <div className="my-account-input-with-icon">
                      <User size={16} className="my-account-input-icon" />
                      <input
                        ref={nameInputRef}
                        value={name}
                        className={fieldErrors.name ? "invalid-input" : ""}
                        onChange={(e) => {
                          setName(e.target.value);
                          if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: "" }));
                        }}
                        placeholder="e.g. Rahul Sharma"
                        required
                      />
                    </div>
                    {fieldErrors.name && <span className="my-account-inline-error">⚠️ {fieldErrors.name}</span>}
                  </label>

                  <label>
                    <span className="my-account-input-label">
                      Mobile / Phone Number <strong className="required-star">*</strong>
                    </span>
                    <div className={`my-account-phone-input-group ${fieldErrors.phone ? "invalid-input" : ""}`}>
                      <div className="my-account-phone-prefix-wrap" title="Click to change country calling code">
                        <span className="my-account-phone-prefix-display">
                          <span>{currentPhoneData.flag}</span>
                          <span>{currentPhoneData.code}</span>
                          <ChevronDown size={13} className="my-account-phone-chevron" />
                        </span>
                        <select
                          className="my-account-phone-select-overlay"
                          value={phoneCountry}
                          onChange={(e) => handlePhoneCountryChange(e.target.value)}
                          aria-label="Select Country Phone Code"
                        >
                          {COUNTRY_PHONE_CODES.map((item) => (
                            <option key={`${item.country}-${item.code}`} value={item.country}>
                              {item.flag} {item.code} - {item.country}
                            </option>
                          ))}
                        </select>
                      </div>
                      <input
                        type="tel"
                        maxLength={16}
                        value={phone}
                        onChange={(e) => {
                          setPhone(e.target.value.replace(/[^\d+\s-]/g, ""));
                          if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: "" }));
                        }}
                        placeholder={currentPhoneData.placeholder || "Enter phone number"}
                        required
                      />
                    </div>
                    {fieldErrors.phone && <span className="my-account-inline-error">⚠️ {fieldErrors.phone}</span>}
                  </label>
                </div>
              </div>

              {/* Section 2: Address Details */}
              <div className="my-account-form-card">
                <div className="my-account-form-card-header">
                  <MapPin size={16} className="my-account-form-card-icon" />
                  <h4>Address Information</h4>
                </div>
                <div className="my-account-form-grid">
                  <label className="my-account-form-full-width">
                    <span className="my-account-input-label">
                      Flat, House No., Building, Street, Area <strong className="required-star">*</strong>
                    </span>
                    <div className="my-account-input-with-icon textarea-wrap">
                      <MapPin size={16} className="my-account-input-icon textarea-icon" />
                      <textarea
                        value={address}
                        rows={2}
                        className={fieldErrors.address ? "invalid-input" : ""}
                        onChange={(e) => {
                          setAddress(e.target.value);
                          if (fieldErrors.address) setFieldErrors((prev) => ({ ...prev, address: "" }));
                        }}
                        placeholder="e.g. #934/S, 2nd Cross, 25th Main, Near Sankranthi Circle, Hebbal"
                        required
                      />
                    </div>
                    {fieldErrors.address && <span className="my-account-inline-error">⚠️ {fieldErrors.address}</span>}
                  </label>

                  <label>
                    <span className="my-account-input-label">Landmark (Optional)</span>
                    <div className="my-account-input-with-icon">
                      <Navigation size={16} className="my-account-input-icon" />
                      <input
                        value={landmark}
                        onChange={(e) => setLandmark(e.target.value)}
                        placeholder="e.g. Near Metro Station / Park"
                      />
                    </div>
                  </label>

                  <label>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span className="my-account-input-label" style={{ marginBottom: 0 }}>
                        PIN Code <strong className="required-star">*</strong>
                      </span>
                      {isDetectingPincode ? (
                        <span className="my-account-pincode-detecting">Detecting city & state...</span>
                      ) : null}
                    </div>
                    <div className="my-account-input-with-icon">
                      <Hash size={16} className="my-account-input-icon" />
                      <input
                        value={pincode}
                        maxLength={10}
                        className={fieldErrors.pincode ? "invalid-input" : ""}
                        onChange={(e) => handlePincodeChange(e.target.value)}
                        placeholder="e.g. 560017"
                        required
                      />
                    </div>
                    {pincodeLookupMsg && (
                      <span className="my-account-pincode-success">
                        <CheckCircle2 size={12} /> {pincodeLookupMsg}
                      </span>
                    )}
                    {fieldErrors.pincode && <span className="my-account-inline-error">⚠️ {fieldErrors.pincode}</span>}
                  </label>

                  <label>
                    <span className="my-account-input-label">
                      Country <strong className="required-star">*</strong>
                    </span>
                    <div className="my-account-input-with-icon">
                      <Globe size={16} className="my-account-input-icon" />
                      <select
                        value={country}
                        className={fieldErrors.country ? "invalid-input" : ""}
                        onChange={(e) => handleCountryChange(e.target.value)}
                        required
                      >
                        {COUNTRIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    {fieldErrors.country && <span className="my-account-inline-error">⚠️ {fieldErrors.country}</span>}
                  </label>

                  <label>
                    <span className="my-account-input-label">
                      State / UT <strong className="required-star">*</strong>
                    </span>
                    <div className="my-account-input-with-icon">
                      <Compass size={16} className="my-account-input-icon" />
                      {availableStates.length > 0 ? (
                        <select
                          value={state}
                          className={fieldErrors.state ? "invalid-input" : ""}
                          onChange={(e) => handleStateChange(e.target.value)}
                          required
                        >
                          <option value="">Select State / UT</option>
                          {availableStates.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={state}
                          className={fieldErrors.state ? "invalid-input" : ""}
                          onChange={(e) => handleStateChange(e.target.value)}
                          placeholder="Enter State / Province"
                          required
                        />
                      )}
                    </div>
                    {fieldErrors.state && <span className="my-account-inline-error">⚠️ {fieldErrors.state}</span>}
                  </label>

                  <label className="my-account-form-full-width">
                    <span className="my-account-input-label">
                      City / District <strong className="required-star">*</strong>
                    </span>
                    <div className="my-account-input-with-icon">
                      <Building size={16} className="my-account-input-icon" />
                      {availableDistricts.length > 0 ? (
                        <select
                          value={city}
                          className={fieldErrors.city ? "invalid-input" : ""}
                          onChange={(e) => handleCityChange(e.target.value)}
                          required
                        >
                          <option value="">Select City / District</option>
                          {availableDistricts.map((dst) => (
                            <option key={dst} value={dst}>
                              {dst}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={city}
                          className={fieldErrors.city ? "invalid-input" : ""}
                          onChange={(e) => handleCityChange(e.target.value)}
                          placeholder="Enter City / District"
                          required
                        />
                      )}
                    </div>
                    {fieldErrors.city && <span className="my-account-inline-error">⚠️ {fieldErrors.city}</span>}
                  </label>
                </div>
              </div>

              {/* Section 3: Default Address Checkbox */}
              <label className="my-account-checkbox-card">
                <input
                  type="checkbox"
                  checked={isDefaultAddress}
                  onChange={(e) => setIsDefaultAddress(e.target.checked)}
                />
                <div className="my-account-checkbox-copy">
                  <strong>Make this my default delivery address</strong>
                  <span>Used automatically for 1-click checkout and delivery estimates.</span>
                </div>
              </label>
            </div>

            {addressError && (
              <div className="my-account-form-error-alert">
                <AlertCircle size={16} />
                <span>{addressError}</span>
              </div>
            )}

            <div className="my-account-form-actions-bar">
              <button type="button" className="primary my-account-save-btn" onClick={saveAddress}>
                {editingIndex === null ? "Save Delivery Address" : "Update Delivery Address"}
              </button>
              <button
                type="button"
                className="my-account-cancel-btn"
                onClick={closeAddressForm}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {/* Delete Address Confirmation Popup Modal */}
        {addressToDelete !== null && (
          <div
            className="address-delete-modal-backdrop"
            onClick={() => setAddressToDelete(null)}
          >
            <div
              className="address-delete-modal-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="address-delete-modal-icon-wrap">
                <span>🗑️</span>
              </div>
              <h3 className="address-delete-modal-title">Delete Address?</h3>
              <p className="address-delete-modal-desc">
                Are you sure you want to delete this delivery address? This action cannot be undone.
              </p>

              {addressToDelete.address && (
                <div className="address-delete-preview-box">
                  <div style={{ fontWeight: 700, marginBottom: "3px" }}>
                    {addressToDelete.address.name} {addressToDelete.address.phone ? `(${addressToDelete.address.phone})` : ""}
                  </div>
                  <div>{addressToDelete.address.address}</div>
                  <div>
                    {[addressToDelete.address.city, addressToDelete.address.state, addressToDelete.address.pincode, addressToDelete.address.country].filter(Boolean).join(", ")}
                  </div>
                </div>
              )}

              <div className="address-delete-modal-actions">
                <button
                  type="button"
                  className="address-delete-btn-cancel"
                  onClick={() => setAddressToDelete(null)}
                >
                  Keep Address
                </button>
                <button
                  type="button"
                  className="address-delete-btn-confirm"
                  onClick={() => {
                    deleteAddress(addressToDelete.index);
                    setAddressToDelete(null);
                  }}
                >
                  Yes, Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <PushSubscribeSection token={token} />

      {/* WhatsApp OTP Verification Modal */}
      <WhatsAppOtpModal
        isOpen={isPhoneOtpModalOpen}
        phone={profilePhone}
        onClose={() => setIsPhoneOtpModalOpen(false)}
        onVerified={handleProfileOtpVerified}
      />
    </div>
  );
}

export default MyAccount;


