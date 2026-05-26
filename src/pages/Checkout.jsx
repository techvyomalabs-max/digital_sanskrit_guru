import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useCart } from "../hooks/useCart";
import { useAuth } from "../hooks/useAuth";
import { useDeliveryLocation } from "../hooks/useDeliveryLocation";
import { convertCurrencyAmount, formatCurrencyExact, formatResolvedPrice } from "../utils/currency";
import { getDeliveryPricingDetails } from "../utils/deliveryPricing";
import { getProductPriceDetails, storePricingConfig } from "../utils/productPricing";
import "./Checkout.css";

const getAddressLocationText = (item) => {
  return [item?.city, item?.state, item?.pincode, item?.country].filter(Boolean).join(", ");
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
  const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
  const displayCurrency =
    cartItems.length > 0
      ? String(getProductPriceDetails(cartItems[0], selectedAddress?.country).currency || "INR")
      : "INR";

  useEffect(() => {
    let active = true;

    axios
      .get("/api/settings")
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
    return getDeliveryPricingDetails(charges, selectedAddress);
  }, [charges, selectedAddress]);

  const totals = useMemo(() => {
    const getItemUnitPrice = (item) => Number(getProductPriceDetails(item, selectedAddress?.country).price || 0);
    const subtotal = roundMoney(cartItems.reduce(
      (sum, item) => sum + getItemUnitPrice(item) * Number(item.quantity || 1),
      0
    ));
    const gstAmount = roundMoney((subtotal * Number(charges.gstPercent || 0)) / 100);
    const deliveryCharge = roundMoney(
      convertCurrencyAmount(Number(deliveryDetails.deliveryCharge || 0), {
        sourceCurrency: "INR",
        currency: displayCurrency
      })
    );
    const grandTotal = roundMoney(subtotal + gstAmount + deliveryCharge);
    return { subtotal, gstAmount, deliveryCharge, grandTotal };
  }, [cartItems, charges.gstPercent, deliveryDetails.deliveryCharge, selectedAddress?.country, displayCurrency]);

  const finalTotal = useMemo(
    () => roundMoney(Math.max(0, Number(totals.grandTotal || 0) - Number(discount || 0))),
    [totals.grandTotal, discount]
  );

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
      const res = await axios.post("/api/coupons/apply", {
        code,
        total: totals.grandTotal,
        currency: displayCurrency
      });
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

    const { data } = await axios.post(
      "/api/orders",
      {
        items: cartItems,
        total: finalTotal,
        shipping: selected,
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

    if (!isDummyPaymentEnabled && !window.Razorpay) {
      setCheckoutMessage("Payment gateway failed to load. Please refresh and try again.");
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

      const rzp = new window.Razorpay({
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
      setCheckoutMessage(err?.response?.data?.message || "Unable to start payment.");
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
          <div className="checkout-section-head">
            <h2>Select a delivery address</h2>
          </div>
          <p className="coupon-selector-empty">
            Add or manage addresses from <a href="/account">My Account</a>.
          </p>

          <div className="address-list">
            {addresses.map((item, index) => (
              <div
                key={index}
                className={`address-card ${selectedIndex === index ? "selected" : ""}`}
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
            {cartItems.map((item, index) => (
              <div key={index} className="summary-item">
                <span>{item.name}</span>
                <span>
                  {Math.max(1, Number(item.quantity || 1))} x {formatResolvedPrice(getProductPriceDetails(item, selectedAddress?.country))} = {" "}
                  {formatCurrencyExact(
                    roundMoney(
                      Number(getProductPriceDetails(item, selectedAddress?.country).price || 0) *
                        Math.max(1, Number(item.quantity || 1))
                    ),
                    displayCurrency
                  )}
                </span>
              </div>
            ))}
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
