import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { useCart } from "../hooks/useCart";
import { useAuth } from "../hooks/useAuth";
import { useDeliveryLocation } from "../hooks/useDeliveryLocation";
import { convertCurrencyAmount, formatCurrencyExact, formatResolvedPrice } from "../utils/currency";
import { getDeliveryPricingDetails, isDigitalItem } from "../utils/deliveryPricing";
import { loadRazorpayCheckout } from "../utils/loadRazorpay";
import { getProductPriceDetails, isInternationalCountry, storePricingConfig } from "../utils/productPricing";
import { reverseGeocodeCoordinates, getCurrentDevicePosition } from "../utils/geoAddress";
import {
  ShieldCheck,
  Lock,
  ArrowLeft,
  ArrowRight,
  MapPin,
  Phone,
  Plus,
  Check,
  CheckCircle2,
  Tag,
  Gift,
  Truck,
  CreditCard,
  Zap,
  AlertCircle,
  Building,
  Home,
  Briefcase,
  User,
  Sparkles,
  ShoppingBag,
  ExternalLink,
  FileText,
  X
} from "lucide-react";
import "./Checkout.css";

const getAddressLocationText = (item) => {
  return [item?.city, item?.state, item?.pincode, item?.country].filter(Boolean).join(", ");
};

const getItemHsnSac = (item) => {
  if (item?.hsnSac) return String(item.hsnSac).trim();
  const name = String(item?.name || item?.product?.name || "").trim().toLowerCase();
  const category = String(item?.category || item?.product?.category || "").trim().toLowerCase();
  
  // E-books, Kindle books, Web versions, and Digital formats are taxed at 18% GST
  const isDigital = 
    category.includes("ebook") ||
    category.includes("e-book") ||
    category.includes("kindle") ||
    category.includes("web version") ||
    category.includes("web-version") ||
    category.includes("flipbook") ||
    name.includes("ebook") ||
    name.includes("e-book") ||
    name.includes("kindle") ||
    name.includes("web version") ||
    name.includes("web-version") ||
    name.includes("flipbook") ||
    name.includes("epub") ||
    name.includes("pdf");
    
  if (isDigital) {
    return "9973"; // Digital products/services (18% GST)
  }

  // Exempt printed books: category or name based check (HSN Chapter 49)
  const isPrintedBook = 
    category.includes("book") ||
    category.includes("sanskrit") ||
    category.includes("gita") ||
    category.includes("scriptures") ||
    category.includes("grammar") ||
    category.includes("dharma") ||
    category.includes("paperback") ||
    name.includes("book") ||
    name.includes("volume") ||
    name.includes("vol.") ||
    name.includes("hardcover") ||
    name.includes("paperback");
    
  return isPrintedBook ? "4901" : "8523";
};

const itemStyles = {
  itemWrapper: {
    padding: "8px 0",
    borderBottom: "1px solid var(--site-border)"
  },
  summaryItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "4px"
  },
  itemName: {
    fontSize: "14px",
    fontWeight: "600",
    color: "var(--site-text)"
  },
  itemTotal: {
    fontSize: "13.5px",
    color: "var(--site-text-soft)",
    textAlign: "right",
    whiteSpace: "nowrap"
  },
  taxDetails: {
    display: "flex",
    gap: "16px",
    fontSize: "11.5px",
    color: "var(--site-text-soft)",
    marginTop: "2px"
  },
  taxDetailLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px"
  },
  taxDetailValue: {
    color: "var(--site-text)",
    fontWeight: "600"
  }
};

function Checkout() {
  const { cartItems, clearCart } = useCart();
  const { token, user } = useAuth();
  const {
    addresses,
    selectedIndex,
    selectedAddress,
    selectAddress,
    addAddress
  } = useDeliveryLocation();
  const [isBillingSame, setIsBillingSame] = useState(true);
  const [selectedBillingIndex, setSelectedBillingIndex] = useState(0);
  const [isGift, setIsGift] = useState(false);
  const [giftRecipientEmail, setGiftRecipientEmail] = useState("");
  const [honeyPot, setHoneyPot] = useState("");
  const selectedBillingAddress = addresses[selectedBillingIndex];
  const navigate = useNavigate();

  const [purchasedProducts, setPurchasedProducts] = useState([]);

  useEffect(() => {
    if (token) {
      axios.get("/api/orders/my", {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then((res) => {
        const list = [];
        if (Array.isArray(res.data)) {
          res.data.forEach((order) => {
            const isPaid = String(order.paymentStatus || "").toLowerCase() === "paid";
            if (!isPaid || !Array.isArray(order.items)) return;
            order.items.forEach((item) => {
              const isGiftItem = Boolean(order.isGift || item.giftCode);
              if (isGiftItem && !order.isRedeemedGift) {
                return;
              }
              const pId = String(item.product || item._id || item.id || "").trim();
              if (pId) {
                list.push(pId);
              }
            });
          });
        }
        setPurchasedProducts(list);
      })
      .catch((err) => console.error("Error fetching my orders in Checkout:", err));
    }
  }, [token]);

  const hasAlreadyPurchasedItemInCart = useMemo(() => {
    return cartItems.some((item) => {
      const isDigital = Boolean(
        item.isDigital ||
        item.webReaderLink ||
        item.kindleLink ||
        String(item.name || "").toLowerCase().includes("web") ||
        String(item.name || "").toLowerCase().includes("kindle") ||
        String(item.name || "").toLowerCase().includes("flipbook") ||
        String(item.format || "").toLowerCase().includes("web") ||
        String(item.format || "").toLowerCase().includes("flipbook")
      );
      const isWeb = isDigital && !String(item.name || "").toLowerCase().includes("kindle") && !item.kindleLink;
      return isWeb && purchasedProducts.includes(String(item.id || item._id));
    });
  }, [cartItems, purchasedProducts]);

  useEffect(() => {
    if (hasAlreadyPurchasedItemInCart) {
      setIsGift(true);
    }
  }, [hasAlreadyPurchasedItemInCart]);
  const razorpayKey = import.meta.env.VITE_RAZORPAY_KEY_ID || "";

  const [charges, setCharges] = useState({
    gstPercent: 0,
    deliveryCharge: 0,
    warehouseLocation: {},
    distancePricing: {},
    internationalDelivery: {}
  });
  const [coupons, setCoupons] = useState([]);
  const [isLoadingCoupons, setIsLoadingCoupons] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [discount, setDiscount] = useState(0);
  const [couponMessage, setCouponMessage] = useState("");
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [isEditingBillingAddress, setIsEditingBillingAddress] = useState(false);
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [addressFormTriggerSource, setAddressFormTriggerSource] = useState("delivery");
  const [addressLabel, setAddressLabel] = useState("Home");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAddressText, setNewAddressText] = useState("");
  const [newLandmark, setNewLandmark] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("");
  const [newPincode, setNewPincode] = useState("");
  const [newCountry, setNewCountry] = useState("India");
  const [addressError, setAddressError] = useState("");
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [locationStatusMessage, setLocationStatusMessage] = useState("");

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
      if (resolved.address) setNewAddressText(resolved.address);
      if (resolved.landmark) setNewLandmark(resolved.landmark);
      if (resolved.city) setNewCity(resolved.city);
      if (resolved.state) setNewState(resolved.state);
      if (resolved.pincode) setNewPincode(resolved.pincode);
      if (resolved.country) setNewCountry(resolved.country);

      setLocationStatusMessage("Location detected! Please review and complete your Flat / House number.");
    } catch (err) {
      setLocationStatusMessage(err?.message || "Could not detect current location.");
    } finally {
      setIsDetectingLocation(false);
    }
  };

  useEffect(() => {
    if (!isBillingSame) {
      setIsEditingBillingAddress(true);
    }
  }, [isBillingSame]);

  const fetchCoordinatesForAddress = async (parts = {}) => {
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
  };

  const handleSaveNewAddress = async () => {
    const digits = String(newPhone || "").replace(/\D/g, "");
    const cleanPhone = String(newPhone || "").trim();
    const cleanPincode = String(newPincode || "").trim();
    const cleanCountry = String(newCountry || "").trim();

    if (!newName || !digits || !newAddressText || !newCity || !newState || !cleanPincode || !cleanCountry) {
      setAddressError("Please fill full name, phone, address, city, state, postal code, and country.");
      return;
    }

    const isIndia = !cleanCountry || cleanCountry.toLowerCase() === "india";
    if (isIndia && !/^[6-9]\d{9}$/.test(digits)) {
      setAddressError("Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9 (e.g. 9876543210).");
      return;
    }

    if (!isIndia && (digits.length < 7 || digits.length > 15)) {
      setAddressError("Please enter a valid phone number (7 to 15 digits).");
      return;
    }

    if (!/^[A-Za-z0-9\s-]{3,12}$/.test(cleanPincode)) {
      setAddressError("Enter a valid postal code (e.g. 560072 or 110001).");
      return;
    }

    setAddressError("");
    setIsSavingAddress(true);

    try {
      const nextCoordinates = await fetchCoordinatesForAddress({
        address: newAddressText,
        landmark: newLandmark,
        city: newCity,
        state: newState,
        pincode: cleanPincode,
        country: cleanCountry
      });

      const payload = {
        label: addressLabel,
        name: newName,
        phone: cleanPhone,
        address: newAddressText,
        landmark: newLandmark,
        city: newCity,
        state: newState,
        pincode: cleanPincode,
        country: cleanCountry,
        latitude: nextCoordinates.latitude,
        longitude: nextCoordinates.longitude,
        isDefault: addresses.length === 0
      };

      addAddress(payload);
      setShowNewAddressForm(false);
      
      if (addressFormTriggerSource === "billing") {
        setSelectedBillingIndex(addresses.length);
        setIsEditingBillingAddress(false);
      } else {
        setIsEditingAddress(false);
      }

      // Reset form fields
      setNewName("");
      setNewPhone("");
      setNewAddressText("");
      setNewLandmark("");
      setNewCity("");
      setNewState("");
      setNewPincode("");
      setNewCountry("India");
      setAddressLabel("Home");
      setAddressError("");
    } catch (err) {
      setAddressError("Failed to save address. Please try again.");
    } finally {
      setIsSavingAddress(false);
    }
  };
  const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
  const displayCurrency =
    cartItems.length > 0
      ? String(getProductPriceDetails(cartItems[0], selectedAddress?.country).currency || "INR")
      : "INR";

  useEffect(() => {
    let active = true;

    axios
      .get("/api/settings/public")
      .then((res) => {
        if (!active) return;
        storePricingConfig({
          pricingMarkets: res.data?.pricingMarkets || [],
          internationalPricingDefaults: res.data?.internationalPricingDefaults || {},
          currencyConversionRates: res.data?.currencyConversionRates || {}
        });
        setCharges({
          gstPercent: Number(res.data?.gstPercent || 0),
          deliveryCharge: Number(res.data?.deliveryCharge || 0),
          warehouseLocation: res.data?.warehouseLocation || {},
          distancePricing: res.data?.distancePricing || {},
          internationalDelivery: res.data?.internationalDelivery || {},
          enableCurrentLocation: res.data?.enableCurrentLocation !== false
        });
      })
      .catch(() => {
        if (!active) return;
        setCharges({
          gstPercent: 0,
          deliveryCharge: 0,
          warehouseLocation: {},
          distancePricing: {},
          internationalDelivery: {}
        });
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setIsLoadingCoupons(true);

    axios
      .get("/api/coupons")
      .then((res) => {
        if (!active) return;
        setCoupons(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        if (!active) return;
        setCoupons([]);
      })
      .finally(() => {
        if (!active) return;
        setIsLoadingCoupons(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const itemCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + Math.max(1, Number(item.quantity || 1)), 0),
    [cartItems]
  );

  const deliveryDetails = useMemo(() => {
    return getDeliveryPricingDetails(charges, selectedAddress, cartItems);
  }, [charges, selectedAddress, cartItems]);

  const [serverTotals, setServerTotals] = useState({
    subtotal: 0,
    gstPercent: 0,
    gstAmount: 0,
    deliveryCharge: 0,
    discount: 0,
    total: 0,
    currency: "INR"
  });
  const [isCalculatingTotals, setIsCalculatingTotals] = useState(false);

  useEffect(() => {
    if (cartItems.length === 0) {
      setServerTotals({
        subtotal: 0,
        gstPercent: 0,
        gstAmount: 0,
        deliveryCharge: 0,
        discount: 0,
        total: 0,
        currency: displayCurrency
      });
      return;
    }

    let active = true;
    setIsCalculatingTotals(true);

    const headers = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
    
    axios.post("/api/orders/calculate-totals", {
      items: cartItems,
      shipping: selectedAddress || {},
      couponCode: couponCode || "",
      currencyDisplay: { currency: displayCurrency }
    }, headers)
    .then((res) => {
      if (!active) return;
      setServerTotals(res.data);
      if (res.data.discount !== undefined) {
        setDiscount(res.data.discount);
      }
    })
    .catch((err) => {
      if (!active) return;
      console.error("Failed to calculate totals:", err);
      if (couponCode) {
        axios.post("/api/orders/calculate-totals", {
          items: cartItems,
          shipping: selectedAddress || {},
          currencyDisplay: { currency: displayCurrency }
        }, headers)
        .then((resWithoutCoupon) => {
          if (!active) return;
          setServerTotals(resWithoutCoupon.data);
          setDiscount(0);
          setCouponCode("");
          setCouponMessage(err?.response?.data?.message || "Invalid coupon removed.");
        })
        .catch((fallbackErr) => {
          if (!active) return;
          console.error("Fallback calculation failed:", fallbackErr);
        });
      } else {
        setCheckoutMessage(err?.response?.data?.message || "Failed to calculate totals from server.");
      }
    })
    .finally(() => {
      if (!active) return;
      setIsCalculatingTotals(false);
    });

    return () => {
      active = false;
    };
  }, [cartItems, selectedAddress, couponCode, displayCurrency, token]);

  const totals = useMemo(() => {
    return {
      subtotal: serverTotals.subtotal,
      gstAmount: serverTotals.gstAmount,
      deliveryCharge: serverTotals.deliveryCharge,
      grandTotal: roundMoney(serverTotals.subtotal + serverTotals.gstAmount + serverTotals.deliveryCharge)
    };
  }, [serverTotals]);

  const finalTotal = serverTotals.total;

  const hasDigitalItemsInCart = useMemo(() => {
    return cartItems.some((item) => isDigitalItem(item));
  }, [cartItems]);

  const isIntlPhysicalRestricted = useMemo(() => {
    const isInternational = isInternationalCountry(selectedAddress?.country);
    const intlDeliveryEnabled = charges?.internationalDelivery?.enabled === true;
    const hasPhysicalItems = cartItems.some((item) => !isDigitalItem(item));
    return isInternational && !intlDeliveryEnabled && hasPhysicalItems;
  }, [selectedAddress?.country, charges?.internationalDelivery?.enabled, cartItems]);

  const availableCoupons = useMemo(() => {
    const now = Date.now();
    return coupons.filter((coupon) => {
      const minOrder = Number(coupon?.minOrder || 0);
      const expiresAt = coupon?.expiresAt ? new Date(coupon.expiresAt).getTime() : null;
      if (expiresAt && !Number.isNaN(expiresAt) && expiresAt < now) return false;
      return totals.grandTotal >= minOrder;
    });
  }, [coupons, totals.grandTotal]);

  const getOrderHeaders = () => ({
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const applyCoupon = async (selectedCode) => {
    const code = String(selectedCode ?? couponCode ?? "").trim();
    if (!code) {
      setCouponMessage("Enter a coupon code.");
      return;
    }

    setIsApplyingCoupon(true);
    setCouponMessage("");

    try {
      const res = await axios.post(
        "/api/coupons/apply",
        {
          code,
          total: totals.grandTotal,
          currency: displayCurrency,
          items: cartItems
        },
        token ? { headers: { Authorization: `Bearer ${token}` } } : {}
      );
      setDiscount(Number(res.data?.discount || 0));
      setCouponCode(code.toUpperCase());
      setCouponMessage("Coupon applied.");
    } catch (err) {
      setDiscount(0);
      setCouponMessage(err?.response?.data?.message || "Invalid coupon");
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const removeCoupon = () => {
    setCouponCode("");
    setDiscount(0);
    setCouponMessage("Coupon removed.");
  };


  const createOrderWithPaymentStatus = async (selected, paymentStatus, paymentInfo = {}) => {
    const checkoutCountry = String(selected?.country || "").trim().toUpperCase();
    const billing = isBillingSame
      ? selected
      : (addresses[selectedBillingIndex] || selected);

    const { data } = await axios.post(
      "/api/orders",
      {
        items: cartItems,
        total: finalTotal,
        shipping: selected,
        billing,
        couponCode: couponCode || "",
        discount,
        isGift,
        giftRecipientEmail: isGift ? String(giftRecipientEmail || "").trim() : "",
        paymentStatus,
        honey_pot_field: honeyPot,
        razorpayOrderId: paymentInfo?.razorpayOrderId || "",
        razorpayPaymentId: paymentInfo?.razorpayPaymentId || "",
        razorpaySignature: paymentInfo?.razorpaySignature || "",
        currencyDisplay: {
          currency: displayCurrency,
          amount: finalTotal,
          detectedCountry: checkoutCountry
        }
      },
      getOrderHeaders()
    );

    return data;
  };

  const createFailedOrderAttempt = async (selected, message) => {
    await createOrderWithPaymentStatus(selected, "Failed");
    navigate("/my-orders", {
      state: {
        message: message || "Payment failed. The order is saved in My Orders. You can retry payment there."
      }
    });
  };

  const validateCheckout = () => {
    if (!selectedAddress) {
      setCheckoutMessage("Please select or add an address before starting payment.");
      return null;
    }

    if (!token) {
      setCheckoutMessage("Please login to continue.");
      return null;
    }

    if (!cartItems.length) {
      setCheckoutMessage("Your cart is empty.");
      return null;
    }

    if (isGift && !giftRecipientEmail.trim()) {
      setCheckoutMessage("Please enter the recipient's email address to purchase as a gift.");
      return null;
    }

    if (isGift && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(giftRecipientEmail.trim())) {
      setCheckoutMessage("Please enter a valid recipient email address.");
      return null;
    }

    return selectedAddress;
  };

  const processCheckout = async () => {
    const selected = validateCheckout();
    if (!selected) {
      return;
    }

    if (!razorpayKey) {
      setCheckoutMessage("Payment gateway key is missing. Please contact support.");
      return;
    }

    setCheckoutMessage("");
    setIsPaying(true);
    let checkoutOpened = false;
    let hasRecordedFailedAttempt = false;

    const recordFailedAttempt = async (message) => {
      if (hasRecordedFailedAttempt) return;
      hasRecordedFailedAttempt = true;
      await createFailedOrderAttempt(selected, message);
    };

    try {
      const RazorpayConstructor = await loadRazorpayCheckout();

      const { data } = await axios.post("/api/payment/create-order", {
        amount: roundMoney(
          convertCurrencyAmount(finalTotal, {
            sourceCurrency: displayCurrency,
            currency: "INR"
          })
        ),
        honey_pot_field: honeyPot
      });

      const cleanPhone = String(selected.phone || "").replace(/\D/g, "").replace(/^0+/, "");
      const cleanEmail = String(user?.email || selected?.email || "").trim();

      const rzp = new RazorpayConstructor({
        key: razorpayKey,
        amount: data.amount,
        currency: data.currency,
        name: "Digital Sanskrit Guru",
        description: "Order Payment",
        order_id: data.id,
        prefill: {
          name: selected.name,
          email: cleanEmail,
          contact: cleanPhone
        },
        notes: {
          address: selected.address
        },
        modal: {
          ondismiss: async () => {
            setIsPaying(false);
            await recordFailedAttempt(
              "Payment was cancelled. Failed order saved in My Orders. You can retry payment there."
            );
          }
        },
        handler: async (response) => {
          try {
            const verify = await axios.post("/api/payment/verify", response);

            if (!verify.data?.success) {
              await recordFailedAttempt("Payment verification failed. Retry from My Orders.");
              return;
            }

            await createOrderWithPaymentStatus(selected, "Paid", {
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature
            });

            // Track purchase event for GTM and Facebook Pixel
            const orderId = response.razorpay_order_id || `order_${Date.now()}`;
            if (window.fbq && window.fbqInitialized) {
              window.fbq("track", "Purchase", {
                value: Number(finalTotal || 0),
                currency: displayCurrency || "INR",
                content_type: "product",
                content_ids: cartItems.map((item) => item.id || item._id).filter(Boolean)
              });
            }
            if (window.dataLayer) {
              window.dataLayer.push({
                event: "purchase",
                ecommerce: {
                  transaction_id: orderId,
                  value: Number(finalTotal || 0),
                  currency: displayCurrency || "INR",
                  coupon: couponCode || "",
                  items: cartItems.map((item) => ({
                    item_name: item.name,
                    item_id: item.id || item._id,
                    price: Number(item.price || 0),
                    quantity: Number(item.quantity || 1)
                  }))
                }
              });
            }

            await clearCart();
            navigate("/my-orders", {
              state: {
                message: "Payment successful. Your order has been placed.",
                showReviewPrompt: true
              }
            });
          } catch {
            setCheckoutMessage("Payment succeeded, but the order could not be saved. Please contact support.");
          } finally {
            setIsPaying(false);
          }
        },
        theme: {
          color: "#1f6feb"
        }
      });

      rzp.on("payment.failed", async (response) => {
        setIsPaying(false);
        const failReason =
          response?.error?.description ||
          response?.error?.reason ||
          "Payment failed. Failed order saved in My Orders.";
        console.error("Razorpay payment failed:", response?.error);
        setCheckoutMessage(`Payment failed: ${failReason}`);
        await recordFailedAttempt(`Payment failed: ${failReason}`);
      });

      checkoutOpened = true;
      rzp.open();
    } catch (err) {
      setIsPaying(false);
      setCheckoutMessage(err?.response?.data?.message || err?.message || "Unable to start payment.");
    } finally {
      if (!checkoutOpened) {
        setIsPaying(false);
      }
    }
  };

  return (
    <div className="checkout-page">
      <div className="checkout-heading-row">
        <div className="checkout-heading-left">
          <div className="checkout-heading-title-wrap">
            <ShieldCheck size={24} className="checkout-heading-icon" />
            <h1>Checkout</h1>
          </div>
          <span className="checkout-heading-count">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
          <span className="checkout-ssl-pill">
            <Lock size={12} /> 256-Bit SSL Encrypted
          </span>
        </div>
        <div className="checkout-heading-right">
          <Link to="/cart" className="checkout-back-link">
            <ArrowLeft size={15} />
            <span>Return to Cart</span>
          </Link>
        </div>
      </div>

      {checkoutMessage && (
        <div className="checkout-feedback">
          <AlertCircle size={16} />
          <span>{checkoutMessage}</span>
        </div>
      )}

      <div className="checkout-container">
        <section className="checkout-main">
          {/* Step 1: Delivery Address */}
          <div className="checkout-step-card">
            <div className="checkout-step-header">
              <div className="checkout-step-title-wrap">
                <span className="checkout-step-num">1</span>
                <h3>Delivery Address</h3>
              </div>
              {selectedAddress && !isEditingAddress && !showNewAddressForm && (
                <button
                  type="button"
                  className="checkout-step-change-btn"
                  onClick={() => setIsEditingAddress(true)}
                >
                  Change
                </button>
              )}
            </div>

            {showNewAddressForm ? (
              <div className="checkout-address-form-container">
                <div className="checkout-section-head" style={{ marginBottom: "16px" }}>
                  <h4>Add a New Address</h4>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    {charges.enableCurrentLocation !== false && (
                      <button
                        type="button"
                        className="checkout-location-detect-btn"
                        onClick={handleUseCurrentLocation}
                        disabled={isDetectingLocation}
                      >
                        <MapPin size={13} />
                        <span>{isDetectingLocation ? "Detecting..." : "Use Current Location"}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="checkout-cancel-link-btn"
                      onClick={() => setShowNewAddressForm(false)}
                    >
                      Back to List
                    </button>
                  </div>
                </div>

                {locationStatusMessage ? (
                  <p className="checkout-location-msg">
                    {locationStatusMessage}
                  </p>
                ) : null}

                <div className="checkout-address-form-grid">
                  <div className="checkout-address-form-labels">
                    {["Home", "Work", "Other"].map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={`checkout-address-label-chip ${addressLabel === option ? "active" : ""}`}
                        onClick={() => setAddressLabel(option)}
                      >
                        {option === "Home" ? <Home size={13} /> : option === "Work" ? <Briefcase size={13} /> : <Building size={13} />}
                        <span>{option}</span>
                      </button>
                    ))}
                  </div>

                  <div className="checkout-form-row two-col">
                    <label className="checkout-form-label">
                      <span>Full Name *</span>
                      <input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="e.g. Rohan Sharma"
                        className="checkout-form-input"
                      />
                    </label>
                    <label className="checkout-form-label">
                      <span>Phone Number *</span>
                      <input
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="e.g. 9876543210"
                        className="checkout-form-input"
                      />
                    </label>
                  </div>

                  <label className="checkout-form-label">
                    <span>Complete Address *</span>
                    <textarea
                      value={newAddressText}
                      onChange={(e) => setNewAddressText(e.target.value)}
                      placeholder="Flat, house no., building, street, area"
                      className="checkout-form-input checkout-form-textarea"
                    />
                  </label>

                  <div className="checkout-form-row two-col">
                    <label className="checkout-form-label">
                      <span>Landmark</span>
                      <input
                        value={newLandmark}
                        onChange={(e) => setNewLandmark(e.target.value)}
                        placeholder="Optional landmark"
                        className="checkout-form-input"
                      />
                    </label>
                    <label className="checkout-form-label">
                      <span>City *</span>
                      <input
                        value={newCity}
                        onChange={(e) => setNewCity(e.target.value)}
                        placeholder="e.g. Bengaluru"
                        className="checkout-form-input"
                      />
                    </label>
                  </div>

                  <div className="checkout-form-row three-col">
                    <label className="checkout-form-label">
                      <span>State *</span>
                      <input
                        value={newState}
                        onChange={(e) => setNewState(e.target.value)}
                        placeholder="e.g. Karnataka"
                        className="checkout-form-input"
                      />
                    </label>
                    <label className="checkout-form-label">
                      <span>Postal Code *</span>
                      <input
                        value={newPincode}
                        onChange={(e) => setNewPincode(e.target.value)}
                        placeholder="e.g. 560040"
                        className="checkout-form-input"
                      />
                    </label>
                    <label className="checkout-form-label">
                      <span>Country *</span>
                      <input
                        value={newCountry}
                        onChange={(e) => setNewCountry(e.target.value)}
                        placeholder="e.g. India"
                        className="checkout-form-input"
                      />
                    </label>
                  </div>

                  {addressError && (
                    <p className="checkout-form-error">
                      {addressError}
                    </p>
                  )}

                  <div className="checkout-form-btn-row">
                    <button
                      type="button"
                      onClick={handleSaveNewAddress}
                      disabled={isSavingAddress}
                      className="checkout-address-save-btn"
                    >
                      {isSavingAddress ? "Saving..." : "Save and Use Address"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNewAddressForm(false)}
                      className="checkout-cancel-btn"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {selectedAddress && !isEditingAddress ? (
                  <div className="checkout-compact-address-box">
                    <div className="checkout-compact-address-info">
                      <div className="checkout-compact-name-row">
                        <strong className="checkout-compact-name">
                          {selectedAddress.name}
                        </strong>
                        {selectedAddress.label && (
                          <span className="checkout-address-label">{selectedAddress.label}</span>
                        )}
                        {selectedAddress.isDefault && (
                          <span className="default-badge">Default</span>
                        )}
                      </div>
                      <p className="checkout-compact-address-detail">
                        {selectedAddress.address}
                      </p>
                      {selectedAddress.landmark && (
                        <p className="checkout-compact-address-detail">Landmark: {selectedAddress.landmark}</p>
                      )}
                      <p className="checkout-compact-address-detail">
                        {getAddressLocationText(selectedAddress)}
                      </p>
                      <p className="checkout-compact-phone">
                        <Phone size={13} /> {selectedAddress.phone}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="checkout-section-action-bar">
                      <p className="checkout-section-note">Select an existing address or add a new delivery location:</p>
                      <div className="checkout-address-actions">
                        <button
                          type="button"
                          className="checkout-add-address-btn"
                          onClick={() => {
                            setAddressFormTriggerSource("delivery");
                            setShowNewAddressForm(true);
                          }}
                        >
                          <Plus size={14} /> Add New Address
                        </button>
                        {selectedAddress && isEditingAddress && (
                          <button
                            type="button"
                            className="checkout-cancel-link-btn"
                            onClick={() => setIsEditingAddress(false)}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="address-list">
                      {addresses.map((item, index) => (
                        <div
                          key={index}
                          className={`address-card ${selectedIndex === index ? "selected" : ""}`}
                          onClick={() => {
                            selectAddress(index);
                            setIsEditingAddress(false);
                          }}
                        >
                          <input
                            type="radio"
                            checked={selectedIndex === index}
                            onChange={(e) => {
                              e.stopPropagation();
                              selectAddress(index);
                              setIsEditingAddress(false);
                            }}
                          />

                          <div className="address-info">
                            <div className="address-card-topline">
                              <strong>{item.name}</strong>
                              <div className="address-badge-row">
                                {item.label ? <span className="checkout-address-label">{item.label}</span> : null}
                                {item.isDefault && <span className="default-badge">Default</span>}
                              </div>
                            </div>
                            <p className="address-line">{item.address}</p>
                            {item.landmark && <p className="address-muted">Landmark: {item.landmark}</p>}
                            {getAddressLocationText(item) && <p className="address-muted">{getAddressLocationText(item)}</p>}
                            <p className="address-phone"><Phone size={12} /> {item.phone}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* Step 2: Billing Address */}
          <div className="checkout-step-card">
            <div className="checkout-step-header">
              <div className="checkout-step-title-wrap">
                <span className="checkout-step-num">2</span>
                <h3>Billing Address</h3>
              </div>
              {!isBillingSame && selectedBillingAddress && !isEditingBillingAddress && !showNewAddressForm && (
                <button
                  type="button"
                  className="checkout-step-change-btn"
                  onClick={() => setIsEditingBillingAddress(true)}
                >
                  Change
                </button>
              )}
            </div>

            <div className="billing-address-toggle">
              <input
                type="checkbox"
                id="billing-same"
                checked={isBillingSame}
                onChange={(e) => setIsBillingSame(e.target.checked)}
              />
              <label htmlFor="billing-same">
                Billing address is same as delivery address
              </label>
            </div>

            {!isBillingSame && (
              <div className="billing-address-section">
                {selectedBillingAddress && !isEditingBillingAddress ? (
                  <div className="checkout-compact-address-box">
                    <div className="checkout-compact-address-info">
                      <div className="checkout-compact-name-row">
                        <strong className="checkout-compact-name">
                          {selectedBillingAddress.name}
                        </strong>
                        {selectedBillingAddress.label && (
                          <span className="checkout-address-label">{selectedBillingAddress.label}</span>
                        )}
                      </div>
                      <p className="checkout-compact-address-detail">
                        {selectedBillingAddress.address}
                      </p>
                      {selectedBillingAddress.landmark && (
                        <p className="checkout-compact-address-detail">Landmark: {selectedBillingAddress.landmark}</p>
                      )}
                      <p className="checkout-compact-address-detail">
                        {getAddressLocationText(selectedBillingAddress)}
                      </p>
                      <p className="checkout-compact-phone">
                        <Phone size={13} /> {selectedBillingAddress.phone}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="checkout-section-action-bar">
                      <p className="checkout-section-note">Select billing address:</p>
                      <div className="checkout-address-actions">
                        <button
                          type="button"
                          className="checkout-add-address-btn"
                          onClick={() => {
                            setAddressFormTriggerSource("billing");
                            setShowNewAddressForm(true);
                          }}
                        >
                          <Plus size={14} /> Add New Address
                        </button>
                        {selectedBillingAddress && isEditingBillingAddress && (
                          <button
                            type="button"
                            className="checkout-cancel-link-btn"
                            onClick={() => setIsEditingBillingAddress(false)}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="address-list">
                      {addresses.map((item, index) => (
                        <div
                          key={`billing-${index}`}
                          className={`address-card ${selectedBillingIndex === index ? "selected" : ""}`}
                          onClick={() => {
                            setSelectedBillingIndex(index);
                            setIsEditingBillingAddress(false);
                          }}
                        >
                          <input
                            type="radio"
                            checked={selectedBillingIndex === index}
                            onChange={(e) => {
                              e.stopPropagation();
                              setSelectedBillingIndex(index);
                              setIsEditingBillingAddress(false);
                            }}
                          />
                          <div className="address-info">
                            <div className="address-card-topline">
                              <strong>{item.name}</strong>
                              {item.label ? <span className="checkout-address-label">{item.label}</span> : null}
                            </div>
                            <p className="address-line">{item.address}</p>
                            {item.landmark && <p className="address-muted">Landmark: {item.landmark}</p>}
                            {getAddressLocationText(item) && <p className="address-muted">{getAddressLocationText(item)}</p>}
                            <p className="address-phone"><Phone size={12} /> {item.phone}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Digital Gift Option */}
          {hasDigitalItemsInCart && (
            <div className="checkout-gift-card">
              <label className="checkout-gift-toggle-label">
                <input
                  type="checkbox"
                  checked={isGift}
                  onChange={(e) => {
                    if (!hasAlreadyPurchasedItemInCart) {
                      setIsGift(e.target.checked);
                    }
                  }}
                  disabled={hasAlreadyPurchasedItemInCart}
                />
                <Gift size={18} className="checkout-gift-icon" />
                <span>Purchase digital items in this order as Gift Passes</span>
              </label>

              {hasAlreadyPurchasedItemInCart && (
                <p className="checkout-gift-warning">
                  <AlertCircle size={14} />
                  <span>You already own one or more digital web version products in this order. This order will automatically generate Gift Passes so you can share them.</span>
                </p>
              )}

              {isGift && (
                <div className="checkout-gift-form">
                  <p className="checkout-gift-note">
                    Unique 1-time Gift Pass Codes (e.g. <code>GIFT-DSG-XXXXXX</code>) will be generated under <strong>My Orders</strong>.
                  </p>
                  <label className="checkout-form-label">
                    <span>Recipient's Email Address (Optional):</span>
                    <input
                      type="email"
                      placeholder="recipient@example.com"
                      value={giftRecipientEmail}
                      onChange={(e) => setGiftRecipientEmail(e.target.value)}
                      className="checkout-form-input"
                    />
                  </label>
                  <p className="checkout-gift-subnote">
                    We will automatically email the generated Gift Pass code directly to this address upon successful checkout!
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Available Coupons & Offers in Left Column */}
          {availableCoupons.length > 0 && (
            <div className="checkout-step-card checkout-coupons-main-card">
              <div className="checkout-step-header">
                <div className="checkout-step-title-wrap">
                  <Sparkles size={20} className="checkout-step-icon-accent" />
                  <h3>Available Coupons & Offers</h3>
                </div>
                <span className="checkout-coupons-count-badge">{availableCoupons.length} available</span>
              </div>

              <div className="coupon-vouchers-grid">
                {availableCoupons.map((coupon) => {
                  const code = String(coupon.code || "").toUpperCase();
                  const isCurrentlyApplied = Boolean(couponCode && couponCode.toUpperCase() === code && discount > 0);
                  const discountLabel =
                    coupon.type === "percentage"
                      ? `${Number(coupon.value || 0)}% OFF`
                      : `${formatCurrencyExact(Number(coupon.value || 0), displayCurrency)} OFF`;
                  const minOrder = Number(coupon.minOrder || 0);

                  return (
                    <div
                      key={coupon._id || code}
                      className={`coupon-voucher-card ${isCurrentlyApplied ? "applied" : ""}`}
                    >
                      <div className="coupon-voucher-left">
                        <div className="coupon-voucher-badge">
                          <Tag size={12} />
                          <strong>{code}</strong>
                        </div>
                        <div className="coupon-voucher-meta">
                          <span className="coupon-voucher-benefit">{discountLabel}</span>
                          {minOrder > 0 && (
                            <span className="coupon-voucher-min">
                              On orders above {formatCurrencyExact(minOrder, displayCurrency)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="coupon-voucher-action">
                        {isCurrentlyApplied ? (
                          <button
                            type="button"
                            className="coupon-voucher-btn remove"
                            onClick={() => removeCoupon()}
                            disabled={isApplyingCoupon}
                          >
                            <X size={12} />
                            <span>Remove</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="coupon-voucher-btn apply"
                            onClick={() => applyCoupon(code)}
                            disabled={isApplyingCoupon}
                          >
                            <span>Apply</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Order Summary Sidebar */}
        <aside className="order-summary">
          <div className="checkout-summary-head">
            <ShieldCheck size={20} className="summary-shield-icon" />
            <h3>Order Summary</h3>
          </div>

          {/* Coupon Code Input & Applied State */}
          {discount > 0 && couponCode ? (
            <div className="coupon-applied-card">
              <div className="coupon-applied-left">
                <div className="coupon-applied-icon-wrap">
                  <CheckCircle2 size={16} />
                </div>
                <div className="coupon-applied-info">
                  <div className="coupon-applied-code-row">
                    <strong className="coupon-applied-code">{couponCode}</strong>
                    <span className="coupon-applied-tag">Applied</span>
                  </div>
                  <span className="coupon-applied-saving">
                    You saved {formatCurrencyExact(discount, displayCurrency)}!
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="coupon-remove-btn"
                onClick={removeCoupon}
                title="Remove this coupon"
              >
                <X size={14} />
                <span>Remove</span>
              </button>
            </div>
          ) : (
            <div className="coupon-box">
              <div className="coupon-input-wrap">
                <Tag size={15} className="coupon-input-icon" />
                <input
                  placeholder="Enter coupon code"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyCoupon();
                    }
                  }}
                />
              </div>
              <button
                type="button"
                className="coupon-apply-btn"
                onClick={() => applyCoupon()}
                disabled={isApplyingCoupon || !couponCode.trim()}
              >
                {isApplyingCoupon ? "Applying..." : "Apply"}
              </button>
            </div>
          )}

          {couponMessage && (
            <p className={`coupon-message ${discount > 0 ? "success" : "info"}`}>
              {couponMessage}
            </p>
          )}

          {/* Purchased Items List */}
          <div className="summary-products">
            {cartItems.map((item, index) => {
              const qty = Math.max(1, Number(item.quantity || 1));
              const unitPrice = Number(getProductPriceDetails(item, selectedAddress?.country).price || 0);
              const lineTotal = roundMoney(unitPrice * qty);
              const hsnSac = getItemHsnSac(item);
              const defaultGstPercent = Number(charges.gstPercent || 0);
              const gstRate = hsnSac === "4901" ? 0 : defaultGstPercent;
              const gstAmount = roundMoney(lineTotal - (lineTotal / (1 + gstRate / 100)));
              const isDigital = isDigitalItem(item);

              return (
                <div key={index} className="summary-item-wrapper">
                  <div className="summary-item-head">
                    <span className="summary-item-name">{item.name}</span>
                    <strong className="summary-item-total">
                      {formatCurrencyExact(lineTotal, displayCurrency)}
                    </strong>
                  </div>
                  <div className="summary-item-sub">
                    <span>
                      {qty} × {formatResolvedPrice(getProductPriceDetails(item, selectedAddress?.country))}
                    </span>
                    <span className="summary-item-hsn">HSN: {hsnSac}</span>
                    <span className="summary-item-gst">GST: {gstRate}%</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Breakdown Rows */}
          <div className="checkout-summary-breakdown">
            <div className="summary-item">
              <span>Subtotal ({itemCount} {itemCount === 1 ? "item" : "items"})</span>
              <strong>{formatCurrencyExact(totals.subtotal, displayCurrency)}</strong>
            </div>
            <div className="summary-item">
              <span>
                {totals.isInternational
                  ? "GST (Export 0%)"
                  : `GST (${charges.gstPercent}% Included)`}
              </span>
              <strong>
                {totals.isInternational
                  ? formatCurrencyExact(0, displayCurrency)
                  : formatCurrencyExact(totals.gstAmount, displayCurrency)}
              </strong>
            </div>
            <div className="summary-item">
              <span>Delivery</span>
              <span>
                {deliveryDetails.pricingMode === "digital" || deliveryDetails.isDigitalOnly ? (
                  <strong className="delivery-free-badge">FREE (Instant Access)</strong>
                ) : totals.deliveryCharge === 0 ? (
                  <strong className="delivery-free-badge">FREE</strong>
                ) : (
                  <strong>{formatCurrencyExact(totals.deliveryCharge, displayCurrency)}</strong>
                )}
              </span>
            </div>

            {discount > 0 && (
              <div className="summary-item discount-row">
                <div className="summary-discount-label">
                  <span>Coupon Discount ({couponCode})</span>
                  <button
                    type="button"
                    className="summary-discount-remove-link"
                    onClick={removeCoupon}
                    title="Remove coupon discount"
                  >
                    <X size={12} />
                    <span>Remove</span>
                  </button>
                </div>
                <strong>-{formatCurrencyExact(discount, displayCurrency)}</strong>
              </div>
            )}
          </div>

          {deliveryDetails.pricingMode === "digital" || deliveryDetails.isDigitalOnly ? (
            <div className="checkout-digital-note">
              <Zap size={14} />
              <span>Digital order: Instant access granted upon payment completion.</span>
            </div>
          ) : null}

          {deliveryDetails.isDistanceBased && deliveryDetails.distanceKm !== null && (
            <p className="checkout-distance-note">Estimated warehouse distance: {deliveryDetails.distanceKm.toFixed(1)} km</p>
          )}

          {deliveryDetails.pricingMode === "international" && deliveryDetails.matchedCountry && (
            <p className="checkout-distance-note">
              International delivery applied for {deliveryDetails.matchedCountry}.
            </p>
          )}

          {/* Grand Total Box */}
          <div className="checkout-summary-grand-total">
            <div className="grand-total-left">
              <span className="grand-total-label">Final Order Total</span>
              <span className="grand-total-tax-note">(Inclusive of all taxes)</span>
            </div>
            <span className="grand-total-val">{formatCurrencyExact(finalTotal, displayCurrency)}</span>
          </div>

          {isIntlPhysicalRestricted && (
            <div className="checkout-intl-warning">
              <strong>⚠️ International Shipping Notice:</strong> Physical product delivery to{" "}
              {selectedAddress?.country || "international addresses"} is currently disabled. Only digital products
              (E-books, Flipbooks & Web versions) can be ordered internationally. Please remove physical items from your cart to proceed.
            </div>
          )}

          <button
            type="button"
            className="pay-now-btn"
            onClick={processCheckout}
            disabled={isPaying || isIntlPhysicalRestricted}
          >
            <Lock size={16} />
            <span>{isPaying ? "Processing..." : isIntlPhysicalRestricted ? "Physical Products Restricted" : `Pay ${formatCurrencyExact(finalTotal, displayCurrency)}`}</span>
            <ArrowRight size={16} />
          </button>

          <p className="checkout-policy-note">
            Your payment is processed securely via Razorpay. Order is confirmed immediately upon payment.
          </p>
        </aside>
      </div>
    </div>
  );
}

export default Checkout;
