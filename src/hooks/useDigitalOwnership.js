import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useAuth } from "./useAuth";

const NEUTRAL_RESULT = {
  blocked: false,
  giftAllowed: true,
  notice: false,
  ownedItems: [],
  message: "",
  isChecking: false,
  upgradeCredit: 0,
  upgradeCreditItems: [],
  currency: "INR"
};

/**
 * Hook to check whether digital items in a cart or selection are already owned by the user.
 *
 * @param {Array} items [{ product: string, quantity: number }] or cartItems
 * @param {boolean} [isGift=false]
 * @param {string} [country=""]
 * @returns {{ blocked: boolean, giftAllowed: boolean, notice: boolean, ownedItems: string[], message: string, isChecking: boolean, upgradeCredit: number, upgradeCreditItems: Array, currency: string }}
 */
export function useDigitalOwnership(items, isGift = false, country = "") {
  const { token } = useAuth();
  const [result, setResult] = useState(NEUTRAL_RESULT);
  const [isChecking, setIsChecking] = useState(false);

  const productIdsKey = useMemo(() => {
    if (!Array.isArray(items) || items.length === 0) return "";
    return items
      .map((it) => {
        const raw = it?.product?._id || it?.product || it?.productId || it?._id || it?.id;
        const prodId = typeof raw === "object" && raw !== null ? raw._id : raw;
        return String(prodId || "").trim();
      })
      .filter(Boolean)
      .sort()
      .join(",");
  }, [items]);

  const normalizedIsGift = Boolean(isGift);
  const normalizedCountry = String(country || "").trim();
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const activeReqIdRef = useRef(0);

  useEffect(() => {
    if (!token || !productIdsKey) {
      setResult(NEUTRAL_RESULT);
      setIsChecking(false);
      return;
    }

    const currentReqId = ++activeReqIdRef.current;
    setIsChecking(true);

    const timer = setTimeout(async () => {
      try {
        const currentItems = itemsRef.current || [];
        const payloadItems = currentItems
          .map((it) => {
            const raw = it?.product?._id || it?.product || it?.productId || it?._id || it?.id;
            const prodId = typeof raw === "object" && raw !== null ? raw._id : raw;
            return {
              product: prodId,
              quantity: it?.quantity || 1
            };
          })
          .filter((it) => Boolean(it.product));

        const payload = { items: payloadItems, isGift: normalizedIsGift };
        if (normalizedCountry) {
          payload.shipping = { country: normalizedCountry };
        }

        const res = await axios.post(
          "/api/orders/digital-ownership",
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (currentReqId !== activeReqIdRef.current) return;

        setResult({
          blocked: Boolean(res.data?.blocked),
          giftAllowed: res.data?.giftAllowed !== false,
          notice: Boolean(res.data?.notice),
          ownedItems: Array.isArray(res.data?.ownedItems) ? res.data.ownedItems : [],
          message: String(res.data?.message || "").trim(),
          upgradeCredit: Number(res.data?.upgradeCredit) || 0,
          upgradeCreditItems: Array.isArray(res.data?.upgradeCreditItems) ? res.data.upgradeCreditItems : [],
          currency: String(res.data?.currency || "INR").toUpperCase(),
          isChecking: false
        });
      } catch {
        if (currentReqId !== activeReqIdRef.current) return;
        setResult(NEUTRAL_RESULT);
      } finally {
        if (currentReqId === activeReqIdRef.current) {
          setIsChecking(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [token, productIdsKey, normalizedIsGift, normalizedCountry]);

  return {
    ...result,
    isChecking
  };
}
