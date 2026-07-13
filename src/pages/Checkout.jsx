import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useCart } from "../hooks/useCart";
import { useAuth } from "../hooks/useAuth";
import { useDeliveryLocation } from "../hooks/useDeliveryLocation";
import { convertCurrencyAmount, formatCurrencyExact, formatResolvedPrice } from "../utils/currency";
import { getDeliveryPricingDetails } from "../utils/deliveryPricing";
import { loadRazorpayCheckout } from "../utils/loadRazorpay";
import { getProductPriceDetails, storePricingConfig } from "../utils/productPricing";
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
    name.includes("ebook") ||
    name.includes("e-book") ||
    name.includes("kindle") ||
    name.includes("web version") ||
    name.includes("web-version") ||
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
  const { token } = useAuth();
  const {
    addresses,
    selectedIndex,
    selectedAddress,
    selectAddress
  } = useDeliveryLocation();
  const [isBillingSame, setIsBillingSame] = useState(true);
  const [selectedBillingIndex, setSelectedBillingIndex] = useState(0);
  const navigate = useNavigate();
  const razorpayKey = import.meta.env.VITE_RAZORPAY_KEY_ID || "";
  const isDummyPaymentEnabled =
    String(import.meta.env.VITE_ENABLE_DUMMY_PAYMENT || "").toLowerCase() === "true";

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
          internationalDelivery: res.data?.internationalDelivery || {}
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
        paymentStatus,
        razorpayOrderId: paymentInfo?.razorpayOrderId || "",
        razorpayPaymentId: paymentInfo?.razorpayPaymentId || "",
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

    return selectedAddress;
  };

  const processCheckout = async () => {
    const selected = validateCheckout();
    if (!selected) {
      return;
    }

    if (!isDummyPaymentEnabled && !razorpayKey) {
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
      let RazorpayConstructor = window.Razorpay;
      if (!isDummyPaymentEnabled) {
        RazorpayConstructor = await loadRazorpayCheckout();
      }

      const { data } = await axios.post("/api/payment/create-order", {
        amount: roundMoney(
          convertCurrencyAmount(finalTotal, {
            sourceCurrency: displayCurrency,
            currency: "INR"
          })
        )
      });

      if (isDummyPaymentEnabled) {
        const wantsToProceed = window.confirm(
          "Dummy payment mode is enabled. Click OK to simulate a successful payment."
        );

        if (!wantsToProceed) {
          setIsPaying(false);
          await recordFailedAttempt(
            "Payment was cancelled. Failed order saved in My Orders. You can retry payment there."
          );
          return;
        }

        const response = {
          razorpay_order_id: data.id || `dummy_order_${Date.now()}`,
          razorpay_payment_id: `dummy_pay_${Date.now()}`,
          razorpay_signature: "dummy_signature",
          dummy: true
        };

        const verify = await axios.post("/api/payment/verify", response);
        if (!verify.data?.success) {
          setIsPaying(false);
          await recordFailedAttempt("Payment verification failed. Retry from My Orders.");
          return;
        }

        await createOrderWithPaymentStatus(selected, "Paid", {
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id
        });
        await clearCart();
        navigate("/my-orders", {
          state: { message: "Payment successful. Your order has been placed." }
        });
        setIsPaying(false);
        return;
      }

      const rzp = new RazorpayConstructor({
        key: razorpayKey,
        amount: data.amount,
        currency: data.currency,
        name: "Digital Sanskrit Guru",
        description: "Order Payment",
        order_id: data.id,
        prefill: {
          name: selected.name,
          contact: selected.phone
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
              razorpayPaymentId: response.razorpay_payment_id
            });
            await clearCart();
            navigate("/my-orders", {
              state: { message: "Payment successful. Your order has been placed." }
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

      rzp.on("payment.failed", async () => {
        setIsPaying(false);
        await recordFailedAttempt("Payment failed. Failed order saved in My Orders.");
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
      <h1 className="checkout-title">
        Checkout <span>({itemCount} items)</span>
      </h1>
      <p className="checkout-lead">Select a delivery address and review your order before payment.</p>
      {isDummyPaymentEnabled ? (
        <p className="checkout-mode-badge">Test mode enabled: payments are simulated.</p>
      ) : (
        <p className="checkout-mode-badge live">Secure live payment mode.</p>
      )}
      {checkoutMessage ? <p className="checkout-feedback">{checkoutMessage}</p> : null}

      <div className="checkout-container">
        <section className="checkout-main">
          {selectedAddress && !isEditingAddress ? (
            <div className="checkout-compact-address-box">
              <div className="checkout-compact-address-info">
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <h2 style={{ margin: 0, fontSize: "17px", fontWeight: "700", color: "var(--site-text)" }}>
                    Delivering to {selectedAddress.name}
                  </h2>
                  {selectedAddress.label && (
                    <span className="checkout-address-label" style={{ margin: 0 }}>{selectedAddress.label}</span>
                  )}
                  {selectedAddress.isDefault && (
                    <span className="default-badge" style={{ margin: 0 }}>Default</span>
                  )}
                </div>
                <p className="checkout-compact-address-detail" style={{ marginTop: "6px" }}>
                  {selectedAddress.address}
                </p>
                {selectedAddress.landmark && (
                  <p className="checkout-compact-address-detail">Landmark: {selectedAddress.landmark}</p>
                )}
                <p className="checkout-compact-address-detail">
                  {getAddressLocationText(selectedAddress)}
                </p>
                <p className="checkout-compact-address-detail" style={{ fontWeight: "500", marginTop: "2px" }}>
                  Phone: {selectedAddress.phone}
                </p>
              </div>
              <button
                type="button"
                className="checkout-compact-address-change-btn"
                onClick={() => setIsEditingAddress(true)}
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <div className="checkout-section-head">
                <h2>Select a delivery address</h2>
                {selectedAddress && isEditingAddress && (
                  <button
                    type="button"
                    className="checkout-compact-address-change-btn"
                    onClick={() => setIsEditingAddress(false)}
                    style={{ fontSize: "13px" }}
                  >
                    Cancel
                  </button>
                )}
              </div>
              <p className="coupon-selector-empty">
                Add or manage addresses from <a href="/account">My Account</a>.
              </p>

              <div className="address-list">
                {addresses.map((item, index) => (
                  <div
                    key={index}
                    className={`address-card ${selectedIndex === index ? "selected" : ""}`}
                    onClick={() => selectAddress(index)}
                  >
                    <input
                      type="radio"
                      checked={selectedIndex === index}
                      onChange={() => selectAddress(index)}
                    />

                    <div className="address-info">
                      <strong>{item.name}</strong>
                      {item.label ? <p className="checkout-address-label">{item.label}</p> : null}
                      <p>{item.phone}</p>
                      <p>{item.address}</p>
                      {item.landmark && <p>Landmark: {item.landmark}</p>}
                      {getAddressLocationText(item) && <p>{getAddressLocationText(item)}</p>}

                      {item.isDefault && <span className="default-badge">Default</span>}
                    </div>
                  </div>
                ))}
              </div>

              {addresses.length > 0 && (
                <button
                  type="button"
                  className="checkout-address-save-btn"
                  onClick={() => setIsEditingAddress(false)}
                >
                  Use this address
                </button>
              )}
            </>
          )}

          <div className="billing-address-toggle" style={{ marginTop: '24px', display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', backgroundColor: 'var(--site-surface-muted)', borderRadius: '8px', border: '1px solid var(--site-border)' }}>
            <input
              type="checkbox"
              id="billing-same"
              checked={isBillingSame}
              onChange={(e) => setIsBillingSame(e.target.checked)}
              style={{ cursor: 'pointer', width: '16px', height: '16px' }}
            />
            <label htmlFor="billing-same" style={{ fontWeight: '600', cursor: 'pointer', color: 'var(--site-text)', fontSize: '14.5px' }}>
              Billing address is same as delivery address
            </label>
          </div>

          {!isBillingSame && (
            <div className="billing-address-section" style={{ marginTop: "24px" }}>
              {selectedBillingAddress && !isEditingBillingAddress ? (
                <div className="checkout-compact-address-box">
                  <div className="checkout-compact-address-info">
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <h2 style={{ margin: 0, fontSize: "17px", fontWeight: "700", color: "var(--site-text)" }}>
                        Billing to {selectedBillingAddress.name}
                      </h2>
                      {selectedBillingAddress.label && (
                        <span className="checkout-address-label" style={{ margin: 0 }}>{selectedBillingAddress.label}</span>
                      )}
                      {selectedBillingAddress.isDefault && (
                        <span className="default-badge" style={{ margin: 0 }}>Default</span>
                      )}
                    </div>
                    <p className="checkout-compact-address-detail" style={{ marginTop: "6px" }}>
                      {selectedBillingAddress.address}
                    </p>
                    {selectedBillingAddress.landmark && (
                      <p className="checkout-compact-address-detail">Landmark: {selectedBillingAddress.landmark}</p>
                    )}
                    <p className="checkout-compact-address-detail">
                      {getAddressLocationText(selectedBillingAddress)}
                    </p>
                    <p className="checkout-compact-address-detail" style={{ fontWeight: "500", marginTop: "2px" }}>
                      Phone: {selectedBillingAddress.phone}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="checkout-compact-address-change-btn"
                    onClick={() => setIsEditingBillingAddress(true)}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <div className="checkout-section-head" style={{ marginBottom: "12px" }}>
                    <h2>Select a billing address</h2>
                    {selectedBillingAddress && isEditingBillingAddress && (
                      <button
                        type="button"
                        className="checkout-compact-address-change-btn"
                        onClick={() => setIsEditingBillingAddress(false)}
                        style={{ fontSize: "13px" }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  <div className="address-list">
                    {addresses.map((item, index) => (
                      <div
                        key={`billing-${index}`}
                        className={`address-card ${selectedBillingIndex === index ? "selected" : ""}`}
                        onClick={() => setSelectedBillingIndex(index)}
                      >
                        <input
                          type="radio"
                          checked={selectedBillingIndex === index}
                          onChange={() => setSelectedBillingIndex(index)}
                        />
                        <div className="address-info">
                          <strong>{item.name}</strong>
                          {item.label ? <p className="checkout-address-label">{item.label}</p> : null}
                          <p>{item.phone}</p>
                          <p>{item.address}</p>
                          {item.landmark && <p>Landmark: {item.landmark}</p>}
                          {getAddressLocationText(item) && <p>{getAddressLocationText(item)}</p>}
                        </div>
                      </div>
                    ))}
                  </div>

                  {addresses.length > 0 && (
                    <button
                      type="button"
                      className="checkout-address-save-btn"
                      onClick={() => setIsEditingBillingAddress(false)}
                    >
                      Use this address
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </section>

        <aside className="order-summary">
          <h2>Order Summary</h2>

          <div className="coupon-box">
            <input
              placeholder="Enter coupon code"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
            />
            <button onClick={() => applyCoupon()} disabled={isApplyingCoupon}>
              {isApplyingCoupon ? "Applying..." : "Apply"}
            </button>
          </div>

          <div className="coupon-selector">
            <p className="coupon-selector-title">Available coupons</p>
            {isLoadingCoupons ? (
              <p className="coupon-selector-empty">Loading coupons...</p>
            ) : availableCoupons.length === 0 ? (
              <p className="coupon-selector-empty">No coupons available for this order amount.</p>
            ) : (
              <div className="coupon-chip-grid">
                {availableCoupons.map((coupon) => {
                  const code = String(coupon.code || "").toUpperCase();
                  const isActive = code === String(couponCode || "").toUpperCase();
                  const label =
                    coupon.type === "percentage"
                      ? `${Number(coupon.value || 0)}% OFF`
                      : `${formatCurrencyExact(Number(coupon.value || 0), displayCurrency)} OFF`;

                  return (
                    <button
                      key={coupon._id || code}
                      type="button"
                      className={isActive ? "coupon-chip active" : "coupon-chip"}
                      onClick={() => applyCoupon(code)}
                      disabled={isApplyingCoupon}
                    >
                      <strong>{code}</strong>
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {couponMessage && <p className="coupon-message">{couponMessage}</p>}

          <div className="summary-products">
            {cartItems.map((item, index) => {
              const qty = Math.max(1, Number(item.quantity || 1));
              const unitPrice = Number(getProductPriceDetails(item, selectedAddress?.country).price || 0);
              const lineTotal = roundMoney(unitPrice * qty);
              const hsnSac = getItemHsnSac(item);
              const defaultGstPercent = Number(charges.gstPercent || 0);
              const gstRate = hsnSac === "4901" ? 0 : defaultGstPercent;
              const gstAmount = roundMoney((lineTotal * gstRate) / 100);

              return (
                <div key={index} className="summary-item-wrapper" style={itemStyles.itemWrapper}>
                  <div className="summary-item" style={itemStyles.summaryItem}>
                    <span style={itemStyles.itemName}>{item.name}</span>
                    <span style={itemStyles.itemTotal}>
                      {qty} x {formatResolvedPrice(getProductPriceDetails(item, selectedAddress?.country))} = {" "}
                      {formatCurrencyExact(lineTotal, displayCurrency)}
                    </span>
                  </div>
                  <div className="itemized-tax-details" style={itemStyles.taxDetails}>
                    <span style={itemStyles.taxDetailLabel}>
                      HSN: <strong style={itemStyles.taxDetailValue}>{hsnSac}</strong>
                    </span>
                    <span style={itemStyles.taxDetailLabel}>
                      GST Rate: <strong style={itemStyles.taxDetailValue}>{gstRate}%</strong>
                    </span>
                    <span style={itemStyles.taxDetailLabel}>
                      Tax: <strong style={itemStyles.taxDetailValue}>{formatCurrencyExact(gstAmount, displayCurrency)}</strong>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <hr />

          <div className="summary-item">
            <span>Subtotal</span>
            <span>{formatCurrencyExact(totals.subtotal, displayCurrency)}</span>
          </div>
          <div className="summary-item">
            <span>GST ({charges.gstPercent}%)</span>
            <span>{formatCurrencyExact(totals.gstAmount, displayCurrency)}</span>
          </div>
          <div className="summary-item">
            <span>Delivery</span>
            <span>{formatCurrencyExact(totals.deliveryCharge, displayCurrency)}</span>
          </div>
          {deliveryDetails.isDistanceBased && deliveryDetails.distanceKm !== null && (
            <p className="coupon-selector-empty">Estimated distance: {deliveryDetails.distanceKm.toFixed(1)} km</p>
          )}
          {deliveryDetails.pricingMode === "international" && deliveryDetails.matchedCountry && (
            <p className="coupon-selector-empty">
              International delivery applied for {deliveryDetails.matchedCountry}.
            </p>
          )}
          {selectedAddress?.country && cartItems.some((item) => getProductPriceDetails(item, selectedAddress.country).priceType === "international-country") && (
            <p className="coupon-selector-empty">
              Country-specific product pricing applied for {selectedAddress.country}.
            </p>
          )}
          <div className="summary-item summary-total">
            <span>Total</span>
            <span>{formatCurrencyExact(totals.grandTotal, displayCurrency)}</span>
          </div>

          {discount > 0 && <p className="discount">Discount: -{formatCurrencyExact(discount, displayCurrency)}</p>}

          <h3 className="final-total">Final Total: {formatCurrencyExact(finalTotal, displayCurrency)}</h3>
          <p className="checkout-policy-note">Order is placed only after successful payment.</p>
          <button className="pay-now-btn" onClick={processCheckout} disabled={isPaying}>
            {isPaying ? "Processing..." : "Pay Now"}
          </button>
        </aside>
      </div>
    </div>
  );
}

export default Checkout;
