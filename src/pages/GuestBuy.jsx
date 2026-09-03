import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import axios from "axios";
import { loadRazorpayCheckout } from "../utils/loadRazorpay";
import { formatResolvedPrice, convertCurrencyAmount } from "../utils/currency";
import { getProductPriceDetails, isInternationalCountry } from "../utils/productPricing";
import { getDeliveryPricingDetails } from "../utils/deliveryPricing";
import { reverseGeocodeCoordinates, getCurrentDevicePosition } from "../utils/geoAddress";
import "./Checkout.css";

function GuestBuy() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const rawQty = searchParams.get("qty") || location.state?.qty;
  const isBulkProduct = product?.productType === "bulk";
  const parsedQty = Math.max(1, Number(rawQty || (isBulkProduct ? 10 : 1)));
  const buyQuantity = isBulkProduct ? parsedQty : Math.min(5, parsedQty);

  // Customer guest details
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Shipping details (only required for physical products)
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [country, setCountry] = useState("India");

  const [isPaying, setIsPaying] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [locationStatusMessage, setLocationStatusMessage] = useState("");

  const handleUseCurrentLocation = async () => {
    if (isDetectingLocation) return;
    setIsDetectingLocation(true);
    setLocationStatusMessage("Detecting location...");

    try {
      const position = await getCurrentDevicePosition();
      const latitude = Number(position?.coords?.latitude);
      const longitude = Number(position?.coords?.longitude);

      if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
        throw new Error("Could not read coordinates from device.");
      }

      setCoords({ latitude, longitude });
      const resolved = await reverseGeocodeCoordinates(latitude, longitude);
      if (resolved.address) setAddress(resolved.address);
      if (resolved.city) setCity(resolved.city);
      if (resolved.state) setState(resolved.state);
      if (resolved.pincode) setPincode(resolved.pincode);
      if (resolved.country) setCountry(resolved.country);

      setLocationStatusMessage("Location detected! Please review and complete your Flat / House number.");
    } catch (err) {
      setLocationStatusMessage(err?.message || "Could not detect current location.");
    } finally {
      setIsDetectingLocation(false);
    }
  };

  // Success state
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [credentialsSent, setCredentialsSent] = useState(false);
  const [settings, setSettings] = useState(null);
  const [coords, setCoords] = useState({ latitude: null, longitude: null });

  const isDummyPaymentEnabled =
    String(import.meta.env.VITE_ENABLE_DUMMY_PAYMENT || "").toLowerCase() === "true";
  const razorpayKey = import.meta.env.VITE_RAZORPAY_KEY_ID || "";

  useEffect(() => {
    const fetchProductAndSettings = async () => {
      try {
        const [prodRes, settRes] = await Promise.all([
          axios.get(`/api/products/${id}`),
          axios.get("/api/settings/public")
        ]);
        setProduct(prodRes.data);
        setSettings(settRes.data);
      } catch (err) {
        setError(err.response?.data?.message || "Failed to load checkout details.");
      } finally {
        setLoading(false);
      }
    };
    fetchProductAndSettings();
  }, [id]);

  const isDigital = product ? Boolean(
    product.isDigital ||
    product.webReaderLink ||
    product.kindleLink ||
    String(product.name || "").toLowerCase().includes("web") ||
    String(product.name || "").toLowerCase().includes("kindle") ||
    String(product.name || "").toLowerCase().includes("flipbook") ||
    String(product.format || "").toLowerCase().includes("web") ||
    String(product.format || "").toLowerCase().includes("flipbook")
  ) : false;

  useEffect(() => {
    if (isDigital) return;
    if (!pincode.trim() || !city.trim() || !state.trim()) {
      setCoords({ latitude: null, longitude: null });
      return;
    }

    const timer = setTimeout(async () => {
      const query = [
        pincode.trim(),
        city.trim(),
        state.trim(),
        country.trim()
      ]
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .join(", ");

      if (!query) return;

      try {
        const params = new URLSearchParams({
          q: query,
          format: "jsonv2",
          limit: "1"
        });
        const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
          headers: { Accept: "application/json" }
        });
        if (response.ok) {
          const results = await response.json();
          const first = results[0];
          const lat = Number(first?.lat);
          const lon = Number(first?.lon);
          if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
            setCoords({ latitude: lat, longitude: lon });
          }
        }
      } catch (err) {
        console.error("Geocoding failed:", err);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [city, state, pincode, country, isDigital]);

  const handlePayment = async (e) => {
    e.preventDefault();

    const digits = String(phone || "").replace(/\D/g, "");
    const cleanPincode = String(pincode || "").trim();
    const cleanCountry = String(country || "").trim();

    if (!name.trim() || !email.trim() || !phone.trim()) {
      setCheckoutMessage("Please fill in your name, email, and phone number.");
      return;
    }

    const isIndia = !cleanCountry || cleanCountry.toLowerCase() === "india";
    if (isIndia && !/^[6-9]\d{9}$/.test(digits)) {
      setCheckoutMessage("Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9 (e.g. 9876543210).");
      return;
    }

    if (!isIndia && (digits.length < 7 || digits.length > 15)) {
      setCheckoutMessage("Please enter a valid phone number (7 to 15 digits).");
      return;
    }

    if (!isDigital && (!address.trim() || !city.trim() || !state.trim() || !pincode.trim())) {
      setCheckoutMessage("Please fill in your complete shipping address.");
      return;
    }

    if (!isDigital && !/^[A-Za-z0-9\s-]{3,12}$/.test(cleanPincode)) {
      setCheckoutMessage("Enter a valid postal code (e.g. 560072 or 110001).");
      return;
    }

    if (!isDigital && isInternationalCountry(country.trim()) && settings?.internationalDelivery?.enabled === false) {
      setCheckoutMessage("Physical product delivery to international locations is currently disabled. Only digital products (E-books, Flipbooks & Web versions) can be ordered internationally.");
      return;
    }

    setCheckoutMessage("");
    setIsPaying(true);

    const shippingInfo = isDigital ? {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      address: "Digital Delivery",
      city: "Digital",
      state: "Digital",
      pincode: "000000",
      country: "India"
    } : {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      pincode: pincode.trim(),
      country: country.trim(),
      latitude: coords.latitude,
      longitude: coords.longitude
    };

    // Construct pricing based on configuration
    const pricing = getProductPriceDetails(product, isDigital ? undefined : country.trim());
    const unitPrice = Number(pricing.price || 0);
    const finalTotal = unitPrice * buyQuantity;
    const displayCurrency = pricing.currency || "INR";

    const deliveryDetails = getDeliveryPricingDetails(
      settings,
      isDigital ? {} : { address: address.trim(), city: city.trim(), state: state.trim(), pincode: pincode.trim(), country: country.trim(), latitude: coords.latitude, longitude: coords.longitude },
      product ? [{
        product: product._id,
        _id: product._id,
        id: product._id,
        name: product.name,
        image: product.image,
        price: unitPrice,
        quantity: buyQuantity,
        isDigital,
        weight: product.weight,
        height: product.height,
        width: product.width,
        length: product.length
      }] : []
    );
    const deliveryChargeInInr = Number(deliveryDetails?.deliveryCharge || 0);
    const deliveryCharge = convertCurrencyAmount(deliveryChargeInInr, {
      sourceCurrency: "INR",
      currency: displayCurrency,
      rates: settings?.currencyConversionRates || {}
    });
    const grandTotal = finalTotal + deliveryCharge;

    try {
      let RazorpayConstructor = window.Razorpay;
      if (!isDummyPaymentEnabled) {
        RazorpayConstructor = await loadRazorpayCheckout();
      }

      // 1. Create Razorpay Order (converting to INR paise)
      const amountInInr = convertCurrencyAmount(grandTotal, {
        sourceCurrency: displayCurrency,
        currency: "INR"
      });

      const { data: rpOrder } = await axios.post("/api/payment/create-order", {
        amount: Math.round(amountInInr * 100) / 100
      });

      // 2. Process payment (Dummy / Live)
      const isOrderDummy =
        isDummyPaymentEnabled ||
        Boolean(rpOrder?.isDummy) ||
        String(rpOrder?.id || "").startsWith("dummy_order_");

      if (isOrderDummy) {
        const wantsToProceed = window.confirm(
          "Dummy payment mode is enabled. Click OK to simulate a successful payment."
        );

        if (!wantsToProceed) {
          setIsPaying(false);
          setCheckoutMessage("Payment was cancelled.");
          return;
        }

        const response = {
          razorpay_order_id: rpOrder.id || `dummy_order_${Date.now()}`,
          razorpay_payment_id: `dummy_pay_${Date.now()}`,
          razorpay_signature: "dummy_signature",
          dummy: true
        };

        const verify = await axios.post("/api/payment/verify", response);
        if (!verify.data?.success) {
          setIsPaying(false);
          setCheckoutMessage("Payment verification failed.");
          return;
        }

        // 3. Create Direct Buy Order on Backend
        const orderRes = await axios.post("/api/orders/direct-buy", {
          items: [{
            product: product._id,
            _id: product._id,
            id: product._id,
            name: product.name,
            image: product.image,
            price: unitPrice,
            quantity: buyQuantity,
            isDigital
          }],
          shipping: shippingInfo,
          billing: shippingInfo,
          paymentStatus: "Paid",
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          currencyDisplay: {
            currency: displayCurrency,
            amount: grandTotal,
            detectedCountry: isDigital ? "India" : country.trim()
          }
        });

        setOrderSuccess(orderRes.data?.order);
        setCredentialsSent(orderRes.data?.accountCreated);
        setIsPaying(false);
        return;
      }

      const cleanPhone = String(phone || "").replace(/\D/g, "").replace(/^0+/, "");
      const cleanEmail = String(email || "").trim().toLowerCase();

      // Live payment mode
      const rzp = new RazorpayConstructor({
        key: razorpayKey,
        amount: rpOrder.amount,
        currency: rpOrder.currency,
        name: "Digital Sanskrit Guru",
        description: `Direct purchase: ${product.name}`,
        order_id: rpOrder.id,
        prefill: {
          name: name.trim(),
          email: cleanEmail,
          contact: cleanPhone
        },
        notes: {
          address: shippingInfo.address
        },
        modal: {
          ondismiss: () => {
            setIsPaying(false);
            setCheckoutMessage("Payment was cancelled.");
          }
        },
        handler: async (response) => {
          try {
            const verify = await axios.post("/api/payment/verify", response);
            if (!verify.data?.success) {
              setCheckoutMessage("Payment verification failed.");
              setIsPaying(false);
              return;
            }

            // Create Direct Buy Order
            const orderRes = await axios.post("/api/orders/direct-buy", {
              items: [{
                product: product._id,
                _id: product._id,
                id: product._id,
                name: product.name,
                image: product.image,
                price: unitPrice,
                quantity: buyQuantity,
                isDigital
              }],
              shipping: shippingInfo,
              billing: shippingInfo,
              paymentStatus: "Paid",
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              currencyDisplay: {
                currency: displayCurrency,
                amount: grandTotal,
                detectedCountry: isDigital ? "India" : country.trim()
              }
            });

            setOrderSuccess(orderRes.data?.order);
            setCredentialsSent(orderRes.data?.accountCreated);
          } catch (err) {
            setCheckoutMessage(err.response?.data?.message || "Failed to finalize order on server.");
          } finally {
            setIsPaying(false);
          }
        }
      });

      rzp.on("payment.failed", (response) => {
        setIsPaying(false);
        const failReason =
          response?.error?.description ||
          response?.error?.reason ||
          "Payment failed.";
        console.error("Razorpay payment failed:", response?.error);
        setCheckoutMessage(`Payment failed: ${failReason}`);
      });

      rzp.open();
    } catch (err) {
      setCheckoutMessage(err.response?.data?.message || "Failed to initialize payment gateway.");
      setIsPaying(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <p>Loading checkout details...</p>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <h3>Error Loading Product</h3>
        <p>{error || "Product not found."}</p>
        <button onClick={() => navigate("/")} className="checkout-btn" style={{ maxWidth: "200px", marginTop: "16px" }}>
          Return to Store
        </button>
      </div>
    );
  }

  if (orderSuccess) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "40px 16px", minHeight: "100vh", backgroundColor: "var(--site-bg, #fafafa)" }}>
        <div style={{ maxWidth: "600px", width: "100%", backgroundColor: "#ffffff", padding: "32px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" }}>
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <span style={{ fontSize: "48px" }}>🎉</span>
            <h2 style={{ fontSize: "24px", color: "#22c55e", fontWeight: "700", marginTop: "12px" }}>Order Placed Successfully!</h2>
            <p style={{ color: "#64748b", marginTop: "8px" }}>Order Number: #{orderSuccess.orderNumber || orderSuccess._id}</p>
          </div>

          <div style={{ borderTop: "1px dashed #cbd5e1", borderBottom: "1px dashed #cbd5e1", padding: "16px 0", marginBottom: "24px" }}>
            <h4 style={{ fontWeight: "700", marginBottom: "12px" }}>Purchase Summary</h4>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{product.name} (x1)</span>
              <strong style={{ color: "#1e293b" }}>{orderSuccess.currencyDisplay?.currency || "INR"} {Math.round(orderSuccess.total)}</strong>
            </div>
          </div>

          <div style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", padding: "16px", borderRadius: "8px", marginBottom: "24px" }}>
            <h4 style={{ fontWeight: "700", color: "#1e293b", marginBottom: "8px" }}>🔑 Account Provisioning</h4>
            {credentialsSent ? (
              <p style={{ fontSize: "14px", color: "#475569", lineHeight: "1.5" }}>
                Welcome to the platform! Since you are a new user, we have automatically created a student account for you. Your <strong>temporary password</strong> has been sent to <strong>{email}</strong>.
              </p>
            ) : (
              <p style={{ fontSize: "14px", color: "#475569", lineHeight: "1.5" }}>
                This order has been linked to your existing account registered under <strong>{email}</strong>. Log in with your password to access your courses immediately.
              </p>
            )}
          </div>

          <button onClick={() => navigate("/login")} className="checkout-btn" style={{ width: "100%", padding: "12px" }}>
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  const pricing = getProductPriceDetails(product, isDigital ? undefined : country);
  const unitPrice = Number(pricing.price || 0);
  const finalTotal = unitPrice * buyQuantity;
  const displayCurrency = pricing.currency || "INR";

  const hasShippingAddress = isDigital || (
    address.trim() &&
    city.trim() &&
    state.trim() &&
    pincode.trim()
  );

  const deliveryDetails = hasShippingAddress
    ? getDeliveryPricingDetails(
        settings,
        isDigital ? {} : { address: address.trim(), city: city.trim(), state: state.trim(), pincode: pincode.trim(), country: country.trim(), latitude: coords.latitude, longitude: coords.longitude },
        product ? [{
          product: product._id,
          _id: product._id,
          id: product._id,
          name: product.name,
          image: product.image,
          price: finalTotal,
          quantity: 1,
          isDigital,
          weight: product.weight,
          height: product.height,
          width: product.width,
          length: product.length
        }] : []
      )
    : null;
  const deliveryChargeInInr = deliveryDetails ? Number(deliveryDetails.deliveryCharge || 0) : 0;
  const deliveryCharge = convertCurrencyAmount(deliveryChargeInInr, {
    sourceCurrency: "INR",
    currency: displayCurrency,
    rates: settings?.currencyConversionRates || {}
  });
  const grandTotal = finalTotal + deliveryCharge;

  return (
    <div style={{ minHeight: "100vh", position: "relative", backgroundColor: "#f8fafc", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
      <style>{`
        @keyframes modalSlideUp {
          from {
            opacity: 0;
            transform: scale(0.96) translateY(20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        .popup-modal-card {
          animation: modalSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @media (max-width: 768px) {
          .checkout-grid-mobile {
            grid-template-columns: 1fr !important;
          }
          .popup-modal-card {
            padding: 20px !important;
            margin: 10px !important;
            max-height: 96vh !important;
          }
        }
      `}</style>
      {/* Background brand overlay */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.05, userSelect: "none", pointerEvents: "none" }}>
        <h1 style={{ fontSize: "80px", fontWeight: "900", margin: 0 }}>VYOMA</h1>
        <p style={{ fontSize: "24px", fontWeight: "700", tracking: "2px" }}>DIGITAL SANSKRIT GURU</p>
      </div>

      {/* Floating Modal Popup Overlay */}
      <div style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.4)",
        backdropFilter: "blur(12px)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999,
        padding: "24px 16px"
      }}>
        <div 
          className="popup-modal-card"
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "20px",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            maxWidth: "850px",
            width: "100%",
            maxHeight: "92vh",
            overflowY: "auto",
            position: "relative",
            padding: "32px",
            display: "flex",
            flexDirection: "column",
            gap: "24px"
          }}
        >
          {/* Close Button */}
          <button 
            type="button"
            onClick={() => {
              if (window.history.length > 2) {
                navigate(-1);
              } else {
                navigate("/");
              }
            }}
            style={{
              position: "absolute",
              top: "20px",
              right: "20px",
              background: "#f1f5f9",
              border: "none",
              borderRadius: "50%",
              width: "36px",
              height: "36px",
              fontSize: "20px",
              fontWeight: "bold",
              color: "#64748b",
              cursor: "pointer",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#e2e8f0"; e.currentTarget.style.color = "#1e293b"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#f1f5f9"; e.currentTarget.style.color = "#64748b"; }}
          >
            &times;
          </button>

          {/* Modal Header */}
          <div style={{ textAlign: "center", paddingRight: "40px", paddingLeft: "40px" }}>
            <h2 style={{ fontSize: "24px", fontWeight: "800", color: "#0f172a", margin: 0 }}>Express Student Purchase</h2>
            <p style={{ color: "#64748b", fontSize: "14px", marginTop: "4px", margin: "4px 0 0" }}>Complete your enrollment instantly via secure payment</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "24px" }} className="checkout-grid-mobile">
            {/* Left Side: Product Card info */}
            <div style={{ backgroundColor: "#f8fafc", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <h3 style={{ fontSize: "16px", fontWeight: "700", marginBottom: "16px", color: "#475569" }}>Product Details</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px", alignItems: "center", textAlign: "center" }}>
                  {product.image && (
                    <img
                      src={product.image}
                      alt={product.name}
                      style={{ width: "120px", height: "120px", objectFit: "contain", borderRadius: "8px" }}
                    />
                  )}
                  <div>
                    <h4 style={{ fontWeight: "700", fontSize: "15px", color: "#1e293b" }}>{product.name}</h4>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "4px 8px",
                        borderRadius: "4px",
                        backgroundColor: "#cbd5e1",
                        color: "#334155",
                        fontSize: "11px",
                        fontWeight: "700",
                        marginTop: "8px"
                      }}
                    >
                      {isDigital ? "💻 Digital Course" : "📚 Physical Format"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "12px", alignItems: "baseline", marginTop: "8px" }}>
                    <span style={{ fontSize: "22px", fontWeight: "800", color: "var(--site-primary, #d97706)" }}>
                      {displayCurrency} {Math.round(finalTotal)}
                    </span>
                    {product?.festiveOffer === true && product?.festiveDiscountPercent > 0 && (
                      <span style={{ textDecoration: "line-through", color: "#94a3b8" }}>
                        {displayCurrency} {Math.round(finalTotal / (1 - Number(product.festiveDiscountPercent || 0) / 100))}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ borderTop: "1px dashed #cbd5e1", paddingTop: "16px", width: "100%", textAlign: "left", fontSize: "13px", marginTop: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ color: "#64748b" }}>Quantity:</span>
                  <span style={{ fontWeight: "600", color: "#334155" }}>{buyQuantity} copies</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ color: "#64748b" }}>Price ({buyQuantity} × {displayCurrency} {Math.round(unitPrice)}):</span>
                  <span style={{ fontWeight: "600", color: "#334155" }}>{displayCurrency} {Math.round(finalTotal)}</span>
                </div>
                {!isDigital && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ color: "#64748b" }}>Delivery Charge:</span>
                    <span style={{ fontWeight: "600", color: "#334155" }}>
                      {hasShippingAddress ? `${displayCurrency} ${Math.round(deliveryCharge)}` : "Enter address to calculate"}
                    </span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "700", fontSize: "15px", borderTop: "1px solid #cbd5e1", paddingTop: "6px", marginTop: "6px" }}>
                  <span>Total:</span>
                  <span style={{ color: "var(--site-primary, #d97706)" }}>{displayCurrency} {Math.round(grandTotal)}</span>
                </div>
              </div>
            </div>

            {/* Right Side: Simple Guest Checkout Form */}
            <form onSubmit={handlePayment} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: "700", color: "#475569" }}>Checkout Details</h3>
              
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>Full Name <span style={{ color: "#ef4444" }}>*</span></label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Supreeth Kumar"
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>Email Address <span style={{ color: "#ef4444" }}>*</span></label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. test@gmail.com"
                    style={{ width: "100%", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>Phone Number <span style={{ color: "#ef4444" }}>*</span></label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. +91 9999999999"
                    style={{ width: "100%", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
                  />
                </div>
              </div>

              {/* Address fields ONLY shown for non-digital products */}
              {!isDigital && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", borderTop: "1px solid #e2e8f0", paddingTop: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h4 style={{ fontWeight: "700", fontSize: "13px", color: "#475569", margin: 0 }}>Shipping Address</h4>
                    {settings?.enableCurrentLocation !== false && (
                      <button
                        type="button"
                        onClick={handleUseCurrentLocation}
                        disabled={isDetectingLocation}
                        style={{
                          background: "var(--site-link, #2563eb)",
                          color: "#fff",
                          border: "none",
                          borderRadius: "4px",
                          padding: "4px 10px",
                          fontSize: "11.5px",
                          fontWeight: "600",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px"
                        }}
                      >
                        📍 {isDetectingLocation ? "Detecting..." : "Use Current Location"}
                      </button>
                    )}
                  </div>
                  {locationStatusMessage ? (
                    <p style={{ fontSize: "12px", color: "var(--site-link, #2563eb)", margin: 0, fontWeight: "500" }}>
                      {locationStatusMessage}
                    </p>
                  ) : null}
                  
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>Street Address <span style={{ color: "#ef4444" }}>*</span></label>
                    <input
                      type="text"
                      required={!isDigital}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="House/Flat No, Apartment, Street"
                      style={{ width: "100%", padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>City <span style={{ color: "#ef4444" }}>*</span></label>
                      <input
                        type="text"
                        required={!isDigital}
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="City"
                        style={{ width: "100%", padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>State <span style={{ color: "#ef4444" }}>*</span></label>
                      <input
                        type="text"
                        required={!isDigital}
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        placeholder="State"
                        style={{ width: "100%", padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>Pincode <span style={{ color: "#ef4444" }}>*</span></label>
                      <input
                        type="text"
                        required={!isDigital}
                        value={pincode}
                        onChange={(e) => setPincode(e.target.value)}
                        placeholder="Pincode"
                        style={{ width: "100%", padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>Country <span style={{ color: "#ef4444" }}>*</span></label>
                      <input
                        type="text"
                        required={!isDigital}
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        placeholder="Country"
                        style={{ width: "100%", padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {checkoutMessage && <p style={{ color: "#ef4444", fontSize: "13px", margin: 0 }}>{checkoutMessage}</p>}

              <button
                type="submit"
                disabled={isPaying}
                className="checkout-btn"
                style={{ width: "100%", padding: "12px 16px", marginTop: "8px" }}
              >
                {isPaying ? "Processing Payment..." : `Pay Now (${displayCurrency} ${Math.round(grandTotal)})`}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GuestBuy;
