import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { isDigitalItem } from "../utils/deliveryPricing";

/**
 * Hook to fetch server delivery pricing estimate from POST /api/orders/delivery-estimate.
 *
 * @param {Array} items [{ product: string, quantity: number, ... }]
 * @param {Object} shipping { country, state, city, pincode, latitude, longitude, ... }
 * @returns {{ deliveryCharge: number | null, pricingMode: string | null, isLoading: boolean }}
 */
export function useDeliveryEstimate(items, shipping) {
  const [estimate, setEstimate] = useState({
    deliveryCharge: null,
    pricingMode: null
  });
  const [isLoading, setIsLoading] = useState(false);

  const itemsKey = useMemo(() => {
    if (!Array.isArray(items) || items.length === 0) return "";
    return items
      .map((it) => {
        const raw = it?.product?._id || it?.product?.id || it?.product || it?.productId || it?._id || it?.id;
        const prodId = typeof raw === "object" && raw !== null ? raw._id || raw.id : raw;
        const id = String(prodId || "").trim();
        const qty = Math.max(1, Number(it?.quantity || 1));
        return `${id}:${qty}`;
      })
      .sort()
      .join("|");
  }, [items]);

  const addressKey = useMemo(() => {
    const country = String(shipping?.country || "").trim().toLowerCase();
    const state = String(shipping?.state || "").trim().toLowerCase();
    const pincode = String(shipping?.pincode || shipping?.postalCode || "").trim();
    const lat = shipping?.latitude !== undefined && shipping?.latitude !== null ? String(shipping.latitude) : "";
    const lon = shipping?.longitude !== undefined && shipping?.longitude !== null ? String(shipping.longitude) : "";
    return `${country}|${state}|${pincode}|${lat}|${lon}`;
  }, [
    shipping?.country,
    shipping?.state,
    shipping?.pincode,
    shipping?.postalCode,
    shipping?.latitude,
    shipping?.longitude
  ]);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const shippingRef = useRef(shipping);
  shippingRef.current = shipping;
  const reqIdRef = useRef(0);

  useEffect(() => {
    const currentItems = itemsRef.current;
    const currentShipping = shippingRef.current;

    const hasItems = Array.isArray(currentItems) && currentItems.length > 0;
    const hasPhysical = hasItems && currentItems.some((it) => !isDigitalItem(it));
    const hasCountry = Boolean(String(currentShipping?.country || "").trim());

    if (!hasItems || !hasPhysical || !hasCountry) {
      setEstimate({ deliveryCharge: null, pricingMode: null });
      setIsLoading(false);
      return;
    }

    const currentReqId = ++reqIdRef.current;
    setIsLoading(true);

    const timer = setTimeout(async () => {
      try {
        const payloadItems = (itemsRef.current || [])
          .map((it) => {
            const raw = it?.product?._id || it?.product?.id || it?.product || it?.productId || it?._id || it?.id;
            const prodId = typeof raw === "object" && raw !== null ? raw._id || raw.id : raw;
            return {
              product: String(prodId || "").trim(),
              quantity: Math.max(1, Math.floor(Number(it?.quantity || 1)) || 1)
            };
          })
          .filter((it) => Boolean(it.product));

        const ship = shippingRef.current || {};
        const payload = {
          items: payloadItems,
          shipping: {
            country: String(ship.country || "").trim(),
            state: String(ship.state || "").trim(),
            city: String(ship.city || "").trim(),
            pincode: String(ship.pincode || ship.postalCode || "").trim(),
            latitude: ship.latitude !== undefined && ship.latitude !== null ? Number(ship.latitude) : null,
            longitude: ship.longitude !== undefined && ship.longitude !== null ? Number(ship.longitude) : null
          }
        };

        const res = await axios.post("/api/orders/delivery-estimate", payload);

        if (currentReqId !== reqIdRef.current) return;

        const charge = res.data?.deliveryCharge;
        if (typeof charge === "number" && !Number.isNaN(charge)) {
          setEstimate({
            deliveryCharge: charge,
            pricingMode: res.data?.pricingMode || null
          });
        } else {
          setEstimate({ deliveryCharge: null, pricingMode: null });
        }
      } catch {
        if (currentReqId !== reqIdRef.current) return;
        setEstimate({ deliveryCharge: null, pricingMode: null });
      } finally {
        if (currentReqId === reqIdRef.current) {
          setIsLoading(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [itemsKey, addressKey]);

  return {
    deliveryCharge: estimate.deliveryCharge,
    pricingMode: estimate.pricingMode,
    isLoading
  };
}
